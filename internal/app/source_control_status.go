// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"

	"github.com/go-git/go-git/v5"
)

func (s *SourceControlService) GetStatus(repoPath string) (SCStatus, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return SCStatus{}, err
	}

	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return SCStatus{}, err
	}

	gitStatus, err := wt.Status()
	if err != nil {
		return SCStatus{}, fmt.Errorf("source control: status: %w", err)
	}

	head, err := repo.Head()
	branch := "HEAD"
	if err == nil {
		if head.Name().IsBranch() {
			branch = head.Name().Short()
		} else {
			branch = head.Hash().String()[:8]
		}
	}

	files := make([]SCFileStatus, 0, len(gitStatus))
	for path, st := range gitStatus {
		staged := st.Staging != git.Unmodified && st.Staging != git.Untracked

		code := st.Worktree
		if staged {
			code = st.Staging
		}
		statusLabel := "modified"
		switch code {
		case git.Added:
			statusLabel = "added"
		case git.Deleted:
			statusLabel = "deleted"
		case git.Untracked:
			statusLabel = "untracked"
			staged = false
		}

		files = append(files, SCFileStatus{
			Path:   path,
			Staged: staged,
			Status: statusLabel,
		})
	}

	return SCStatus{
		Branch: branch,
		Files:  files,
		Clean:  len(files) == 0,
	}, nil
}

func (s *SourceControlService) StageFile(repoPath, path string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}
	if _, err := wt.Add(path); err != nil {
		return fmt.Errorf("source control: stage %q: %w", path, err)
	}
	return nil
}

func (s *SourceControlService) UnstageFile(repoPath, path string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}
	if err := wt.Reset(&git.ResetOptions{
		Files: []string{path},
		Mode:  git.MixedReset,
	}); err != nil {
		return fmt.Errorf("source control: unstage %q: %w", path, err)
	}
	return nil
}

func (s *SourceControlService) StageAll(repoPath string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}
	if _, err := wt.Add("."); err != nil {
		return fmt.Errorf("source control: stage all: %w", err)
	}
	return nil
}
