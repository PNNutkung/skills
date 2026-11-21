#!/usr/bin/env python3
"""PreToolUse hook (Bash matcher) for test names that follow
Should_ExpectedBehavior_When_StateUnderTest, written in the language's own style:

  Python      def test_should_<expected_behavior>_when_<state_under_test>(...)   snake_case
  TS / JS     test('should <expected behavior> when <state under test>', ...)   also it(...)

TEST_NAME_GUARD_MODE picks how hard it is (the naming rule is a convention, rules/test-naming.md):
  warn (default)  `git commit` goes through with a note telling the agent which tests to rename;
                  `gh pr create` / `glab mr create` is DENIED while the branch adds a badly named test
  deny            both are denied (the behavior before modes existed)
  off             the hook does nothing
An unknown value counts as warn.

Only ADDED lines are checked (the commit's, or the branch's against its base for a
change request), so legacy tests never block an edit.
Every git repo is guarded by default; TEST_NAME_GUARD_SCOPE (colon-separated path
prefixes) narrows it. Fails open on any internal error.

Escape hatch:  TEST_NAME_GUARD=off git commit ...   (or ... gh pr create)
Per-repo override: <repo>/.claude/test-naming.json
    {"enabled": true, "python": "<regex>" | null, "javascript": "<regex>" | null}
  null turns that language off; a string replaces the built-in name regex
  (Python matches the function name, JavaScript matches the test title).
Staged check (for scripts and agents; ignores the scope, exit 1 on a violation):
               python3 test-name-guard.py --staged
Self-test:     python3 test-name-guard.py --self-test
"""

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile

DEFAULT_SCOPE = "/"
GLOBAL_FLAGS_WITH_VALUE = {"-c", "--git-dir", "--work-tree", "--namespace"}
ESCAPE_RE = re.compile(r"(^|\s)TEST_NAME_GUARD=(off|0|false|no)(\s|$)", re.IGNORECASE)

PY_NAME = r"^test_should_[a-z0-9]+(?:_[a-z0-9]+)*_when_[a-z0-9]+(?:_[a-z0-9]+)*$"
JS_TITLE = r"^should\s+\S.*\s+when\s+\S.*$"

PY_FILE = re.compile(r"(^|/)(tests?|__tests__)/.*\.py$|(^|/)(test_[^/]*|[^/]*_test)\.py$")
JS_FILE = re.compile(r"\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|(^|/)__tests__/.*\.(ts|tsx|js|jsx)$")
PY_DEF = re.compile(r"^\+\s*(?:async\s+)?def\s+(test_\w*)\s*\(")
JS_CASE = re.compile(
    r"""^\+\s*(?:test|it)(?:\.(?:only|skip))?(?:\.each\(.*?\))?\(\s*(['"`])(.*?)\1"""
)

EXAMPLES = {
    "python": "test_should_return_empty_list_when_no_items_match",
    "javascript": "test('should render the empty state when no items match', ...)",
}


def _git(args, cwd):
    out = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=False, timeout=20
    )
    return out.stdout if out.returncode == 0 else ""


def find_commit(raw_cmd, cwd):
    """Return (repo_dir, commit_args, escaped) for the first `git commit`, else None."""
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
            if tok.rsplit("/", 1)[-1] != "git":
                continue
            repo, j = cur, i + 1
            while j < len(tokens):
                t = tokens[j]
                if t == "-C" and j + 1 < len(tokens):
                    repo = os.path.join(repo, os.path.expanduser(tokens[j + 1]))
                    j += 2
                elif t in GLOBAL_FLAGS_WITH_VALUE:
                    j += 2
                elif t.startswith("-"):
                    j += 1
                else:
                    break
            if j < len(tokens) and tokens[j] == "commit":
                return repo, tokens[j + 1 :], bool(ESCAPE_RE.search(seg))
    return None


def find_cr(raw_cmd, cwd):
    """Return (repo_dir, args, escaped, exe) for the first `gh pr create` / `glab mr create|new`, else None."""
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
            if exe not in ("gh", "glab"):
                continue
            words = [t for t in tokens[i + 1 :] if not t.startswith("-")][:2]
            if (exe == "gh" and words == ["pr", "create"]) or (exe == "glab" and words[:1] == ["mr"] and words[1:] in (["create"], ["new"])):
                return cur, tokens[i + 1 :], bool(ESCAPE_RE.search(seg)), exe
    return None


def mode():
    value = (os.environ.get("TEST_NAME_GUARD_MODE") or "warn").strip().lower()
    return value if value in ("warn", "deny", "off") else "warn"


def base_ref(root, args, exe):
    """The change request's base: --base/-B (gh), --target-branch/-b (glab), else origin/HEAD, main, master."""
    flags = ("--base", "-B") if exe == "gh" else ("--target-branch", "-b")
    named = None
    for k, a in enumerate(args):
        if a in flags and k + 1 < len(args):
            named = args[k + 1]
        for f in flags:
            if f.startswith("--") and a.startswith(f + "="):
                named = a[len(f) + 1 :]
    head = _git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], root).strip()
    for cand in (named, head, "main", "master"):
        if not cand:
            continue
        for ref in (cand,) if cand.startswith("origin/") else (f"origin/{cand}", cand):
            if _git(["rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"], root).strip():
                return ref
    return None


def in_scope(repo_root):
    prefixes = os.environ.get("TEST_NAME_GUARD_SCOPE") or DEFAULT_SCOPE
    real = os.path.realpath(repo_root)
    return any(real.startswith(os.path.realpath(os.path.expanduser(p))) for p in prefixes.split(":") if p)


def load_rules(repo_root):
    rules = {"python": PY_NAME, "javascript": JS_TITLE}
    try:
        with open(os.path.join(repo_root, ".claude", "test-naming.json")) as fh:
            cfg = json.load(fh)
    except (OSError, ValueError):
        return rules
    if cfg.get("enabled") is False:
        return {}
    for lang in list(rules):
        if lang in cfg:
            value = cfg[lang]
            if value is None:
                rules.pop(lang)
            elif isinstance(value, str):
                try:
                    re.compile(value)
                except re.error:
                    continue
                rules[lang] = value
    return rules


def violations(diff_text, rules):
    """Names added by the diff that break the rule of their language: [(file, name)]."""
    bad, current = [], None
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            current = line[4:].removeprefix("b/") if line[4:] != "/dev/null" else None
            continue
        if current is None or not line.startswith("+"):
            continue
        base = current.rsplit("/", 1)[-1]
        if "python" in rules and PY_FILE.search(current) and base != "conftest.py":
            m = PY_DEF.match(line)
            if m and not re.match(rules["python"], m.group(1)):
                bad.append((current, m.group(1)))
        elif "javascript" in rules and JS_FILE.search(current):
            m = JS_CASE.match(line)
            if m and not re.match(rules["javascript"], m.group(2).strip(), re.IGNORECASE):
                bad.append((current, m.group(2)))
    return bad


def warn(text):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": text}}))


def listing(bad):
    shown = "\n".join(f"  {f}: {n}" for f, n in bad[:20])
    more = f"\n  ... and {len(bad) - 20} more" if len(bad) > 20 else ""
    return f"{shown}{more}\nPython: {EXAMPLES['python']}\nTS/JS:  {EXAMPLES['javascript']}\n"


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )


def repo_rules(repo):
    """(root, rules) for a repo in scope with the rule on, else None."""
    root = _git(["rev-parse", "--show-toplevel"], repo).strip()
    if not root or not in_scope(root):
        return None
    rules = load_rules(root)
    return (root, rules) if rules else None


def main():
    how = mode()
    if how == "off":
        return
    try:
        data = json.load(sys.stdin)
        cmd = data.get("tool_input", {}).get("command", "")
        cwd = data.get("cwd") or os.getcwd()
        found, cr = find_commit(cmd, cwd), find_cr(cmd, cwd)
        if cr is not None and not cr[2]:
            ctx = repo_rules(cr[0])
            base = ctx and base_ref(ctx[0], cr[1], cr[3])
            mb = base and _git(["merge-base", base, "HEAD"], ctx[0]).strip()
            if mb:
                bad = violations(_git(["diff", mb, "HEAD", "--unified=0", "--no-color", "--diff-filter=ACMR"], ctx[0]), ctx[1])
                if bad:
                    return deny(
                        f"This branch adds tests not named should ... when ... (rules/test-naming.md), so the change request is refused until they are renamed:\n"
                        f"{listing(bad)}Rename them in a new commit, then create the change request again. "
                        "Bypass once with `TEST_NAME_GUARD=off gh pr create ...`. Per-repo override: <repo>/.claude/test-naming.json."
                    )
        if found is None or found[2]:
            return
        repo, args, _ = found
        ctx = repo_rules(repo)
        if not ctx:
            return
        root, rules = ctx
        all_flag = any(a == "--all" or re.fullmatch(r"-[a-zA-Z]*a[a-zA-Z]*", a) for a in args)
        diff = _git(
            ["diff", "HEAD" if all_flag else "--cached", "--unified=0", "--no-color", "--diff-filter=ACMR"],
            root,
        )
        bad = violations(diff, rules)
    except Exception:  # fail open: a guard bug must never block work
        return
    if not bad:
        return
    if how == "warn":
        return warn(
            "Test-name convention (rules/test-naming.md): this commit adds tests not named should ... when ...:\n"
            f"{listing(bad)}The commit goes through, but rename these tests in your next commit: "
            "a pull request or merge request is refused while the branch still adds them."
        )
    deny(
        "Test names must follow Should_ExpectedBehavior_When_StateUnderTest in the "
        "language's style. Added tests that do not:\n"
        f"{listing(bad)}"
        "Rename them, or bypass once with `TEST_NAME_GUARD=off git commit ...`. "
        "Per-repo override: <repo>/.claude/test-naming.json."
    )


def staged_check():
    """CLI mode: list the staged tests that break the rule; exit 1 if there are any."""
    root = _git(["rev-parse", "--show-toplevel"], os.getcwd()).strip()
    if not root:
        print("not inside a git repository", file=sys.stderr)
        return 2
    diff = _git(["diff", "--cached", "--unified=0", "--no-color", "--diff-filter=ACMR"], root)
    bad = violations(diff, load_rules(root))
    for path, name in bad:
        print(f"{path}: {name}")
    if bad:
        print(f"Python: {EXAMPLES['python']}\nTS/JS:  {EXAMPLES['javascript']}")
    return 1 if bad else 0


def self_test():
    py, js = PY_NAME, JS_TITLE
    names_ok = [
        "test_should_return_empty_list_when_no_items_match",
        "test_should_warn_when_x_2",
    ]
    names_bad = [
        "test_ac1_happy_x",
        "test_should_do_x",
        "test_when_x_should_y",
        "test_should_Do_x_when_y",
        "test_x",
    ]
    assert all(re.match(py, n) for n in names_ok)
    assert not any(re.match(py, n) for n in names_bad)
    assert re.match(js, "should render the list when data is empty", re.IGNORECASE)
    assert re.match(js, "Should render the list when data is empty", re.IGNORECASE)
    assert not re.match(js, "renders the list", re.IGNORECASE)

    diff = (
        "diff --git a/tests/unit_tests/test_a.py b/tests/unit_tests/test_a.py\n"
        "+++ b/tests/unit_tests/test_a.py\n"
        "@@ -0,0 +1,4 @@\n"
        "+def test_ac1_bad() -> None:\n"
        "+async def test_should_ok_when_state() -> None:\n"
        "+    def helper() -> None:\n"
        "-def test_removed_old() -> None:\n"
        "+++ b/tests/conftest.py\n"
        "+def test_fixture_like() -> None:\n"
        "+++ b/src/not_a_module.py\n"
        "+def test_in_source() -> None:\n"
        "+++ b/src/a.test.tsx\n"
        "+  test('renders the list', () => {\n"
        "+  it(\"should show x when y\", () => {\n"
        "+  test.each([1, 2])('adds %i', (n) => {\n"
    )
    got = violations(diff, {"python": py, "javascript": js})
    assert got == [
        ("tests/unit_tests/test_a.py", "test_ac1_bad"),
        ("src/a.test.tsx", "renders the list"),
        ("src/a.test.tsx", "adds %i"),
    ], got
    assert violations(diff, {"python": py}) == [("tests/unit_tests/test_a.py", "test_ac1_bad")]
    assert violations(diff, {}) == []

    cases = [
        ("git commit -F m.txt", True, False),
        ("cd /x && git commit -m 'a'", True, False),
        ("time git commit -F m", True, False),
        ("git -C /y commit -F m", True, False),
        ("git status", False, False),
        ("TEST_NAME_GUARD=off git commit -F m", True, True),
        ("git log --grep commit", False, False),
    ]
    for cmd, is_commit, escaped in cases:
        found = find_commit(cmd, "/tmp")
        assert (found is not None) == is_commit, cmd
        if found:
            assert found[2] == escaped, cmd
    assert find_commit("cd /x && git commit -m a", "/tmp")[0] == "/x"
    assert find_commit("git -C /y commit -F m", "/tmp")[0] == "/y"

    # --staged: a staged bad name exits 1, a staged good name exits 0.
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["git", "init", "-q", tmp], check=True)
        os.makedirs(os.path.join(tmp, "tests"))
        test_file = os.path.join(tmp, "tests", "test_a.py")
        for body, want in (
            ("def test_ac1_bad():\n    pass\n", 1),
            ("def test_should_pass_when_named():\n    pass\n", 0),
        ):
            with open(test_file, "w") as fh:
                fh.write(body)
            subprocess.run(["git", "add", "-A"], cwd=tmp, check=True)
            run = subprocess.run(
                [sys.executable, os.path.abspath(__file__), "--staged"],
                cwd=tmp, capture_output=True, text=True, check=False,
            )
            assert run.returncode == want, (body, run.stdout, run.stderr)
    print("test-name-guard self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    elif "--staged" in sys.argv:
        sys.exit(staged_check())
    else:
        main()
