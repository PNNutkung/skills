# Suggestion blocks for a line range

Rules for Step 3b of SKILL.md. Read before posting or reporting any `suggestion` fence.

A mechanical fix is an **applyable suggestion block**, not prose; judgment calls stay prose. The fence is `suggestion:-A+B`: `A` lines above and `B` below the anchored line, replaced wholesale (one line = `-0+0`). For lines `xx..yy` anchor (`new_line`) at `xx`, `B = yy - xx`, span `B + 1` lines: 142-158 -> `-0+16`. Compute it, don't eyeball it.

- **Span cap:** 100 above + 100 below (201 lines, `B <= 200`); larger is not a suggestion: report it and propose the split (point 5).
- **Verbatim:** every line of `xx..yy`, unchanged ones too, at exact indentation. Read the file at the reviewed SHA, never rebuild it from the hunk: `git show "$SHA:$FILE" | sed -n "${XX},${YY}p" | cat -A | head` (exposes tabs vs spaces).
- **New side only:** a hazard in a file the MR never touched can be permalinked but cannot carry a suggestion; say so.
- **No trailing-newline drift:** don't add or drop a blank line at the end of the span.

Post like Step 3 with `new_line` = `xx`; body = prose + a fence labelled `suggestion:-0+${B}` holding the real replacement. Separate threads apply together from the MR UI in one commit. The local report repeats each block under its finding, labelled with its fence (`suggestion:-0+16`, anchor L142).
