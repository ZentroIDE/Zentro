// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newTestLockService(t *testing.T, dir string) *ProjectLockService {
	t.Helper()
	svc := NewProjectLockService(nil)
	svc.locksDir = func() (string, error) { return dir, nil }
	svc.focusOwner = func(int) bool { return false }
	return svc
}

func writeForeignLock(t *testing.T, dir, projectID string, pid int) string {
	t.Helper()
	path := filepath.Join(dir, projectID+".lock")
	payload := projectLockPayload{
		PID:        pid,
		ProjectID:  projectID,
		Hostname:   "other-host",
		AcquiredAt: time.Now().Format(time.RFC3339),
		App:        "zentro",
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal foreign lock: %v", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("write foreign lock: %v", err)
	}
	return path
}

func TestProjectLockAcquireAndRelease(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)

	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("acquire: %v", err)
	}
	path := filepath.Join(dir, "p1.lock")
	payload, ok := readLockPayload(path)
	if !ok {
		t.Fatalf("lock file unreadable at %s", path)
	}
	if payload.PID != os.Getpid() {
		t.Fatalf("lock PID = %d, want %d", payload.PID, os.Getpid())
	}

	svc.Release("p1")
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("lock file still exists after release: %v", err)
	}
}

func TestProjectLockReacquireSameProcessIsNoop(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)

	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("re-acquire: %v", err)
	}
}

func TestProjectLockBlockedByLiveForeignProcess(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return true }
	writeForeignLock(t, dir, "p1", os.Getpid()+100000)

	err := svc.Acquire("p1", "Project One")
	if !errors.Is(err, ErrProjectLocked) {
		t.Fatalf("err = %v, want ErrProjectLocked", err)
	}
}

func TestProjectLockStaleForeignLockIsReclaimed(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return false }
	path := writeForeignLock(t, dir, "p1", os.Getpid()+100000)

	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("acquire over stale lock: %v", err)
	}
	payload, ok := readLockPayload(path)
	if !ok || payload.PID != os.Getpid() {
		t.Fatalf("lock not rewritten with own PID: ok=%v pid=%d", ok, payload.PID)
	}
}

func TestProjectLockUnreadableLockTreatedAsStale(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	path := filepath.Join(dir, "p1.lock")
	if err := os.WriteFile(path, []byte("not-json"), 0o644); err != nil {
		t.Fatalf("write garbage lock: %v", err)
	}

	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("acquire over garbage lock: %v", err)
	}
}

func TestProjectLockSwitchToKeepsOldOnFailure(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return true }

	if err := svc.Acquire("old", "Old Project"); err != nil {
		t.Fatalf("acquire old: %v", err)
	}
	writeForeignLock(t, dir, "new", os.Getpid()+100000)

	err := svc.SwitchTo("new", "New Project", "old")
	if !errors.Is(err, ErrProjectLocked) {
		t.Fatalf("err = %v, want ErrProjectLocked", err)
	}
	if _, statErr := os.Stat(filepath.Join(dir, "old.lock")); statErr != nil {
		t.Fatalf("old lock lost after failed switch: %v", statErr)
	}
}

func TestProjectLockSwitchToReleasesOldOnSuccess(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)

	if err := svc.Acquire("old", "Old Project"); err != nil {
		t.Fatalf("acquire old: %v", err)
	}
	if err := svc.SwitchTo("new", "New Project", "old"); err != nil {
		t.Fatalf("switch: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "old.lock")); !os.IsNotExist(err) {
		t.Fatalf("old lock not released: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "new.lock")); err != nil {
		t.Fatalf("new lock missing: %v", err)
	}
}

func TestProjectLockReleaseDoesNotDeleteForeignLock(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)

	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("acquire: %v", err)
	}
	// Simulate another process replacing the lock file behind our back.
	path := writeForeignLock(t, dir, "p1", os.Getpid()+100000)

	svc.Release("p1")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("foreign lock was deleted by Release: %v", err)
	}
}

func TestProjectLockReleaseAll(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)

	for _, id := range []string{"a", "b"} {
		if err := svc.Acquire(id, id); err != nil {
			t.Fatalf("acquire %s: %v", id, err)
		}
	}
	svc.ReleaseAll()
	for _, id := range []string{"a", "b"} {
		if _, err := os.Stat(filepath.Join(dir, id+".lock")); !os.IsNotExist(err) {
			t.Fatalf("lock %s not released: %v", id, err)
		}
	}
}

func TestProjectLockBlockedAcquireFocusesOwner(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return true }
	foreignPID := os.Getpid() + 100000
	writeForeignLock(t, dir, "p1", foreignPID)

	var focusedPID int
	var focusCalls int
	svc.focusOwner = func(pid int) bool {
		focusCalls++
		focusedPID = pid
		return true
	}

	if err := svc.Acquire("p1", "Project One"); !errors.Is(err, ErrProjectLocked) {
		t.Fatalf("err = %v, want ErrProjectLocked", err)
	}
	if focusCalls != 1 {
		t.Fatalf("focusOwner called %d times, want 1", focusCalls)
	}
	if focusedPID != foreignPID {
		t.Fatalf("focusedPID = %d, want %d", focusedPID, foreignPID)
	}
}

func TestProjectLockCheckHolder(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return true }
	foreignPID := os.Getpid() + 100000
	writeForeignLock(t, dir, "p1", foreignPID)

	pid, locked := svc.CheckHolder("p1")
	if !locked || pid != foreignPID {
		t.Fatalf("CheckHolder = (%d, %v), want (%d, true)", pid, locked, foreignPID)
	}

	// Unlocked / unknown project.
	if _, locked := svc.CheckHolder("nonexistent"); locked {
		t.Fatal("expected nonexistent project to be unlocked")
	}
}

func TestProjectLockCheckHolderIgnoresOwnHeldLock(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	if err := svc.Acquire("p1", "Project One"); err != nil {
		t.Fatalf("acquire: %v", err)
	}

	if _, locked := svc.CheckHolder("p1"); locked {
		t.Fatal("CheckHolder should not report a lock this process itself holds")
	}
}

func TestProjectLockFocusHolder(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	svc.isAlive = func(pid int) bool { return true }
	writeForeignLock(t, dir, "p1", os.Getpid()+100000)

	focusCalled := false
	svc.focusOwner = func(int) bool {
		focusCalled = true
		return true
	}

	if !svc.FocusHolder("p1") {
		t.Fatal("FocusHolder should report success")
	}
	if !focusCalled {
		t.Fatal("focusOwner was not called")
	}

	if svc.FocusHolder("nonexistent") {
		t.Fatal("FocusHolder should return false for an unlocked project")
	}
}

func TestProjectLockEmptyIDIsNoop(t *testing.T) {
	dir := t.TempDir()
	svc := newTestLockService(t, dir)
	if err := svc.Acquire("", "unnamed"); err != nil {
		t.Fatalf("empty id acquire: %v", err)
	}
	if err := svc.SwitchTo("", "", ""); err != nil {
		t.Fatalf("empty switch: %v", err)
	}
}
