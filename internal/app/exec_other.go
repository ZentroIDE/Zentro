// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows

package app

import "os/exec"

// hideWindow is a no-op on Linux/macOS - neither allocates a visible console
// for a spawned child process the way Windows does, so there is nothing to
// suppress. See exec_windows.go for the Windows behavior.
func hideWindow(cmd *exec.Cmd) {}
