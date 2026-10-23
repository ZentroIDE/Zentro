// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"

	"github.com/UserExistsError/conpty"
)

// winPTY adapts a ConPTY session to terminalProcess.
type winPTY struct{ c *conpty.ConPty }

func (w *winPTY) Read(p []byte) (int, error)  { return w.c.Read(p) }
func (w *winPTY) Write(p []byte) (int, error) { return w.c.Write(p) }
func (w *winPTY) Close() error                { return w.c.Close() }
func (w *winPTY) Resize(cols, rows int) error { return w.c.Resize(cols, rows) }

func (w *winPTY) Wait(ctx context.Context) (int, error) {
	code, err := w.c.Wait(ctx)
	return int(code), err
}

// startLocalShell starts the user's shell on a ConPTY: PowerShell when
// present, else cmd.exe. Returns the process and a short name for the tab.
func startLocalShell(cols, rows int) (terminalProcess, string, error) {
	if !conpty.IsConPtyAvailable() {
		return nil, "", errors.New("the terminal needs Windows 10 version 1809 or later (ConPTY is not available)")
	}
	commandLine, name := windowsShell()
	opts := []conpty.ConPtyOption{conpty.ConPtyDimensions(cols, rows)}
	if home, err := os.UserHomeDir(); err == nil {
		opts = append(opts, conpty.ConPtyWorkDir(home))
	}
	cpty, err := conpty.Start(commandLine, opts...)
	if err != nil {
		return nil, "", fmt.Errorf("start %s: %w", name, err)
	}
	return &winPTY{c: cpty}, name, nil
}

func windowsShell() (commandLine, name string) {
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return `"` + path + `" -NoLogo`, "PowerShell"
	}
	if path, err := exec.LookPath("cmd.exe"); err == nil {
		return `"` + path + `"`, "cmd"
	}
	return "cmd.exe", "cmd"
}
