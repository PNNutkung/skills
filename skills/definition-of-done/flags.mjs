// On/off flags: NAME_ENABLED=true|false (any case). Unset or empty keeps the default; any other value warns and keeps it.
// Each skill installs on its own, so paired-agent-tdd and qa-sweep keep identical copies (flags.test.mjs checks).
const say = m => process.stderr.write(`${m}\n`);

/** -> boolean. env: process.env; dflt: the value when unset; warn: where a bad value is reported. */
export function enabled(env, name, dflt, warn = say) {
  const v = String(env?.[name] ?? '').trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v) warn(`${name}=${env[name]} is not true or false; using the default, ${dflt}`);
  return dflt;
}
