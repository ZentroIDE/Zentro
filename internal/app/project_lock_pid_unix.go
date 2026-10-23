// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows

package app

import (
	"errors"
	"os"
	"syscall"
)

// isProcessAlive reports whether pid belongs to a running process.
// On unix, FindProcess always succeeds; signal 0 probes existence.
// EPERM means the process exists but is owned by another user.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = proc.Signal(syscall.Signal(0))
	return err == nil || errors.Is(err, syscall.EPERM)
}
