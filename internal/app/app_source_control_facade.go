// SPDX-License-Identifier: GPL-3.0-only

package app

import "fmt"

func (a *App) scRepoPath() (string, error) {
	if a.project == nil {
		return "", fmt.Errorf("no active project")
	}
	if a.project.StoragePath == "" {
		return "", fmt.Errorf("source control: project storage path is not configured")
	}
	return a.project.StoragePath, nil
}

// scDispatch resolves the active project's repo path and calls fn with it,
// propagating the path-resolution error otherwise. Every SC* facade method
// is this same resolve-path-then-call shape; this is the one place that
// shape lives.
func scDispatch[T any](a *App, fn func(repoPath string) (T, error)) (T, error) {
	var zero T
	path, err := a.scRepoPath()
	if err != nil {
		return zero, err
	}
	return fn(path)
}

// scDispatchErr is scDispatch for calls that return only an error.
func scDispatchErr(a *App, fn func(repoPath string) error) error {
	path, err := a.scRepoPath()
	if err != nil {
		return err
	}
	return fn(path)
}

func (a *App) SCGetStatus() (SCStatus, error) {
	return scDispatch(a, a.svc.SC.GetStatus)
}

func (a *App) SCStageFile(filePath string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.StageFile(path, filePath) })
}

func (a *App) SCUnstageFile(filePath string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.UnstageFile(path, filePath) })
}

func (a *App) SCStageAll() error {
	return scDispatchErr(a, a.svc.SC.StageAll)
}

func (a *App) SCCommit(message string) (string, error) {
	return scDispatch(a, func(path string) (string, error) { return a.svc.SC.Commit(path, message) })
}

func (a *App) SCGetHistory(limit int) ([]SCCommit, error) {
	return scDispatch(a, func(path string) ([]SCCommit, error) { return a.svc.SC.GetHistory(path, limit) })
}

func (a *App) SCGetFileDiffs(hash string) ([]GitCommitFileDiff, error) {
	return scDispatch(a, func(path string) ([]GitCommitFileDiff, error) { return a.svc.SC.GetFileDiffs(path, hash) })
}

func (a *App) SCGetWorkingFileDiff(filePath string, staged bool) (GitCommitFileDiff, error) {
	return scDispatch(a, func(path string) (GitCommitFileDiff, error) {
		return a.svc.SC.GetWorkingFileDiff(path, filePath, staged)
	})
}

func (a *App) SCListBranches() ([]string, error) {
	return scDispatch(a, a.svc.SC.ListBranches)
}

func (a *App) SCCheckoutBranch(branchName string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.CheckoutBranch(path, branchName) })
}

func (a *App) SCCreateBranch(branchName string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.CreateBranch(path, branchName) })
}

func (a *App) SCCreateBranchFrom(branchName string, fromRef string) error {
	return scDispatchErr(a, func(path string) error {
		return a.svc.SC.CreateBranchFrom(path, branchName, fromRef)
	})
}

func (a *App) SCCheckoutDetached(ref string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.CheckoutDetached(path, ref) })
}

func (a *App) SCInitRepo() error {
	return scDispatchErr(a, a.svc.SC.InitRepo)
}

func (a *App) SCReadGitIgnore() (string, error) {
	return scDispatch(a, a.svc.SC.ReadGitIgnore)
}

func (a *App) SCWriteGitIgnore(content string) error {
	return scDispatchErr(a, func(path string) error { return a.svc.SC.WriteGitIgnore(path, content) })
}
