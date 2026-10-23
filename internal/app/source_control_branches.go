// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"sort"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
)

func (s *SourceControlService) ListBranches(repoPath string) ([]string, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return nil, err
	}

	iter, err := repo.Branches()
	if err != nil {
		return nil, fmt.Errorf("source control: list branches: %w", err)
	}
	defer iter.Close()

	branches := make([]string, 0, 8)
	_ = iter.ForEach(func(ref *plumbing.Reference) error {
		if ref == nil {
			return nil
		}
		branches = append(branches, ref.Name().Short())
		return nil
	})

	sort.Strings(branches)
	return branches, nil
}

func (s *SourceControlService) CheckoutBranch(repoPath, branchName string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}

	name := strings.TrimSpace(branchName)
	if name == "" {
		return fmt.Errorf("source control: branch name is required")
	}

	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}

	if err := wt.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(name),
		Keep:   true,
	}); err != nil {
		return fmt.Errorf("source control: checkout %q: %w", name, err)
	}
	return nil
}

func (s *SourceControlService) CreateBranch(repoPath, branchName string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}

	name := strings.TrimSpace(branchName)
	if name == "" {
		return fmt.Errorf("source control: branch name is required")
	}

	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}

	if err := wt.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(name),
		Create: true,
		Keep:   true,
	}); err != nil {
		return fmt.Errorf("source control: create branch %q: %w", name, err)
	}
	return nil
}

func (s *SourceControlService) CreateBranchFrom(repoPath, branchName, fromRef string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}

	name := strings.TrimSpace(branchName)
	if name == "" {
		return fmt.Errorf("source control: branch name is required")
	}
	from := strings.TrimSpace(fromRef)
	if from == "" {
		return fmt.Errorf("source control: base ref is required")
	}

	hash, err := resolveRevisionHash(repo, from)
	if err != nil {
		return fmt.Errorf("source control: resolve ref %q: %w", from, err)
	}

	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}

	if err := wt.Checkout(&git.CheckoutOptions{
		Branch: plumbing.NewBranchReferenceName(name),
		Create: true,
		Hash:   hash,
		Keep:   true,
	}); err != nil {
		return fmt.Errorf("source control: create branch %q from %q: %w", name, from, err)
	}
	return nil
}

func (s *SourceControlService) CheckoutDetached(repoPath, ref string) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()

	repo, err := s.openRepo(repoPath)
	if err != nil {
		return err
	}

	target := strings.TrimSpace(ref)
	if target == "" {
		return fmt.Errorf("source control: target ref is required")
	}

	hash, err := resolveRevisionHash(repo, target)
	if err != nil {
		return fmt.Errorf("source control: resolve ref %q: %w", target, err)
	}

	wt, err := s.repo.Worktree(repo, "source control")
	if err != nil {
		return err
	}

	if err := wt.Checkout(&git.CheckoutOptions{
		Hash: hash,
		Keep: true,
	}); err != nil {
		return fmt.Errorf("source control: checkout detached %q: %w", target, err)
	}
	return nil
}

func resolveRevisionHash(repo *git.Repository, ref string) (plumbing.Hash, error) {
	hashPtr, err := repo.ResolveRevision(plumbing.Revision(ref))
	if err == nil && hashPtr != nil {
		return *hashPtr, nil
	}

	if !strings.HasPrefix(ref, "refs/") {
		hashPtr, err = repo.ResolveRevision(plumbing.Revision("refs/heads/" + ref))
		if err == nil && hashPtr != nil {
			return *hashPtr, nil
		}
	}

	return plumbing.ZeroHash, fmt.Errorf("reference not found")
}
