// SPDX-License-Identifier: GPL-3.0-only

package sshtunnel

import (
	"context"
	"errors"
	"io"
	"sync"

	"golang.org/x/crypto/ssh"
)

// Shell is an interactive shell on the SSH server, running on a pseudo-terminal.
// It rides the same shared SSH connection as the database tunnels, so opening a
// terminal for a connection costs no extra login and keeps that connection
// alive for as long as the shell is open.
type Shell struct {
	session *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader

	once    sync.Once
	release func()
}

// OpenShell starts a login shell on the SSH server described by cfg, sized
// cols x rows.
func (m *Manager) OpenShell(ctx context.Context, cfg Config, cols, rows int) (*Shell, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	e, err := m.acquire(ctx, cfg)
	if err != nil {
		return nil, err
	}

	session, err := e.client.NewSession()
	if err != nil {
		m.release(e)
		return nil, tunnelErr("cannot open a session on %s: %v", cfg.addr(), err)
	}
	fail := func(format string, args ...any) (*Shell, error) {
		_ = session.Close()
		m.release(e)
		return nil, tunnelErr(format, args...)
	}

	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := session.RequestPty("xterm-256color", clampDim(rows), clampDim(cols), modes); err != nil {
		return fail("%s refused a terminal: %v", cfg.addr(), err)
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		return fail("cannot attach to the shell input: %v", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return fail("cannot attach to the shell output: %v", err)
	}
	// On a PTY the server merges stderr into stdout; this just makes sure
	// nothing is left unread if a server sends it separately.
	session.Stderr = io.Discard
	if err := session.Shell(); err != nil {
		return fail("cannot start a shell on %s: %v", cfg.addr(), err)
	}

	return &Shell{session: session, stdin: stdin, stdout: stdout, release: func() { m.release(e) }}, nil
}

func clampDim(n int) int {
	if n < 1 {
		return 1
	}
	return n
}

func (s *Shell) Read(p []byte) (int, error)  { return s.stdout.Read(p) }
func (s *Shell) Write(p []byte) (int, error) { return s.stdin.Write(p) }

// Resize tells the remote PTY the terminal changed size.
func (s *Shell) Resize(cols, rows int) error {
	return s.session.WindowChange(clampDim(rows), clampDim(cols))
}

// Wait blocks until the shell exits (or ctx ends) and returns its exit code.
func (s *Shell) Wait(ctx context.Context) (int, error) {
	done := make(chan error, 1)
	go func() { done <- s.session.Wait() }()
	select {
	case err := <-done:
		if err == nil {
			return 0, nil
		}
		var exit *ssh.ExitError
		if errors.As(err, &exit) {
			return exit.ExitStatus(), nil
		}
		// A shell closed from our side ends with io.EOF / missing exit status.
		return 0, nil
	case <-ctx.Done():
		return 0, ctx.Err()
	}
}

// Close ends the shell and lets go of the SSH connection reference.
func (s *Shell) Close() error {
	err := s.session.Close()
	s.once.Do(s.release)
	return err
}
