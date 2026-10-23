// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/go-git/go-git/v5"
)

const (
	trackedSQLRootPath = "scripts/queries/"
	trackedSchemaPath  = "artifacts/source-control/schema/"
)

var defaultManagedGitIgnoreRules = []string{
	"# Zentro managed: track project SQL assets and schema recovery snapshots",
	"*",
	"!.gitignore",
	"!scripts/",
	"!scripts/queries/",
	"!scripts/queries/**/*.sql",
	"!scripts/queries/**/index.json",
	"!artifacts/",
	"!artifacts/source-control/",
	"!artifacts/source-control/schema/",
	"!artifacts/source-control/schema/**",
}

func isTrackedQuerySQLPath(path string) bool {
	normalized := pathpkg.Clean(filepath.ToSlash(strings.TrimSpace(path)))
	if normalized == "." || normalized == "" {
		return false
	}
	return strings.HasPrefix(normalized, trackedSQLRootPath) && strings.HasSuffix(strings.ToLower(normalized), ".sql")
}

func isTrackedScriptIndexPath(path string) bool {
	normalized := pathpkg.Clean(filepath.ToSlash(strings.TrimSpace(path)))
	if normalized == "." || normalized == "" {
		return false
	}
	return strings.HasPrefix(normalized, trackedSQLRootPath) && strings.HasSuffix(strings.ToLower(normalized), "/index.json")
}

func isTrackedSchemaPath(path string) bool {
	normalized := pathpkg.Clean(filepath.ToSlash(strings.TrimSpace(path)))
	if normalized == "." || normalized == "" {
		return false
	}
	return normalized == strings.TrimSuffix(trackedSchemaPath, "/") || strings.HasPrefix(normalized, trackedSchemaPath)
}

func isManagedTrackedPath(path string) bool {
	return isTrackedQuerySQLPath(path) || isTrackedScriptIndexPath(path) || isTrackedSchemaPath(path)
}

func trackedManagedFilesFromStatus(status git.Status) []string {
	if len(status) == 0 {
		return []string{}
	}
	files := make([]string, 0, len(status))
	for path, st := range status {
		if st.Staging == git.Unmodified && st.Worktree == git.Unmodified {
			continue
		}
		if !isManagedTrackedPath(path) {
			continue
		}
		files = append(files, path)
	}
	sort.Strings(files)
	return files
}

func trackedQuerySQLFilesFromStatus(status git.Status) []string {
	return trackedManagedFilesFromStatus(status)
}

func ensureManagedProjectGitIgnore(repoPath string) error {
	if strings.TrimSpace(repoPath) == "" {
		return fmt.Errorf("source control: git repo path is not configured")
	}

	gitignorePath := filepath.Join(repoPath, ".gitignore")
	existing := ""
	if data, err := os.ReadFile(gitignorePath); err == nil {
		existing = string(data)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("source control: read .gitignore: %w", err)
	}

	merged := mergeManagedGitIgnoreRules(existing)
	if merged == existing {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(gitignorePath), 0o755); err != nil {
		return fmt.Errorf("source control: ensure .gitignore directory: %w", err)
	}
	if err := os.WriteFile(gitignorePath, []byte(merged), 0o644); err != nil {
		return fmt.Errorf("source control: write .gitignore: %w", err)
	}
	return nil
}

func mergeManagedGitIgnoreRules(existing string) string {
	content := strings.ReplaceAll(existing, "\r\n", "\n")
	seen := map[string]struct{}{}
	for _, line := range strings.Split(content, "\n") {
		seen[strings.TrimSpace(line)] = struct{}{}
	}

	toAppend := make([]string, 0, len(defaultManagedGitIgnoreRules))
	for _, rule := range defaultManagedGitIgnoreRules {
		if _, ok := seen[rule]; ok {
			continue
		}
		toAppend = append(toAppend, rule)
	}
	if len(toAppend) == 0 {
		return content
	}

	var out strings.Builder
	out.WriteString(content)
	if content != "" && !strings.HasSuffix(content, "\n") {
		out.WriteString("\n")
	}
	for _, rule := range toAppend {
		out.WriteString(rule)
		out.WriteString("\n")
	}
	return out.String()
}

func resolveRepoRootFilePath(repoPath, fileName string) (string, error) {
	repoRoot := strings.TrimSpace(repoPath)
	if repoRoot == "" {
		return "", fmt.Errorf("source control: git repo path is not configured")
	}
	absoluteRepoRoot, err := filepath.Abs(repoRoot)
	if err != nil {
		return "", fmt.Errorf("source control: resolve repo path: %w", err)
	}
	target := filepath.Join(absoluteRepoRoot, fileName)
	absoluteTarget, err := filepath.Abs(target)
	if err != nil {
		return "", fmt.Errorf("source control: resolve file path: %w", err)
	}
	if absoluteTarget != absoluteRepoRoot && !strings.HasPrefix(absoluteTarget, absoluteRepoRoot+string(filepath.Separator)) {
		return "", fmt.Errorf("source control: invalid target path")
	}
	return absoluteTarget, nil
}
