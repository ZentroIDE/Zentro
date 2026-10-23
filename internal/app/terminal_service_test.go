// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"zentro/internal/constant"
	"zentro/internal/models"
	"zentro/internal/sshtunnel"
)

// fakeProc is an in-memory shell: output written to out is what the terminal
// "prints", and keystrokes written by the service land in input.
type fakeProc struct {
	outR *io.PipeReader
	outW *io.PipeWriter

	mu      sync.Mutex
	input   strings.Builder
	resizes [][2]int
	closes  int
	exit    int
}

func newFakeProc() *fakeProc {
	r, w := io.Pipe()
	return &fakeProc{outR: r, outW: w}
}

func (f *fakeProc) Read(p []byte) (int, error) { return f.outR.Read(p) }

func (f *fakeProc) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.input.Write(p)
}

func (f *fakeProc) Resize(cols, rows int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.resizes = append(f.resizes, [2]int{cols, rows})
	return nil
}

func (f *fakeProc) Wait(ctx context.Context) (int, error) { return f.exit, nil }

func (f *fakeProc) Close() error {
	f.mu.Lock()
	f.closes++
	f.mu.Unlock()
	return f.outW.Close()
}

func (f *fakeProc) printed(s string) { _, _ = f.outW.Write([]byte(s)) }

func (f *fakeProc) typed() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.input.String()
}

type terminalEvents struct {
	mu    sync.Mutex
	data  map[string]string
	exits []TerminalExitEvent
}

func (e *terminalEvents) Emit(_ context.Context, name string, payload any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	switch name {
	case constant.EventTerminalData:
		ev := payload.(TerminalDataEvent)
		raw, _ := base64.StdEncoding.DecodeString(ev.Data)
		if e.data == nil {
			e.data = map[string]string{}
		}
		e.data[ev.ID] += string(raw)
	case constant.EventTerminalExit:
		e.exits = append(e.exits, payload.(TerminalExitEvent))
	}
}

func (e *terminalEvents) output(id string) string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.data[id]
}

func (e *terminalEvents) exitCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.exits)
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	waitForWithin(t, 5*time.Second, what, cond)
}

func waitForWithin(t *testing.T, timeout time.Duration, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func newTestTerminalService(events *terminalEvents, proc *fakeProc) *TerminalService {
	svc := NewTerminalService(events,
		func(id string) (*models.ConnectionProfile, error) { return nil, nil },
		nil)
	svc.startLocal = func(cols, rows int) (terminalProcess, string, error) {
		return proc, "testsh", nil
	}
	return svc
}

func TestTerminalForwardsOutputAsBase64Events(t *testing.T) {
	events, proc := &terminalEvents{}, newFakeProc()
	svc := newTestTerminalService(events, proc)

	info, err := svc.Open(TerminalKindLocal, "", 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	if info.Kind != TerminalKindLocal || info.Title != "testsh" || info.ID == "" {
		t.Fatalf("info = %+v", info)
	}

	// Output that is not valid UTF-8 must survive the trip.
	proc.printed("hello \xff\xfe world")
	waitFor(t, "output event", func() bool { return strings.Contains(events.output(info.ID), "world") })
	if got := events.output(info.ID); got != "hello \xff\xfe world" {
		t.Fatalf("output = %q, want the exact bytes", got)
	}
	svc.Shutdown()
}

func TestTerminalWriteAndResizeReachTheShell(t *testing.T) {
	events, proc := &terminalEvents{}, newFakeProc()
	svc := newTestTerminalService(events, proc)
	info, _ := svc.Open(TerminalKindLocal, "", 80, 24)
	defer svc.Shutdown()

	if err := svc.Write(info.ID, "ls -la\r"); err != nil {
		t.Fatal(err)
	}
	if proc.typed() != "ls -la\r" {
		t.Fatalf("shell received %q", proc.typed())
	}

	if err := svc.Resize(info.ID, 120, 40); err != nil {
		t.Fatal(err)
	}
	if len(proc.resizes) != 1 || proc.resizes[0] != [2]int{120, 40} {
		t.Fatalf("resizes = %v", proc.resizes)
	}
	// A collapsed panel reports 0x0; that must not shrink the shell to nothing.
	if err := svc.Resize(info.ID, 0, 0); err != nil || len(proc.resizes) != 1 {
		t.Fatalf("0x0 resize must be ignored: err=%v resizes=%v", err, proc.resizes)
	}
}

func TestTerminalReportsExitAndForgetsTheSession(t *testing.T) {
	events, proc := &terminalEvents{}, newFakeProc()
	proc.exit = 3
	svc := newTestTerminalService(events, proc)
	info, _ := svc.Open(TerminalKindLocal, "", 80, 24)

	_ = proc.outW.Close() // the shell ends by itself
	waitFor(t, "exit event", func() bool { return events.exitCount() == 1 })

	events.mu.Lock()
	got := events.exits[0]
	events.mu.Unlock()
	if got.ID != info.ID || got.ExitCode != 3 {
		t.Fatalf("exit = %+v, want id %s code 3", got, info.ID)
	}
	if err := svc.Write(info.ID, "x"); err == nil {
		t.Fatal("writing to an ended session must fail")
	}
}

func TestTerminalCloseEndsTheSessionOnceAndIsIdempotent(t *testing.T) {
	events, proc := &terminalEvents{}, newFakeProc()
	svc := newTestTerminalService(events, proc)
	info, _ := svc.Open(TerminalKindLocal, "", 80, 24)

	svc.Close(info.ID)
	svc.Close(info.ID) // already gone: not an error
	svc.Close("never-existed")

	if proc.closes != 1 {
		t.Fatalf("process closed %d times, want exactly once (double-closing a ConPTY is unsafe)", proc.closes)
	}
	if events.exitCount() != 1 {
		t.Fatalf("exit events = %d, want 1", events.exitCount())
	}
}

func TestTerminalShutdownEndsEverySessionAndRefusesNewOnes(t *testing.T) {
	events := &terminalEvents{}
	var procs []*fakeProc
	svc := NewTerminalService(events, func(string) (*models.ConnectionProfile, error) { return nil, nil }, nil)
	svc.startLocal = func(cols, rows int) (terminalProcess, string, error) {
		p := newFakeProc()
		procs = append(procs, p)
		return p, "sh", nil
	}
	for i := 0; i < 3; i++ {
		if _, err := svc.Open(TerminalKindLocal, "", 80, 24); err != nil {
			t.Fatal(err)
		}
	}

	svc.Shutdown()

	for i, p := range procs {
		if p.closes != 1 {
			t.Errorf("session %d closed %d times, want 1", i, p.closes)
		}
	}
	if _, err := svc.Open(TerminalKindLocal, "", 80, 24); err == nil {
		t.Fatal("Open after Shutdown must fail")
	}
}

func TestTerminalOpenFailuresAreReported(t *testing.T) {
	events := &terminalEvents{}
	svc := NewTerminalService(events, func(string) (*models.ConnectionProfile, error) { return nil, nil }, nil)
	svc.startLocal = func(cols, rows int) (terminalProcess, string, error) {
		return nil, "", errors.New("no pty here")
	}

	if _, err := svc.Open(TerminalKindLocal, "", 80, 24); err == nil || !strings.Contains(err.Error(), "no pty here") {
		t.Fatalf("local failure = %v", err)
	}
	if _, err := svc.Open("telnet", "", 80, 24); err == nil || !strings.Contains(err.Error(), "unknown terminal kind") {
		t.Fatalf("unknown kind = %v", err)
	}
	if _, err := svc.Open(TerminalKindSSH, "x", 80, 24); err == nil || !strings.Contains(err.Error(), "not available") {
		t.Fatalf("ssh with no opener = %v", err)
	}
}

func TestTerminalSSHRequiresAConnectionWithATunnel(t *testing.T) {
	events := &terminalEvents{}
	profiles := map[string]*models.ConnectionProfile{
		"plain": {ID: "plain", Name: "plain db"},
		"tun": {
			ID: "tun", Name: "prod", SSHEnabled: true, SSHHost: "bastion", SSHUser: "me",
			SSHAuth: sshtunnel.AuthPassword, SSHPassword: "pw",
		},
	}
	var gotCfg sshtunnel.Config
	var gotCols, gotRows int
	proc := newFakeProc()
	svc := NewTerminalService(events,
		func(id string) (*models.ConnectionProfile, error) { return profiles[id], nil },
		func(_ context.Context, cfg sshtunnel.Config, cols, rows int) (terminalProcess, error) {
			gotCfg, gotCols, gotRows = cfg, cols, rows
			return proc, nil
		})
	defer svc.Shutdown()

	if _, err := svc.Open(TerminalKindSSH, "plain", 80, 24); err == nil || !strings.Contains(err.Error(), "no SSH tunnel") {
		t.Fatalf("connection without a tunnel = %v", err)
	}
	if _, err := svc.Open(TerminalKindSSH, "missing", 80, 24); err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unknown connection = %v", err)
	}

	info, err := svc.Open(TerminalKindSSH, "tun", 100, 30)
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "me@bastion" {
		t.Errorf("title = %q", info.Title)
	}
	if gotCfg.Host != "bastion" || gotCfg.Port != sshtunnel.DefaultPort || gotCfg.Password != "pw" || gotCols != 100 || gotRows != 30 {
		t.Errorf("opener got cfg=%+v cols=%d rows=%d", gotCfg, gotCols, gotRows)
	}
}

// TestLocalShellRoundTrip drives the real platform shell (ConPTY on Windows, a
// PTY elsewhere) end to end: type a command, read its output back.
func TestLocalShellRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("starts a real shell")
	}
	events := &terminalEvents{}
	svc := NewTerminalService(events, func(string) (*models.ConnectionProfile, error) { return nil, nil }, nil)
	defer svc.Shutdown()

	info, err := svc.Open(TerminalKindLocal, "", 100, 30)
	if err != nil {
		t.Skipf("no local pseudo-terminal in this environment: %v", err)
	}

	// Build the marker from two pieces so the echoed command line itself can
	// never contain it; only the command's output does.
	command := "echo zentro-term-$((1+1))\r"
	want := "zentro-term-2"
	if runtime.GOOS == "windows" {
		command = "Write-Output ('zentro-term-' + (1+1))\r"
	}
	if err := svc.Write(info.ID, command); err != nil {
		t.Fatal(err)
	}
	// A real shell cold-starts slowly on a shared CI runner (PowerShell under
	// ConPTY took longer than 5s there), so give it far more room than the fakes.
	defer func() {
		if t.Failed() {
			t.Logf("shell output so far: %q", events.output(info.ID))
		}
	}()
	waitForWithin(t, 45*time.Second, "shell output", func() bool {
		return strings.Contains(events.output(info.ID), want)
	})

	if err := svc.Resize(info.ID, 120, 40); err != nil {
		t.Errorf("resize: %v", err)
	}
	svc.Close(info.ID)
	if events.exitCount() != 1 {
		t.Errorf("exit events = %d, want 1", events.exitCount())
	}
}
