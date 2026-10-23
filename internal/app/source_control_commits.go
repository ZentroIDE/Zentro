// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func (s *SourceControlService) Commit(repoPath, message string) (string, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return "", err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return "", err
	}

	authorName, authorEmail := s.repo.ReadCommitAuthor(repo, "Zentro", "zentro@local")

	msg := strings.TrimSpace(message)
	if msg == "" {
		msg = "chore: commit via Zentro"
	}

	hash, err := wt.Commit(msg, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", fmt.Errorf("source control: commit: %w", err)
	}
	return hash.String(), nil
}

func (s *SourceControlService) CommitAllIfDirty(repoPath, message string) (string, bool, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return "", false, err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return "", false, err
	}

	statusBefore, err := wt.Status()
	if err != nil {
		return "", false, fmt.Errorf("source control: status: %w", err)
	}
	allowed := trackedManagedFilesFromStatus(statusBefore)
	for _, path := range allowed {
		st := statusBefore[path]
		if st.Worktree == git.Deleted || st.Staging == git.Deleted {
			if _, err := wt.Remove(path); err != nil && !os.IsNotExist(err) {
				return "", false, fmt.Errorf("source control: stage delete %q: %w", path, err)
			}
			continue
		}
		if _, err := wt.Add(path); err != nil {
			return "", false, fmt.Errorf("source control: stage %q: %w", path, err)
		}
	}

	statusAfter, err := wt.Status()
	if err != nil {
		return "", false, fmt.Errorf("source control: status: %w", err)
	}
	if len(trackedManagedFilesFromStatus(statusAfter)) == 0 {
		return "", true, nil
	}

	authorName, authorEmail := s.repo.ReadCommitAuthor(repo, "Zentro", "zentro@local")

	msg := strings.TrimSpace(message)
	if msg == "" {
		msg = "app.close: autosave flush"
	}

	hash, err := wt.Commit(msg, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", false, fmt.Errorf("source control: commit: %w", err)
	}
	return hash.String(), false, nil
}

func (s *SourceControlService) GetHistory(repoPath string, limit int) ([]SCCommit, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return nil, err
	}

	head, err := repo.Head()
	if err != nil {
		if err == plumbing.ErrReferenceNotFound {
			return []SCCommit{}, nil
		}
		return nil, fmt.Errorf("source control: head: %w", err)
	}

	iter, err := repo.Log(&git.LogOptions{From: head.Hash()})
	if err != nil {
		return nil, fmt.Errorf("source control: log: %w", err)
	}
	defer iter.Close()

	if limit <= 0 {
		limit = 100
	}

	var commits []SCCommit
	for i := 0; i < limit; i++ {
		c, err := iter.Next()
		if err != nil {
			break
		}
		commits = append(commits, SCCommit{
			Hash:    c.Hash.String(),
			Message: strings.TrimSpace(c.Message),
			Author:  c.Author.Name,
			When:    c.Author.When.UTC().Format(time.RFC3339),
		})
	}
	return commits, nil
}
