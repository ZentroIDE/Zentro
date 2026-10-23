// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
)

func (s *SourceControlService) ReadGitIgnore(repoPath string) (string, error) {
	path, err := resolveRepoRootFilePath(repoPath, ".gitignore")
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("source control: read .gitignore: %w", err)
	}
	return string(data), nil
}

func (s *SourceControlService) WriteGitIgnore(repoPath, content string) error {
	path, err := resolveRepoRootFilePath(repoPath, ".gitignore")
	if err != nil {
		return err
	}
	if len(content) > 1024*1024 {
		return fmt.Errorf("source control: .gitignore too large")
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("source control: write .gitignore: %w", err)
	}
	return nil
}
