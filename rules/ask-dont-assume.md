# Ask, don't assume

- A behavior with no written source (spec, ticket, ADR, the user's own words) is not a requirement. Ask the user about it. <!-- rule: ask-dont-assume/no-source -->
- What the code does today, a code comment or an existing test's assertion is not a source either. <!-- rule: ask-dont-assume/code-not-source -->
- Put all open questions in one numbered batch, then wait. A question nobody answered stays listed as unconfirmed. It never becomes a test or a finding. <!-- rule: ask-dont-assume/one-batch -->
- Mark any item you had to assume as `assumed` and list those items for the user before spending on them (paired-agent-tdd DoD `source: "assumed"`). <!-- rule: ask-dont-assume/mark-assumed -->
- Ask only what needs judgment: a business or product trade-off, accepting a risk, or a change that no convention in the repo or in `rules/` covers. Settle the rest with evidence: code, a run or the docs. <!-- rule: ask-dont-assume/judgment-only -->
