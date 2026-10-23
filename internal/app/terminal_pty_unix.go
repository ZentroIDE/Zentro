// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows

package app

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/creack/pty"
)

// unixPTY is a shell process attached to a PTY master.
type unixPTY struct {
	f   *os.File
	cmd *exec.Cmd

	waitOnce sync.Once
	waitDone chan struct{}
	exitCode int
}

func (u *unixPTY) Read(p []byte) (int, error)  { return u.f.Read(p) }
func (u *unixPTY) Write(p []byte) (int, error) { return u.f.Write(p) }

func (u *unixPTY) Resize(cols, rows int) error {
	return pty.Setsize(u.f, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
}

// reap waits for the process exactly once, whoever asks first.
func (u *unixPTY) reap() {
	u.waitOnce.Do(func() {
		u.waitDone = make(chan struct{})
		go func() {
			_ = u.cmd.Wait()
			if u.cmd.ProcessState != nil {
				u.exitCode = u.cmd.ProcessState.ExitCode()
			}
			close(u.waitDone)
		}()
	})
}

func (u *unixPTY) Wait(ctx context.Context) (int, error) {
	u.reap()
	select {
	case <-u.waitDone:
		return u.exitCode, nil
	case <-ctx.Done():
		return 0, ctx.Err()
	}
}

func (u *unixPTY) Close() error {
	err := u.f.Close()
	if u.cmd.Process != nil {
		_ = u.cmd.Process.Kill()
	}
	u.reap()
	return err
}

// startLocalShell starts $SHELL (else /bin/sh) on a PTY in the user's home.
func startLocalShell(cols, rows int) (terminalProcess, string, error) {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	if home, err := os.UserHomeDir(); err == nil {
		cmd.Dir = home
	}
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: uint16(rows), Cols: uint16(cols)})
	if err != nil {
		return nil, "", err
	}
	return &unixPTY{f: f, cmd: cmd}, filepath.Base(shell), nil
}
