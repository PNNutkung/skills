# VReal: a real A/B run of paired-agent-tdd

This kit runs the real skill with a real model twice on the same small change. Run A has every speed flag off, and Run B uses the defaults. Each run adds one line to `runs.md`. The 2026-11-22 lines there came from this kit.

**This is not a test.** It costs real tokens, about $2-3 per run at list price. A run takes about 7 minutes. It needs Claude Code logged in, Node 22+, git and bash (Linux, macOS or WSL). It does not run in the cloud sandbox, because the cloud has no Workflow tool.

## Steps

```bash
export VREAL_DIR=~/ptdd-vreal        # the default
git clone --branch <branch> https://github.com/PNNutkung/skills $VREAL_DIR/skills
K=$VREAL_DIR/skills/skills/paired-agent-tdd/vreal
bash $K/build-base.sh                # $VREAL_DIR/base: 3 groups, 6 DoD items, 18 pairs
bash $K/setup.sh                     # changes ~/.claude: the machine's owner runs this
VREAL_NOTE=VReal3 bash $K/run.sh A   # flags off
VREAL_NOTE=VReal3 bash $K/run.sh B   # defaults
bash $K/restore.sh                   # puts ~/.claude back exactly
```

- `setup.sh` moves your `paired-agent-tdd` and `zero-trust-review` skills to `$VREAL_DIR/backup` and links the clone's copies in their place. It also writes two stand-in agents, `tdd-guide` and `code-reviewer`, to `~/.claude/agents`. It refuses to run if a backup already exists or if either agent file is already there.
- `restore.sh` undoes exactly that, and you can run it more than once.
- Each run copies `base` to `$VREAL_DIR/runA` or `runB`, and saves `run?.out.json`, `run?.err.txt`, `run?.env.txt` and `run?.time` next to it. The lead calls `record.mjs --append` itself, so the line goes into the **clone's** `runs.md`. Copy it into the repo by hand, together with the note about stand-ins.

## What to know before reading the numbers

- **Stand-in agents.** The `tdd-guide` and `code-reviewer` written by `setup.sh` are short stand-ins, not the real agents. A run with your own agents will give different numbers.
- **Usage limit.** Two runs use a large part of a 5-hour plan window. Round 1's Run B was cut off by the limit and had to be recorded by hand. Start with a fresh window.
- **Run files stay out of the repo.** The prompt tells the lead to write `args.json` and `return.json` to `$RUN`, and the base's `.gitignore` also ignores both. A stray file in the repo fails the final gate. Before c089224, it also voided every DoD pair when the courier was skipped.
- **graft.** The `.gitignore`/`.ignore` blocks for `graft/` are there because a graft hook on the first machine wrote into the repo. They do nothing on a machine without graft.
- **Workflow `scriptPath`.** The Workflow tool refuses a `scriptPath` outside the working directory, even through a symlink, so the leads passed `workflow.js` inline.
- **`unfixed` can be wrong.** `verify` reports a guard-style fix as unfixed (issue #23). Check each `unfixed` entry against the code.
- **One run each is an observation, not a rate.** Read several runs before you change a default.
