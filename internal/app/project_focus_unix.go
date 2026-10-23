// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows

package app

// focusProcessWindow is a no-op on non-Windows builds (Zentro is
// Windows-first; the caller falls back to spawning/erroring normally).
func focusProcessWindow(pid int) bool {
	return false
}
