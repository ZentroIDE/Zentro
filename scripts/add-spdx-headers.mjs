// One-time (and re-runnable) pass that adds an SPDX-License-Identifier header
// to every .go/.ts/.tsx file this repo tracks. Core files get GPL-3.0-only;
// a Pro file (found by path, ADR 0019: pro_*, a pro/ directory,
// frontend/src/pro/) gets LicenseRef-Zentro-Commercial instead. Generated
// files (frontend/wailsjs/, entitlementMatrix.ts) are skipped — they're
// rewritten by their own generator, which doesn't carry a header through.
//
//   node scripts/add-spdx-headers.mjs           add missing headers
//   node scripts/add-spdx-headers.mjs --check   fail if any file is missing one
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matcher } from './export-public-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const isPro = matcher(['**/pro_*', '**/pro/', 'frontend/src/pro/']);
const GENERATED = matcher([
    'frontend/wailsjs/',
    'frontend/src/lib/license/entitlementMatrix.ts',
    'cmd/gen-entitlement-matrix/',
]);

function git(...a) {
    const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout;
}

const tracked = git('ls-files', '-z', '--', '*.go', '*.ts', '*.tsx').split('\0').filter(Boolean);

let missing = 0;
let written = 0;
let alreadyHad = 0;
for (const path of tracked) {
    if (GENERATED(path)) continue;
    const full = resolve(ROOT, path);
    const text = readFileSync(full, 'utf8');
    if (text.includes('SPDX-License-Identifier')) {
        alreadyHad++;
        continue;
    }

    missing++;
    const id = isPro(path) ? 'LicenseRef-Zentro-Commercial' : 'GPL-3.0-only';
    if (CHECK) {
        console.error(`missing SPDX header: ${path}`);
        continue;
    }
    writeFileSync(full, `// SPDX-License-Identifier: ${id}\n\n${text}`);
    written++;
}

if (CHECK) {
    if (missing > 0) {
        console.error(`\n${missing} file(s) missing an SPDX header.`);
        process.exit(1);
    }
    console.log('Every tracked .go/.ts/.tsx file has an SPDX header.');
} else {
    console.log(`Added a header to ${written} file(s); ${alreadyHad} already had one.`);
}
