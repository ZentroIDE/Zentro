// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows

package sshtunnel

import (
	"errors"
	"io"
	"net"
	"os"
)

func dialAgent() (io.ReadWriteCloser, error) {
	sock := os.Getenv("SSH_AUTH_SOCK")
	if sock == "" {
		return nil, errors.New("SSH_AUTH_SOCK is not set")
	}
	return net.Dial("unix", sock)
}
