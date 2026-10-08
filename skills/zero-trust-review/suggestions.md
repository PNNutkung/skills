# Suggestion blocks for a line range

Rules for Step 3b of SKILL.md. Read before posting or reporting any `suggestion` fence.

A mechanical fix is an **applyable suggestion block**, not prose; judgment calls stay prose.

**Who writes the block: the reviewer, never the lead** (the lead-only rule holds). A mechanical finding carries `replacement` in the compact return: the exact new text of its `startLine..endLine`, kept only for an anchorable finding whose fix no navigator changed (<= 2400 chars; a longer or changed fix stays prose in `suggestedFix`). The lead checks it against the rules below and wraps it in the host's fence; it never composes code itself, and a finding with no `replacement` gets no block. Post a block only for a finding that `proofcheck` left `confirmed`. An on-demand request ("suggest a fix for lines 42 to 58") with no `replacement` yet goes to ONE sonnet reviewer agent given the range and these rules; the lead relays its text.

The fence is host-specific (commands: [`hosts.md`](./hosts.md)):

- **GitLab:** `suggestion:-A+B`: `A` lines above and `B` below the anchored line, replaced wholesale (one line = `-0+0`). For lines `xx..yy` anchor (`new_line`) at `xx`, `B = yy - xx`, span `B + 1` lines: 142-158 -> `-0+16`. Compute it, don't eyeball it.
- **GitHub:** a plain ```` ```suggestion ```` fence; the range comes from the comment, not the fence: `start_line=xx`, `line=yy`, `side=RIGHT`, `start_side=RIGHT`. Example: 142-158 -> `start_line=142`, `line=158`; the fence body replaces exactly lines 142..158.
- **Other host or git-only:** no applyable block; give the replacement as a fenced code block in prose, with the line range.

The rules below hold on every host.

- **Span cap:** GitLab allows 100 lines above and 100 below the anchored line (201 total). Anchored at `xx` with `-0+B`, that is `B <= 100` (101 lines); larger is not a suggestion: report it and propose the split (point 5).
- **Verbatim:** every line of `xx..yy`, unchanged ones too, at exact indentation. Read the file at the reviewed SHA, never rebuild it from the hunk: `git show "$SHA:$FILE" | sed -n "${XX},${YY}p" | cat -A | head` (exposes tabs vs spaces).
- **New side only:** a hazard in a file the change request never touched can be permalinked but cannot carry a suggestion; say so.
- **No trailing-newline drift:** don't add or drop a blank line at the end of the span.

Post like [`posting.md`](./posting.md) anchored at `xx` (GitLab `new_line`, GitHub `start_line`); body = prose + the fence holding the real replacement (GitLab label `suggestion:-0+${B}`). Separate threads apply together from the review UI in one commit. The local report repeats each block under its finding, labelled with its range (GitLab `suggestion:-0+16`, GitHub `L142-L158`; anchor L142).
