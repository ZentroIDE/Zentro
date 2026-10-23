import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScopedFiles } from './changed-files-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const FEATURE_ROOT = path.resolve(REPO_ROOT, 'frontend', 'src', 'features');
const SRC_ROOT = path.resolve(REPO_ROOT, 'frontend', 'src');
const PRO_ROOT = path.resolve(SRC_ROOT, 'pro');
const EXTS = new Set(['.ts', '.tsx']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (EXTS.has(path.extname(full))) out.push(full);
  }
  return out;
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

const requestedFiles = process.argv.slice(2);
const scopedFiles = resolveScopedFiles(REPO_ROOT, requestedFiles).filter((file) => EXTS.has(path.extname(file)));
const featureDirs = readdirSync(FEATURE_ROOT)
  .map((name) => path.resolve(FEATURE_ROOT, name))
  .filter((full) => statSync(full).isDirectory());

const violations = [];

for (const featurePath of featureDirs) {
  const featureName = path.basename(featurePath);
  const files = requestedFiles.length > 0 ? scopedFiles.filter((file) => file.startsWith(featurePath + path.sep)) : walk(featurePath);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const relFile = toPosix(path.relative(REPO_ROOT, file));
    const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
    for (const match of matches) {
      const rawImport = match[1];
      if (!rawImport.startsWith('../') && !rawImport.startsWith('./')) continue;
      const normalized = toPosix(path.normalize(rawImport));
      if (!normalized.includes('features/')) continue;
      const targetFeatureMatch = normalized.match(/features\/([^/]+)/);
      const targetFeature = targetFeatureMatch?.[1];
      if (!targetFeature || targetFeature === featureName) continue;
      violations.push({
        file: relFile,
        importPath: rawImport,
        reason: `cross-feature relative import (${featureName} -> ${targetFeature})`,
      });
    }
  }
}

// Pro code is found by path (ADR 0019): frontend/src/pro/ for the UI, same as
// pro_*.go for the backend. The export script (scripts/export-public.mjs)
// drops that directory, so a static import into it would break the public
// tree's build — the compiler is the real guardrail there. The one hole a
// build failure can't catch is `import.meta.glob`: Vite resolves a glob to an
// empty object when the directory is missing instead of failing, which is the
// intended way for core to discover Pro contributions without depending on
// them directly. A plain `import`/`require` of a pro/ path would hide the same
// way in a reviewer's eyes, so it is flagged here regardless of whether
// frontend/src/pro/ exists yet.
function isGlobCall(content, matchIndex) {
  const before = content.slice(Math.max(0, matchIndex - 32), matchIndex);
  return /import\s*\.\s*meta\s*\.\s*glob\w*\s*\(\s*$/.test(before);
}

function resolvesIntoPro(file, rawImport) {
  if (rawImport.startsWith('@pro/') || rawImport === '@pro') return true;
  if (!rawImport.startsWith('../') && !rawImport.startsWith('./')) return false;
  const resolved = toPosix(path.resolve(path.dirname(file), rawImport));
  return resolved === toPosix(PRO_ROOT) || resolved.startsWith(toPosix(PRO_ROOT) + '/');
}

const proFiles =
  requestedFiles.length > 0
    ? scopedFiles.filter((file) => file.startsWith(SRC_ROOT + path.sep) && !file.startsWith(PRO_ROOT + path.sep))
    : walk(SRC_ROOT).filter((file) => !file.startsWith(PRO_ROOT + path.sep));

for (const file of proFiles) {
  const content = readFileSync(file, 'utf8');
  const relFile = toPosix(path.relative(REPO_ROOT, file));
  const pattern = /(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(pattern)) {
    const rawImport = match[1];
    if (!resolvesIntoPro(file, rawImport)) continue;
    if (isGlobCall(content, match.index)) continue;
    violations.push({
      file: relFile,
      importPath: rawImport,
      reason: 'import into frontend/src/pro/ from outside it (use import.meta.glob to discover Pro contributions)',
    });
  }
}

if (violations.length > 0) {
  console.error('Feature boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.importPath} (${violation.reason})`);
  }
  process.exit(1);
}

console.log('Feature boundary check passed.');

