// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"os"
	"path/filepath"
	"sync"
)

// AppLogFile is an io.Writer that routes writes to the current log file.
// Calling SwitchTo closes the old file and opens the new one; all writes
// after the call go to the new file. Safe for concurrent use.
type AppLogFile struct {
	mu      sync.Mutex
	current *os.File
	path    string
}

// NewAppLogFile opens path as the initial log file.
// If path is empty or cannot be opened, writes are silently discarded.
func NewAppLogFile(path string) *AppLogFile {
	lf := &AppLogFile{}
	_ = lf.SwitchTo(path)
	return lf
}

// Write implements io.Writer.
func (lf *AppLogFile) Write(p []byte) (int, error) {
	lf.mu.Lock()
	f := lf.current
	lf.mu.Unlock()
	if f == nil {
		return len(p), nil // discard
	}
	return f.Write(p)
}

// SwitchTo closes the current log file and opens path.
// An empty path leaves the writer in discard mode.
func (lf *AppLogFile) SwitchTo(path string) error {
	lf.mu.Lock()
	defer lf.mu.Unlock()

	if lf.current != nil {
		_ = lf.current.Close()
		lf.current = nil
	}
	lf.path = path

	if path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		lf.path = ""
		return err
	}
	lf.current = f
	return nil
}

// SwitchToProject opens the per-project app log inside storagePath.
// Falls back to global zentro.log if storagePath is empty.
func (lf *AppLogFile) SwitchToProject(storagePath string) {
	if storagePath == "" {
		globalPath, _ := filepath.Abs("zentro.log")
		_ = lf.SwitchTo(globalPath)
		return
	}
	dir := filepath.Join(storagePath, ".zentro-tracking", "runtime")
	_ = lf.SwitchTo(filepath.Join(dir, "app.log"))
}

// CurrentPath returns the absolute path of the file currently being written.
func (lf *AppLogFile) CurrentPath() string {
	lf.mu.Lock()
	defer lf.mu.Unlock()
	return lf.path
}

// Close closes the underlying file.
func (lf *AppLogFile) Close() {
	lf.mu.Lock()
	defer lf.mu.Unlock()
	if lf.current != nil {
		_ = lf.current.Close()
		lf.current = nil
	}
}
