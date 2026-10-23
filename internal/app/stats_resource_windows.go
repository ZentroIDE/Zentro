// SPDX-License-Identifier: GPL-3.0-only

//go:build windows

package app

import (
	"fmt"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var procGetProcessMemoryInfo = windows.NewLazySystemDLL("kernel32.dll").NewProc("K32GetProcessMemoryInfo")

// processMemoryCounters mirrors PROCESS_MEMORY_COUNTERS.
type processMemoryCounters struct {
	cb                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
}

// platformProcessUsage sums CPU time and working set over this process and all
// its descendants (the WebView2 renderer/GPU/utility processes).
func platformProcessUsage() (processUsage, error) {
	pids, err := processTree(windows.GetCurrentProcessId())
	if err != nil {
		return processUsage{}, err
	}
	var total processUsage
	for _, pid := range pids {
		u, err := usageOfProcess(pid)
		if err != nil {
			continue // exited, or not ours to query
		}
		total.CPUTime += u.CPUTime
		total.MemBytes += u.MemBytes
	}
	return total, nil
}

// processTree returns root and every process descended from it.
func processTree(root uint32) ([]uint32, error) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("process snapshot: %w", err)
	}
	defer windows.CloseHandle(snap)

	children := map[uint32][]uint32{}
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snap, &entry); err != nil {
		return nil, fmt.Errorf("process list: %w", err)
	}
	for {
		children[entry.ParentProcessID] = append(children[entry.ParentProcessID], entry.ProcessID)
		if err := windows.Process32Next(snap, &entry); err != nil {
			break
		}
	}

	out := []uint32{root}
	seen := map[uint32]bool{root: true}
	for i := 0; i < len(out); i++ {
		for _, child := range children[out[i]] {
			if !seen[child] {
				seen[child] = true
				out = append(out, child)
			}
		}
	}
	return out, nil
}

func usageOfProcess(pid uint32) (processUsage, error) {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, pid)
	if err != nil {
		return processUsage{}, err
	}
	defer windows.CloseHandle(h)

	var creation, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(h, &creation, &exit, &kernel, &user); err != nil {
		return processUsage{}, err
	}
	var counters processMemoryCounters
	counters.cb = uint32(unsafe.Sizeof(counters))
	r, _, callErr := procGetProcessMemoryInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&counters)), uintptr(counters.cb))
	if r == 0 {
		return processUsage{}, callErr
	}
	mem, err := privateWorkingSet(h)
	if err != nil {
		mem = uint64(counters.WorkingSetSize) // fall back to the shared-inclusive figure
	}
	return processUsage{
		CPUTime:  filetimeDuration(kernel) + filetimeDuration(user),
		MemBytes: mem,
	}, nil
}

const (
	pageSize           = 4096
	wsShareCountShift  = 5 // PSAPI_WORKING_SET_BLOCK: Protection(5) | ShareCount(3) | Shared(1) | ...
	wsShareCountMask   = 0x7
	wsSharedBit        = 1 << 8
	errorBadLength     = windows.Errno(24)
	maxWorkingSetTries = 4
)

var procQueryWorkingSet = windows.NewLazySystemDLL("kernel32.dll").NewProc("K32QueryWorkingSet")

// privateWorkingSet returns the resident bytes not shared with other processes,
// which is what Task Manager's Memory column reports. Plain WorkingSetSize also
// counts shared DLL/image pages, and summing it over the WebView2 process tree
// counts those same pages once per process.
func privateWorkingSet(h windows.Handle) (uint64, error) {
	entries := 16384
	for try := 0; try < maxWorkingSetTries; try++ {
		buf := make([]uintptr, entries+1) // [0] = NumberOfEntries, then one block per page
		r, _, callErr := procQueryWorkingSet.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf))*unsafe.Sizeof(buf[0]))
		if r == 0 {
			if callErr == errorBadLength {
				entries = int(buf[0]) + 2048 // the call reports the needed count; leave room to grow
				continue
			}
			return 0, callErr
		}
		var pages uint64
		for _, block := range buf[1 : 1+int(buf[0])] {
			if block&wsSharedBit == 0 && (block>>wsShareCountShift)&wsShareCountMask <= 1 {
				pages++
			}
		}
		return pages * pageSize, nil
	}
	return 0, fmt.Errorf("working set kept growing")
}

// filetimeDuration converts a FILETIME interval (100ns units) to a Duration.
func filetimeDuration(ft windows.Filetime) time.Duration {
	ticks := uint64(ft.HighDateTime)<<32 | uint64(ft.LowDateTime)
	return time.Duration(ticks) * 100 * time.Nanosecond
}
