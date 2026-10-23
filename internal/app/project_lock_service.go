// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ErrProjectLocked signals that another live Zentro process holds the lock
// for a project. The frontend matches on this message substring (Wails
// serializes errors to strings), so keep the wording stable.
var ErrProjectLocked = errors.New("project is already open in another Zentro window")

// projectLockPayload is the JSON body of a lock file.
type projectLockPayload struct {
	PID        int    `json:"pid"`
	ProjectID  string `json:"project_id"`
	Hostname   string `json:"hostname"`
	AcquiredAt string `json:"acquired_at"`
	App        string `json:"app"`
}

// ProjectLockService guards each project against being opened by more than
// one Zentro process at a time. Locks are files under the zentro config dir
// (never inside the project StoragePath — that directory is a git repo with
// auto-commit). Stale locks left behind by killed processes are detected via
// a PID-alive check and cleaned up on the next acquire.
//
// Known limitation: OS PID reuse can make a stale lock look live. The lock
// carries acquired_at for a future age heuristic; worst case the user deletes
// the lock file (its path is logged on conflict).
type ProjectLockService struct {
	mu         sync.Mutex
	held       map[string]string // projectID -> lock file path
	locksDir   func() (string, error)
	isAlive    func(pid int) bool
	focusOwner func(pid int) bool
	logger     *slog.Logger
}

func NewProjectLockService(logger *slog.Logger) *ProjectLockService {
	return &ProjectLockService{
		held:       make(map[string]string),
		locksDir:   defaultProjectLocksDir,
		isAlive:    isProcessAlive,
		focusOwner: focusProcessWindow,
		logger:     logger,
	}
}

func defaultProjectLocksDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("project lock: config dir: %w", err)
	}
	dir := filepath.Join(base, "zentro", "locks")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("project lock: mkdir: %w", err)
	}
	return dir, nil
}

// SetLogger attaches a logger after construction (Startup runs later than NewApp).
func (s *ProjectLockService) SetLogger(logger *slog.Logger) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logger = logger
}

func (s *ProjectLockService) lockPath(projectID string) (string, error) {
	dir, err := s.locksDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, projectID+".lock"), nil
}

// Acquire takes the lock for projectID or returns ErrProjectLocked (wrapped)
// when another live process holds it. Re-acquiring a lock this process
// already holds is a no-op success.
func (s *ProjectLockService) Acquire(projectID, projectName string) error {
	if projectID == "" {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.acquireLocked(projectID, projectName)
}

func (s *ProjectLockService) acquireLocked(projectID, projectName string) error {
	path, err := s.lockPath(projectID)
	if err != nil {
		return err
	}
	if _, alreadyHeld := s.held[projectID]; alreadyHeld {
		return nil
	}

	if err := s.tryCreateLock(path, projectID); err == nil {
		s.held[projectID] = path
		return nil
	} else if !os.IsExist(err) {
		return fmt.Errorf("project lock: create: %w", err)
	}

	payload, readable := readLockPayload(path)
	if readable && payload.PID == os.Getpid() {
		// Our own lock from this process (e.g. map lost after a partial
		// failure) — adopt it.
		s.held[projectID] = path
		return nil
	}
	if readable && s.isAlive(payload.PID) {
		s.logf("project lock held by live process", "path", path, "pid", payload.PID)
		// Best-effort: bring the window that already has this project open
		// to the foreground instead of leaving the user with just an error.
		s.focusOwner(payload.PID)
		return fmt.Errorf("cannot open %q: %w", projectName, ErrProjectLocked)
	}

	// Stale (dead PID or unreadable). Re-read to make sure the file was not
	// replaced by a fresh lock between our read and the remove, then retry
	// the exclusive create exactly once — losing that race means another
	// process won the project.
	current, currentReadable := readLockPayload(path)
	if currentReadable != readable || (currentReadable && current.PID != payload.PID) {
		return fmt.Errorf("cannot open %q: %w", projectName, ErrProjectLocked)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("project lock: remove stale: %w", err)
	}
	if err := s.tryCreateLock(path, projectID); err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("cannot open %q: %w", projectName, ErrProjectLocked)
		}
		return fmt.Errorf("project lock: create after stale cleanup: %w", err)
	}
	s.held[projectID] = path
	return nil
}

// tryCreateLock atomically creates the lock file (O_EXCL) and writes our payload.
func (s *ProjectLockService) tryCreateLock(path, projectID string) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	hostname, _ := os.Hostname()
	payload := projectLockPayload{
		PID:        os.Getpid(),
		ProjectID:  projectID,
		Hostname:   hostname,
		AcquiredAt: time.Now().Format(time.RFC3339),
		App:        "zentro",
	}
	encodeErr := json.NewEncoder(file).Encode(payload)
	syncErr := file.Sync()
	closeErr := file.Close()
	if encodeErr != nil || syncErr != nil || closeErr != nil {
		_ = os.Remove(path)
		return fmt.Errorf("project lock: write: %w", errors.Join(encodeErr, syncErr, closeErr))
	}
	return nil
}

func readLockPayload(path string) (projectLockPayload, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return projectLockPayload{}, false
	}
	var payload projectLockPayload
	if err := json.Unmarshal(raw, &payload); err != nil || payload.PID <= 0 {
		return projectLockPayload{}, false
	}
	return payload, true
}

// SwitchTo acquires the lock for the new project first and only then
// releases the old one, so a blocked open leaves the current project intact.
func (s *ProjectLockService) SwitchTo(newID, newName, oldID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if newID == oldID {
		if newID == "" {
			return nil
		}
		return s.acquireLocked(newID, newName)
	}
	if newID != "" {
		if err := s.acquireLocked(newID, newName); err != nil {
			return err
		}
	}
	if oldID != "" {
		s.releaseLocked(oldID)
	}
	return nil
}

// CheckHolder reports the PID of the live process currently holding
// projectID's lock, without acquiring anything. Used to decide whether
// "open in new window" should just focus the existing window instead of
// spawning a new process that would immediately hit the lock.
func (s *ProjectLockService) CheckHolder(projectID string) (pid int, locked bool) {
	if projectID == "" {
		return 0, false
	}
	path, err := s.lockPath(projectID)
	if err != nil {
		return 0, false
	}
	s.mu.Lock()
	if _, ownedByUs := s.held[projectID]; ownedByUs {
		s.mu.Unlock()
		return 0, false
	}
	s.mu.Unlock()

	payload, readable := readLockPayload(path)
	if !readable || !s.isAlive(payload.PID) {
		return 0, false
	}
	return payload.PID, true
}

// FocusHolder brings projectID's current owner window to the foreground.
// Returns false if the project isn't locked by a live process or the
// window couldn't be focused (best-effort, never errors).
func (s *ProjectLockService) FocusHolder(projectID string) bool {
	pid, locked := s.CheckHolder(projectID)
	if !locked {
		return false
	}
	return s.focusOwner(pid)
}

// Release drops the lock for projectID if this process holds it.
func (s *ProjectLockService) Release(projectID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.releaseLocked(projectID)
}

// ReleaseAll drops every lock this process holds. Called from App.Shutdown.
func (s *ProjectLockService) ReleaseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for projectID := range s.held {
		s.releaseLocked(projectID)
	}
}

func (s *ProjectLockService) releaseLocked(projectID string) {
	path, tracked := s.held[projectID]
	if !tracked {
		return
	}
	delete(s.held, projectID)
	// Never delete a lock owned by another process.
	if payload, ok := readLockPayload(path); ok && payload.PID != os.Getpid() {
		return
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		s.logf("project lock release failed", "path", path, "err", err)
	}
}

func (s *ProjectLockService) logf(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Warn(msg, args...)
	}
}
