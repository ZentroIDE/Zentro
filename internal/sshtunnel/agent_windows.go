// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package sshtunnel

import (
	"io"
	"os"
)

// openSSHAgentPipe is where Windows' built-in OpenSSH agent listens. Pageant
// and third-party agents are not supported.
const openSSHAgentPipe = `\\.\pipe\openssh-ssh-agent`

func dialAgent() (io.ReadWriteCloser, error) {
	return os.OpenFile(openSSHAgentPipe, os.O_RDWR, 0)
}
