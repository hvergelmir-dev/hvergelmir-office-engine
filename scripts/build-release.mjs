#!/usr/bin/env node
/**
 * Build the zip the desktop app downloads on first use.
 *
 * Upstream ships a single bundled server.js next to the ONLYOFFICE web assets and
 * node_modules. We keep that shape exactly: take the upstream release, replace the
 * bundle with one built from this repo's (patched) sources, rezip. The editors, the
 * converter and node_modules come from upstream untouched, which keeps the artifact
 * byte-for-byte comparable to what upstream ships apart from our own code.
 *
 * Usage: node scripts/build-release.mjs [--out dist]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const UPSTREAM_REPO = 'openinterpreter/oo-editors';
const UPSTREAM_TAG = 'v1.0.40';
const UPSTREAM_ASSET = 'oo-editors-windows-x64.zip';
const UPSTREAM_ASSET_SHA256 =
  'af9364bd452bd3a3d69cf88ed8a625ccb0fa9c6cebc644f866e5061ef93581ba';
const ESBUILD_VERSION = '0.25.12';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(ROOT, argValue('--out') || 'dist');

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function downloadUpstream(target) {
  const url = `https://github.com/${UPSTREAM_REPO}/releases/download/${UPSTREAM_TAG}/${UPSTREAM_ASSET}`;
  log(`downloading ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '-o', target, url], { stdio: 'inherit' });
  const digest = sha256File(target);
  if (digest !== UPSTREAM_ASSET_SHA256) {
    throw new Error(
      `upstream asset changed: expected ${UPSTREAM_ASSET_SHA256}, got ${digest}. ` +
        'Review the new upstream release before bumping the pin.'
    );
  }
  log(`upstream asset sha256 verified (${UPSTREAM_TAG})`);
}

function bundleServer(outFile) {
  execFileSync(
    'npx',
    [
      '--yes',
      `esbuild@${ESBUILD_VERSION}`,
      'server.js',
      '--bundle',
      '--platform=node',
      '--target=node20',
      '--packages=external',
      '--minify',
      `--outfile=${outFile}`
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
}

async function main() {
  const work = await mkdtemp(path.join(tmpdir(), 'hvergelmir-office-'));
  const upstreamZip = path.join(work, UPSTREAM_ASSET);
  const tree = path.join(work, 'tree');
  await downloadUpstream(upstreamZip);

  await mkdir(tree, { recursive: true });
  execFileSync('unzip', ['-q', upstreamZip, '-d', tree], { stdio: 'inherit' });

  const bundled = path.join(work, 'server.js');
  bundleServer(bundled);
  await writeFile(path.join(tree, 'server.js'), await readFile(bundled));

  const version = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
  const zipName = `hvergelmir-office-engine-windows-x64-${version}.zip`;
  const outZip = path.join(OUT_DIR, zipName);
  await mkdir(OUT_DIR, { recursive: true });
  await rm(outZip, { force: true });
  execFileSync('zip', ['-qr', outZip, '.'], { cwd: tree, stdio: 'inherit' });

  const manifest = {
    version,
    upstream: { repo: UPSTREAM_REPO, tag: UPSTREAM_TAG, asset: UPSTREAM_ASSET },
    file: zipName,
    bytes: (await stat(outZip)).size,
    sha256: sha256File(outZip)
  };
  const manifestName = `hvergelmir-office-engine-windows-x64-${version}.json`;
  await writeFile(path.join(OUT_DIR, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);

  await rm(work, { recursive: true, force: true });

  log(`\n${zipName}`);
  log(`  bytes  ${manifest.bytes}`);
  log(`  sha256 ${manifest.sha256}`);
  log(`  manifest ${manifestName}`);
}

await main();
