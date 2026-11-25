// The small runner (ADR 0008 A18): bash -c in its own process group, stdout and stderr in arrival order, and a timeout that kills the group.
import { spawn } from 'node:child_process';

// set by node --test in its children; a nested `node --test` would then print v8 frames instead of its report
const DROP_ENV = ['NODE_TEST_CONTEXT'];

/** -> Promise<{ code, output, timedOut, seconds }>; never rejects. */
export function runCommand(cmd, { cwd, env, timeoutSec = Infinity }) {
  return new Promise(done => {
    const childEnv = { ...env };
    for (const k of DROP_ENV) delete childEnv[k];
    const chunks = [];
    let timedOut = false, timer = null, settled = false;
    const finish = r => { if (settled) return; settled = true; if (timer) clearTimeout(timer); done({ ...r, output: Buffer.concat(chunks).toString('utf8') + (r.extra ?? ''), timedOut, seconds: timeoutSec }); };
    let child;
    try {
      child = spawn('bash', ['-c', cmd], { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { finish({ code: null, extra: String(e.message) }); return; }
    child.stdout.on('data', c => chunks.push(c));
    child.stderr.on('data', c => chunks.push(c));
    child.on('error', e => finish({ code: null, extra: `${e.message}\n` }));
    child.on('close', code => finish({ code }));
    // own timer, not spawn's timeout option (rules/performance.md)
    if (Number.isFinite(timeoutSec)) {
      timer = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
      }, timeoutSec * 1000);
    }
  });
}
