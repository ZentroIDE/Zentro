// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"
)

// Legacy Wails methods kept temporarily for frontend compatibility while the
// backend converges on Source Control terminology.

func (a *App) EnableGitTracking() error {
	if a.project == nil {
		return fmt.Errorf("no active project")
	}
	if a.svc.SCAuto == nil {
		return fmt.Errorf("source control automation unavailable")
	}
	return a.svc.SCAuto.Enable(a.project)
}

func (a *App) DisableGitTracking() error {
	if a.project == nil {
		return fmt.Errorf("no active project")
	}
	if a.svc.SCAuto == nil {
		return fmt.Errorf("source control automation unavailable")
	}
	return a.svc.SCAuto.Disable(a.project)
}

func (a *App) GetGitTrackingStatus() (GitTrackingStatus, error) {
	if a.project == nil {
		return GitTrackingStatus{Enabled: false, Initialized: false}, nil
	}
	if a.svc.SCAuto == nil {
		return GitTrackingStatus{}, fmt.Errorf("source control automation unavailable")
	}
	return a.svc.SCAuto.GetStatus(a.project)
}

func (a *App) ListGitTimeline(limit int, eventType string) ([]GitTimelineItem, error) {
	path, err := a.scRepoPath()
	if err != nil {
		return []GitTimelineItem{}, nil
	}
	return a.svc.SC.ListTimeline(path, limit, eventType)
}

func (a *App) GetGitCommitDiff(commitHash string) (string, error) {
	path, err := a.scRepoPath()
	if err != nil {
		return "", err
	}
	return a.svc.SC.GetCommitDiff(path, commitHash)
}

func (a *App) ManualGitCommit(message string) (GitCommitResult, error) {
	path, err := a.scRepoPath()
	if err != nil {
		return GitCommitResult{}, err
	}
	return a.svc.SC.CommitManaged(path, strings.TrimSpace(message))
}

func (a *App) GetCommitFileDiffs(commitHash string) ([]GitCommitFileDiff, error) {
	path, err := a.scRepoPath()
	if err != nil {
		return nil, err
	}
	return a.svc.SC.GetFileDiffs(path, commitHash)
}

func (a *App) RestoreGitCommit(commitHash string) error {
	path, err := a.scRepoPath()
	if err != nil {
		return err
	}
	return a.svc.SC.RestoreCommit(path, commitHash)
}

func (a *App) GetGitPendingChanges() ([]string, error) {
	path, err := a.scRepoPath()
	if err != nil {
		return []string{}, nil
	}
	return a.svc.SC.GetPendingChanges(path)
}

func (a *App) RunGitTrackingMigration() error {
	return nil
}

func (a *App) SnapshotStoredProcedures(schema string) (int, error) {
	_ = schema
	return 0, nil
}
