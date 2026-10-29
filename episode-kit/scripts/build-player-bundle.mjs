#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalJSON } from '../lib/export.mjs';

const VERSION = '0.28.2', SCHEMA = 'ludolingua.portable-player-bundle.v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = 'web/portable-player-bundle.json', TOOLCHAIN = 'scripts/portable-toolchain.json';
const ENTRY = 'web/portable-entry.mjs', HTML = 'web/playtest.html', CSS = 'web/style.css';
const REQUIRED = ['scripts/build-player-bundle.mjs', TOOLCHAIN, ENTRY, 'web/portable-bootstrap.mjs', 'web/playtest.mjs', HTML, CSS];
const STYLE_ANCHOR = '<link rel="stylesheet" href="./style.css">';
const SCRIPT_ANCHOR = '<script type="module" src="./playtest.mjs"></script>';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function validateRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value) ||
      path.posix.normalize(value) !== value || value === '..' || value.startsWith('../')) fail('Invalid source path: ' + value);
}
async function sourceBytes(relative) {
  validateRelative(relative);
  const realRoot = await fs.realpath(ROOT), realFile = await fs.realpath(path.resolve(ROOT, relative));
  if (!within(realRoot, realFile) || !(await fs.stat(realFile)).isFile()) fail('Source escapes the kit or is not a file: ' + relative);
  return fs.readFile(realFile);
}
async function sourceRecord(relative) {
  const bytes = await sourceBytes(relative);
  return { path: relative, bytes: bytes.length, sha256: digest(bytes) };
}
function attribute(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}
function validateAssets(html, css) {
  for (const anchor of [STYLE_ANCHOR, SCRIPT_ANCHOR, '</head>', '</body>']) {
    if (html.split(anchor).length !== 2) fail('Expected exactly one player template anchor: ' + anchor);
  }
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  if (scripts.length !== 1 || attribute(scripts[0], 'src') !== './playtest.mjs') fail('Unhandled player script.');
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase(), href = attribute(tag, 'href') ?? '';
    if (!(rel === 'stylesheet' && href === './style.css') && !(rel === 'icon' && /^data:/i.test(href))) fail('Unhandled player link: ' + tag);
  }
  if (/<(?:base|iframe|object|embed)\b/i.test(html)) fail('Unsupported external-content element.');
  for (const tag of html.match(/<[a-z][^>]*>/gi) ?? []) {
    if (/^<script\b/i.test(tag)) continue;
    if (/\bsrcset\s*=/i.test(tag)) fail('Unhandled player srcset.');
    for (const key of ['src', 'poster']) {
      const value = attribute(tag, key);
      if (value !== undefined && !/^data:/i.test(value)) fail('Unhandled player asset: ' + value);
    }
  }
  if (/@import\b/i.test(css) || /<\/style/i.test(css)) fail('Unsupported inline player CSS.');
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    const value = (match[1] ?? match[2] ?? match[3]).trim();
    if (!/^data:/i.test(value) && !value.startsWith('#')) fail('Unhandled player CSS URL: ' + value);
  }
}
function validateJavascript(javascript) {
  if (typeof javascript !== 'string' || !javascript.trim() || /<\/script/i.test(javascript)) fail('Unsupported inline player JavaScript.');
  new vm.Script(javascript, { filename: 'portable-player.js' });
}
async function readToolchain() {
  const value = JSON.parse((await sourceBytes(TOOLCHAIN)).toString('utf8'));
  if (value.name !== 'esbuild' || value.version !== VERSION) fail('Toolchain must pin esbuild ' + VERSION + '.');
}
async function checkBundle() {
  await readToolchain();
  const bundle = JSON.parse((await sourceBytes(OUTPUT)).toString('utf8'));
  if (Object.keys(bundle).sort().join(',') !== 'compiler,css,html,javascript,schema,sha256,sources' ||
      bundle.schema !== SCHEMA || bundle.compiler?.name !== 'esbuild' || bundle.compiler.version !== VERSION) fail('Invalid portable bundle shape or toolchain.');
  const { sha256, ...payload } = bundle;
  if (sha256 !== digest(canonicalJSON(payload))) fail('Portable bundle integrity check failed.');
  if (!Array.isArray(bundle.sources) || !bundle.sources.length) fail('Missing source inventory.');
  const names = bundle.sources.map(value => value.path);
  if (new Set(names).size !== names.length || canonicalJSON(names) !== canonicalJSON([...names].sort())) fail('Source inventory must be unique and sorted.');
  for (const required of REQUIRED) if (!names.includes(required)) fail('Missing required source: ' + required);
  for (const recorded of bundle.sources) {
    const current = await sourceRecord(recorded.path);
    if (current.bytes !== recorded.bytes || current.sha256 !== recorded.sha256) fail('Portable player bundle is stale: ' + recorded.path);
  }
  const html = (await sourceBytes(HTML)).toString('utf8'), css = (await sourceBytes(CSS)).toString('utf8');
  if (bundle.html !== html || bundle.css !== css) fail('Bundled presentation differs from its source.');
  validateAssets(html, css); validateJavascript(bundle.javascript);
  console.log(JSON.stringify({ verified: true, sha256: bundle.sha256, sources: bundle.sources.length }));
}
async function buildBundle() {
  await readToolchain();
  const binary = process.env.LUDO_ESBUILD_BINARY;
  if (!binary || !path.isAbsolute(binary)) fail('Set LUDO_ESBUILD_BINARY to the absolute path of esbuild ' + VERSION + '.');
  if (execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim() !== VERSION) fail('Compiler version does not match the pinned toolchain.');
  const html = (await sourceBytes(HTML)).toString('utf8'), css = (await sourceBytes(CSS)).toString('utf8');
  validateAssets(html, css);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ludo-portable-'));
  try {
    const output = path.join(temporary, 'player.js'), meta = path.join(temporary, 'meta.json');
    execFileSync(binary, [ENTRY, '--bundle', '--format=iife', '--platform=browser', '--target=es2022', '--charset=utf8',
      '--legal-comments=inline', '--log-level=error', '--color=false', '--outfile=' + output, '--metafile=' + meta],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const metadata = JSON.parse(await fs.readFile(meta, 'utf8')), outputs = Object.entries(metadata.outputs ?? {});
    if (outputs.length !== 1 || path.resolve(ROOT, outputs[0][0]) !== output || (outputs[0][1].imports ?? []).length || outputs[0][1].cssBundle) fail('Portable player must have one JavaScript output with no runtime imports or extra assets.');
    const names = new Set(REQUIRED);
    for (const [input, info] of Object.entries(metadata.inputs ?? {})) {
      const absolute = path.resolve(ROOT, input);
      if (!within(ROOT, absolute)) fail('Compiler input escapes the kit: ' + input);
      const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
      await sourceBytes(relative); names.add(relative);
      for (const dependency of info.imports ?? []) if (dependency.external || dependency.kind === 'dynamic-import') fail('Unsupported runtime dependency: ' + dependency.path);
    }
    const javascript = await fs.readFile(output, 'utf8'); validateJavascript(javascript);
    const sources = [];
    for (const name of [...names].sort()) sources.push(await sourceRecord(name));
    const payload = { schema: SCHEMA, compiler: { name: 'esbuild', version: VERSION }, sources, html, css, javascript };
    await fs.writeFile(path.join(ROOT, OUTPUT), JSON.stringify({ ...payload, sha256: digest(canonicalJSON(payload)) }, null, 2) + '\n');
    await checkBundle();
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
try {
  const args = process.argv.slice(2);
  if (!args.length) await buildBundle();
  else if (args.length === 1 && args[0] === '--check') await checkBundle();
  else fail('Usage: node scripts/build-player-bundle.mjs [--check]');
} catch (error) { console.error(error.message); process.exitCode = 1; }
