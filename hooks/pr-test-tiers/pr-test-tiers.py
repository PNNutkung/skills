#!/usr/bin/env python3
"""PreToolUse hook: a change request ships all three test tiers, container-first.

  Bash `gh pr create` / `glab mr create`  DENY when the branch diff against the base branch
                                          touches source but lacks a unit, integration or e2e
                                          test, or mocks a dependency in an integration or e2e
                                          test file without a stated reason.
  Bash `git commit`                       WARN, never blocks: the same findings for the branch
                                          so far, so the gap shows before the change request.
  Write of a new test file                REMIND, never blocks: the policy and the file's tier.

A test file's tier comes from its path (a unit/integration/e2e directory or filename token).
Docs, lockfiles and config never count as source. A repo with no tiered test at all gets a
note instead of a denial. Only ADDED lines are checked for mocks. Fails open on any internal
error.

A mock in an integration or e2e test file needs `no-container: <reason>` in a comment of
that file, in any comment syntax.

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


def evaluate(root, base, cfg, extra=None):
    """Judge the branch diff (plus `extra` diff args, e.g. ["--cached"]) against the policy."""
    names, added = set(), {}
    for rng in filter(None, ([f"{base}...HEAD"], extra)):
        names.update(n for n in _git(["diff", "--name-only", "-z", "--diff-filter=ACMR", *rng], root).split("\0") if n)
        diff = _git(["diff", "--unified=0", "--no-color", "--diff-filter=ACMR", *rng], root)
        for path, lines in parse_added(diff).items():
            added.setdefault(path, []).extend(lines)
    res = {"exempt": False, "untiered": False, "present": [], "missing": [], "unjustified": []}
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
    if res["exempt"]:
        return None
    if res["untiered"]:
        return None if kind == "commit" else ("context", UNTIERED)
    findings = []
    if res["missing"]:
        found = ", ".join(res["present"]) or "none"
        findings.append(f"Missing test tiers: {', '.join(res['missing'])} (found: {found}).")
    for path, line in res["unjustified"]:
        findings.append(f"Mock without `no-container: <reason>` in {path}: {line}")
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
    print("pr-test-tiers self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    elif "--check" in sys.argv:
        sys.exit(check_cli(sys.argv))
    else:
        main()
