import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function readGitLines(args, cwd) {
  const output = execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getPreCommitCandidateFiles(repoRoot) {
  const staged = readGitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], repoRoot);
  const untracked = readGitLines(['ls-files', '--others', '--exclude-standard'], repoRoot);
  return [...new Set([...staged, ...untracked])];
}

export function resolveScopedFiles(repoRoot, files) {
  return [...new Set(files)]
    .map((file) => path.resolve(repoRoot, file))
    .filter((file) => existsSync(file));
}
