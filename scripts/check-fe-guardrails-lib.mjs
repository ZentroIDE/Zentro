import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.css']);
const SOURCE_EXT_GUARDRAIL = new Set(['.ts', '.tsx']);

export const NATIVE_CONTROL_ALLOWLIST = [
  'components/ui/input.tsx',
  'components/ui/Input.tsx',
  'components/ui/textarea.tsx',
  'components/layout/OverlayDialog.test.tsx',
];

export const COMPACT_SPACING_PX = new Set([0, 4, 8, 12, 16, 20, 24, 32, 40]);
export const MIGRATION_DEADLINES = {
  'no-inline-px-spacing-or-typography': '2026-06-30',
  'interactive-requires-focus-visible': '2026-06-30',
  'compact-spacing-scale-only': '2026-06-30',
  'no-feature-local-interactive-state-styling': '2026-07-15',
  // Not reusing '2026-06-30' like the other migration rules: that date is
  // already in the past (today >= deadline promotes every migration
  // violation to critical and fails the build immediately), and this rule
  // just found ~90 pre-existing hits across the codebase. Given a deadline
  // far enough out to stay a warning until a real cleanup pass happens.
  'click-without-keyboard-activation': '2027-06-30',
};
const STRICT_SCOPE_PATHS = [
  /^components\/layout\/SettingsView\.tsx$/,
  /^components\/layout\/settings\//,
  /^components\/layout\/Toolbar\.tsx$/,
  /^components\/sidebar\/Sidebar\.tsx$/,
  /^components\/sidebar\/SecondarySidebar\.tsx$/,
  /^components\/sidebar\/RowDetailTab\.tsx$/,
];
const STRICT_SCOPE_RULES = new Set([
  'no-inline-px-spacing-or-typography',
  'interactive-requires-focus-visible',
  'no-feature-local-interactive-state-styling',
]);
const SHARED_PRIMITIVE_FILENAMES = new Set([
  'Button.tsx',
  'Input.tsx',
  'select.tsx',
  'switch.tsx',
  'textarea.tsx',
]);

function walkFiles(dir, extensions) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath, extensions));
      continue;
    }
    if (extensions.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function walkFrontendFiles(rootDir) {
  return walkFiles(rootDir, SOURCE_EXT);
}

export function walkGuardrailSourceFiles(rootDir) {
  return walkFiles(rootDir, SOURCE_EXT_GUARDRAIL);
}

export function isTestFile(filePath) {
  return /\.(test|spec)\.(ts|tsx)$/.test(filePath);
}

function normalizeScopedSourceFiles(sourceRoot, files, allowedExtensions) {
  return [...new Set(files)]
    .filter((file) => file.startsWith(sourceRoot + path.sep) || file === sourceRoot)
    .filter((file) => allowedExtensions.has(path.extname(file)));
}

function collectLineViolations(filePath, content, regex, label, severity = 'critical') {
  const lines = content.split('\n');
  const violations = [];
  lines.forEach((line, index) => {
    if (regex.test(line)) {
      violations.push({
        severity,
        rule: label,
        file: filePath,
        line: index + 1,
        snippet: line.trim(),
      });
    }
    regex.lastIndex = 0;
  });
  return violations;
}

function findPxValues(line) {
  const matches = line.matchAll(/(-?\d+(?:\.\d+)?)px/g);
  const values = [];
  for (const match of matches) {
    values.push(Number.parseFloat(match[1]));
  }
  return values;
}

function collectSpacingScaleViolations(filePath, content) {
  const violations = [];
  const lines = content.split('\n');
  const cssSpacingProperty = /^\s*(padding|padding-top|padding-right|padding-bottom|padding-left|margin|margin-top|margin-right|margin-bottom|margin-left|gap|column-gap|row-gap|inset|top|right|bottom|left)\s*:\s*[^;]+;/;
  lines.forEach((line, index) => {
    if (!cssSpacingProperty.test(line)) return;
    const values = findPxValues(line);
    if (values.length === 0) return;
    const invalid = values.filter((value) => !COMPACT_SPACING_PX.has(Math.abs(value)));
    if (invalid.length > 0) {
      violations.push({
        severity: 'migration',
        rule: 'compact-spacing-scale-only',
        file: filePath,
        line: index + 1,
        snippet: line.trim(),
      });
    }
  });
  return violations;
}

function collectInlineTypographySpacingViolations(filePath, content) {
  return collectLineViolations(
    filePath,
    content,
    /(padding|margin|gap|fontSize|lineHeight)\s*:\s*['"]?\d+(?:\.\d+)?(px|rem)['"]?/,
    'no-inline-px-spacing-or-typography',
    'migration',
  );
}

function collectMissingFocusVisibleViolations(filePath, content) {
  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const hasInteractiveElement = /<(button|a)\b|role=['"]button['"]/.test(line);
    if (!hasInteractiveElement) return;
    const hasClassName = /className\s*=/.test(line);
    if (!hasClassName) return;
    const hasFocusVisible = /focus-visible:|ui-focus-ring/.test(line);
    if (hasFocusVisible) return;
    violations.push({
      severity: 'migration',
      rule: 'interactive-requires-focus-visible',
      file: filePath,
      line: index + 1,
      snippet: line.trim(),
    });
  });
  return violations;
}

const NATIVE_INTERACTIVE_TAG_RE = /<(button|a|input|textarea|select)\b/i;
const KEYBOARD_ACCESSIBLE_ROLE_RE =
  /role\s*=\s*['"](button|link|menuitem|tab|option|checkbox|radio)['"]/;

/**
 * Flags a line with `onClick=` on an element that isn't natively keyboard
 * operable (a native control, or one that already carries a keyboard-
 * accessible ARIA role) and has neither `onKeyDown=` nor `tabIndex=` on the
 * same line — a future click-only control slipping in without the Enter/
 * Space handling keyboard-only navigation depends on. Sibling rule to
 * collectMissingFocusVisibleViolations: same single-line heuristic, same
 * migration severity, same allowlist/exclusion story.
 */
function collectClickWithoutKeyboardViolations(filePath, relPath, content) {
  if (relPath.startsWith('components/ui/')) return [];
  if (isNativeControlAllowed(relPath)) return [];

  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (!/onClick\s*=/.test(line)) return;
    if (NATIVE_INTERACTIVE_TAG_RE.test(line)) return;
    if (KEYBOARD_ACCESSIBLE_ROLE_RE.test(line)) return;
    if (/onKeyDown\s*=/.test(line)) return;
    if (/tabIndex\s*=/.test(line)) return;
    violations.push({
      severity: 'migration',
      rule: 'click-without-keyboard-activation',
      file: filePath,
      line: index + 1,
      snippet: line.trim(),
    });
  });
  return violations;
}

function isInteractionContractOwner(relPath) {
  return relPath.startsWith('components/ui/') || relPath === 'components/layout/Toast.tsx';
}

function collectFeatureLocalInteractiveStateViolations(filePath, relPath, content) {
  if (isInteractionContractOwner(relPath)) return [];

  const violations = [];
  const lines = content.split('\n');
  const bannedPatterns = [
    /hover:(?!bg-transparent\b|text-transparent\b)(?:[^'"`\s]*)(?:bg-|text-|border-|ring-|accent|primary|success|warning|destructive|muted|foreground|background|card)/,
    /data-\[state=(?:active|selected|open)\]:(?:[^'"`\s]*)(?:bg-|text-|border-)/,
    /data-\[selected=true\]:(?:[^'"`\s]*)(?:bg-|text-|border-)/,
    /(?:bg|text|border)-\[\s*var\(--state-[^)]+\)\s*\]/,
    /(?:bg|text)-\(--state-[^)]+\)/,
    /var\(--state-[^)]+\)/,
    /\bbg-primary\/(?:5|9|10|15)\b/,
    /\bborder-primary\/(?:35|40|45|60)\b/,
    /(?:isSelected|isActive|\bselected\b)\s*(?:&&|\?)\s*['"]\s*bg-muted/,
  ];

  lines.forEach((line, index) => {
    const isClassLine = /className\s*=/.test(line) || /className:/.test(line);
    if (!isClassLine) return;
    for (const pattern of bannedPatterns) {
      if (!pattern.test(line)) continue;
      violations.push({
        severity: 'migration',
        rule: 'no-feature-local-interactive-state-styling',
        file: filePath,
        line: index + 1,
        snippet: line.trim(),
      });
      break;
    }
  });

  return violations;
}

function collectDestructiveColorNamingViolations(filePath, relPath, content) {
  if (relPath.startsWith('components/ui/')) return [];

  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const usesLegacyErrorColor =
        /(?:text|bg|border|ring|outline|shadow|divide|from|via|to|fill|stroke|caret|accent|decoration|placeholder)-error\b/.test(
            line,
        );
    const usesLegacyDangerTone = /tone=\{?['"]danger['"]\}?/.test(line);
    if (usesLegacyErrorColor || usesLegacyDangerTone) {
      violations.push({
        severity: 'migration',
        rule: 'no-legacy-error-danger-color-naming',
        file: filePath,
        line: index + 1,
        snippet: line.trim(),
      });
    }
  });
  return violations;
}

function isNativeControlAllowed(relPath) {
  return NATIVE_CONTROL_ALLOWLIST.includes(relPath);
}

export function analyzeFeGuardrails({ repoRoot, sourceRoot, files = [], scoped = false }) {
  const scopedGuardrailFiles = normalizeScopedSourceFiles(sourceRoot, files, SOURCE_EXT_GUARDRAIL);
  const scopedFrontendFiles = normalizeScopedSourceFiles(sourceRoot, files, SOURCE_EXT);
  const guardrailFiles = scoped ? scopedGuardrailFiles : scopedGuardrailFiles.length > 0 ? scopedGuardrailFiles : walkGuardrailSourceFiles(sourceRoot);
  const critical = [];
  const migration = [];

  for (const file of guardrailFiles) {
    const rel = path.relative(sourceRoot, file).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');
    const prodFile = !isTestFile(file);
    const fileName = path.basename(file);

    if (!rel.startsWith('components/ui/') && SHARED_PRIMITIVE_FILENAMES.has(fileName)) {
      critical.push({
        severity: 'critical',
        rule: 'no-shared-primitive-forks',
        file,
        line: 1,
        snippet: rel,
      });
    }

    if (!rel.startsWith('platform/')) {
      critical.push(
        ...collectLineViolations(
          file,
          content,
          /from\s+['"][^'"]*wailsjs\/go\/app\/App['"]/,
          'no-direct-wails-import-outside-platform',
        ),
      );
    }

    if (prodFile) {
      critical.push(
        ...collectLineViolations(file, content, /window\.(confirm|prompt|alert)\s*\(/, 'no-native-dialogs'),
        ...collectLineViolations(file, content, /(^|[^\w.])(confirm|prompt|alert)\s*\(/, 'no-native-dialogs'),
        ...collectLineViolations(file, content, /\bas\s+unknown\s+as\b/, 'no-double-unknown-cast'),
        ...collectLineViolations(file, content, /\bfunction\s+toErrorMessage\s*\(/, 'use-shared-error-helper'),
        ...collectLineViolations(
          file,
          content,
          /variant\s*=\s*["'](primary|solid|danger|success)["']/,
          'no-legacy-button-variants',
        ),
        ...collectLineViolations(file, content, /\bdanger\s*=\s*\{?/, 'no-legacy-button-danger-prop'),
        ...collectLineViolations(
          file,
          content,
          /import\s+\{[^}]*\b(ModalBackdrop|ModalFrame|AlertModal|PromptModal)\b[^}]*\}\s+from\s+['"][^'"]*\/ui(?:['"]|\/)/,
          'no-legacy-ui-components',
        ),
        ...collectLineViolations(
          file,
          content,
          /from\s+['"][^'"]*\/ui\/(ModalBackdrop|ModalFrame|AlertModal|PromptModal)['"]/,
          'no-legacy-ui-components',
        ),
        ...collectLineViolations(
          file,
          content,
          /<\s*(ModalBackdrop|ModalFrame|AlertModal|PromptModal)\b/,
          'no-legacy-ui-components',
        ),
        ...collectLineViolations(
          file,
          content,
          /<\s*SwitchField\b[^>]*\bonChange\s*=/,
          'switchfield-use-oncheckedchange',
        ),
        ...collectLineViolations(
          file,
          content,
          /variant\s*=\s*["'](danger|primary)["']/,
          'no-legacy-confirmation-variants',
        ),
        ...collectLineViolations(
          file,
          content,
          /from\s+['"][^'"]*\/ui\/(BaseTable|DatabaseTreePicker)['"]/,
          'no-domain-components-inside-ui',
        ),
        ...collectLineViolations(
          file,
          content,
          /import\s+\{[^}]*\b(BaseTable|DatabaseTreePicker)\b[^}]*\}\s+from\s+['"][^'"]*\/ui['"]/,
          'no-domain-components-inside-ui',
        ),
        ...collectLineViolations(
          file,
          content,
          /from\s+['"][^'"]*\/ui\/(FormField|SelectField|SwitchField|SearchField|Divider)['"]/,
          'no-legacy-form-wrappers',
        ),
        ...collectLineViolations(
          file,
          content,
          /import\s+\{[^}]*\b(FormField|SelectField|SwitchField|SearchField|Divider)\b[^}]*\}\s+from\s+['"][^'"]*\/ui['"]/,
          'no-legacy-form-wrappers',
        ),
        ...collectLineViolations(
          file,
          content,
          /<\s*(FormField|SelectField|SwitchField|SearchField|Divider)\b/,
          'no-legacy-form-wrappers',
        ),
        ...collectLineViolations(
          file,
          content,
          /<\s*Tooltip\b[^>]*\bcontent\s*=/,
          'no-legacy-tooltip-content-prop',
        ),
        ...collectLineViolations(
          file,
          content,
          /from\s+['"][^'"]*\/layout\/(Modal|OverlayDialog)['"]/,
          'no-legacy-layout-dialog-wrappers',
        ),
        ...collectLineViolations(
          file,
          content,
          /from\s+['"]\.(\.\/|\/)?(Modal|OverlayDialog)['"]/,
          'no-legacy-layout-dialog-wrappers',
        ),
      );

      if (!isNativeControlAllowed(rel)) {
        critical.push(
          ...collectLineViolations(file, content, /<(button|input|textarea)\b/, 'no-native-controls-outside-allowlist'),
        );
      }

      migration.push(...collectInlineTypographySpacingViolations(file, content));
      migration.push(...collectFeatureLocalInteractiveStateViolations(file, rel, content));
      migration.push(...collectDestructiveColorNamingViolations(file, rel, content));
    }

    if (rel === 'components/sidebar/Sidebar.tsx' || rel === 'components/sidebar/SecondarySidebar.tsx') {
      critical.push(
        ...collectLineViolations(file, content, /\buseState<SidebarTab>\b/, 'sidebar-shell-registry-only'),
        ...collectLineViolations(file, content, /\bconst\s+tabs\s*=\s*\[/, 'sidebar-shell-registry-only'),
      );
    }

    if (!rel.startsWith('components/ui/')) {
      critical.push(
        ...collectLineViolations(
          file,
          content,
          /from\s+['"]@radix-ui\//,
          'no-radix-import-outside-ui',
        ),
      );
    }

    if (!rel.startsWith('platform/')) {
      critical.push(
        ...collectLineViolations(file, content, /\bwindow\.go\b/, 'no-window-go-outside-platform'),
      );
    }

    migration.push(...collectMissingFocusVisibleViolations(file, content));
    migration.push(...collectClickWithoutKeyboardViolations(file, rel, content));
  }

  const cssFiles =
    scoped
      ? scopedFrontendFiles.filter((file) => path.extname(file) === '.css')
      : scopedFrontendFiles.length > 0
      ? scopedFrontendFiles.filter((file) => path.extname(file) === '.css')
      : walkFrontendFiles(sourceRoot).filter((file) => path.extname(file) === '.css');
  for (const cssFile of cssFiles) {
    const content = readFileSync(cssFile, 'utf8');
    migration.push(...collectSpacingScaleViolations(cssFile, content));
  }

  const formatViolation = (violation) => {
    const displayPath = path.relative(repoRoot, violation.file).replace(/\\/g, '/');
    return `- [${violation.rule}] ${displayPath}:${violation.line} -> ${violation.snippet}`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const promoteMigrationViolation = (violation) => ({
    ...violation,
    severity: 'critical',
    rule: `${violation.rule}::migration-deadline`,
  });
  const shouldApplyStrictScope = (filePath) => {
    const rel = path.relative(sourceRoot, filePath).replace(/\\/g, '/');
    return STRICT_SCOPE_PATHS.some((pattern) => pattern.test(rel));
  };

  const stillMigration = [];
  for (const violation of migration) {
    const deadline = MIGRATION_DEADLINES[violation.rule];
    const deadlineExceeded = Boolean(deadline && today >= deadline);
    const strictScopePromote = STRICT_SCOPE_RULES.has(violation.rule) && shouldApplyStrictScope(violation.file);
    if (deadlineExceeded || strictScopePromote) {
      critical.push(promoteMigrationViolation(violation));
      continue;
    }
    stillMigration.push(violation);
  }

  return {
    critical,
    migration: stillMigration,
    formatViolation,
  };
}
