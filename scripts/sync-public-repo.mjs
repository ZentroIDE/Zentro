// Updates an existing local clone of the public repo to match this repo's
// current commit, minus what public-export.json denies (ADR 0019). Mirrors
// exactly: a file dropped from the private tree, or newly denied, is removed
// from the clone too.
//
//   node scripts/sync-public-repo.mjs --to <path to a clone of the public repo>
//
// The clone must already exist (`git init`/`git clone` it yourself first) and
// have no uncommitted changes of its own — this script only ever adds the
// commit it makes. It never pushes: review `git log`/`git diff` in the clone
// and push when you're ready.
//
// Follow-up this intentionally skips: regenerating frontend/wailsjs
// (export-public.mjs's --wails) so no Pro method name ships in the public
// bindings. See that script's header for why — core's own Wails adapters
// aren't written to tolerate a trimmed one yet.
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matcher } from './export-public-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

const to = option('--to');
if (!to) {
    console.error('usage: node scripts/sync-public-repo.mjs --to <path to a clone of the public repo>');
    process.exit(2);
}
const TARGET = resolve(to);

function git(cwd, ...a) {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} (in ${cwd}): ${r.stderr}`);
    return r.stdout;
}

function hasCommits(cwd) {
    return spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd }).status === 0;
}

if (!existsSync(join(TARGET, '.git'))) {
    console.error(`${TARGET} is not a git repository. Create or clone the public repo there first.`);
    process.exit(2);
}
const targetStatus = git(TARGET, 'status', '--porcelain').trim();
if (targetStatus) {
    console.error(`${TARGET} has uncommitted changes. Commit, stash, or discard them first:\n${targetStatus}`);
    process.exit(2);
}

const config = JSON.parse(readFileSync(join(ROOT, 'public-export.json'), 'utf8'));
const isDenied = matcher(config.deny);

const sha = git(ROOT, 'rev-parse', '--short', 'HEAD').trim();
const tracked = git(ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard')
    .split('\0')
    .filter(Boolean);

const kept = new Set();
for (const path of tracked) {
    if (!existsSync(join(ROOT, path))) continue; // deleted in the working tree
    if (isDenied(path)) continue;
    kept.add(path);
}

// Remove whatever the clone tracks that isn't (or no longer is) part of the
// export, then copy every kept file over.
const existing = git(TARGET, 'ls-files').split('\n').filter(Boolean);
let removed = 0;
for (const path of existing) {
    if (kept.has(path)) continue;
    rmSync(join(TARGET, path), { force: true });
    removed++;
}
let copied = 0;
for (const path of kept) {
    const target = join(TARGET, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, path), target);
    copied++;
}

// Prune directories ls-files's removals left empty (git doesn't track empty
// directories, but a stray one left on disk is confusing to `git status`).
function pruneEmptyDirs(dir) {
    if (dir === TARGET || !existsSync(dir)) return;
    const entries = readdirSync(dir);
    if (entries.length === 0) {
        rmSync(dir, { recursive: true, force: true });
        pruneEmptyDirs(dirname(dir));
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) pruneEmptyDirs(full);
    }
}
pruneEmptyDirs(TARGET);

const isFirstCommit = !hasCommits(TARGET);

git(TARGET, 'add', '-A');
const diff = git(TARGET, 'status', '--porcelain').trim();
if (!diff) {
    console.log(`Nothing to sync — ${TARGET} already matches private @${sha}.`);
    process.exit(0);
}

const message = isFirstCommit ? 'Initial public release' : `Sync from private @${sha}`;
git(TARGET, 'commit', '-m', message);

console.log(
    `Copied ${copied} file(s), removed ${removed}. Committed "${message}" in ${relative(ROOT, TARGET) || TARGET}.`,
);
console.log('Review with `git log -p -1` / `git diff HEAD~1` there, then push yourself.');
