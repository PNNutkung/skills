# Review host adapter

SKILL.md names host-neutral operations. This table maps each to a host. *Change request (CR)* = GitLab MR or GitHub PR. Detect the host from `git remote get-url origin` (`gitlab` -> glab, `github.com` -> gh). Unknown host or no CLI: use the git-only column; the review still runs, it just cannot read CR metadata or post.

Set once in Step 0: `TARGET` (target branch), `SHA` (reviewed head), `WEB` (repo web URL), `CR` (CR number/iid, empty if none). GitLab also needs `BASE` and `START` for inline positions.

| Operation | GitLab (`glab`, `jq`) | GitHub (`gh`, `jq`) | Git-only |
|---|---|---|---|
| CR metadata | `glab mr view --output json > "$CTX/cr.json"` | `gh pr view --json number,body,baseRefName,headRefOid,url > "$CTX/cr.json"` | skip |
| Target branch | `jq -r .target_branch "$CTX/cr.json"` | `jq -r .baseRefName "$CTX/cr.json"` | `git symbolic-ref --short refs/remotes/origin/HEAD \| sed 's\|^origin/\|\|'`, or ask the user |
| Reviewed SHA | `jq -r .diff_refs.head_sha "$CTX/cr.json"` (also `.base_sha` -> `BASE`, `.start_sha` -> `START`) | `jq -r .headRefOid "$CTX/cr.json"` | `git rev-parse HEAD` |
| CR number | `jq -r .iid "$CTX/cr.json"` | `jq -r .number "$CTX/cr.json"` | empty: no CR, report only |
| Ticket text | `jq -r .description "$CTX/cr.json" > "$SCRATCH/ticket.md"` | `jq -r .body "$CTX/cr.json" > "$SCRATCH/ticket.md"` | ask the user to paste it; a missing one is a point-1 finding |
| `WEB` | `w=$(jq -r .web_url "$CTX/cr.json"); WEB=${w%%/-/merge_requests/*}` | `WEB=$(git remote get-url origin \| sed -E 's#^git@([^:]+):#https://\1/#; s#\.git$##')` | same as GitHub (scp-style remotes only) |
| Permalink, lines 42-58 | `$WEB/-/blob/$SHA/path/File.kt#L42-58` | `$WEB/blob/$SHA/path/File.kt#L42-L58` | `path/File.kt:42-58 @ ${SHA:0:8}` (no URL) |
| Inline comment | `glab api --method POST projects/:id/merge_requests/$CR/discussions -f body=… -f position[position_type]=text -f position[base_sha]=$BASE -f position[start_sha]=$START -f position[head_sha]=$SHA -f position[old_path]=<file> -f position[new_path]=<file> -f position[new_line]=<n>` | `gh api --method POST repos/{owner}/{repo}/pulls/$CR/comments -f body=… -f commit_id=$SHA -f path=<file> -F line=<n> -f side=RIGHT` (range xx..yy: `line`=yy, add `-F start_line=xx -f start_side=RIGHT`) | none: report only |
| General note | `glab mr note $CR -m …` | `gh pr comment $CR --body …` | none |
| Suggestion fence | `suggestion:-0+B`, anchor `new_line`=xx | plain `suggestion`, add `-F start_line=xx` and `-F line=yy`, `-f start_side=RIGHT` | none: prose |

Other hosts (Bitbucket, Gitea, Azure DevOps): use the git-only column plus the host's own permalink form (`$WEB/src/$SHA/path#lines-42:58` on Bitbucket); post only if the user supplies the API call.

## Example: Step 0 on GitLab

```bash
CTX=$(mktemp -d)
glab mr view --output json > "$CTX/cr.json" 2>/dev/null
TARGET=$(jq -r '.target_branch // empty' "$CTX/cr.json"); SHA=$(jq -r '.diff_refs.head_sha // empty' "$CTX/cr.json")
CR=$(jq -r '.iid // empty' "$CTX/cr.json"); w=$(jq -r '.web_url // empty' "$CTX/cr.json"); WEB=${w%%/-/merge_requests/*}
BASE=$(jq -r '.diff_refs.base_sha // empty' "$CTX/cr.json"); START=$(jq -r '.diff_refs.start_sha // empty' "$CTX/cr.json")
```

## Example: Step 0 on GitHub

```bash
CTX=$(mktemp -d)
gh pr view --json number,body,baseRefName,headRefOid,url > "$CTX/cr.json" 2>/dev/null
TARGET=$(jq -r '.baseRefName // empty' "$CTX/cr.json"); SHA=$(jq -r '.headRefOid // empty' "$CTX/cr.json")
CR=$(jq -r '.number // empty' "$CTX/cr.json")
WEB=$(git remote get-url origin | sed -E 's#^git@([^:]+):#https://\1/#; s#\.git$##')
```

## Example: Step 0 with no host CLI

```bash
CTX=$(mktemp -d)
TARGET=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||'); SHA=$(git rev-parse HEAD)
```

After any of the three, default empty values: `TARGET=${TARGET:-main}`, `SHA=${SHA:-$(git rev-parse HEAD)}`.

## Posting notes

- API calls take the **full 40-character** `SHA` (`head_sha`, `commit_id`); `sha8` is for display only.
- Pass a multi-line body, suggestion fence included, through a variable, not inline: `BODY=$(cat <<'EOF' … EOF)`, then `-f body="$BODY"` (same on `glab api` and `gh api`).
- A comment line must sit inside a diff hunk on the new side; GitHub rejects a range outside the diff. If it does not, the finding is not anchorable (posting.md): use the general note.
