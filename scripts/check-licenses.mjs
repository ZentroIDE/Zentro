import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const FRONTEND_DIR = resolve(REPO_ROOT, 'frontend');
const POLICY_FILE = resolve(REPO_ROOT, 'license-policy.json');
const NOTICES_FILE = resolve(REPO_ROOT, 'THIRD_PARTY_NOTICES.md');

const GO_LICENSES_VERSION = 'v1.6.0';
// Every installer ships the Go dependencies of its own OS (Windows-only wincred,
// Linux-only dbus, macOS-only shellescape, ...), so the notices cover all of them.
const GO_TARGET_OSES = ['windows', 'linux', 'darwin'];
const LICENSE_CHECKER = 'license-checker-rseidelsohn';
const LICENSE_CHECKER_VERSION = '5.0.1';

const WRITE_NOTICES = process.argv.includes('--write-notices');

function run(command, args, cwd = REPO_ROOT) {
    return spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
}

function runNpx(args, cwd) {
    if (process.platform === 'win32') {
        return run('cmd.exe', ['/d', '/s', '/c', ['npx', ...args].join(' ')], cwd);
    }
    return run('npx', args, cwd);
}

function failWithHint(message, tool) {
    console.error(message);
    console.error(
        `\n${tool} may need network access on its first run to download the pinned tool version and package metadata. ` +
            'Ensure network access (or pre-populate the tool cache) and retry.',
    );
    process.exit(1);
}

function readPolicy() {
    const raw = readFileSync(POLICY_FILE, 'utf8');
    const policy = JSON.parse(raw);
    for (const key of ['allowedLicenses', 'deniedLicenses']) {
        if (!Array.isArray(policy[key])) {
            failWithHint(`license-policy.json is missing the "${key}" array.`, 'check-licenses');
        }
    }
    return policy;
}

function readGoModulePath() {
    const mod = readFileSync(resolve(REPO_ROOT, 'go.mod'), 'utf8');
    const match = mod.match(/^module\s+(\S+)/m);
    return match ? match[1] : null;
}

function normalizeLicense(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function parseCsvLine(line) {
    const parts = line.split(',');
    const pkg = parts[0].trim();
    const license = normalizeLicense(parts[parts.length - 1]);
    const url = parts.length > 2 ? parts.slice(1, -1).join(',').trim() : '';
    return { pkg, license, url };
}

function moduleVersionFor(pkg, versions) {
    let best = '';
    for (const [mod, version] of versions) {
        if ((pkg === mod || pkg.startsWith(`${mod}/`)) && mod.length > best.length) {
            best = version;
        }
    }
    return best;
}

// main.go embeds frontend/dist, so `./...` does not load on a fresh checkout
// (CI) until it exists. Same stub as scripts/verify-push.mjs.
function ensureEmbeddedFrontendStub() {
    const distDir = resolve(FRONTEND_DIR, 'dist');
    const indexFile = resolve(distDir, 'index.html');
    if (existsSync(indexFile)) return;
    mkdirSync(distDir, { recursive: true });
    writeFileSync(indexFile, '<!doctype html><html><body></body></html>\n', 'utf8');
}

function goScan() {
    const goBin = process.env.GO || 'go';
    ensureEmbeddedFrontendStub();

    const versions = new Map();
    const modList = run(goBin, ['list', '-m', '-f', '{{.Path}} {{.Version}}', 'all']);
    if (modList.status === 0 && modList.stdout) {
        for (const line of modList.stdout.split(/\r?\n/)) {
            const idx = line.lastIndexOf(' ');
            if (idx < 0) continue;
            const path = line.slice(0, idx).trim();
            const version = line.slice(idx + 1).trim();
            if (path && version) versions.set(path, version);
        }
    }

    // Built once as a host binary: `go run` would build the tool itself for the
    // target OS, and a Linux binary cannot run on a Windows host.
    const toolDir = mkdtempSync(join(tmpdir(), 'go-licenses-'));
    const install = spawnSync(goBin, ['install', `github.com/google/go-licenses@${GO_LICENSES_VERSION}`], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, GOBIN: toolDir },
    });
    if (install.error) {
        failWithHint(`Could not install go-licenses: ${install.error.message}`, 'go-licenses');
    }
    if (install.status !== 0) {
        failWithHint(`go install go-licenses exited with code ${install.status}\n${install.stderr ?? ''}`, 'go-licenses');
    }
    const tool = join(toolDir, process.platform === 'win32' ? 'go-licenses.exe' : 'go-licenses');

    const mainModule = readGoModulePath();
    const byPackage = new Map();
    try {
        for (const goos of GO_TARGET_OSES) {
            const result = spawnSync(tool, ['csv', './...'], {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, GOOS: goos, GOARCH: 'amd64' },
            });
            if (result.error) {
                failWithHint(`Could not run go-licenses for ${goos}: ${result.error.message}`, 'go-licenses');
            }
            if (result.status !== 0) {
                failWithHint(`go-licenses (${goos}) exited with code ${result.status}\n${result.stderr ?? ''}`, 'go-licenses');
            }
            for (const line of (result.stdout ?? '').split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const { pkg, license, url } = parseCsvLine(trimmed);
                if (mainModule && (pkg === mainModule || pkg.startsWith(`${mainModule}/`))) continue;
                if (byPackage.has(pkg)) continue;
                byPackage.set(pkg, {
                    ecosystem: 'go',
                    name: pkg,
                    version: moduleVersionFor(pkg, versions),
                    license,
                    reference: url === 'Unknown' ? '' : url.replace(/\\/g, '/'),
                });
            }
        }
    } finally {
        rmSync(toolDir, { recursive: true, force: true });
    }
    const entries = [...byPackage.values()];
    return entries;
}

function npmScan() {
    const rootPkg = JSON.parse(readFileSync(resolve(FRONTEND_DIR, 'package.json'), 'utf8'));
    const args = ['--yes', `${LICENSE_CHECKER}@${LICENSE_CHECKER_VERSION}`, '--production', '--json'];
    const result = runNpx(args, FRONTEND_DIR);
    if (result.error) {
        failWithHint(`Could not run ${LICENSE_CHECKER}: ${result.error.message}`, 'license-checker');
    }
    if (result.status !== 0) {
        failWithHint(
            `${LICENSE_CHECKER} exited with code ${result.status}\n${result.stderr ?? ''}`,
            'license-checker',
        );
    }

    let data;
    try {
        data = JSON.parse(result.stdout);
    } catch (error) {
        failWithHint(`Could not parse ${LICENSE_CHECKER} output as JSON: ${error.message}`, 'license-checker');
    }

    const entries = [];
    for (const [key, info] of Object.entries(data)) {
        const idx = key.lastIndexOf('@');
        const name = idx > 0 ? key.slice(0, idx) : key;
        const version = idx > 0 ? key.slice(idx + 1) : '';
        if (name === rootPkg.name) continue;

        const licenses = Array.isArray(info.licenses) ? info.licenses.join(' OR ') : info.licenses;
        entries.push({
            ecosystem: 'npm',
            name,
            version,
            license: normalizeLicense(licenses),
            licenseFile: info.licenseFile || '',
            reference: info.repository || '',
        });
    }
    return entries;
}

function extractLicenseIds(license) {
    return license
        .replace(/\(|\)/g, ' ')
        .split(/\b(?:OR|AND|WITH)\b/i)
        .map((part) => part.trim())
        .filter((part) => part && !/^licenseref-/i.test(part));
}

function classify(license, allowed, denied) {
    const normalized = normalizeLicense(license);
    if (!normalized) return { status: 'unknown', ids: [] };

    const upper = normalized.toUpperCase();
    if (['UNKNOWN', 'UNLICENSED', 'NOASSERTION', 'NONE'].includes(upper)) {
        return { status: 'unknown', ids: [] };
    }
    if (upper.startsWith('SEE LICENSE IN') || upper.startsWith('CUSTOM:') || upper.startsWith('LICENSEREF-')) {
        return { status: 'unknown', ids: [] };
    }

    const ids = extractLicenseIds(normalized);
    if (ids.length === 0) return { status: 'unknown', ids: [] };

    // SPDX: `A OR B` lets us pick either, so one fully allowed alternative is
    // enough; `A AND B` needs every part allowed. Nested parentheses are not
    // expected in package metadata and are flattened.
    const alternatives = normalized
        .replace(/\(|\)/g, ' ')
        .split(/\bOR\b/i)
        .map((alt) => extractLicenseIds(alt));
    const altStatus = (parts) => {
        if (parts.length === 0) return 'unknown';
        if (parts.some((id) => denied.has(id))) return 'denied';
        if (parts.some((id) => !allowed.has(id))) return 'unknown';
        return 'allowed';
    };
    const statuses = alternatives.map(altStatus);

    if (statuses.includes('allowed')) return { status: 'allowed', ids };
    if (statuses.includes('unknown')) return { status: 'unknown', ids };
    return { status: 'denied', ids };
}

function findException(entry, exceptionsByPackage) {
    if (exceptionsByPackage.has(entry.name)) return exceptionsByPackage.get(entry.name);
    return exceptionsByPackage.get(`${entry.name}@${entry.version}`);
}

function evaluate(entries, policy) {
    const allowed = new Set(policy.allowedLicenses);
    const denied = new Set(policy.deniedLicenses);
    const exceptionsByPackage = new Map((policy.exceptions ?? []).map((ex) => [ex.package, ex]));

    const offenders = [];
    let exceptionCount = 0;

    for (const entry of entries) {
        const exception = findException(entry, exceptionsByPackage);
        if (exception) {
            entry.license = exception.license;
            entry.exceptionReason = exception.reason;
            exceptionCount += 1;
            continue;
        }

        const { status, ids } = classify(entry.license, allowed, denied);
        entry.licenseIds = ids;
        if (status !== 'allowed') {
            offenders.push({ entry, status });
        }
    }

    return { offenders, exceptionCount };
}

function printTable(rows, headers) {
    const widths = headers.map((header, i) =>
        Math.max(header.length, ...rows.map((row) => String(row[i] ?? '').length)),
    );
    const line = widths.map((w) => '-'.repeat(w)).join('-+-');
    const format = (row) => row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join(' | ');

    console.log(` ${format(headers)}`);
    console.log(`-${line}`);
    for (const row of rows) {
        console.log(` ${format(row)}`);
    }
}

function printOffenders(offenders) {
    const rows = offenders.map(({ entry, status }) => [
        entry.ecosystem,
        entry.name,
        entry.version,
        entry.license || '(none)',
        status,
    ]);
    printTable(rows, ['Ecosystem', 'Package', 'Version', 'License', 'Status']);
}

function markdownCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function referenceCell(entry) {
    if (/^https?:\/\//i.test(entry.reference)) {
        return `[link](${entry.reference})`;
    }
    return 'See license text below';
}

function sortEntries(entries) {
    return entries
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function isLicenseFile(entry) {
    if (!entry.licenseFile) return false;
    return /(licen[cs]e|copying|notice|unlicense)/i.test(basename(entry.licenseFile));
}

function readLicenseText(entry) {
    if (!isLicenseFile(entry)) return '';
    try {
        const text = readFileSync(entry.licenseFile, 'utf8').trim();
        return text && text.length < 50000 ? text : '';
    } catch {
        return '';
    }
}

function collectLicenseTexts(npmEntries) {
    const texts = new Map();
    for (const entry of npmEntries) {
        if (texts.has(entry.license)) continue;
        const text = readLicenseText(entry);
        if (text) texts.set(entry.license, text);
    }
    return texts;
}

function renderNotices(goEntries, npmEntries) {
    const lines = [];
    lines.push('# Third-Party Notices');
    lines.push('');
    lines.push('<!-- Generated by `npm run check:licenses -- --write-notices`. Do not edit by hand. -->');
    lines.push('');
    lines.push(
        'Zentro incorporates the third-party software components listed below, each distributed ' +
            "under its own license. Zentro's own source code is licensed under the terms in the " +
            'repository [LICENSE](LICENSE) file.',
    );
    lines.push('');

    lines.push('## Go modules');
    lines.push('');
    lines.push('| Package | Version | License | License reference |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of sortEntries(goEntries)) {
        lines.push(
            `| ${markdownCell(entry.name)} | ${markdownCell(entry.version)} | ${markdownCell(entry.license)} | ${referenceCell(entry)} |`,
        );
    }
    lines.push('');

    lines.push('## npm packages');
    lines.push('');
    lines.push('| Package | Version | License | License reference |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of sortEntries(npmEntries)) {
        lines.push(
            `| ${markdownCell(entry.name)} | ${markdownCell(entry.version)} | ${markdownCell(entry.license)} | ${referenceCell(entry)} |`,
        );
    }
    lines.push('');

    const licenseTexts = collectLicenseTexts(npmEntries);
    if (licenseTexts.size > 0) {
        lines.push('## License texts');
        lines.push('');
        lines.push(
            'The following license texts are reproduced from the corresponding npm packages. ' +
                'Where a package provides no local license text, its license reference links to the source license instead.',
        );
        lines.push('');
        const sortedLicenses = [...licenseTexts.keys()].sort((a, b) => a.localeCompare(b));
        for (const license of sortedLicenses) {
            lines.push(`### ${license}`);
            lines.push('');
            lines.push('```text');
            lines.push(licenseTexts.get(license));
            lines.push('```');
            lines.push('');
        }
    }

    return `${lines.join('\n')}\n`;
}

function main() {
    const policy = readPolicy();

    let goEntries;
    try {
        goEntries = goScan();
    } catch (error) {
        failWithHint(`Go license scan failed: ${error.message}`, 'go-licenses');
    }

    let npmEntries;
    try {
        npmEntries = npmScan();
    } catch (error) {
        failWithHint(`npm license scan failed: ${error.message}`, 'license-checker');
    }

    const goResult = evaluate(goEntries, policy);
    const npmResult = evaluate(npmEntries, policy);
    const offenders = [...goResult.offenders, ...npmResult.offenders];
    const exceptionCount = goResult.exceptionCount + npmResult.exceptionCount;

    const renderedNotices = renderNotices(goEntries, npmEntries);
    const committedNotices = existsSync(NOTICES_FILE) ? readFileSync(NOTICES_FILE, 'utf8') : null;
    // Compare content only, not local checkout line endings (core.autocrlf on
    // Windows can leave the committed file CRLF while this script always
    // writes LF) - a diff here must mean the actual license data changed.
    const normalizeEol = value => (value === null ? null : value.replace(/\r\n/g, '\n'));
    const noticesStale = normalizeEol(committedNotices) !== normalizeEol(renderedNotices);

    if (WRITE_NOTICES) {
        if (noticesStale) {
            writeFileSync(NOTICES_FILE, renderedNotices, 'utf8');
            console.log(`Wrote ${resolve(NOTICES_FILE)}`);
        } else {
            console.log(`${resolve(NOTICES_FILE)} is already up to date.`);
        }
    } else if (noticesStale) {
        console.error(
            `\nTHIRD_PARTY_NOTICES.md is out of date with the current Go modules and npm packages.\n` +
                'Run `npm run check:licenses -- --write-notices` and commit the result.',
        );
        process.exit(1);
    }

    console.log(`\nGo modules scanned: ${goEntries.length}`);
    console.log(`npm packages scanned: ${npmEntries.length}`);
    console.log(`Policy exceptions applied: ${exceptionCount}`);

    if (offenders.length > 0) {
        console.error(`\nLicense check failed: ${offenders.length} offender(s) found.`);
        printOffenders(offenders);
        console.error(
            '\nDenied licenses must be removed or replaced. Unknown/unlicensed packages must be ' +
                'added to license-policy.json with an owner-approved reason, or removed.',
        );
        process.exit(1);
    }

    console.log('\nAll third-party licenses comply with the policy.');
}

main();
