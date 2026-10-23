// SPDX-License-Identifier: GPL-3.0-only

package app

// TerminalService runs the interactive shells behind the bottom panel's
// Terminal tab: a local shell on a pseudo-terminal, or a shell on the SSH
// server of a connection that has a tunnel. Pattern: Observer - each session
// pumps its output to the frontend as terminal:data events (base64, since
// terminal output is bytes, not always valid UTF-8) and ends with terminal:exit.
// The frontend owns the xterm.js view; this side only owns the processes.

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"

	"zentro/internal/constant"
	"zentro/internal/models"
	"zentro/internal/sshtunnel"
)

// Terminal session kinds accepted by Open.
const (
	TerminalKindLocal = "local"
	TerminalKindSSH   = "ssh"
)

const (
	defaultTerminalCols = 80
	defaultTerminalRows = 24
	terminalReadBuffer  = 8192
)

// TerminalInfo describes one open session to the frontend.
type TerminalInfo struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Title string `json:"title"`
}

// TerminalDataEvent is the terminal:data payload: a chunk of output.
type TerminalDataEvent struct {
	ID string `json:"id"`
	// Data is the raw output bytes, base64-encoded.
	Data string `json:"data"`
}

// TerminalExitEvent is the terminal:exit payload: the shell ended.
type TerminalExitEvent struct {
	ID       string `json:"id"`
	ExitCode int    `json:"exitCode"`
}

type terminalSession struct {
	info   TerminalInfo
	proc   terminalProcess
	cancel context.CancelFunc
	done   chan struct{} // closed once the output pump has finished

	closeOnce sync.Once
}

// close releases the process exactly once. Closing a ConPTY twice would close
// its handles twice, and Windows may by then have reused those handle numbers.
func (t *terminalSession) close() {
	t.closeOnce.Do(func() { _ = t.proc.Close() })
}

type TerminalService struct {
	emitter     EventEmitter
	loadProfile func(id string) (*models.ConnectionProfile, error)
	startLocal  func(cols, rows int) (terminalProcess, string, error)
	openSSH     func(ctx context.Context, cfg sshtunnel.Config, cols, rows int) (terminalProcess, error)

	mu       sync.Mutex
	ctx      context.Context
	sessions map[string]*terminalSession
	counter  int
	closed   bool
}

// NewTerminalService wires the service. openSSH may be nil (SSH terminals are
// then reported as unavailable).
func NewTerminalService(
	emitter EventEmitter,
	loadProfile func(id string) (*models.ConnectionProfile, error),
	openSSH func(ctx context.Context, cfg sshtunnel.Config, cols, rows int) (terminalProcess, error),
) *TerminalService {
	return &TerminalService{
		emitter:     emitter,
		loadProfile: loadProfile,
		startLocal:  startLocalShell,
		openSSH:     openSSH,
		sessions:    map[string]*terminalSession{},
	}
}

// SetContext sets the Wails runtime context events are emitted on.
func (s *TerminalService) SetContext(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ctx = ctx
}

// Open starts a shell and returns its session. kind is "local" or "ssh"; for
// "ssh", profileID names the connection whose SSH server to log in to.
func (s *TerminalService) Open(kind, profileID string, cols, rows int) (*TerminalInfo, error) {
	if cols < 1 {
		cols = defaultTerminalCols
	}
	if rows < 1 {
		rows = defaultTerminalRows
	}

	// Sessions outlive the call that opened them, so they hang off the runtime
	// context rather than a request-scoped one.
	s.mu.Lock()
	parent := s.ctx
	closed := s.closed
	s.mu.Unlock()
	if closed {
		return nil, errors.New("the terminal is shutting down")
	}
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)

	var (
		proc  terminalProcess
		title string
		err   error
	)
	switch kind {
	case TerminalKindLocal:
		proc, title, err = s.startLocal(cols, rows)
	case TerminalKindSSH:
		proc, title, err = s.openSSHShell(ctx, profileID, cols, rows)
	default:
		err = fmt.Errorf("unknown terminal kind %q", kind)
	}
	if err != nil {
		cancel()
		return nil, err
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		cancel()
		_ = proc.Close()
		return nil, errors.New("the terminal is shutting down")
	}
	s.counter++
	id := fmt.Sprintf("term-%d", s.counter)
	sess := &terminalSession{
		info:   TerminalInfo{ID: id, Kind: kind, Title: title},
		proc:   proc,
		cancel: cancel,
		done:   make(chan struct{}),
	}
	s.sessions[id] = sess
	s.mu.Unlock()

	go s.pump(ctx, sess)
	info := sess.info
	return &info, nil
}

func (s *TerminalService) openSSHShell(ctx context.Context, profileID string, cols, rows int) (terminalProcess, string, error) {
	if s.openSSH == nil {
		return nil, "", errors.New("SSH terminals are not available")
	}
	profile, err := s.loadProfile(strings.TrimSpace(profileID))
	if err != nil {
		return nil, "", err
	}
	if profile == nil {
		return nil, "", errors.New("connection not found")
	}
	cfg, ok := sshtunnel.ConfigFromProfile(profile)
	if !ok {
		return nil, "", fmt.Errorf("connection %q has no SSH tunnel configured", profile.Name)
	}
	proc, err := s.openSSH(ctx, cfg, cols, rows)
	if err != nil {
		return nil, "", err
	}
	return proc, fmt.Sprintf("%s@%s", cfg.User, cfg.Host), nil
}

// pump forwards the shell's output until it ends, then reports the exit and
// forgets the session.
func (s *TerminalService) pump(ctx context.Context, sess *terminalSession) {
	defer close(sess.done)

	buf := make([]byte, terminalReadBuffer)
	for {
		n, err := sess.proc.Read(buf)
		if n > 0 {
			s.emit(constant.EventTerminalData, TerminalDataEvent{
				ID:   sess.info.ID,
				Data: base64.StdEncoding.EncodeToString(buf[:n]),
			})
		}
		if err != nil {
			break
		}
	}

	code, _ := sess.proc.Wait(ctx)
	sess.close()
	sess.cancel()

	s.mu.Lock()
	delete(s.sessions, sess.info.ID)
	s.mu.Unlock()

	s.emit(constant.EventTerminalExit, TerminalExitEvent{ID: sess.info.ID, ExitCode: code})
}

func (s *TerminalService) emit(name string, payload any) {
	s.mu.Lock()
	ctx := s.ctx
	s.mu.Unlock()
	s.emitter.Emit(ctx, name, payload)
}

func (s *TerminalService) session(id string) (*terminalSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, fmt.Errorf("terminal %q is not open", id)
	}
	return sess, nil
}

// Write sends keystrokes to the shell.
func (s *TerminalService) Write(id, data string) error {
	sess, err := s.session(id)
	if err != nil {
		return err
	}
	_, err = sess.proc.Write([]byte(data))
	return err
}

// Resize tells the shell's pseudo-terminal the viewport changed size.
func (s *TerminalService) Resize(id string, cols, rows int) error {
	sess, err := s.session(id)
	if err != nil {
		return err
	}
	if cols < 1 || rows < 1 {
		return nil // a hidden/collapsed panel reports 0x0; keep the last good size
	}
	return sess.proc.Resize(cols, rows)
}

// Close ends one session. Closing one that is already gone is not an error.
func (s *TerminalService) Close(id string) {
	sess, err := s.session(id)
	if err != nil {
		return
	}
	sess.close()
	sess.cancel()
	<-sess.done
}

// Shutdown ends every session for good, so no shell is left running after the
// app quits.
func (s *TerminalService) Shutdown() {
	s.mu.Lock()
	s.closed = true
	all := make([]*terminalSession, 0, len(s.sessions))
	for _, sess := range s.sessions {
		all = append(all, sess)
	}
	s.mu.Unlock()

	for _, sess := range all {
		sess.close()
		sess.cancel()
	}
	for _, sess := range all {
		<-sess.done
	}
}
