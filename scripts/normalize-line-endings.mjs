import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function getStagedFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  });
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function looksBinary(buffer) {
  for (const byte of buffer) {
    if (byte === 0) return true;
  }
  return false;
}

function normalizeContent(content, eol) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return eol === 'crlf' ? normalized.replace(/\n/g, '\r\n') : normalized;
}

function matchSimplePattern(filePath, pattern) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(normalizedPath);

  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    return normalizedPath.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
  }
  return normalizedPath === pattern || fileName === pattern;
}

function parseGitAttributes() {
  const attributesPath = path.resolve('.gitattributes');
  if (!existsSync(attributesPath)) return [];

  const lines = readFileSync(attributesPath, 'utf8').split(/\r?\n/);
  const rules = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const pattern = parts[0];
    const attrs = parts.slice(1);
    let eol;
    let binary = false;

    for (const attr of attrs) {
      if (attr === 'binary') {
        binary = true;
      } else if (attr.startsWith('eol=')) {
        eol = attr.slice(4).toLowerCase();
      }
    }

    rules.push({ pattern, eol, binary });
  }

  return rules;
}

function parseEditorConfig() {
  const editorConfigPath = path.resolve('.editorconfig');
  if (!existsSync(editorConfigPath)) return [];

  const lines = readFileSync(editorConfigPath, 'utf8').split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      current = {
        pattern: line.slice(1, -1).trim(),
        endOfLine: undefined,
      };
      sections.push(current);
      continue;
    }

    if (!current) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().toLowerCase();

    if (key === 'end_of_line') {
      current.endOfLine = value;
    }
  }

  return sections;
}

function resolveEolFromGitAttributes(filePath, rules) {
  let match = null;
  for (const rule of rules) {
    if (!matchSimplePattern(filePath, rule.pattern)) continue;
    match = rule;
  }

  if (!match || match.binary) return null;
  return match.eol || null;
}

function resolveEolFromEditorConfig(filePath, sections) {
  let match = null;
  for (const section of sections) {
    if (!matchSimplePattern(filePath, section.pattern)) continue;
    match = section;
  }
  return match?.endOfLine || null;
}

function resolveDesiredEol(filePath, gitAttributesRules, editorConfigSections) {
  const gitAttributesEol = resolveEolFromGitAttributes(filePath, gitAttributesRules);
  if (gitAttributesEol) return gitAttributesEol;

  const editorConfigEol = resolveEolFromEditorConfig(filePath, editorConfigSections);
  if (editorConfigEol) return editorConfigEol;

  return 'lf';
}

const stagedFiles = getStagedFiles();
const gitAttributesRules = parseGitAttributes();
const editorConfigSections = parseEditorConfig();

for (const file of stagedFiles) {
  const absolutePath = path.resolve(file);
  const buffer = readFileSync(absolutePath);
  if (looksBinary(buffer)) {
    continue;
  }

  const desiredEol = resolveDesiredEol(file, gitAttributesRules, editorConfigSections);
  const source = buffer.toString('utf8');
  const normalized = normalizeContent(source, desiredEol);

  if (normalized !== source) {
    writeFileSync(absolutePath, normalized, 'utf8');
  }
}
