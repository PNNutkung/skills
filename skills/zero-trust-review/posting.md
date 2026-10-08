# Citing and posting findings (Step 3)

Rules for Step 3 of SKILL.md. Read before citing a permalink or posting anything to the review host. Per-host commands: [`hosts.md`](./hosts.md). Suggestion blocks (Step 3b): [`suggestions.md`](./suggestions.md).

## Cite

Build a permalink pinned to the reviewed SHA from `WEB` and `SHA` (Step 0); the format differs per host:

```bash
echo "$WEB/-/blob/$SHA/path/to/File.kt#L42-58"   # GitLab; GitHub: $WEB/blob/$SHA/path/to/File.kt#L42-L58
```

Cite findings as `path:line` | permalink | finding. With no host URL, cite `path:line @ sha8`. The local report gives every finding its permalink. A posted **inline** comment already points at its line, so it carries a permalink only when its evidence sits at a different file or line than the anchor.

**Do not post** until the user asks to comment on the CR.

## Anchorable or not

**Anchorable** = one file and a line or range on the diff's new side, inside a diff hunk (changed or context lines). **Not anchorable** = spans the CR, names a missing artifact (no test file, no description, no CI run on this SHA) or has no single line ("has the flag-OFF path run in staging?"). Never invent a line number; say why there is no anchor.

## Post

Needs a host CLI; git-only means report only.

- One resolvable inline comment per anchorable finding, with the host's inline-comment call (`glab api …/discussions`, `gh api …/pulls/<n>/comments`; full commands in [`hosts.md`](./hosts.md)).
- Never one giant note, never two findings in a thread.
- Body: 1-3 sentences in the Voice ([`voice.md`](./voice.md)), plus a Step 3b suggestion only when the fix is mechanical. Prefix `blocker:` on a finding that sits in report section 1 (Critical Blockers) and `nit:` on one in section 7; no other label (severity is the section, not an adjective).
- Not-anchorable findings go into exactly ONE general note (`glab mr note`, `gh pr comment`). When the verdict is `REQUEST CHANGES` or `BLOCKED` the note opens with one line, `Verdict: REQUEST CHANGES` (or `BLOCKED`), the only summary; with `APPROVE` there is no verdict line, and the note exists only if a not-anchorable finding does. A verdict line alone still gets its note.
- Mirror the mechanism (inline, on the line), not another tool's chrome (rating buttons, IDE links, hidden payloads, borrowed HTML markers).
