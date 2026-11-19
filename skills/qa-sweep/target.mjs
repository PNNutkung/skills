// Target guard: runs the project's e2e runner only against a local app,
// or against a non-local one the user confirmed by its exact URL.
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { touch } from './run.mjs';

const DOTTED_QUAD_127 = /^127\.(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){2}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const USAGE = 'usage: node target.mjs run --url URL [--services a,b] [--confirm-target URL] [--env-name BASE_URL] -- CMD ARG...';

export function isLocalTarget(url, services = []) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1' ||
    DOTTED_QUAD_127.test(host) || services.includes(host);
}

class UsageError extends Error {}

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  if (sep === -1 || sep === argv.length - 1) throw new UsageError('missing -- CMD');
  const flags = argv.slice(0, sep);
  const opts = { envName: 'BASE_URL', services: [], cmd: argv.slice(sep + 1) };
  const names = { '--url': 'url', '--confirm-target': 'confirm', '--env-name': 'envName' };
  for (let i = 0; i < flags.length; i += 2) {
    const value = flags[i + 1];
    if (value === undefined) throw new UsageError(`${flags[i]} needs a value`);
    if (flags[i] === '--services') opts.services = value.split(',').filter(Boolean);
    else if (names[flags[i]]) opts[names[flags[i]]] = value;
    else throw new UsageError(`unknown flag ${flags[i]}`);
  }
  if (!opts.url) throw new UsageError('missing --url');
  return opts;
}

function main(argv) {
  let opts;
  try {
    if (argv[0] !== 'run') throw new UsageError('unknown command');
    opts = parseArgs(argv.slice(1));
  } catch (e) {
    process.stderr.write(`target: ${e.message}\n${USAGE}\n`);
    process.exit(2);
  }
  try { touch({ session: process.env.CLAUDE_CODE_SESSION_ID }); } catch {}
  if (!isLocalTarget(opts.url, opts.services) && opts.confirm !== opts.url) {
    process.stderr.write(`target ${opts.url} is not local: ask the user, then pass --confirm-target ${opts.url}\n`);
    process.exit(3);
  }
  const [cmd, ...args] = opts.cmd;
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, [opts.envName]: opts.url } });
  child.on('error', (e) => { process.stderr.write(`target: ${e.message}\n`); process.exit(1); });
  child.on('close', (code) => process.exit(code ?? 1));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
