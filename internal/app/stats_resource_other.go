// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows && !linux

package app

import (
	goruntime "runtime"
	"syscall"
	"time"
)

// platformProcessUsage measures the Go process. CPU comes from getrusage;
// resident memory has no cheap cgo-free source here, so the Go runtime's own
// footprint (memory obtained from the OS) stands in for it.
func platformProcessUsage() (processUsage, error) {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return processUsage{}, err
	}
	var ms goruntime.MemStats
	goruntime.ReadMemStats(&ms)
	cpu := time.Duration(ru.Utime.Sec)*time.Second + time.Duration(ru.Utime.Usec)*time.Microsecond +
		time.Duration(ru.Stime.Sec)*time.Second + time.Duration(ru.Stime.Usec)*time.Microsecond
	return processUsage{CPUTime: cpu, MemBytes: ms.Sys}, nil
}
