// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"os/exec"
	"syscall"
)

// createNoWindow is CREATE_NO_WINDOW - the documented Windows flag for
// running a console-subsystem child (e.g. git.exe, cmd.exe) without letting
// the OS allocate and flash a visible console window for it.
const createNoWindow = 0x08000000

// hideWindow suppresses the console window Windows would otherwise flash for
// a console-subsystem child process. No-op on other platforms (see
// exec_other.go) since only Windows allocates a console per child by default.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
}
