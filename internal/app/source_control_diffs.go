// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func (s *SourceControlService) GetFileDiffs(repoPath, hash string) ([]GitCommitFileDiff, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return nil, err
	}

	commitHash := plumbing.NewHash(hash)
	commit, err := repo.CommitObject(commitHash)
	if err != nil {
		return nil, fmt.Errorf("source control: commit %q: %w", hash, err)
	}

	commitTree, err := commit.Tree()
	if err != nil {
		return nil, fmt.Errorf("source control: tree: %w", err)
	}

	var parentTree *object.Tree
	if commit.NumParents() > 0 {
		parent, err := commit.Parents().Next()
		if err == nil {
			parentTree, _ = parent.Tree()
		}
	}

	changes, err := object.DiffTree(parentTree, commitTree)
	if err != nil {
		return nil, fmt.Errorf("source control: diff tree: %w", err)
	}

	var diffs []GitCommitFileDiff
	for _, change := range changes {
		before := readBlobContent(repo, change.From.TreeEntry.Hash)
		after := readBlobContent(repo, change.To.TreeEntry.Hash)

		path := change.To.Name
		if path == "" {
			path = change.From.Name
		}
		diffs = append(diffs, GitCommitFileDiff{
			Path:   path,
			Before: before,
			After:  after,
		})
	}
	return diffs, nil
}

func (s *SourceControlService) GetWorkingFileDiff(repoPath, filePath string, staged bool) (GitCommitFileDiff, error) {
	repo, err := s.openRepo(repoPath)
	if err != nil {
		return GitCommitFileDiff{}, err
	}

	normalizedPath, err := normalizeRepoRelativePath(filePath)
	if err != nil {
		return GitCommitFileDiff{}, err
	}

	before := ""
	after := ""

	if staged {
		before = readHeadFileContent(repo, normalizedPath)
		after = readIndexFileContent(repo, normalizedPath)
	} else {
		before = readIndexFileContent(repo, normalizedPath)
		after = readWorkingTreeFileContent(repoPath, normalizedPath)
	}

	return GitCommitFileDiff{
		Path:   normalizedPath,
		Before: before,
		After:  after,
	}, nil
}

func normalizeRepoRelativePath(filePath string) (string, error) {
	path := strings.TrimSpace(strings.ReplaceAll(filePath, "\\", "/"))
	if path == "" {
		return "", fmt.Errorf("source control: empty file path")
	}
	cleaned := strings.TrimPrefix(pathpkg.Clean("/"+path), "/")
	if cleaned == "." || cleaned == "" || strings.HasPrefix(cleaned, "../") || cleaned == ".." {
		return "", fmt.Errorf("source control: invalid file path %q", filePath)
	}
	return cleaned, nil
}

func readHeadFileContent(repo *git.Repository, filePath string) string {
	head, err := repo.Head()
	if err != nil {
		return ""
	}
	commit, err := repo.CommitObject(head.Hash())
	if err != nil {
		return ""
	}
	tree, err := commit.Tree()
	if err != nil {
		return ""
	}
	file, err := tree.File(filePath)
	if err != nil {
		return ""
	}
	content, err := file.Contents()
	if err != nil {
		return ""
	}
	return content
}

func readIndexFileContent(repo *git.Repository, filePath string) string {
	idx, err := repo.Storer.Index()
	if err != nil || idx == nil {
		return ""
	}
	for _, entry := range idx.Entries {
		if entry.Name == filePath {
			return readBlobContent(repo, entry.Hash)
		}
	}
	return ""
}

func readWorkingTreeFileContent(repoPath, filePath string) string {
	fullPath := filepath.Join(repoPath, filepath.FromSlash(filePath))
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return ""
	}
	return string(content)
}

func readBlobContent(repo *git.Repository, hash plumbing.Hash) string {
	if hash.IsZero() {
		return ""
	}
	blob, err := repo.BlobObject(hash)
	if err != nil {
		return ""
	}
	r, err := blob.Reader()
	if err != nil {
		return ""
	}
	defer r.Close()
	var sb strings.Builder
	buf := make([]byte, 32*1024)
	for {
		n, e := r.Read(buf)
		if n > 0 {
			sb.Write(buf[:n])
		}
		if e != nil {
			break
		}
	}
	return sb.String()
}
