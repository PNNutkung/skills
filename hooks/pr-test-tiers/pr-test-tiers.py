#!/usr/bin/env python3
"""PreToolUse hook: a change request ships all three test tiers, container-first.

  Bash `gh pr create` / `glab mr create`  DENY when the branch diff against the base branch
                                          touches source but lacks a unit, integration or e2e
                                          test, or mocks a dependency in an integration or e2e
                                          test file without a stated reason.
  Bash `git commit`                       WARN, never blocks: the same findings for the branch
                                          so far, so the gap shows before the change request.
  Same two, a removed test          DENY / WARN: the branch deletes a test file, removes a test function, or adds
                                          a skip or expected-failure marker, without a stated reason.
  Write of a new test file                REMIND, never blocks: the policy and the file's tier.

A test file's tier comes from its path (a unit/integration/e2e directory or filename token).
Docs, lockfiles and config never count as source. A repo with no tiered test at all gets a
note instead of a denial. Only ADDED lines are checked for mocks. Fails open on any internal
error.

A mock in an integration or e2e test file needs `no-container: <reason>` in a comment of
that file, in any comment syntax.

A removal needs `Test-Removed: <path>: <reason>` as a trailer in a commit message of the branch. A skip
or expected-failure marker needs `skip-reason: <reason>` on its line or the line before. A test moved to
another file, or a file renamed, is not a removal.

Escape hatch:  PR_TEST_TIERS=off gh pr create ...
Scope:         every git repo is guarded by default; PR_TEST_TIERS_SCOPE (colon-separated
               path prefixes) narrows it.
Per-repo override: <repo>/.claude/test-tiers.json
    {"enabled": true,
     "tiers": {"unit": ["glob"], "integration": ["glob"], "e2e": ["glob"]},
     "mockPatterns": ["regex"]}
  `tiers` replaces the built-in path rule of each tier it names (`*` also matches `/`);
  `mockPatterns` adds to the built-in mocking-library patterns.
Branch check (for scripts and agents; exit 1 when the gate would deny):
               python3 pr-test-tiers.py --check [--base BRANCH]
Inventory:     python3 pr-test-tiers.py --inventory [--depth N]
               JSON of per-module unit/integration/e2e counts, plus `unmapped` (tiered tests no
               module owns), `unmapped_tiers` (their counts per tier) and `untiered` (test files
               with no tier); exit 2 outside a git repo
Test file?     python3 pr-test-tiers.py --is-test PATH
               exit 0 when PATH (repo-relative or absolute) is a test file, 3 when not, 2 outside a repo
One tier:      python3 pr-test-tiers.py --list-tier unit|integration|e2e [--module PATH]
               the tracked test files of that tier (with --module, only those --inventory counts for
               that module), one per line; exit 2 for another tier, an unknown module or outside a repo
Self-test:     python3 pr-test-tiers.py --self-test
"""

import fnmatch
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile

DEFAULT_SCOPE = "/"
GLOBAL_FLAGS_WITH_VALUE = {"-c", "--git-dir", "--work-tree", "--namespace"}
ESCAPE_RE = re.compile(r"(^|\s)PR_TEST_TIERS=(off|0|false|no)(\s|$)", re.IGNORECASE)

TIERS = ("unit", "integration", "e2e")
TIER_PRIORITY = ("e2e", "integration", "unit")  # the broader scope wins a tie
TIER_DIR = {
    "e2e": r"(?:e2e|end[_-]to[_-]end)(?:[_-]?tests?)?",
    "integration": r"integration(?:[_-]?tests?)?",
    "unit": r"unit(?:[_-]?tests?)?",
}
TEST_DIR = re.compile(
    r"^(?:tests?|__tests__|specs?|e2e|(?:unit|integration|e2e|end[_-]to[_-]end)[_-]?tests?)$",
    re.IGNORECASE,
)
TEST_NAME = re.compile(r"^test_|_test\.|\.test\.|\.spec\.|_spec\.|\.cy\.")  # on the lowercased basename
JAVA_TEST = re.compile(r"[a-z0-9]Tests?\.[A-Za-z]+$")
EXEMPT_EXT = {".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".lock"}

# ponytail: regex heuristic; repos add their own through `mockPatterns`
MOCK_PATTERNS = [
    r"\bunittest\.mock\b|\bfrom\s+unittest\s+import\s+mock\b|\bMagicMock\b",
    r"\bpytest_mock\b|\bmocker\b",
    r"^\s*(?:import|from)\s+responses\b",
    r"\bjest\.(?:mock|doMock|fn|spyOn)\b",
    r"\bsinon\b",
    r"['\"]nock['\"]",
    r"['\"]msw(?:/[^'\"]*)?['\"]",
]
MARKER = re.compile(r"no-container:\s*\S+")

# ponytail: regex heuristic; a skip or an expected failure silences a test as well as deleting it does
SKIP_PATTERNS = [re.compile(p) for p in (
    r"@pytest\.mark\.skip\b", r"\bpytest\.skip\(", r"@unittest\.skip", r"\b(?:it|test|describe)\.skip\(",
    r"\bx(?:it|test|describe)\(", r"\bt\.Skip(?:Now|f)?\(", r"@Disabled\b", r"@Ignore\b",
    r"@pytest\.mark\.xfail\b", r"\bpytest\.xfail\(", r"@unittest\.expectedFailure\b",
    r"\b(?:it|test)\.(?:fails|failing)\(", r"\btest\.fail\(",
)]
SKIP_MARKER = re.compile(r"skip-reason:\s*\S+")
TRAILER = re.compile(r"^Test-Removed:\s*(.+?):\s*\S", re.M)
PY_TEST_DEF = re.compile(r"^\s*(?:async\s+)?def\s+(test_\w*)\s*\(")
JS_TEST_CASE = re.compile(r"\b(?:it|test)(?:\.only)?\s*\(\s*(['\"`])(.+?)\1")
# a TS/JS case line, skipped or not (`it.skip('t'`, `xit('t'`), and a Go test function
JS_CASE_ANY = re.compile(r"\b(?:x?it|x?test|describe)(?:\.\w+)?\s*\(\s*(['\"`])(.+?)\1")
GO_TEST_FUNC = re.compile(r"^func\s+(Test\w*)\s*\(")
HUNK_NEW_START = re.compile(r"\+(\d+)")
REMOVED_HINT = (
    "Give a reason with `skip-reason: <reason>` next to a skip, or a "
    "`Test-Removed: <path>: <reason>` commit trailer."
)

POLICY = (
    "Policy: a change request that touches source ships unit, integration and e2e tests. "
    "Container-first: integration and e2e tests run real dependencies in containers "
    "(Testcontainers, docker compose). Mock only when no container is possible, for example "
    "a third-party service with no UAT server, and say why in a comment in that file: "
    "`# no-container: <reason>` or `// no-container: <reason>`."
)
BYPASS = (
    "\nBypass once with `PR_TEST_TIERS=off <command>`. Per-repo override: "
    "<repo>/.claude/test-tiers.json."
)
UNTIERED = (
    "pr-test-tiers: no unit, integration or e2e test found in this repo, so the three-tier "
    "rule is not enforced here. Put tests under tests/unit, tests/integration and tests/e2e, "
    "or map them in <repo>/.claude/test-tiers.json.\n" + POLICY
)


def _git(args, cwd):
    out = subprocess.run(
        ["git", "-c", "core.quotepath=off", *args],
        cwd=cwd, capture_output=True, text=True, check=False, timeout=20,
    )
    return out.stdout if out.returncode == 0 else ""


def find_cmd(raw_cmd, cwd):
    """Return (kind, repo_dir, args, escaped, exe) for the first `git commit` (kind
    "commit"), `gh pr create` or `glab mr create` (kind "pr"), else None."""
    cur = cwd
    for seg in re.split(r"&&|\|\||;|\||&", raw_cmd):
        try:
            tokens = shlex.split(seg)
        except ValueError:
            continue
        if tokens[:1] == ["cd"] and len(tokens) > 1:
            cur = os.path.join(cur, os.path.expanduser(tokens[1]))
            continue
        for i, tok in enumerate(tokens):
            exe = tok.rsplit("/", 1)[-1]
            if exe not in ("git", "gh", "glab"):
                continue
            repo, j = cur, i + 1
            while j < len(tokens):
                t = tokens[j]
                if exe == "git" and t == "-C" and j + 1 < len(tokens):
                    repo = os.path.join(repo, os.path.expanduser(tokens[j + 1]))
                    j += 2
                elif exe == "git" and t in GLOBAL_FLAGS_WITH_VALUE:
                    j += 2
                elif t.startswith("-"):
                    j += 1
                else:
                    break
            words, esc = tokens[j : j + 2], bool(ESCAPE_RE.search(seg))
            if exe == "git" and words[:1] == ["commit"]:
                return "commit", repo, tokens[j + 1 :], esc, exe
            if (exe == "gh" and words == ["pr", "create"]) or (
                exe == "glab" and words[:1] == ["mr"] and words[1:] in (["create"], ["new"])
            ):
                return "pr", repo, tokens[j + 2 :], esc, exe
    return None


def explicit_base(args, exe):
    """The base branch named on the command line, else None (gh -b is --body, so glab only)."""
    flags = ("--base", "-B") if exe == "gh" else ("--target-branch", "-b")
    for k, a in enumerate(args):
        if a in flags and k + 1 < len(args):
            return args[k + 1]
        for f in flags:
            if f.startswith("--") and a.startswith(f + "="):
                return a[len(f) + 1 :]
    return None


def resolve_base(root, explicit=None):
    head = _git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], root).strip()
    for cand in (explicit, head, "main", "master"):
        if not cand:
            continue
        for ref in (cand,) if cand.startswith("origin/") else (f"origin/{cand}", cand):
            if _git(["rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"], root).strip():
                return ref
    return None


def in_scope(repo_root):
    prefixes = os.environ.get("PR_TEST_TIERS_SCOPE") or DEFAULT_SCOPE
    real = os.path.realpath(repo_root)
    return any(real.startswith(os.path.realpath(os.path.expanduser(p))) for p in prefixes.split(":") if p)


def load_cfg(root):
    cfg = {"enabled": True, "tiers": {}, "mock": [re.compile(p) for p in MOCK_PATTERNS]}
    try:
        with open(os.path.join(root, ".claude", "test-tiers.json")) as fh:
            raw = json.load(fh)
    except (OSError, ValueError):
        return cfg
    if not isinstance(raw, dict):
        return cfg
    cfg["enabled"] = raw.get("enabled") is not False
    tiers = raw.get("tiers")
    for tier, globs in (tiers.items() if isinstance(tiers, dict) else ()):
        if tier in TIERS and isinstance(globs, list):
            cfg["tiers"][tier] = [g for g in globs if isinstance(g, str)]
    for pattern in raw.get("mockPatterns") or []:
        try:
            cfg["mock"].append(re.compile(pattern))
        except (re.error, TypeError):
            pass
    return cfg


def _matches(path, globs):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def is_test(path, cfg):
    if any(_matches(path, g) for g in cfg["tiers"].values()):
        return True
    *dirs, base = path.split("/")
    return bool(TEST_NAME.search(base.lower()) or JAVA_TEST.search(base) or any(TEST_DIR.match(d) for d in dirs))


def tier_of(path, cfg):
    """unit, integration or e2e for a test file; None for anything else."""
    for tier in TIER_PRIORITY:
        if _matches(path, cfg["tiers"].get(tier, [])):
            return tier
    if not is_test(path, cfg):
        return None
    *dirs, base = path.split("/")
    tokens = set(re.split(r"[._-]", base.lower()))
    for tier in TIER_PRIORITY:
        if tier in cfg["tiers"]:
            continue
        if tier in tokens or any(re.fullmatch(TIER_DIR[tier], d.lower()) for d in dirs):
            return tier
    return None


def is_exempt(path):
    *dirs, base = path.split("/")
    return (
        os.path.splitext(base)[1].lower() in EXEMPT_EXT
        or base == "go.sum"
        or base.upper().startswith(("LICENSE", "COPYING"))
        or "docs" in dirs
        or any(p.startswith(".") for p in (*dirs, base))
    )


def is_source(path, cfg):
    return not is_test(path, cfg) and not is_exempt(path)


def parse_added(diff_text):
    """{path: [added lines]} from a unified diff."""
    out, cur = {}, None
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            cur = line[4:].removeprefix("b/") if line[4:] != "/dev/null" else None
        elif cur and line.startswith("+"):
            out.setdefault(cur, []).append(line[1:])
    return out


def has_marker(root, rel):
    try:
        with open(os.path.join(root, rel), errors="replace") as fh:
            return bool(MARKER.search(fh.read()))
    except OSError:
        return False


def parse_removed(diff_text):
    """{path: [removed lines]} from a unified diff, keyed by the `--- a/` path."""
    out, cur = {}, None
    for line in diff_text.splitlines():
        if line.startswith("--- "):
            path = line[4:].split("\t")[0]
            cur = path.removeprefix("a/") if path != "/dev/null" else None
        elif cur and line.startswith("-"):
            out.setdefault(cur, []).append(line[1:])
    return out


def _parse_added_numbered(diff_text):
    """{path: [(line number in the new file, added line)]} from a `--unified=0` diff."""
    out, cur, num = {}, None, 0
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            path = line[4:].split("\t")[0]
            cur = path.removeprefix("b/") if path != "/dev/null" else None
        elif line.startswith("@@"):
            m = HUNK_NEW_START.search(line)
            num = int(m.group(1)) if m else 0
        elif cur and line.startswith("+"):
            out.setdefault(cur, []).append((num, line[1:]))
            num += 1
    return out


def _test_names(lines):
    names = set()
    for line in lines:
        m = PY_TEST_DEF.match(line)
        if m:
            names.add(m.group(1))
        m = JS_TEST_CASE.search(line)
        if m:
            names.add(m.group(2))
    return names


def _name_status(status_z):
    """(deleted paths, {new path: old path} of renames) from `git diff --name-status -z`."""
    parts, deleted, renamed, i = status_z.split("\0"), [], {}, 0
    while i < len(parts) and parts[i]:
        if parts[i][0] in "RC":
            renamed[parts[i + 2]] = parts[i + 1]
            i += 3
        else:
            if parts[i][0] == "D":
                deleted.append(parts[i + 1])
            i += 2
    return deleted, renamed


def _read(root, rel):
    try:
        with open(os.path.join(root, rel), errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _markers(text):
    """{owner: [line numbers]} of skip and expected-failure markers outside comments. The owner is the Python
    test holding the marker, else the nearest preceding TS/JS case title or Go test function (a marker on
    a case line belongs to that case), else the marker's stripped text (count-based)."""
    lines = text.splitlines()
    owner = [None] * len(lines)
    for i, line in enumerate(lines):
        m = PY_TEST_DEF.match(line)
        if not m:
            continue
        indent, owner[i], j, k = len(line) - len(line.lstrip()), m.group(1), i - 1, i + 1
        while j >= 0 and lines[j].lstrip().startswith(("@", "#")):
            owner[j], j = m.group(1), j - 1
        while k < len(lines) and (not lines[k].strip() or len(lines[k]) - len(lines[k].lstrip()) > indent):
            owner[k], k = m.group(1), k + 1
    out, case = {}, None
    for num, line in enumerate(lines, 1):
        if line.strip().startswith(("#", "//")):
            continue
        m = JS_CASE_ANY.search(line) or GO_TEST_FUNC.match(line)
        case = m.groups()[-1] if m else case
        if any(r.search(line) for r in SKIP_PATTERNS):
            out.setdefault(owner[num - 1] or case or line.strip(), []).append(num)
    return out


def _has_skip_reason(root, rel, lineno):
    """True when `skip-reason: <reason>` is on line `lineno` of the file or the line before it."""
    lines = _read(root, rel).splitlines()
    return any(SKIP_MARKER.search(l) for l in lines[max(lineno - 2, 0) : lineno])


def removed_tests(root, base, cfg, extra=None):
    """(path, what) for each deleted test file, removed test name, or unexplained skip on the branch."""
    log = _git(["log", f"{base}..HEAD", "--format=%B"], root)
    cleared = {m.group(1) for m in TRAILER.finditer(log)}
    found, added_names = [], set()
    for rng in filter(None, ([f"{base}...HEAD"], extra)):
        deleted, renamed = _name_status(_git(["diff", "--name-status", "-z", "--find-renames", *rng], root))
        deleted = set(deleted)
        diff = _git(["diff", "--unified=0", "--no-color", "--find-renames", *rng], root)
        added = _parse_added_numbered(diff)
        for lines in added.values():
            added_names |= _test_names(l for _, l in lines)
        found += [(p, "deleted test file") for p in sorted(deleted) if is_test(p, cfg)]
        removed = parse_removed(diff)
        for path, lines in removed.items():
            if path not in deleted and is_test(path, cfg):
                found += [(path, f"removed test {n}") for n in sorted(_test_names(lines))]
        for path in filter(lambda p: is_test(p, cfg), added):
            now = _read(root, path)
            was = _markers(_git(["show", f"{base}:{renamed.get(path, path)}"], root))  # more markers than at base
            for key, nums in _markers(now).items():
                for num in nums[len(was.get(key, [])):]:
                    if not _has_skip_reason(root, path, num):
                        found.append((path, f"added skip or expected-failure marker: {now.splitlines()[num - 1].strip()[:80]}"))
    kept = {}
    for path, what in found:
        if what.startswith("removed test ") and what[len("removed test "):] in added_names:
            continue  # moved to another file
        if not what.startswith("added skip") and path in cleared:
            continue
        kept[(path, what)] = None
    return list(kept)


def evaluate(root, base, cfg, extra=None):
    """Judge the branch diff (plus `extra` diff args, e.g. ["--cached"]) against the policy."""
    names, added = set(), {}
    for rng in filter(None, ([f"{base}...HEAD"], extra)):
        names.update(n for n in _git(["diff", "--name-only", "-z", "--diff-filter=ACMR", *rng], root).split("\0") if n)
        diff = _git(["diff", "--unified=0", "--no-color", "--diff-filter=ACMR", *rng], root)
        for path, lines in parse_added(diff).items():
            added.setdefault(path, []).extend(lines)
    res = {"exempt": False, "untiered": False, "present": [], "missing": [], "unjustified": [],
           "removed": removed_tests(root, base, cfg, extra)}
    if not any(is_source(n, cfg) for n in names):
        res["exempt"] = True
        return res
    present = {t for n in names if (t := tier_of(n, cfg))}
    res["present"] = [t for t in TIERS if t in present]
    res["missing"] = [t for t in TIERS if t not in present]
    if not present and not cfg["tiers"]:
        tracked = _git(["ls-files", "-z"], root).split("\0")
        res["untiered"] = not any(tier_of(n, cfg) for n in tracked if n)
    for n in sorted(names):
        if tier_of(n, cfg) not in ("integration", "e2e"):
            continue
        hit = next((l.strip() for l in added.get(n, []) if any(r.search(l) for r in cfg["mock"])), None)
        if hit and not has_marker(root, n):
            res["unjustified"].append((n, hit[:80]))
    return res


def judge(kind, res):
    """Map an evaluate() result to ("deny" | "context", text), or None when there is nothing to say."""
    removed = [f"Removed test protection without a reason: {p}: {w}." for p, w in res["removed"]]
    if removed:
        removed.append(REMOVED_HINT)
    findings = []
    if not res["exempt"]:
        if res["untiered"] and not removed:
            return None if kind == "commit" else ("context", UNTIERED)
        if not res["untiered"]:
            if res["missing"]:
                found = ", ".join(res["present"]) or "none"
                findings.append(f"Missing test tiers: {', '.join(res['missing'])} (found: {found}).")
            for path, line in res["unjustified"]:
                findings.append(f"Mock without `no-container: <reason>` in {path}: {line}")
    findings += removed
    if not findings:
        return None
    body = "\n".join(findings) + "\n" + POLICY
    if kind == "pr":
        return "deny", "Change request blocked by pr-test-tiers.\n" + body + BYPASS
    return "context", "pr-test-tiers (not blocking): a change request from this branch would be refused today.\n" + body


def on_write(file_path, cwd):
    path = os.path.join(cwd, file_path)
    if not file_path or os.path.exists(path):
        return None
    probe = os.path.dirname(path)
    while not os.path.isdir(probe) and probe != os.path.dirname(probe):
        probe = os.path.dirname(probe)
    root = _git(["rev-parse", "--show-toplevel"], probe).strip()
    if not root or not in_scope(root):
        return None
    cfg = load_cfg(root)
    rel = os.path.relpath(os.path.join(os.path.realpath(probe), os.path.relpath(path, probe)), root)
    rel = rel.replace(os.sep, "/")
    if not cfg["enabled"] or rel.startswith("..") or not is_test(rel, cfg):
        return None
    return "context", f"pr-test-tiers: new test file {rel} (tier: {tier_of(rel, cfg) or 'none'}). {POLICY}"


def handle(data):
    cwd = data.get("cwd") or os.getcwd()
    args = data.get("tool_input", {})
    if data.get("tool_name") == "Write":
        return on_write(args.get("file_path", ""), cwd)
    found = find_cmd(args.get("command", ""), cwd)
    if found is None or found[3]:
        return None
    kind, repo, cmd_args, _, exe = found
    root = _git(["rev-parse", "--show-toplevel"], repo).strip()
    if not root or not in_scope(root):
        return None
    cfg = load_cfg(root)
    if not cfg["enabled"]:
        return None
    base = resolve_base(root, explicit_base(cmd_args, exe) if kind == "pr" else None)
    if not base:
        return None
    extra = None
    if kind == "commit":
        if base.removeprefix("origin/") == _git(["rev-parse", "--abbrev-ref", "HEAD"], root).strip():
            return None
        all_flag = any(a == "--all" or re.fullmatch(r"-[a-zA-Z]*a[a-zA-Z]*", a) for a in cmd_args)
        extra = ["HEAD"] if all_flag else ["--cached"]
    return judge(kind, evaluate(root, base, cfg, extra))


def emit(decision, text):
    out = {"hookEventName": "PreToolUse"}
    if decision == "deny":
        out.update(permissionDecision="deny", permissionDecisionReason=text)
    else:
        out["additionalContext"] = text
    print(json.dumps({"hookSpecificOutput": out}))


def main():
    try:
        verdict = handle(json.load(sys.stdin))
    except Exception:  # fail open: a guard bug must never block work
        return
    if verdict:
        emit(*verdict)


def check_cli(argv):
    """CLI mode: print what the change-request gate says about this branch plus the index."""
    root = _git(["rev-parse", "--show-toplevel"], os.getcwd()).strip()
    if not root:
        print("not inside a git repository", file=sys.stderr)
        return 2
    cfg = load_cfg(root)
    if not cfg["enabled"]:
        return 0
    flag = argv[argv.index("--base") + 1] if "--base" in argv and argv.index("--base") + 1 < len(argv) else None
    base = resolve_base(root, flag)
    if not base:
        print("no base branch found; pass --base BRANCH", file=sys.stderr)
        return 2
    verdict = judge("pr", evaluate(root, base, cfg, ["--cached"]))
    if verdict:
        print(verdict[1])
    return 1 if verdict and verdict[0] == "deny" else 0


def _owner_module(test_dirs, modules):
    """The module a tiered test belongs to: longest path prefix first, else a last-segment match."""
    rest = [d for d in test_dirs if not TEST_DIR.match(d)
            and not any(re.fullmatch(TIER_DIR[t], d.lower()) for t in TIERS)]
    for m in sorted(modules, key=lambda m: -m.count("/")):
        parts = m.split("/")
        if rest[: len(parts)] == parts:
            return m
    by_name = [m for m in modules if rest[:1] == [m.rsplit("/", 1)[-1]]]
    return by_name[0] if len(by_name) == 1 else None  # several modules share the name: unmapped


def _modules(tracked, cfg, depth):
    """Module names: the first `depth` directories of tracked source files."""
    return sorted({"/".join(n.split("/")[:-1][:depth]) for n in tracked if "/" in n and is_source(n, cfg)})


def inventory(root, cfg, depth=1):
    """Tests per tier for each module (first `depth` directories of tracked source files)."""
    tracked = [n for n in _git(["ls-files", "-z"], root).split("\0") if n]
    modules = {m: {t: 0 for t in TIERS} for m in _modules(tracked, cfg, depth)}
    unmapped, untiered, unmapped_tiers = [], [], {t: 0 for t in TIERS}
    for n in sorted(tracked):
        if not is_test(n, cfg):
            continue
        tier = tier_of(n, cfg)
        if tier is None:
            untiered.append(n)
            continue
        owner = _owner_module(n.split("/")[:-1], modules)
        if owner is None:
            unmapped.append(n)
            unmapped_tiers[tier] += 1
        else:
            modules[owner][tier] += 1
    return {"modules": modules, "unmapped": unmapped, "unmapped_tiers": unmapped_tiers, "untiered": untiered}


def inventory_cli(argv):
    root = _git(["rev-parse", "--show-toplevel"], os.getcwd()).strip()
    if not root:
        print("not inside a git repository", file=sys.stderr)
        return 2
    try:
        depth = max(1, int(argv[argv.index("--depth") + 1])) if "--depth" in argv else 1
    except (ValueError, IndexError):
        print("--depth needs a number", file=sys.stderr)
        return 2
    print(json.dumps(inventory(root, load_cfg(root), depth), indent=2))
    return 0


def list_tier(root, cfg, tier, module=None):
    """The tracked test files of one tier, sorted: the whole tier a mutant must survive to prove a test gap.
    With `module`, only the files inventory() counts for that module (None when it is not a module)."""
    tracked = [n for n in _git(["ls-files", "-z"], root).split("\0") if n]
    files = [n for n in sorted(tracked) if tier_of(n, cfg) == tier]
    if module is None:
        return files
    modules = _modules(tracked, cfg, module.count("/") + 1)
    if module not in modules:
        return None
    return [n for n in files if _owner_module(n.split("/")[:-1], modules) == module]


def list_tier_cli(argv):
    """Print the tracked test files of TIER (of one module with --module PATH), one per line;
    exit 2 for a missing or unknown tier or module, or outside a repo."""
    i = argv.index("--list-tier") + 1
    if i >= len(argv) or argv[i] not in TIERS:
        print(f"--list-tier needs one of {', '.join(TIERS)}", file=sys.stderr)
        return 2
    module = None
    if "--module" in argv:
        j = argv.index("--module") + 1
        module = argv[j].strip("/") if j < len(argv) else ""
        if not module:
            print("--module needs a PATH", file=sys.stderr)
            return 2
    root = _git(["rev-parse", "--show-toplevel"], os.getcwd()).strip()
    if not root:
        print("not inside a git repository", file=sys.stderr)
        return 2
    names = list_tier(root, load_cfg(root), argv[i], module)
    if names is None:
        print(f"--module {module} is not a module: --inventory --depth {module.count('/') + 1} lists them", file=sys.stderr)
        return 2
    for name in names:
        print(name)
    return 0


def is_test_cli(argv):
    """Exit 0 when PATH is a test file under the repo's config, 3 when not, 2 outside a repo.
    Not 1: a Python crash exits 1, and a caller must never read a crash as an answer."""
    i = argv.index("--is-test") + 1
    if i >= len(argv):
        print("--is-test needs a PATH", file=sys.stderr)
        return 2
    path = argv[i]
    probe = os.path.dirname(os.path.abspath(path))
    while not os.path.isdir(probe) and probe != os.path.dirname(probe):
        probe = os.path.dirname(probe)
    root = _git(["rev-parse", "--show-toplevel"], probe if os.path.isabs(path) else os.getcwd()).strip()
    if not root:
        print("not inside a git repository", file=sys.stderr)
        return 2
    rel = os.path.relpath(os.path.realpath(os.path.join(os.getcwd(), path)), os.path.realpath(root)).replace(os.sep, "/")
    return 0 if not rel.startswith("..") and is_test(rel, load_cfg(root)) else 3


def inventory_self_test(cfg):
    """Own repo: the main fixture's earlier cases need `main` free of tiered tests."""
    with tempfile.TemporaryDirectory() as tmp_inv:
        def git(*a):
            subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=tmp_inv, check=True, capture_output=True)

        def put(rel):
            os.makedirs(os.path.dirname(os.path.join(tmp_inv, rel)), exist_ok=True)
            with open(os.path.join(tmp_inv, rel), "w") as fh:
                fh.write("x\n")

        def is_test_cli(path, cwd=tmp_inv):
            return subprocess.run([sys.executable, os.path.abspath(__file__), "--is-test", path],
                                  cwd=cwd, capture_output=True, check=False).returncode

        git("init", "-q", "-b", "main")
        put("pkg/a.py"); put("pkg/tests/unit/test_a.py")  # sibling layout
        put("app/charts/b.py"); put("tests/unit/charts/test_b.py"); put("tests/integration/charts/test_b_db.py")  # mirror layout
        put("tests/unit/test_misc.py")  # no module matches
        put("tests/test_plain.py")  # a test with no tier
        git("add", "-A"); git("commit", "-qm", "inv")
        inv1 = inventory(tmp_inv, cfg, depth=1)
        assert inv1["modules"]["pkg"] == {"unit": 1, "integration": 0, "e2e": 0}, inv1
        inv2 = inventory(tmp_inv, cfg, depth=2)
        assert inv2["modules"]["app/charts"] == {"unit": 1, "integration": 1, "e2e": 0}, inv2
        assert inv2["modules"]["pkg"] == {"unit": 1, "integration": 0, "e2e": 0}, inv2
        assert "tests/unit/test_misc.py" in inv2["unmapped"], inv2
        assert inv2["unmapped_tiers"] == {"unit": 1, "integration": 0, "e2e": 0}, inv2
        assert inv2["untiered"] == ["tests/test_plain.py"], inv2
        put("a/utils/u.py"); put("b/utils/u.py"); put("tests/unit/utils/test_x.py")  # ambiguous last segment
        git("add", "-A"); git("commit", "-qm", "dup")
        inv3 = inventory(tmp_inv, cfg, depth=2)
        assert "tests/unit/utils/test_x.py" in inv3["unmapped"], inv3
        assert inv3["modules"]["a/utils"]["unit"] == inv3["modules"]["b/utils"]["unit"] == 0, inv3
        assert is_test_cli("pkg/tests/unit/test_a.py") == 0
        assert is_test_cli(os.path.join(os.path.realpath(tmp_inv), "tests/test_plain.py"), cwd="/") == 0
        assert is_test_cli("pkg/a.py") == 3, "not a test: 3, so a crash (1) is never read as an answer"
        assert is_test_cli("/etc/hosts", cwd="/") == 2, "outside a git repo"

        def list_tier_cli(*args, cwd=tmp_inv):
            return subprocess.run([sys.executable, os.path.abspath(__file__), "--list-tier", *args], cwd=cwd,
                                  stdin=subprocess.DEVNULL, capture_output=True, text=True, check=False)
        unit = list_tier_cli("unit")
        assert unit.returncode == 0, unit.stderr
        assert unit.stdout.splitlines() == ["pkg/tests/unit/test_a.py", "tests/unit/charts/test_b.py",
                                            "tests/unit/test_misc.py", "tests/unit/utils/test_x.py"], unit.stdout
        assert list_tier_cli("integration").stdout.splitlines() == ["tests/integration/charts/test_b_db.py"]
        assert list_tier_cli("e2e").stdout == "", "a tier with no test files prints nothing"
        assert list_tier_cli("smoke").returncode == 2, "an unknown tier"
        assert list_tier_cli().returncode == 2, "no tier"
        assert list_tier_cli("unit", cwd="/").returncode == 2, "outside a git repo"
        # --module: only the files inventory() counts for that module, at the module path's own depth
        assert list_tier_cli("unit", "--module", "pkg").stdout.splitlines() == ["pkg/tests/unit/test_a.py"]
        assert list_tier_cli("unit", "--module", "app/charts/").stdout.splitlines() == ["tests/unit/charts/test_b.py"]
        assert list_tier_cli("e2e", "--module", "pkg").stdout == "", "a module with no tests of the tier"
        assert list_tier_cli("unit", "--module", "nope").returncode == 2, "an unknown module"
        assert list_tier_cli("unit", "--module").returncode == 2, "no module path"


def removed_self_test(cfg):
    """Own repo: `main` holds two tests in one file, a spaced non-ASCII test file and a source file."""
    with tempfile.TemporaryDirectory() as tmp_rm:
        env = {k: v for k, v in os.environ.items() if k != "PR_TEST_TIERS_SCOPE"}

        def git(*a):
            subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=tmp_rm, check=True, capture_output=True)

        def put(rel, body="x\n"):
            os.makedirs(os.path.dirname(os.path.join(tmp_rm, rel)) or tmp_rm, exist_ok=True)
            with open(os.path.join(tmp_rm, rel), "w") as fh:
                fh.write(body)

        def land(msg):
            git("add", "-A")
            git("commit", "-qm", msg)

        def run(tool, **tool_input):
            payload = {"tool_name": tool, "cwd": tmp_rm, "tool_input": tool_input}
            p = subprocess.run([sys.executable, os.path.abspath(__file__)], input=json.dumps(payload),
                               capture_output=True, text=True, env=env, check=False)
            assert p.returncode == 0, p.stderr
            return json.loads(p.stdout)["hookSpecificOutput"] if p.stdout.strip() else None

        def pr():
            return run("Bash", command="gh pr create --title t")

        def denied(out):
            return bool(out) and out.get("permissionDecision") == "deny"

        def branch(name):
            git("checkout", "-q", "-B", name, "main")

        git("init", "-q", "-b", "main")
        put("src/app.py")
        put("tests/unit/test_keep.py", "def test_one(): ...\ndef test_two(): ...\n")
        put("tests/unit/my test \u00fc.py", "def test_x(): ...\n")
        put("tests/unit/test_skipped.py", "import pytest\n@pytest.mark.skip(reason='flaky')\ndef test_s(): ...\n")
        put("tests/unit/test_pair.py", "import pytest\n@pytest.mark.skip(reason='x')\ndef test_a(): ...\ndef test_b(): ...\n")
        put("tests/unit/test_doc.py", "# pytest.skip( is how we skip\ndef test_d(): ...\n")
        put("tests/unit/sample_test.go", 'package x\nfunc TestA(t *testing.T) {\n\tt.Skip("x")\n}\nfunc TestB(t *testing.T) {\n}\n')
        put("tests/e2e/flow.spec.ts", "test('a', async () => {\n  test.fail()\n})\ntest('b', async () => {\n})\n")
        put("tests/unit/total.test.ts", "test('should total the cart when items exist', () => {})\n")
        land("base")

        # deleted test file -> deny; trailer clears it
        branch("del")
        git("rm", "-q", "tests/unit/test_keep.py"); land("drop")
        out = pr()
        assert denied(out) and "deleted test file" in out["permissionDecisionReason"], out
        git("commit", "-q", "--allow-empty", "-m", "chore: x\n\nTest-Removed: tests/unit/test_keep.py: covered by e2e now")
        assert not denied(pr())
        # a space and non-ASCII in the path
        git("rm", "-q", "tests/unit/my test \u00fc.py"); land("drop2")
        assert "my test \u00fc.py" in pr()["permissionDecisionReason"]

        # rename -> allowed
        branch("mv")
        git("mv", "tests/unit/test_keep.py", "tests/unit/test_kept.py"); land("mv")
        assert not denied(pr())

        # a removed function -> deny; moved to another file -> allowed
        branch("fn")
        put("tests/unit/test_keep.py", "def test_one(): ...\n"); land("rm fn")
        assert "removed test test_two" in pr()["permissionDecisionReason"]
        put("tests/unit/test_other.py", "def test_two(): ...\n"); land("moved")
        assert not denied(pr())

        # an added skip -> deny; skip-reason on the line before -> allowed
        branch("skip")
        put("tests/unit/test_keep.py", "import pytest\n@pytest.mark.skip\ndef test_one(): ...\ndef test_two(): ...\n"); land("skip")
        assert "added skip" in pr()["permissionDecisionReason"]
        put("tests/unit/test_keep.py", "import pytest\n# skip-reason: upstream outage\n@pytest.mark.skip\ndef test_one(): ...\ndef test_two(): ...\n"); land("why")
        assert not denied(pr())

        # an added expected-failure marker -> deny (Python and TS/JS); skip-reason naming the defect -> allowed
        branch("xfail")
        put("tests/unit/test_keep.py", "import pytest\n@pytest.mark.xfail(strict=True)\ndef test_one(): ...\ndef test_two(): ...\n"); land("xfail")
        assert "expected-failure" in pr()["permissionDecisionReason"]
        put("tests/unit/test_keep.py", "import pytest\n# skip-reason: defect F1: refund over 30 days is accepted\n@pytest.mark.xfail(strict=True)\ndef test_one(): ...\ndef test_two(): ...\n"); land("defect")
        assert not denied(pr())
        put("tests/unit/cart.test.ts", "test.fails('should refuse an empty cart when checking out', () => {})\n"); land("fails")
        assert denied(pr())

        # a skip that already existed and is only re-indented is not new
        branch("reindent")
        put("tests/unit/test_skipped.py", "import pytest\n    @pytest.mark.skip(reason='flaky')\ndef test_s(): ...\n"); land("reindent")
        assert not denied(pr())

        # per-test attribution: a moved or duplicated skip is new; an edited reason or comment is not
        pair = "import pytest\n{}def test_a(): ...\n{}def test_b(): ...\n"
        skip = "@pytest.mark.skip(reason='{}')\n"
        for name, body, want in (
            ("mvskip", pair.format("", skip.format("x")), True),
            ("dup", pair.format(skip.format("x") * 2, ""), True),
            ("dup2", pair.format(skip.format("x"), "") + skip.format("x") + "def test_c(): ...\n", True),
            ("reason", pair.format(skip.format("y"), ""), False),
        ):
            branch(name)
            put("tests/unit/test_pair.py", body); land(name)
            assert denied(pr()) == want, name
        branch("comment")
        put("tests/unit/test_doc.py", "# pytest.skip( was how we skipped\ndef test_d(): ...\n"); land("comment")
        assert not denied(pr())
        branch("newxfail")
        put("tests/unit/test_new.py", "import pytest\n@pytest.mark.xfail(strict=True)\ndef test_n(): ...\n"); land("newxfail")
        assert "added skip" in pr()["permissionDecisionReason"]

        # body markers outside Python: owned by the preceding Go func or TS/JS case
        branch("gomv")
        put("tests/unit/sample_test.go", 'package x\nfunc TestA(t *testing.T) {\n}\nfunc TestB(t *testing.T) {\n\tt.Skip("x")\n}\n'); land("gomv")
        assert "added skip" in pr()["permissionDecisionReason"]
        branch("pwmv")
        put("tests/e2e/flow.spec.ts", "test('a', async () => {\n})\ntest('b', async () => {\n  test.fail()\n})\n"); land("pwmv")
        assert "added skip" in pr()["permissionDecisionReason"]
        branch("pwsame")
        put("tests/e2e/flow.spec.ts", "test('a', async () => {\n  await go()\n  test.fail()\n})\ntest('b', async () => {\n})\n"); land("pwsame")
        assert not denied(pr())

        # TS/JS: a removed test title -> deny; moved to another file -> allowed
        branch("ts")
        put("tests/unit/total.test.ts", "// gone\n"); land("rm ts")
        assert "should total the cart when items exist" in pr()["permissionDecisionReason"]
        put("tests/unit/moved.test.ts", "test('should total the cart when items exist', () => {})\n"); land("moved ts")
        assert not denied(pr())

        # TS/JS: an added it.skip( and an added xit( -> deny
        for name, line in (("itskip", "it.skip('should x when y', () => {})"), ("xit", "xit('should x when y', () => {})")):
            branch(name)
            put("tests/unit/new.test.ts", line + "\n"); land(name)
            assert "added skip" in pr()["permissionDecisionReason"], name

        # git commit only warns
        branch("warn")
        git("rm", "-q", "tests/unit/test_keep.py")
        got = run("Bash", command="git commit -m x")
        assert got and "deleted test file" in got["additionalContext"] and not denied(got), got


def self_test():
    cfg = load_cfg("/nonexistent")
    tiers = {
        "tests/unit/test_a.py": "unit",
        "tests/unit_tests/test_a.py": "unit",
        "tests/integration/test_db.py": "integration",
        "src/foo.integration.test.ts": "integration",
        "skills/x/e2e.test.mjs": "e2e",
        "e2e/login.ts": "e2e",
        "tests/test_plain.py": None,
        "src/integration/stripe.py": None,
        "src/app.py": None,
        "FooTest.java": None,
    }
    for path, want in tiers.items():
        assert tier_of(path, cfg) == want, (path, tier_of(path, cfg))
    assert is_test("FooTest.java", cfg) and not is_test("src/Latest.py", cfg)
    custom = {"enabled": True, "tiers": {"integration": ["it/*"]}, "mock": cfg["mock"]}
    assert tier_of("it/db/x.py", custom) == "integration"
    assert tier_of("tests/integration/test_db.py", custom) is None  # a named tier replaces its default rule
    assert tier_of("tests/unit/test_a.py", custom) == "unit"

    sources = {"src/app.py": True, "Dockerfile": True, "tests/unit/test_a.py": False}
    sources.update({p: False for p in ("README.md", "docs/a.py", "package-lock.json", "go.sum", "LICENSE",
                                       ".github/workflows/ci.yml", "uv.lock", "pyproject.toml")})
    for path, want in sources.items():
        assert is_source(path, cfg) == want, path

    cases = [
        ("git commit -m x", "commit", "/tmp", False),
        ("cd /x && gh pr create --base dev", "pr", "/x", False),
        ("glab mr create -b dev", "pr", "/tmp", False),
        ("glab mr new", "pr", "/tmp", False),
        ("git -C /y commit -F m", "commit", "/y", False),
        ("PR_TEST_TIERS=off gh pr create", "pr", "/tmp", True),
        ("gh pr view", None, None, None),
        ("git status", None, None, None),
        ('echo "gh pr create"', None, None, None),
    ]
    for cmd, kind, repo, esc in cases:
        found = find_cmd(cmd, "/tmp")
        assert (found[0] if found else None) == kind, cmd
        if found:
            assert (found[1], found[3]) == (repo, esc), cmd
    assert explicit_base(["--base", "dev"], "gh") == "dev"
    assert explicit_base(["--base=dev"], "gh") == "dev"
    assert explicit_base(["-B", "dev", "-t", "x"], "gh") == "dev"
    assert explicit_base(["-b", "body text"], "gh") is None
    assert explicit_base(["-b", "dev"], "glab") == "dev"
    assert explicit_base(["--target-branch=dev"], "glab") == "dev"

    mocks = ["from unittest import mock", "import responses", "jest.mock('x')", "const nock = require('nock')"]
    for line in mocks:
        assert any(r.search(line) for r in cfg["mock"]), line
    assert not any(r.search("# the responses were slow") for r in cfg["mock"])

    env = {k: v for k, v in os.environ.items() if k != "PR_TEST_TIERS_SCOPE"}
    with tempfile.TemporaryDirectory() as tmp:
        def git(*a):
            subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=tmp, check=True, capture_output=True)

        def put(rel, body="x\n"):
            os.makedirs(os.path.dirname(os.path.join(tmp, rel)) or tmp, exist_ok=True)
            with open(os.path.join(tmp, rel), "w") as fh:
                fh.write(body)

        def land(msg):
            git("add", "-A")
            git("commit", "-qm", msg)

        def run(tool, **tool_input):
            payload = {"tool_name": tool, "cwd": tmp, "tool_input": tool_input}
            p = subprocess.run([sys.executable, os.path.abspath(__file__)], input=json.dumps(payload),
                               capture_output=True, text=True, env=env, check=False)
            assert p.returncode == 0, p.stderr
            return json.loads(p.stdout)["hookSpecificOutput"] if p.stdout.strip() else None

        def pr(cmd="gh pr create --title t"):
            return run("Bash", command=cmd)

        git("init", "-q", "-b", "main")
        put("README.md")
        land("base")
        git("checkout", "-q", "-b", "feature")

        put("docs/a.md")
        land("docs")
        assert pr() is None, "docs-only diff is exempt"

        put("src/app.py")
        land("src")
        got = pr()
        assert got and "additionalContext" in got and "no unit" in got["additionalContext"], got  # untiered: note, no deny

        put("tests/unit/test_app.py")
        land("unit")
        got = pr()
        assert got and got["permissionDecision"] == "deny", got
        assert "integration, e2e" in got["permissionDecisionReason"], got

        put("tests/integration/test_db.py", "from unittest import mock\n")
        put("tests/e2e/test_flow.py")
        land("integration+e2e")
        got = pr()
        assert got and got["permissionDecision"] == "deny", got
        assert "tests/integration/test_db.py" in got["permissionDecisionReason"], got
        assert pr("PR_TEST_TIERS=off gh pr create") is None, "env bypass"

        put("tests/integration/test_db.py", "# no-container: vendor has no UAT server\nfrom unittest import mock\n")
        land("justify mock")
        assert pr() is None, "all tiers present and mock justified"

        git("checkout", "-q", "-b", "feature3", "main")
        put(".claude/test-tiers.json", '{"enabled": false}')
        put("src/z.py")
        put("tests/unit/test_z.py")
        land("src and unit only, hook disabled")
        assert pr() is None, "per-repo disable"
        git("checkout", "-q", "main")

        git("checkout", "-q", "-b", "feature2", "main")
        put("src/b.py")
        put("tests/unit/test_b.py")
        git("add", "-A")
        got = run("Bash", command="git commit -m x")
        assert got and "not blocking" in got["additionalContext"] and "integration, e2e" in got["additionalContext"], got
        git("commit", "-qm", "b")
        git("checkout", "-q", "main")
        put("src/c.py")
        git("add", "-A")
        assert run("Bash", command="git commit -m x") is None, "commit on the base branch stays quiet"

        got = run("Write", file_path="tests/e2e/test_new.py")
        assert got and "tier: e2e" in got["additionalContext"], got
        assert run("Write", file_path="README.md") is None
        assert run("Write", file_path="src/helper.py") is None
        assert run("Write", file_path="tests/unit/test_a_dir/test_x.py") is not None, "new directory"
    inventory_self_test(cfg)
    removed_self_test(cfg)
    print("pr-test-tiers self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    elif "--check" in sys.argv:
        sys.exit(check_cli(sys.argv))
    elif "--inventory" in sys.argv:
        sys.exit(inventory_cli(sys.argv))
    elif "--is-test" in sys.argv:
        sys.exit(is_test_cli(sys.argv))
    elif "--list-tier" in sys.argv:
        sys.exit(list_tier_cli(sys.argv))
    else:
        main()
