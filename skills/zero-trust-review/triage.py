#!/usr/bin/env python3
"""Lead-side diff triage for zero-trust-review. Stdlib only; prints ONE compact JSON object.
usage: triage.py [--base origin/main] [--head HEAD] [--mode auto|quick|standard|deep] [--force-all]
                 [--no-merge] [--min-group 150] [--diff-dir DIR] [--self-test]"""
import argparse, json, os, re, subprocess, sys, tempfile
from pathlib import Path

ALWAYS = [1, 2, 3, 4, 5, 24, 25, 27, 28, 29, 30]
# Gated point -> regex over ADDED lines of production files. Firing too much costs a 2-call N/A; firing too little hides a hazard.
# (?-i:..) keeps SQL keywords upper-case so React's <Select> does not fire point 12.
GATED = {
    6: r'\brequest\b|os\.(getenv|environ)|json\.loads|pickle|subprocess|\bopen\(|requests\.|execute\(|raise_for_access|security_manager|\beval\(|\bexec\(',
    7: r'\brandom\.|Math\.random|\bhmac\b|\bsecrets\b|\btoken|password',
    8: r'retry|idempot|\.delay\(|apply_async|webhook|celery',
    9: r'commit\(|publish|send_task|outbox|replica',
    10: r'@transaction|session\.begin|commit\(|(?-i:\bBEGIN\b)',
    11: r'(?<![a-z])lock|version_(id|col|check)|with_for_update|\brace\b|optimistic',
    12: r'order.by|group.by|(?-i:\bSELECT\b|\bLIKE\b|\bJOIN\b)|outerjoin|index=True|(?-i:\bIndex\()|create_index|add_index',
    13: r'fetchall|\.all\(\)|\blimit|paginat|\bread\(|fetchmany|cursor|stream|chunk|(?-i:SELECT \*)',
    14: r'timeout|cancel|abort|SoftTimeLimit|revoke|\bstop',
    15: r'Thread|asyncio|create_task|gevent|spawn|Promise|setTimeout|apply_async',
    16: r'time\.time\(|Date\.now|datetime\.now|monotonic|perf_counter',
    17: r'cache|invalidat|\bttl\b|redis',
    18: r'\bopen\(|close\(|connect|cursor|socket|\bPool|finally|ExitStack|addEventListener|setInterval',
    19: r'SIGTERM|signal\.|liveness|readiness|probe|drain|graceful',
    20: r'openai|anthropic|\bllm\b|prompt|completion|embedding|tokens|mcp_service',
    21: r'\bEnum\b|json\.dumps|serializ|marshmallow|pydantic|Decimal|BigInt|JSON\.stringify|asdict',
    22: r'delete\(|(?-i:DELETE FROM)|\bdrop\b|truncate|soft.?delete|expire|retention',
    23: r'\b429\b|Retry-After|rate.?limit|quota|backoff|httpx|urllib',
    26: r'FEATURE_FLAGS|is_feature_enabled|app\.config|os\.getenv|ENABLE_|\bflag',
}
RX = {n: re.compile(r, re.I) for n, r in GATED.items()}
CAP = 600  # max changed lines per reviewer group (empirical; adjust only from runs.md data)
MIN_GROUP = 150  # groups below this many changed lines are merged with a partner (see merge_small)
TEST = re.compile(r'(^|/)(tests?|__tests__|specs?|e2e|cypress|playwright)/|(^|/)(test_|conftest)[^/]*$|[_.](test|spec)\.\w+$', re.I)
FRONT = re.compile(r'\.(m?[jt]sx?|s?css|less)$', re.I)
TS = re.compile(r'\.[mc]?[jt]sx?$', re.I)
COMMENT = re.compile(r'\s*(#|//|/?\*|<!--)')  # comment-only lines (license headers, prose) never fire a point
LABEL = {'src': 'source', 'tests': 'tests', 'frontend': 'frontend', 'docs': 'docs+config'}


def kind(p):  # 'db_engine_specs/' is source: only a spec/ DIRECTORY or a .spec. SUFFIX is a test
    if TEST.search(p): return 'tests'
    if FRONT.search(p): return 'frontend'
    if re.search(r'\.(md|ya?ml|json|toml|ini|cfg)$', p, re.I) or 'config' in os.path.basename(p).lower(): return 'docs'
    return 'src'


def pack(items):  # sorted (path, lines) -> bins of <= CAP changed lines, directories stay adjacent
    bins, cur, n = [], [], 0
    for p, l in sorted(items):
        if cur and n + l > CAP: bins.append(cur); cur, n = [], 0
        cur.append(p); n += l
    return bins + ([cur] if cur else [])


def merge_small(groups, min_lines=MIN_GROUP, cap=CAP):  # every agent costs ~45k tokens of fixed context: fold tiny groups together
    gs, stuck = list(groups), set()
    while True:
        small = [g for g in gs if g['lines'] < min_lines and g['id'] not in stuck]
        if not small: return gs
        a = min(small, key=lambda g: g['lines'])  # min() keeps the first of equals, i.e. kind order
        fits = [g for g in gs if g is not a and a['lines'] + g['lines'] <= cap]
        if not fits: stuck.add(a['id']); continue
        b = min(fits, key=lambda g: g['lines'])
        i, j = sorted((gs.index(a), gs.index(b)))
        x, y = gs[i], gs[j]
        merged = {'id': f"{x['id']}-{y['id']}", 'label': f"{x['label']}+{y['label']}", 'files': x['files'] + y['files'],
                  'lines': x['lines'] + y['lines'], 'points': sorted(set(x['points']) | set(y['points'])),
                  'agentType': 'typescript-reviewer' if x['agentType'] == y['agentType'] == 'typescript-reviewer' else 'python-reviewer'}
        gs = gs[:i] + [merged] + gs[i + 1:j] + gs[j + 1:]


def with_diffs(groups, rng, out_dir):  # one patch per group so a reviewer reads only its own files
    os.makedirs(out_dir, exist_ok=True)
    out = []
    for g in groups:
        path = os.path.abspath(os.path.join(out_dir, g['id'] + '.patch'))
        # --literal-pathspecs: a path like '[id].tsx' must not be read as a glob
        Path(path).write_text(git('--literal-pathspecs', 'diff', '-U15', '--no-color', '--no-ext-diff', '--no-renames', rng, '--', *g['files']))
        out.append({**g, 'diff': path})
    return out


def git(*a, cwd=None):
    r = subprocess.run(['git', '-c', 'core.quotepath=false', *a], capture_output=True, text=True, cwd=cwd)
    if r.returncode: sys.exit(f'triage: git {" ".join(a)}: {(r.stderr.strip().splitlines() or [""])[0]} (git fetch the base first?)')
    return r.stdout


def self_test():
    assert kind('superset/db_engine_specs/base.py') == 'src' and kind('tests/unit_tests/utils/test_a.py') == 'tests'
    assert kind('a/B.test.tsx') == 'tests' and kind('superset-frontend/spec/h.tsx') == 'tests' and kind('x/index.tsx') == 'frontend'
    assert kind('superset/config.py') == kind('docs/flags.md') == 'docs' and kind('setup.py') == 'src'
    assert [len(b) for b in pack([('a', 400), ('b', 300), ('c', 700)])] == [1, 1, 1] and len(pack([('a', 300), ('b', 300)])) == 1
    assert RX[12].search('FROM t ORDER BY x') and not RX[12].search('<Select value={v} />') and RX[13].search('cur.fetchmany(10)')
    G = lambda i, n, pts=(1,), ts=False: {'id': i, 'label': i.upper(), 'files': [i + '.py'], 'lines': n, 'points': list(pts),
                                          'agentType': 'typescript-reviewer' if ts else 'python-reviewer'}
    ids = lambda gs: [(g['id'], g['lines']) for g in gs]
    src_docs = [G('src', 72, [1, 4]), G('tests', 421, [2, 3]), G('docs', 108, [1, 27])]
    m = merge_small(src_docs)
    assert ids(m) == [('src-docs', 180), ('tests', 421)] and m[0]['points'] == [1, 4, 27] and m[0]['files'] == ['src.py', 'docs.py']
    assert m[0]['label'] == 'SRC+DOCS' and ids(src_docs) == [('src', 72), ('tests', 421), ('docs', 108)]  # input not mutated
    one, big = [G('src', 10)], [G('src', 150), G('tests', 600)]
    assert merge_small(one) == one and merge_small(big) == big
    assert ids(merge_small([G('src', 10), G('docs', 20)])) == [('src-docs', 30)]
    assert ids(merge_small([G('src', 500), G('docs', 20)])) == [('src-docs', 520)]  # earlier kind first, whichever was tiny
    assert ids(merge_small([G('src', 100), G('tests', 590)])) == [('src', 100), ('tests', 590)]  # 690 > cap: stays
    assert ids(merge_small([G('src', 50), G('tests', 60), G('docs', 70)])) == [('src-tests-docs', 180)]
    assert ids(merge_small([G('src', 100), G('tests', 100), G('docs', 100)], cap=250)) == [('src-tests', 200), ('docs', 100)]
    assert ids(merge_small([G('src', 50), G('tests', 50), G('docs', 50)])) == [('src-tests-docs', 150)]  # ties go to kind order
    ts2 = [G('src', 30, ts=True), G('frontend', 40, ts=True), G('docs', 500)]
    assert merge_small(ts2[:2])[0]['agentType'] == 'typescript-reviewer' and merge_small([ts2[0], ts2[2]])[0]['agentType'] == 'python-reviewer'
    with tempfile.TemporaryDirectory() as d:  # real repo: 2 commits, 2 tiny groups, one file each
        rows = lambda x: ''.join(f'row{i}\n' if i != 20 else x for i in range(1, 41))
        ident = ('-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false')
        git('init', '-q', cwd=d)
        for n, line in enumerate(('row20\n', 'changed\n')):
            for f in ('a.py', 'b.md'): Path(d, f).write_text(rows(line))
            git('add', '.', cwd=d); git(*ident, 'commit', '-q', '--no-verify', '-m', str(n), cwd=d)
        run = lambda *x: json.loads(subprocess.run([sys.executable, os.path.abspath(__file__), '--base', 'HEAD~1', *x],
                                                   cwd=d, capture_output=True, text=True, check=True).stdout)
        gs = run('--diff-dir', os.path.join(d, 'x', 'y'))['groups']
        assert ids(gs) == [('src-docs', 4)] and os.path.isabs(gs[0]['diff'])
        patch = Path(gs[0]['diff']).read_text()
        assert 'a/a.py' in patch and 'a/b.md' in patch and patch.count('\n row5\n') == 2 and '\n row4\n' not in patch  # -U15 around line 20
        gs = run('--no-merge')['groups']
        assert ids(gs) == [('src', 2), ('docs', 2)] and all('diff' not in g for g in gs)
    print('ok')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='origin/main'); ap.add_argument('--head', default='HEAD')
    ap.add_argument('--mode', default='auto', choices=['auto', 'quick', 'standard', 'deep'])
    ap.add_argument('--force-all', action='store_true'); ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--no-merge', action='store_true'); ap.add_argument('--min-group', type=int, default=MIN_GROUP)
    ap.add_argument('--diff-dir')
    a = ap.parse_args()
    if a.self_test: return self_test()
    head, tip = git('rev-parse', a.head, a.base).split()
    mb = git('merge-base', a.base, head).strip()
    rng = f'{a.base}...{head}'  # three-dot: merge-base diff, not a moving target
    files = {}
    for ln in git('diff', '--numstat', '--no-renames', rng).splitlines():
        add, dele, p = ln.split('\t', 2)
        files[p] = {'lines': sum(int(x) for x in (add, dele) if x.isdigit()), 'added': []}
    cur, hdr = None, False
    for ln in git('diff', '-U0', '--no-renames', '--no-ext-diff', '--no-color', rng).splitlines():
        if ln.startswith('diff --git'): hdr, cur = True, None
        elif hdr and ln.startswith('+++ '): hdr, cur = False, files.get(ln[6:])  # 'b/<path>' or '/dev/null'
        elif ln.startswith('@@'): hdr = False
        elif cur is not None and ln.startswith('+') and not COMMENT.match(ln[1:]): cur['added'].append(ln[1:501])
    scan = '\n'.join(l for p, f in files.items() if kind(p) in ('src', 'frontend') or (kind(p) == 'docs' and not re.search(r'\.(md|json)$', p)) for l in f['added'])
    fired = [n for n, rx in RX.items() if a.force_all or rx.search(scan)]
    skipped = [n for n in RX if n not in fired]
    allp = sorted(set(ALWAYS) | set(fired))
    pts = {'tests': [2, 3], 'docs': [1, 27, 28], 'frontend': [p for p in allp if p in (2, 3, 6, 24, 27, 29)], 'src': [p for p in allp if p not in (2, 3)]}
    groups = []
    for k in ('src', 'tests', 'frontend', 'docs'):
        items = [(p, f['lines']) for p, f in files.items() if kind(p) == k]
        bins = [b for b in (pack(items) if k != 'docs' else [sorted(p for p, _ in items)]) if b]
        for i, b in enumerate(bins):
            ts = k == 'frontend' or all(TS.search(p) for p in b)
            groups.append({'id': k + (f'-{i + 1}' if len(bins) > 1 else ''), 'label': LABEL[k], 'files': b, 'lines': sum(files[p]['lines'] for p in b),
                           'points': pts[k], 'agentType': 'typescript-reviewer' if ts else 'python-reviewer'})
    if not a.no_merge: groups = merge_small(groups, a.min_group)
    if a.diff_dir: groups = with_diffs(groups, rng, a.diff_dir)
    src_lines = sum(f['lines'] for p, f in files.items() if kind(p) in ('src', 'frontend'))
    mode = a.mode if a.mode != 'auto' else 'quick' if src_lines < 150 and len(files) <= 5 else 'deep' if src_lines > 1500 or len(files) > 40 else 'standard'
    ahead = git('rev-list', '--count', f'{mb}..{tip}').strip()
    drift = f'{a.base} is {ahead} commit(s) ahead of merge-base {mb[:10]} (tip {tip[:10]})' if ahead != '0' else f'{a.base} has not moved since the merge-base'
    facts = (f'drift: {drift}\n$ git log {a.base}..{head[:10]} --oneline\n{git("log", "--oneline", "-n", "8", f"{a.base}..{head}").strip()}\n'
             f'$ git diff --stat {a.base}...{head[:10]}\n{git("diff", "--stat=100,60,40", "--stat-graph-width=10", rng).strip()}')
    print(json.dumps({'base': a.base, 'head': head, 'mergeBase': mb, 'baseTip': tip, 'filesChanged': len(files),
                      'linesChanged': sum(f['lines'] for f in files.values()), 'sourceLines': src_lines, 'mode': mode, 'groups': groups,
                      'points': {'always': ALWAYS, 'fired': fired, 'skipped': skipped}, 'facts': facts}, separators=(',', ':')))


if __name__ == '__main__':
    main()
