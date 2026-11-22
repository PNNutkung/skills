// Hide secrets in text read from transcripts before anything quotes it (pure). Patterns err on hiding too much: a redacted quote is only
// harder to read, a leaked key is a breach.
const MARK = '[redacted]';
const PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
  /sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
];
const BEARER = /\b(Bearer|Basic)\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]{8,}/g;
const ASSIGNED = /\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*)(\s*[:=]\s*)(["']?)(?!\[redacted\])([^\s"']{6,})\3/gi;

/** -> { text, count } */
export function redact(input) {
  let text = String(input ?? ''), count = 0;
  for (const re of PATTERNS) text = text.replace(re, () => { count++; return MARK; });
  text = text.replace(BEARER, (_, kind) => { count++; return `${kind} ${MARK}`; });
  text = text.replace(ASSIGNED, (_, name, sep, q) => { count++; return `${name}${sep}${q}${MARK}${q}`; });
  return { text, count };
}
