import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScopedFiles } from './changed-files-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const ROOTS = [path.resolve(REPO_ROOT, 'internal'), path.resolve(REPO_ROOT, 'cmd'), path.resolve(REPO_ROOT, 'main.go')];

const EVENT_CONSTANTS_FILE = path.resolve(REPO_ROOT, 'internal', 'constant', 'events.go');
const ALLOWED_RUNTIME_FILES = new Set([
  path.resolve(REPO_ROOT, 'internal', 'app', 'app.go'),
  path.resolve(REPO_ROOT, 'internal', 'app', 'connection_service.go'),
  path.resolve(REPO_ROOT, 'internal', 'app', 'event_emitter.go'),
  path.resolve(REPO_ROOT, 'internal', 'app', 'dialogs.go'),
  // export_service.go replaced query_export.go (streaming export jobs) —
  // it owns the SaveFileDialog call the old file used to.
  path.resolve(REPO_ROOT, 'internal', 'app', 'export_service.go'),
]);
const APP_DYNAMIC_WHITELIST = new Set([
  path.resolve(REPO_ROOT, 'internal', 'app', 'event_emitter.go'),
  // export_writer.go replaced query_export.go's exportJSON — it owns the
  // dynamic map[string]any used to build one JSON object per exported row.
  path.resolve(REPO_ROOT, 'internal', 'app', 'export_writer.go'),
  path.resolve(REPO_ROOT, 'internal', 'app', 'query_service.go'),
]);

// Driver names in internal/app must come from internal/constant (Driver*).
// The DBeaver importer is whitelisted: it substring-matches external tool
// identifiers ("postgresql", "mariadb", …) as *inputs* and already returns
// constant.Driver* values.
const DRIVER_LITERAL_WHITELIST = new Set([
  path.resolve(REPO_ROOT, 'internal', 'app', 'connection_importer_dbeaver.go'),
]);
const DRIVER_LITERAL_REGEX = /"(postgres|sqlserver|mysql|sqlite)"/;

// The dev-only license override must always be gated behind the dev build tag.
// A file that defines NewDevProviderFromEnv or actually reads ZENTRO_DEV_TIER
// in a default/production build would let an environment variable open a paid
// tier, so it must be excluded unless `dev` is set.
const DEV_TIER_OVERRIDE_RULE = 'dev-tier-override-must-be-behind-dev-build-tag';
const DEV_TIER_OVERRIDE_REGEX = /func\s+NewDevProviderFromEnv\b|os\.(?:Getenv|LookupEnv)\("ZENTRO_DEV_TIER"\)/;

const EVENT_LITERALS = [
  'connection:changed',
  'query:started',
  'query:chunk',
  'query:done',
  'transaction:status',
  'schema:databases',
  'schema:error',
  'schema:loaded',
  'app:before-close',
];

function walkFiles(target) {
  const stat = statSync(target);
  if (stat.isFile()) {
    return path.extname(target) === '.go' ? [target] : [];
  }
  const files = [];
  for (const entry of readdirSync(target)) {
    const full = path.join(target, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      files.push(...walkFiles(full));
      continue;
    }
    if (path.extname(full) === '.go') {
      files.push(full);
    }
  }
  return files;
}

function isTestFile(filePath) {
  return filePath.endsWith('_test.go');
}

function collectLineViolations(filePath, regex, rule) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const violations = [];
  lines.forEach((line, index) => {
    if (regex.test(line)) {
      violations.push({
        rule,
        file: filePath,
        line: index + 1,
        snippet: line.trim(),
      });
    }
    regex.lastIndex = 0;
  });
  return violations;
}

function hasDevBuildTag(filePath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('package ')) {
      return false;
    }
    const match = trimmed.match(/^\/\/go:build\s+(.+)$/);
    if (match) {
      // The constraint must require `dev`: a plain AND of terms, one of them
      // `dev`. Any `||` (e.g. `linux || dev`) would let a release build in.
      const expr = match[1].trim();
      if (expr.includes('||')) {
        return false;
      }
      return expr.split(/[()\s&]+/).filter(Boolean).includes('dev');
    }
  }
  return false;
}

function firstMatchLine(filePath, regex) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

const requestedFiles = process.argv.slice(2);
const scopedFiles = resolveScopedFiles(REPO_ROOT, requestedFiles).filter((file) => path.extname(file) === '.go');
const files = requestedFiles.length > 0 ? scopedFiles : ROOTS.flatMap(walkFiles);
const violations = [];

for (const file of files) {
  const inApp = file.includes(`${path.sep}internal${path.sep}app${path.sep}`);
  const prodFile = !isTestFile(file);

  if (inApp && prodFile && !APP_DYNAMIC_WHITELIST.has(file)) {
    violations.push(
      ...collectLineViolations(file, /\bmap\[string\](any|interface\{\})\b/, 'no-dynamic-map-in-app-core'),
      ...collectLineViolations(file, /\binterface\{\}\b/, 'no-interface-empty-in-app-core'),
    );
  }

  if (file !== EVENT_CONSTANTS_FILE && prodFile) {
    for (const eventName of EVENT_LITERALS) {
      violations.push(
        ...collectLineViolations(
          file,
          new RegExp(eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
          'no-hardcoded-event-literal-outside-constants',
        ),
      );
    }
  }

  if (inApp && prodFile && !DRIVER_LITERAL_WHITELIST.has(file)) {
    violations.push(
      ...collectLineViolations(file, DRIVER_LITERAL_REGEX, 'no-raw-driver-name-in-app-core'),
    );
  }

  if (prodFile && !ALLOWED_RUNTIME_FILES.has(file)) {
    violations.push(
      ...collectLineViolations(file, /\bruntime\./, 'runtime-calls-outside-managed-context-files'),
    );
  }

  const aiRoot = path.resolve(REPO_ROOT, 'internal', 'extensions', 'ai') + path.sep;
  if (prodFile && file.startsWith(aiRoot)) {
    violations.push(
      ...collectLineViolations(
        file,
        /zentro\/internal\/(?:db|app)\b/,
        'ai-package-must-not-import-query-or-result-packages',
      ),
      ...collectLineViolations(file, /"database\/sql"/, 'ai-package-must-not-import-query-or-result-packages'),
    );
  }

  if (prodFile && DEV_TIER_OVERRIDE_REGEX.test(readFileSync(file, 'utf8')) && !hasDevBuildTag(file)) {
    violations.push({
      rule: DEV_TIER_OVERRIDE_RULE,
      file,
      line: firstMatchLine(file, DEV_TIER_OVERRIDE_REGEX),
      snippet: 'dev-only license override must be behind //go:build dev',
    });
  }
}

if (violations.length > 0) {
  console.error('BE guardrails failed:');
  for (const violation of violations) {
    const displayPath = path.relative(REPO_ROOT, violation.file).replace(/\\/g, '/');
    console.error(`- [${violation.rule}] ${displayPath}:${violation.line} -> ${violation.snippet}`);
  }
  process.exit(1);
}

console.log('BE guardrails passed.');
