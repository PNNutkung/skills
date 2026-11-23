// Test helper for the in-process CLIs (mutate.mjs, note.mjs; ADR 0003 ZtInProc): run a tool both ways, compare, and check that an in-process call
// leaves the test process as it found it. Not a test file itself (node --test picks up *.test.mjs only).
import { spawn, spawnSync } from 'node:child_process';

/** The CLI as a real process: { code, stdout, stderr }. */
export function spawnCli(file, argv, { env = process.env, cwd } = {}) {
  const r = spawnSync(process.execPath, [file, ...argv], { encoding: 'utf8', env, cwd });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** The same, without blocking the event loop, so several runs (and in-process calls) can overlap. */
export function spawnCliAsync(file, argv, { env = process.env, cwd } = {}) {
  return new Promise((done, fail) => {
    const p = spawn(process.execPath, [file, ...argv], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.setEncoding('utf8').on('data', d => { stdout += d; });
    p.stderr.setEncoding('utf8').on('data', d => { stderr += d; });
    p.on('error', fail);
    p.on('close', code => done({ code, stdout, stderr }));
  });
}

/** fn over items, at most n at a time; results in item order. */
export async function inPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}
export const PARALLEL = 4;

/** Make two runs comparable: each [from, to] pair is replaced everywhere (longest first), then stub run ids that carry a pid are made stable. */
export function normalize(r, pairs = []) {
  const sorted = [...pairs].filter(([from]) => from).sort((a, b) => b[0].length - a[0].length);
  const fix = s => sorted.reduce((t, [from, to]) => t.replaceAll(from, to), s).replace(/stub-\d+/g, 'stub-PID');
  return { code: r.code, stdout: fix(r.stdout), stderr: fix(r.stderr) };
}

/** A seeded generator, so a failing fuzz case can be replayed. */
export const rng = seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
export const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

/** What an in-process call must not change in the test process. */
export const processState = () => ({ env: JSON.stringify(Object.entries(process.env).sort()), cwd: process.cwd(), exitCode: process.exitCode, argv: [...process.argv] });

/** Runs fn with process.exit replaced by a recorder; -> { value, exits } (exits: the codes main tried to exit with, expected none). */
export async function recordExits(fn) {
  const real = process.exit, exits = [];
  process.exit = code => { exits.push(code); throw new Error(`process.exit(${code}) called from main`); };
  try { return { value: await fn(), exits }; } finally { process.exit = real; }
}
