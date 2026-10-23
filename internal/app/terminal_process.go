// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"io"
)

// terminalProcess is one running shell behind a terminal session: a local
// shell on a pseudo-terminal (ConPTY on Windows, a PTY elsewhere) or a shell on
// an SSH server. Read yields what the terminal should display, Write takes the
// user's keystrokes.
type terminalProcess interface {
	io.ReadWriteCloser
	// Resize tells the pseudo-terminal the viewport changed size.
	Resize(cols, rows int) error
	// Wait blocks until the shell exits, or ctx ends, and returns its exit code.
	Wait(ctx context.Context) (int, error)
}
