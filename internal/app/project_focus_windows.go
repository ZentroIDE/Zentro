// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const swRestore = 9

var (
	modUser32                    = windows.NewLazySystemDLL("user32.dll")
	procEnumWindows              = modUser32.NewProc("EnumWindows")
	procGetWindowThreadProcessId = modUser32.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible          = modUser32.NewProc("IsWindowVisible")
	procShowWindow               = modUser32.NewProc("ShowWindow")
	procSetForegroundWindow      = modUser32.NewProc("SetForegroundWindow")
	procAttachThreadInput        = modUser32.NewProc("AttachThreadInput")
	procGetWindowTextLengthW     = modUser32.NewProc("GetWindowTextLengthW")
)

// focusProcessWindow brings pid's main top-level window to the foreground.
// Best-effort: returns false (never panics) if the window can't be found or
// Windows' foreground-lock rules refuse the switch.
//
// Windows normally only lets the process that owns the current foreground
// window steal focus for another process; AttachThreadInput temporarily
// merges input state with the target thread so SetForegroundWindow is
// honored — the standard workaround for this restriction.
func focusProcessWindow(pid int) bool {
	if pid <= 0 {
		return false
	}
	targetPID := uint32(pid)

	var targetHwnd windows.Handle
	cb := syscall.NewCallback(func(hwnd windows.Handle, _ uintptr) uintptr {
		visible, _, _ := procIsWindowVisible.Call(uintptr(hwnd))
		if visible == 0 {
			return 1 // continue enumeration
		}
		titleLen, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
		if titleLen == 0 {
			return 1 // skip windows with no title (tooltips, hidden helpers)
		}
		var ownerPID uint32
		procGetWindowThreadProcessId.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&ownerPID)))
		if ownerPID == targetPID {
			targetHwnd = hwnd
			return 0 // stop enumeration
		}
		return 1
	})
	procEnumWindows.Call(cb, 0)
	if targetHwnd == 0 {
		return false
	}

	procShowWindow.Call(uintptr(targetHwnd), swRestore)

	currentThreadID := windows.GetCurrentThreadId()
	targetThreadID, _, _ := procGetWindowThreadProcessId.Call(uintptr(targetHwnd), 0)

	procAttachThreadInput.Call(uintptr(currentThreadID), targetThreadID, 1)
	ok, _, _ := procSetForegroundWindow.Call(uintptr(targetHwnd))
	procAttachThreadInput.Call(uintptr(currentThreadID), targetThreadID, 0)

	return ok != 0
}
