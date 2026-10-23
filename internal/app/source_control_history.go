// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func (s *SourceControlService) GetCommitDiff(repoPath, commitHash string) (string, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return "", err
	}

	commit, err := repo.CommitObject(plumbing.NewHash(strings.TrimSpace(commitHash)))
	if err != nil {
		return "", err
	}

	var patch *object.Patch
	if commit.NumParents() == 0 {
		patch, err = commit.Patch(nil)
	} else {
		parent, parentErr := commit.Parent(0)
		if parentErr != nil {
			return "", parentErr
		}
		patch, err = parent.Patch(commit)
	}
	if err != nil {
		return "", err
	}
	return patch.String(), nil
}

func (s *SourceControlService) ListTimeline(repoPath string, limit int, eventType string) ([]GitTimelineItem, error) {
	repo, err := s.openRepo(repoPath)
	if errors.Is(err, git.ErrRepositoryNotExists) {
		return []GitTimelineItem{}, nil
	}
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	if _, err := repo.Head(); err != nil {
		if errors.Is(err, plumbing.ErrReferenceNotFound) || strings.Contains(strings.ToLower(err.Error()), "reference not found") {
			return []GitTimelineItem{}, nil
		}
		return nil, err
	}

	iter, err := repo.Log(&git.LogOptions{})
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	items := make([]GitTimelineItem, 0, limit)
	for len(items) < limit {
		commit, nextErr := iter.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			return nil, nextErr
		}
		message := strings.TrimSpace(commit.Message)
		evt := parseTimelineEventType(message)
		if eventType != "" && !strings.EqualFold(eventType, evt) {
			continue
		}
		files, _ := changedFilesForTimelineCommit(commit)
		items = append(items, GitTimelineItem{
			Hash:      commit.Hash.String(),
			Message:   message,
			EventType: evt,
			Author:    commit.Committer.Name,
			When:      commit.Committer.When.UTC().Format(time.RFC3339),
			Files:     files,
		})
	}
	return items, nil
}

func (s *SourceControlService) GetPendingChanges(repoPath string) ([]string, error) {
	repo, err := s.openRepo(repoPath)
	if errors.Is(err, git.ErrRepositoryNotExists) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return nil, err
	}
	status, err := wt.Status()
	if err != nil {
		return nil, err
	}
	return trackedManagedFilesFromStatus(status), nil
}

func (s *SourceControlService) CommitManaged(repoPath, message string) (GitCommitResult, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()
	return s.commitManagedLocked(repoPath, message, "Zentro", "zentro@local")
}

func (s *SourceControlService) RestoreCommit(repoPath, commitHash string) error {
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

	hash := plumbing.NewHash(strings.TrimSpace(commitHash))
	commit, err := repo.CommitObject(hash)
	if err != nil {
		return fmt.Errorf("source control: commit not found: %w", err)
	}
	tree, err := commit.Tree()
	if err != nil {
		return err
	}

	if err := tree.Files().ForEach(func(f *object.File) error {
		content, readErr := f.Contents()
		if readErr != nil {
			return readErr
		}
		absPath := filepath.Join(repoPath, filepath.FromSlash(f.Name))
		if mkErr := os.MkdirAll(filepath.Dir(absPath), 0o755); mkErr != nil {
			return mkErr
		}
		return os.WriteFile(absPath, []byte(content), 0o644)
	}); err != nil {
		return fmt.Errorf("source control: restore files failed: %w", err)
	}

	if err := wt.AddWithOptions(&git.AddOptions{All: true}); err != nil {
		return err
	}

	shortHash := strings.TrimSpace(commitHash)
	if len(shortHash) > 8 {
		shortHash = shortHash[:8]
	}
	_, err = wt.Commit(fmt.Sprintf("zentro.sc.restore: restored to %s", shortHash), &git.CommitOptions{
		Author: &object.Signature{
			Name:  "Zentro Source Control",
			Email: "source-control@zentro.local",
			When:  time.Now().UTC(),
		},
	})
	return err
}

func (s *SourceControlService) commitManagedLocked(repoPath, message, fallbackAuthorName, fallbackAuthorEmail string) (GitCommitResult, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return GitCommitResult{}, err
	}
	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return GitCommitResult{}, err
	}

	statusBefore, err := wt.Status()
	if err != nil {
		return GitCommitResult{}, fmt.Errorf("source control: status: %w", err)
	}
	allowed := trackedManagedFilesFromStatus(statusBefore)
	for _, path := range allowed {
		st := statusBefore[path]
		if st.Worktree == git.Deleted || st.Staging == git.Deleted {
			if _, err := wt.Remove(path); err != nil && !os.IsNotExist(err) {
				return GitCommitResult{}, fmt.Errorf("source control: stage delete %q: %w", path, err)
			}
			continue
		}
		if _, err := wt.Add(path); err != nil {
			return GitCommitResult{}, fmt.Errorf("source control: stage %q: %w", path, err)
		}
	}

	statusAfter, err := wt.Status()
	if err != nil {
		return GitCommitResult{}, fmt.Errorf("source control: status: %w", err)
	}
	files := trackedManagedFilesFromStatus(statusAfter)
	result := GitCommitResult{
		Message:   strings.TrimSpace(message),
		Files:     files,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		NoChanges: len(files) == 0,
	}
	if len(files) == 0 {
		return result, nil
	}

	authorName, authorEmail := s.repo.ReadCommitAuthor(repo, fallbackAuthorName, fallbackAuthorEmail)
	hash, err := wt.Commit(result.Message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return GitCommitResult{}, fmt.Errorf("source control: commit: %w", err)
	}
	result.Hash = hash.String()
	return result, nil
}

func parseTimelineEventType(message string) string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return "source_control.update"
	}
	parts := strings.SplitN(trimmed, ":", 2)
	return strings.TrimSpace(parts[0])
}

func changedFilesForTimelineCommit(commit *object.Commit) ([]string, error) {
	if commit == nil {
		return []string{}, nil
	}
	if commit.NumParents() == 0 {
		tree, err := commit.Tree()
		if err != nil {
			return nil, err
		}
		files := []string{}
		err = tree.Files().ForEach(func(file *object.File) error {
			files = append(files, file.Name)
			return nil
		})
		sort.Strings(files)
		return files, err
	}
	parent, err := commit.Parent(0)
	if err != nil {
		return nil, err
	}
	patch, err := parent.Patch(commit)
	if err != nil {
		return nil, err
	}
	stats := patch.Stats()
	files := make([]string, 0, len(stats))
	for _, stat := range stats {
		files = append(files, stat.Name)
	}
	sort.Strings(files)
	return files, nil
}
