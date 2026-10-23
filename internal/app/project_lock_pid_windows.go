// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"golang.org/x/sys/windows"
)

const stillActive = 259

// isProcessAlive reports whether pid belongs to a running process.
// Known limitation: Windows reuses PIDs, so a recycled PID can make a stale
// lock look live; callers store acquired_at for a future age heuristic.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		// Access denied still proves the process exists.
		return err == windows.ERROR_ACCESS_DENIED
	}
	defer windows.CloseHandle(handle)
	var exitCode uint32
	if err := windows.GetExitCodeProcess(handle, &exitCode); err != nil {
		return false
	}
	return exitCode == stillActive
}
