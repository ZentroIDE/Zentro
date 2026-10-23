// Pulls a branch's commits from a public-repo PR back into this (private)
// repo as patches, keeping authorship, after checking every commit's author
// email against docs/CONTRIBUTORS-CLA.txt (ADR 0019 / CONTRIBUTING.md: a PR
// without a signed CLA is not merged).
//
//   node scripts/pull-back-pr.mjs --from <path to a clone of the public repo> --branch <name> [--base <ref>]
//
// <path> is a local clone that already has <branch> checked out or fetched
// (`git fetch origin pull/<n>/head:<branch>` for a GitHub PR, run by hand
// first). --base defaults to that clone's default remote branch
// (origin/HEAD, falling back to main). This repo (the one running the
// script) must have a clean working tree: `git am` applies directly to it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

const from = option('--from');
const branch = option('--branch');
if (!from || !branch) {
    console.error(
        'usage: node scripts/pull-back-pr.mjs --from <path to a clone of the public repo> --branch <name> [--base <ref>] [--skip-cla-check]',
    );
    process.exit(2);
}
const FROM = resolve(from);

function git(cwd, ...a) {
    const r = spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} (in ${cwd}): ${r.stderr}`);
    return r.stdout;
}

function resolveBase() {
    const explicit = option('--base');
    if (explicit) return explicit;
    const head = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
        cwd: FROM,
        encoding: 'utf8',
    });
    if (head.status === 0) return head.stdout.trim().replace(/^refs\/remotes\//, '');
    return 'origin/main';
}

const base = resolveBase();
console.log(`Patches: ${base}..${branch} (in ${FROM})`);

const patchDir = mktempPatchDir();
function mktempPatchDir() {
    return mkdtempSync(join(tmpdir(), 'zentro-pullback-'));
}

git(FROM, 'format-patch', `${base}..${branch}`, '--output-directory', patchDir, '--no-signature');

const patchFiles = readdirSync(patchDir)
    .filter(name => name.endsWith('.patch'))
    .sort()
    .map(name => join(patchDir, name));

if (patchFiles.length === 0) {
    console.log(`No commits in ${base}..${branch}. Nothing to pull back.`);
    rmSync(patchDir, { recursive: true, force: true });
    process.exit(0);
}

function patchAuthorEmail(patchText) {
    const m = patchText.match(/^From:\s*.*<([^>]+)>/m);
    return m ? m[1].toLowerCase() : null;
}

if (!flag('--skip-cla-check')) {
    const claFile = join(ROOT, 'docs', 'CONTRIBUTORS-CLA.txt');
    const signed = new Set(
        readFileSync(claFile, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.toLowerCase()),
    );

    const unsigned = [];
    for (const file of patchFiles) {
        const email = patchAuthorEmail(readFileSync(file, 'utf8'));
        if (!email || !signed.has(email)) unsigned.push({ file, email: email ?? '(unparsed)' });
    }
    if (unsigned.length > 0) {
        console.error(
            `\nNo signed CLA on file for:\n${unsigned.map(u => `  ${u.email} (${u.file})`).join('\n')}\n` +
                `Add the email to docs/CONTRIBUTORS-CLA.txt once you have a signed CLA, or pass --skip-cla-check to override.`,
        );
        rmSync(patchDir, { recursive: true, force: true });
        process.exit(1);
    }
}

const rootStatus = git(ROOT, 'status', '--porcelain').trim();
if (rootStatus) {
    console.error(`This repo has uncommitted changes; \`git am\` needs a clean tree:\n${rootStatus}`);
    rmSync(patchDir, { recursive: true, force: true });
    process.exit(2);
}

git(ROOT, 'am', ...patchFiles);
rmSync(patchDir, { recursive: true, force: true });
console.log(`Applied ${patchFiles.length} commit(s) from ${branch}, authorship kept. Review before pushing.`);
