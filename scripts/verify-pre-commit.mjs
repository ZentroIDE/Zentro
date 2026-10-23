import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPreCommitCandidateFiles } from './changed-files-lib.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const candidateFiles = getPreCommitCandidateFiles(repoRoot);

function runStep(label, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync('node', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (candidateFiles.length === 0) {
  console.log('No staged or untracked files to verify.');
  process.exit(0);
}

const backendFiles = candidateFiles.filter((file) => file === 'main.go' || file.startsWith('internal/') || file.startsWith('cmd/'));
const frontendFiles = candidateFiles.filter((file) => file.startsWith('frontend/src/'));

// A file list this long overflows Windows' command-line length (ENAMETOOLONG)
// once it's spread across argv — and past this size there's little left to
// "scope" to anyway (a repo-wide change like an SPDX-header or license-year
// pass). Fall back to each script's own full, unscoped check instead of
// trying to chunk the argv.
const ARGV_SAFE_FILE_COUNT = 200;

if (backendFiles.length > 0) {
  const scoped = backendFiles.length <= ARGV_SAFE_FILE_COUNT;
  runStep(
    scoped ? 'Backend guardrails (scoped)' : 'Backend guardrails (full — too many files to scope)',
    scoped ? ['scripts/check-be-guardrails.mjs', ...backendFiles] : ['scripts/check-be-guardrails.mjs'],
  );
}

if (frontendFiles.length > 0) {
  const scoped = frontendFiles.length <= ARGV_SAFE_FILE_COUNT;
  const label = suffix => (scoped ? `${suffix} (scoped)` : `${suffix} (full — too many files to scope)`);
  const withFiles = args => (scoped ? [...args, ...frontendFiles] : args);
  runStep(label('Frontend guardrails'), withFiles(['scripts/check-fe-guardrails.mjs']));
  runStep(label('Feature boundaries'), withFiles(['scripts/check-feature-boundaries.mjs']));
  runStep(label('Frontend debt dashboard'), withFiles(['scripts/fe-debt-dashboard.mjs']));
}

console.log('\nScoped pre-commit checks passed.');
