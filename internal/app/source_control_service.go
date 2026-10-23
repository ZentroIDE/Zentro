// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"sync"

	"github.com/go-git/go-git/v5"
)

type SCFileStatus struct {
	Path   string `json:"path"`
	Staged bool   `json:"staged"`
	Status string `json:"status"` // "modified" | "added" | "deleted" | "untracked"
}

type SCStatus struct {
	Branch string         `json:"branch"`
	Files  []SCFileStatus `json:"files"`
	Clean  bool           `json:"clean"`
}

type SCCommit struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Author  string `json:"author"`
	When    string `json:"when"`
}

// SourceControlService exposes user-facing git operations for the project repo.
// Methods are spread across sibling files in this package by concern:
//   - source_control_branches.go   — list/create/checkout branches, revision resolution
//   - source_control_status.go     — status, stage/unstage
//   - source_control_commits.go    — Commit, CommitAllIfDirty, GetHistory
//   - source_control_diffs.go      — file diffs (commit vs commit, working tree vs index/HEAD)
//   - source_control_gitignore.go  — .gitignore read/write
type SourceControlService struct {
	opMu sync.Mutex
	repo *GitRepoAdapter
}

func NewSourceControlService() *SourceControlService {
	return &SourceControlService{repo: NewGitRepoAdapter()}
}

func (s *SourceControlService) openRepo(repoPath string) (*git.Repository, error) {
	return s.repo.Open(repoPath, "source control")
}

func (s *SourceControlService) InitRepo(repoPath string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	_, err := s.repo.EnsureManagedRepo(repoPath, "source control", managedGitRepoOptions{
		BootstrapInitialCommit: true,
		InitialCommitMessage:   initialProjectCommitMessage,
	})
	return err
}
