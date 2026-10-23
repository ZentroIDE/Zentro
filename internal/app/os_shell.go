// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"os/exec"
	goruntime "runtime"
)

func osArchLabel() string {
	return goruntime.GOOS + " " + goruntime.GOARCH
}

func fileManagerCmd(target string) *exec.Cmd {
	switch goruntime.GOOS {
	case "windows":
		cmd := exec.Command("explorer", target)
		hideWindow(cmd)
		return cmd
	case "darwin":
		return exec.Command("open", target)
	default:
		return exec.Command("xdg-open", target)
	}
}

func openPathCmd(target string) *exec.Cmd {
	switch goruntime.GOOS {
	case "windows":
		cmd := exec.Command("cmd", "/c", "start", "", target)
		hideWindow(cmd)
		return cmd
	case "darwin":
		return exec.Command("open", target)
	default:
		return exec.Command("xdg-open", target)
	}
}
