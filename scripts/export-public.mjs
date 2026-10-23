// Writes the public tree: every tracked file except what public-export.json
// denies. Pro code is found by path (ADR 0019), so there is nothing to parse.
//
//   node scripts/export-public.mjs --out <dir>             write the tree
//   node scripts/export-public.mjs --out <dir> --verify    ...and prove it stands alone
//   node scripts/export-public.mjs --out <dir> --verify --frontend
//                                                         ...including the frontend build
//   node scripts/export-public.mjs --out <dir> --wails    ...and regenerate frontend/wailsjs
//                                                         from this tree, so a Pro method
//                                                         (GetQueryStats, ConfigureAppLock, ...)
//                                                         isn't in the public bindings by name
//
// --verify runs go vet and go test on the exported tree. It is the check that
// the core never references a symbol defined in a Pro file: the compiler, not a
// rule, is what catches it.
//
// --wails needs the `wails` CLI on PATH. It is not part of --verify: the
// checked-in frontend/wailsjs is what --verify --frontend's tsc/vite build
// actually type-checks against, and that passes without --wails. --wails
// regenerates it from this tree's own Go source, so a Pro method
// (GetQueryStats, ConfigureAppLock, ...) isn't in the public bindings by name
// at all — this is currently proven to work only with --verify alone (Go
// side). Pairing it with --frontend's tsc fails today: the FE's own Wails
// adapters (platform/app-api/wailsApiGateway.ts and its *.adapter.ts files)
// import every bound method by name unconditionally, unlike the REST adapter,
// which already guards each Pro call with `fn?.(...)`. Giving those adapters
// the same optional pattern is a prerequisite this script does not attempt;
// until then, scripts/sync-public-repo.mjs ships frontend/wailsjs as commited
// (full method names, same as every PR's own --verify --frontend) rather than
// passing --wails.
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matcher } from './export-public-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

const out = option('--out');
if (!out) {
    console.error('usage: node scripts/export-public.mjs --out <dir> [--verify] [--frontend] [--wails]');
    process.exit(2);
}
const OUT = resolve(out);
const config = JSON.parse(readFileSync(join(ROOT, 'public-export.json'), 'utf8'));

const isDenied = matcher(config.deny);

function git(...a) {
    const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout;
}

// On Windows, npm and npx resolve to .cmd shims that spawnSync can only run
// through a shell; go and node are real executables and don't need one.
const NEEDS_SHELL_ON_WINDOWS = new Set(['npm', 'npx']);

function run(label, command, commandArgs, cwd) {
    console.log(`\n==> ${label}`);
    const r = spawnSync(command, commandArgs, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32' && NEEDS_SHELL_ON_WINDOWS.has(command),
    });
    if (r.error) {
        console.error(`\nThe public tree does not stand alone: "${label}" failed to start: ${r.error.message}`);
        process.exit(1);
    }
    if (r.status !== 0) {
        console.error(`\nThe public tree does not stand alone: "${label}" failed.`);
        process.exit(r.status ?? 1);
    }
}

function exportTree() {
    if (existsSync(OUT)) {
        if (readdirSync(OUT).length > 0) {
            console.error(`${OUT} is not empty; pick an empty or new directory.`);
            process.exit(2);
        }
    }
    mkdirSync(OUT, { recursive: true });

    const tracked = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
    let kept = 0;
    const dropped = [];
    for (const path of tracked) {
        if (!existsSync(join(ROOT, path))) continue; // deleted in the working tree
        if (isDenied(path)) {
            dropped.push(path);
            continue;
        }
        const target = join(OUT, path);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(ROOT, path), target);
        kept++;
    }
    console.log(`Exported ${kept} files to ${OUT}; left out ${dropped.length}:`);
    for (const path of dropped) console.log(`  - ${path}`);
    return dropped;
}

function scanForbiddenStrings() {
    const needles = config.forbiddenStrings ?? [];
    if (needles.length === 0) return;
    const ignored = matcher(config.forbiddenStringsIgnore ?? []);
    const hits = [];
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            const rel = full.slice(OUT.length + 1).replace(/\\/g, '/');
            if (statSync(full).isDirectory()) {
                walk(full);
            } else if (!ignored(rel) && statSync(full).size < 2_000_000) {
                const text = readFileSync(full, 'utf8');
                for (const needle of needles) if (text.includes(needle)) hits.push(`${rel}: ${needle}`);
            }
        }
    };
    walk(OUT);
    if (hits.length > 0) {
        console.error('\nThe public tree still mentions what it must not:');
        for (const hit of hits) console.error(`  ${hit}`);
        process.exit(1);
    }
}

function regenerateWails() {
    // wails generate module parses main.go's bound App struct; the
    // go:embed directive on frontend/dist just needs the directory to
    // exist and be non-empty.
    const distDir = join(OUT, 'frontend', 'dist');
    if (!existsSync(join(distDir, 'index.html'))) {
        mkdirSync(distDir, { recursive: true });
        writeFileSync(join(distDir, 'index.html'), '<!doctype html><html><body></body></html>\n');
    }
    run('wails generate module', 'wails', ['generate', 'module'], OUT);
}

exportTree();
scanForbiddenStrings();

if (flag('--wails')) {
    regenerateWails();
}

if (flag('--verify')) {
    // main.go embeds frontend/dist, so only the internal packages are built here.
    run('go vet ./internal/...', 'go', ['vet', './internal/...'], OUT);
    run('go test ./internal/...', 'go', ['test', './internal/...', '-count=1'], OUT);
    if (flag('--frontend')) {
        const frontend = join(OUT, 'frontend');
        run('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'], frontend);
        run('tsc', 'npx', ['tsc', '--noEmit'], frontend);
        run('vite build', 'npx', ['vite', 'build'], frontend);
    }
    console.log('\nThe public tree builds and passes its tests on its own.');
}

