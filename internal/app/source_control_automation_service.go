// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"

	"zentro/internal/models"
)

type SourceControlAutomationService struct {
	mu          sync.RWMutex
	logger      *slog.Logger
	repo        *GitRepoAdapter
	sc          *SourceControlService
	saveProject func(*models.Project) error
}

func NewSourceControlAutomationService(sc *SourceControlService, saveProject func(*models.Project) error) *SourceControlAutomationService {
	return &SourceControlAutomationService{
		repo:        NewGitRepoAdapter(),
		sc:          sc,
		saveProject: saveProject,
	}
}

func (s *SourceControlAutomationService) SetLogger(logger *slog.Logger) {
	s.mu.Lock()
	s.logger = logger
	s.mu.Unlock()
}

func (s *SourceControlAutomationService) Enable(project *models.Project) error {
	if project == nil {
		return fmt.Errorf("source control automation: active project is required")
	}
	project.AutoSchemaSnapshots = true
	return s.persistProject(project)
}

func (s *SourceControlAutomationService) Disable(project *models.Project) error {
	if project == nil {
		return fmt.Errorf("source control automation: active project is required")
	}
	project.AutoSchemaSnapshots = false
	return s.persistProject(project)
}

func (s *SourceControlAutomationService) GetStatus(project *models.Project) (GitTrackingStatus, error) {
	if project == nil {
		return GitTrackingStatus{Enabled: false, Initialized: false}, nil
	}

	repoRoot := strings.TrimSpace(project.StoragePath)
	status := GitTrackingStatus{
		Enabled:   project.AutoSchemaSnapshots,
		RepoPath:  repoRoot,
		ProjectID: project.ID,
	}
	if repoRoot == "" {
		status.LastError = "project storage path is empty"
		return status, nil
	}

	repo, err := s.repo.Open(repoRoot, "source control automation")
	if errorsIsRepoMissing(err) {
		return status, nil
	}
	if err != nil {
		status.LastError = err.Error()
		return status, nil
	}
	status.Initialized = true

	head, err := repo.Head()
	if err == nil {
		status.LastCommitHash = head.Hash().String()
	}
	wt, err := s.repo.Worktree(repo, "source control automation")
	if err == nil {
		ws, stErr := wt.Status()
		if stErr == nil {
			status.PendingCount = len(trackedManagedFilesFromStatus(ws))
		}
	}
	return status, nil
}

func (s *SourceControlAutomationService) TrackSchemaSnapshot(project *models.Project, schema string, files map[string]string, message string) (GitCommitResult, error) {
	if project == nil {
		return GitCommitResult{}, fmt.Errorf("source control automation: active project is required")
	}
	if !project.AutoSchemaSnapshots {
		return GitCommitResult{}, nil
	}
	repoRoot := strings.TrimSpace(project.StoragePath)
	if repoRoot == "" {
		return GitCommitResult{}, fmt.Errorf("source control automation: project storage path is empty")
	}

	schemaKey := sanitizePathSegment(schema)
	if schemaKey == "" {
		schemaKey = "default"
	}

	if _, err := s.repo.EnsureManagedRepo(repoRoot, "source control automation", managedGitRepoOptions{
		BootstrapInitialCommit: true,
		InitialCommitMessage:   initialProjectCommitMessage,
	}); err != nil {
		return GitCommitResult{}, err
	}

	schemaDir, err := resolveRepoRootFilePath(repoRoot, filepath.Join("artifacts", "source-control", "schema", schemaKey))
	if err != nil {
		return GitCommitResult{}, err
	}
	if err := os.RemoveAll(schemaDir); err != nil {
		return GitCommitResult{}, err
	}
	if err := os.MkdirAll(schemaDir, 0o755); err != nil {
		return GitCommitResult{}, err
	}

	for relPath, content := range files {
		target, err := resolveRepoRootFilePath(repoRoot, filepath.Join("artifacts", "source-control", "schema", schemaKey, filepath.FromSlash(relPath)))
		if err != nil {
			return GitCommitResult{}, err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return GitCommitResult{}, err
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return GitCommitResult{}, err
		}
	}

	msg := strings.TrimSpace(message)
	if msg == "" {
		msg = fmt.Sprintf("zentro.sc.auto: snapshot schema %s", schemaKey)
	}
	return s.commitManaged(repoRoot, msg, "Zentro Source Control", "source-control@zentro.local")
}

func (s *SourceControlAutomationService) persistProject(project *models.Project) error {
	if s.saveProject == nil || project == nil {
		return nil
	}
	return s.saveProject(project)
}

func (s *SourceControlAutomationService) commitManaged(repoRoot, message, authorName, authorEmail string) (GitCommitResult, error) {
	repo, err := s.repo.Open(repoRoot, "source control automation")
	if err != nil {
		return GitCommitResult{}, err
	}
	wt, err := s.repo.Worktree(repo, "source control automation")
	if err != nil {
		return GitCommitResult{}, err
	}

	statusBefore, err := wt.Status()
	if err != nil {
		return GitCommitResult{}, err
	}
	allowed := trackedManagedFilesFromStatus(statusBefore)
	for _, path := range allowed {
		st := statusBefore[path]
		if st.Worktree == git.Deleted || st.Staging == git.Deleted {
			if _, err := wt.Remove(path); err != nil && !os.IsNotExist(err) {
				return GitCommitResult{}, err
			}
			continue
		}
		if _, err := wt.Add(path); err != nil {
			return GitCommitResult{}, err
		}
	}

	statusAfter, err := wt.Status()
	if err != nil {
		return GitCommitResult{}, err
	}
	files := trackedManagedFilesFromStatus(statusAfter)
	result := GitCommitResult{
		Message:   message,
		Files:     files,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		NoChanges: len(files) == 0,
	}
	if len(files) == 0 {
		return result, nil
	}

	hash, err := wt.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now().UTC(),
		},
	})
	if err != nil {
		return GitCommitResult{}, err
	}
	result.Hash = hash.String()
	s.logInfo("source control automation: committed", "repo", repoRoot, "message", message, "files", len(files), "hash", result.Hash)
	return result, nil
}

func (s *SourceControlAutomationService) logInfo(msg string, args ...any) {
	s.mu.RLock()
	logger := s.logger
	s.mu.RUnlock()
	if logger != nil {
		logger.Info(msg, args...)
	}
}

func errorsIsRepoMissing(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "repository does not exist")
}
