# Tool discipline

- Read, Edit, Write, Grep and Glob are for files. Bash is for test commands, gate and skill scripts, read-only git and linters.
- Never edit a file with `sed -i`, a heredoc or a redirect. The file tools show the change and keep hooks able to check it.
- Run tests through the skill's runner (`direct-run.mjs` or `sandbox-run.mjs`) so the run is recorded in the ledger and the proof can be checked.
- Run lint on the changed files only, never the whole repo.
