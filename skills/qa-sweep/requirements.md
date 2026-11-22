# Mode C: requirements and cases

Read [`SKILL.md`](./SKILL.md) first. This mode turns written requirements into test cases. Nothing here runs a test.

## 1. Sources, in this order

1. Spec files in the repo: docs, specs, ADRs, `GLOSSARY.md`, the README. `findings.mjs` reads them as committed at HEAD, so quote committed text only.
2. The ticket. Save its text word for word to `<run>/ticket.md` before you quote it:
   - GitHub: `gh issue view <n> --comments > <run>/ticket.md`
   - GitLab: `glab issue view <n> --comments > <run>/ticket.md`
   - pasted by the user: write that text, unchanged, with the Write tool.
3. The user's answers (section 3).

What the code does today, a code comment or an existing test's assertion is not a source. A behavior you find only there goes to the user as a question.

## 2. The requirement record

Each requirement goes in the `requirements` list of `<run>/findings.json`:

```json
{"id": "R1", "text": "a refund is refused after 30 days",
 "source": {"kind": "spec", "ref": "docs/refunds.md:12", "quote": "Refunds are refused after 30 days."}}
```

| `kind` | `ref` | `quote` must be |
|---|---|---|
| `spec` | `file:line` of the repo file | word for word, within 2 lines of that line at HEAD |
| `ticket` | the ticket URL | word for word from `<run>/ticket.md` |
| `user` | the answer number, such as `A1` | word for word from that answer in `<run>/answers.md` |

`text` is your one-line statement of the behavior. The quote is what proves it.

**From a definition of done.** When the definition-of-done skill recorded the work as an ADR, take the requirements from it instead of writing them: set `"dodFile": "docs/adr/NNNN-<slug>.md"` in `findings.json` and leave `requirements` out (both at once exit 2). `findings.mjs` reads the ADR committed at `--head` (unchanged in the working tree when that is HEAD), refuses one whose `## Definition of done` section was edited by hand, and turns each item into a `spec` requirement quoted from the ADR; the report shows it as `dod:A2` with the ADR's `file:line`. With neither field, the one active ADR whose `touches` cover the files your findings and tests name is used (`DOD_ADR_AUTO_FIND_ENABLED=false` turns this off); none means no requirements, as before, and several print a warning naming them, so set `dodFile`. A `touches` glob that matches no file prints a warning too. Your own questions still go to `<run>/answers.md`, apart from the ADR's.

## 3. Questions to the user

Write a question for each behavior with no written source, and for each unclear wording in a spec or a ticket. Ask them all in one numbered batch, then wait for the answers. Each question states your reading of the current behavior and where you saw it, so the user can say yes or correct it:

```
Q1. A refund of an order exactly 30 days old: the code accepts it (src/refunds/policy.ts:18). Is that required? Answer yes, or say what it must do.
Q2. The ticket says "recent orders". Does that mean the last 30 days, or something else?
```

Save each answer word for word, with the time, as a block in `<run>/answers.md` (Write tool). `A<n>` answers `Q<n>`:

```
A1: yes
time: 2026-11-19T10:04:00Z
A2: the last 14 days
time: 2026-11-19T10:04:00Z
```

An answer becomes a requirement with `kind: user`. If an answer is itself unclear, ask again as a new numbered question. A question left unanswered gets no test. Record it in the `unconfirmed` list of `<run>/findings.json`:

```json
{"question": "Q1. A refund of an order exactly 30 days old ...", "behavior": "the code accepts it (src/refunds/policy.ts:18)"}
```

## 4. Cases

Derive the cases from each requirement:

- **Equivalence classes:** one case per group of inputs the requirement treats the same, valid and invalid.
- **Boundaries:** each edge, and the values just inside and just outside it (29, 30 and 31 days).
- **State transitions:** each allowed move between states, and at least one forbidden move.
- **Error paths:** each error the requirement names, and invalid input.

Keep the cases in `<run>/cases.json`, one record each:

```json
{"id": "C1", "requirement": "R1", "inputs": {"days": 31}, "expected": "the refund is refused", "tier": "unit"}
```

`expected` comes from the requirement. When the requirement does not settle it, that is a question (section 3), not a guess. `tier` is the lowest tier that can observe the behavior (see `code.md`, section 5).

## 5. Many inputs: pairwise.mjs

When a requirement depends on several inputs or states that vary independently, do not pick the combinations by hand. With the Write tool, write one list of values per input, taken from your classes and boundaries, to `<run>/pairs-R1.json`:

```json
{"days": [0, 30, 31], "method": ["card", "voucher"], "state": ["paid", "shipped", "returned"]}
```

Then run `node "$SK/pairwise.mjs" <run>/pairs-R1.json`.

It prints JSON rows: every combination when there are 50 or fewer, else a smaller set that still covers every pair of values. Each row is the `inputs` of one case. Its `expected` still comes from the requirement.
