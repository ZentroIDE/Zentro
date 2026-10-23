// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
)

type managedGitRepoOptions struct {
	BootstrapInitialCommit bool
	InitialCommitMessage   string
}

// GitRepoAdapter centralizes low-level go-git repository plumbing shared by
// source control, automation, and project bootstrap.
type GitRepoAdapter struct{}

func NewGitRepoAdapter() *GitRepoAdapter {
	return &GitRepoAdapter{}
}

func (a *GitRepoAdapter) Open(repoPath, scope string) (*git.Repository, error) {
	repoRoot := strings.TrimSpace(repoPath)
	if repoRoot == "" {
		return nil, fmt.Errorf("%s: git repo path is not configured", scope)
	}
	repo, err := git.PlainOpen(repoRoot)
	if err != nil {
		return nil, fmt.Errorf("%s: cannot open repo at %q: %w", scope, repoRoot, err)
	}
	return repo, nil
}

func (a *GitRepoAdapter) Worktree(repo *git.Repository, scope string) (*git.Worktree, error) {
	if repo == nil {
		return nil, fmt.Errorf("%s: repository is required", scope)
	}
	wt, err := repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("%s: worktree: %w", scope, err)
	}
	return wt, nil
}

func (a *GitRepoAdapter) EnsureManagedRepo(
	repoPath string,
	scope string,
	opts managedGitRepoOptions,
) (*git.Repository, error) {
	repoRoot := strings.TrimSpace(repoPath)
	if repoRoot == "" {
		return nil, fmt.Errorf("%s: git repo path is not configured", scope)
	}
	if err := os.MkdirAll(repoRoot, 0o755); err != nil {
		return nil, fmt.Errorf("%s: ensure repo directory: %w", scope, err)
	}
	if err := ensureManagedProjectGitIgnore(repoRoot); err != nil {
		return nil, err
	}

	repo, err := git.PlainOpen(repoRoot)
	if err == nil {
		if opts.BootstrapInitialCommit {
			if err := ensureInitialProjectCommit(repo, repoRoot, opts.InitialCommitMessage); err != nil {
				return nil, err
			}
		}
		return repo, nil
	}
	if !errors.Is(err, git.ErrRepositoryNotExists) {
		return nil, fmt.Errorf("%s: cannot open repo at %q: %w", scope, repoRoot, err)
	}

	repo, err = git.PlainInit(repoRoot, false)
	if err != nil {
		return nil, fmt.Errorf("%s: cannot init repo at %q: %w", scope, repoRoot, err)
	}
	if err := repo.Storer.SetReference(
		plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.NewBranchReferenceName("main")),
	); err != nil {
		return nil, fmt.Errorf("%s: set default branch main: %w", scope, err)
	}
	if opts.BootstrapInitialCommit {
		if err := ensureInitialProjectCommit(repo, repoRoot, opts.InitialCommitMessage); err != nil {
			return nil, err
		}
	}
	return repo, nil
}

func (a *GitRepoAdapter) ReadCommitAuthor(
	repo *git.Repository,
	fallbackName string,
	fallbackEmail string,
) (string, string) {
	name := fallbackName
	email := fallbackEmail
	cfg, _ := repo.Config()
	if cfg != nil {
		if n := cfg.User.Name; n != "" {
			name = n
		}
		if e := cfg.User.Email; e != "" {
			email = e
		}
	}
	return name, email
}
