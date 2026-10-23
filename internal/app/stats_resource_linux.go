// SPDX-License-Identifier: GPL-3.0-only

//go:build linux

package app

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// platformProcessUsage measures the Go process: CPU from getrusage, resident
// memory from /proc/self/statm (pages 2 = resident).
func platformProcessUsage() (processUsage, error) {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return processUsage{}, err
	}
	cpu := timevalDuration(ru.Utime) + timevalDuration(ru.Stime)

	raw, err := os.ReadFile("/proc/self/statm")
	if err != nil {
		return processUsage{CPUTime: cpu}, nil
	}
	fields := strings.Fields(string(raw))
	if len(fields) < 2 {
		return processUsage{CPUTime: cpu}, fmt.Errorf("unexpected /proc/self/statm: %q", raw)
	}
	pages, err := strconv.ParseUint(fields[1], 10, 64)
	if err != nil {
		return processUsage{CPUTime: cpu}, err
	}
	return processUsage{CPUTime: cpu, MemBytes: pages * uint64(os.Getpagesize())}, nil
}

func timevalDuration(tv syscall.Timeval) time.Duration {
	return time.Duration(tv.Sec)*time.Second + time.Duration(tv.Usec)*time.Microsecond
}
