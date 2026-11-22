#!/usr/bin/env bash
# Builds the VReal fixture repo at $V/base: 3 groups (slug, money, dates), 6 DoD items, 18 pairs. Round 2 ran on this base (its last commit was 4152226 on the first machine).
set -euo pipefail
V=${VREAL_DIR:-$HOME/ptdd-vreal}
B=$V/base
if [ -e "$B" ]; then echo "REFUSE: $B exists"; exit 1; fi
mkdir -p "$B/src" "$B/test"; cd "$B"
git init -q -b main; git config user.email vreal@example.test; git config user.name vreal; git config commit.gpgSign false
cat > package.json <<'EOF'
{ "name": "vreal-fixture", "version": "1.0.0", "type": "module", "private": true,
  "scripts": { "test": "node --test test/" } }
EOF
printf 'node_modules/\n' > .gitignore
cat > src/slug.mjs <<'EOF'
export function slugify(input) {
  return String(input).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
EOF
cat > src/money.mjs <<'EOF'
export function formatCents(cents) {
  return (cents / 100).toFixed(2);
}
EOF
cat > src/dates.mjs <<'EOF'
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
EOF
cat > test/slug.test.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';
test('slugify lowercases and hyphenates', () => { assert.equal(slugify('Hello World'), 'hello-world'); });
EOF
cat > test/money.test.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents } from '../src/money.mjs';
test('formatCents renders two decimals', () => { assert.equal(formatCents(1234), '12.34'); });
EOF
cat > test/dates.test.mjs <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDate } from '../src/dates.mjs';
test('isoDate returns YYYY-MM-DD', () => { assert.equal(isoDate(new Date(Date.UTC(2026, 0, 5))), '2026-01-05'); });
EOF
git add -A; git commit -qm 'fixture: three modules with tests'
cat > ticket.md <<'EOF'
# Ticket VREAL-1: small helpers in three modules

## slug (src/slug.mjs)
- slugify accepts an optional maxLength and truncates the slug to at most maxLength characters without leaving a trailing hyphen.
- slugify throws a TypeError when the input is null or undefined.

## money (src/money.mjs)
- A new parseCents function converts a decimal string like "12.34" into an integer number of cents.
- parseCents throws a RangeError when the string has more than two decimal places or is not a number.

## dates (src/dates.mjs)
- A new addDays function returns a new Date that is the given number of days later in UTC, and does not mutate its input.
- addDays throws a TypeError when the days argument is not an integer.
EOF
cat > plan.json <<'EOF'
{
  "repo": ".",
  "cmd": "node --test {file}",
  "ticket": "ticket.md",
  "dod": [
    { "id": "AC1", "text": "slugify(input, maxLength) truncates to at most maxLength chars with no trailing hyphen", "source": "slugify accepts an optional maxLength and truncates the slug to at most maxLength characters without leaving a trailing hyphen." },
    { "id": "AC2", "text": "slugify throws TypeError for null or undefined input", "source": "slugify throws a TypeError when the input is null or undefined." },
    { "id": "AC3", "text": "parseCents('12.34') returns 1234 (integer cents)", "source": "A new parseCents function converts a decimal string like \"12.34\" into an integer number of cents." },
    { "id": "AC4", "text": "parseCents throws RangeError for >2 decimals or non-numeric strings", "source": "parseCents throws a RangeError when the string has more than two decimal places or is not a number." },
    { "id": "AC5", "text": "addDays(date, n) returns a new Date n UTC days later without mutating the input", "source": "A new addDays function returns a new Date that is the given number of days later in UTC, and does not mutate its input." },
    { "id": "AC6", "text": "addDays throws TypeError when days is not an integer", "source": "addDays throws a TypeError when the days argument is not an integer." }
  ],
  "groups": [
    { "id": "slug", "goal": "slugify maxLength and null/undefined guard", "tests": ["test/slug.ac.test.mjs"], "src": ["src/slug.mjs"], "dod": ["AC1", "AC2"], "after": [], "mirror": "test/slug.test.mjs" },
    { "id": "money", "goal": "parseCents", "tests": ["test/money.ac.test.mjs"], "src": ["src/money.mjs"], "dod": ["AC3", "AC4"], "after": [], "mirror": "test/money.test.mjs" },
    { "id": "dates", "goal": "addDays", "tests": ["test/dates.ac.test.mjs"], "src": ["src/dates.mjs"], "dod": ["AC5", "AC6"], "after": [], "mirror": "test/dates.test.mjs" }
  ]
}
EOF
git add -A; git commit -qm 'fixture: ticket and plan'
cat > .gitignore <<'EOF'
node_modules/

# graft's local graph cache — regenerable, not committed (run `graft build`).
/graft/

# ptdd lead artifacts must never count as changes
args.json
return.json
EOF
cat > .ignore <<'EOF'
# graft's cards are gitignored but should stay greppable: ripgrep reads
# .ignore before .gitignore, so this re-admits the tree to search only.
!graft/
graft/.cache/
graft/.graph/
EOF
git add -A; git commit -qm 'fixture: ignore run files and the graft cache'
echo "base ready: $B ($(git rev-parse --short HEAD))"
