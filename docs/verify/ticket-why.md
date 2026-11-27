# Verify: ticket-why (ADR 0012)

## Skill
<!-- verify: written by verify.mjs; sha256:62ee921779010a34 -->
env: cloud (local shell)
run: node --test skills/ticket-writer/why.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Skill
```
TAP version 13
# Subtest: should list the 4 sections in order when the module loads (Skill)
ok 1 - should list the 4 sections in order when the module loads (Skill)
  ---
  duration_ms: 2.168763
  type: 'test'
  ...
# Subtest: should pass when a body has the 4 sections in order with an outcome table
ok 2 - should pass when a body has the 4 sections in order with an outcome table
  ---
  duration_ms: 0.961528
  type: 'test'
  ...
# Subtest: should pass when the headings are in Thai
ok 3 - should pass when the headings are in Thai
  ---
  duration_ms: 0.382613
  type: 'test'
  ...
# Subtest: should pass when a preamble such as PR attribution lines comes before the first section
ok 4 - should pass when a preamble such as PR attribution lines comes before the first section
  ---
  duration_ms: 0.256803
  type: 'test'
  ...
# Subtest: should name each missing section when the body has none of them
ok 5 - should name each missing section when the body has none of them
  ---
  duration_ms: 0.32303
  type: 'test'
  ...
# Subtest: should report an empty section when a heading has no text under it
ok 6 - should report an empty section when a heading has no text under it
  ---
  duration_ms: 0.266711
  type: 'test'
  ...
# Subtest: should report the order when the sections are not first or not in order
ok 7 - should report the order when the sections are not first or not in order
  ---
  duration_ms: 0.214591
  type: 'test'
  ...
# Subtest: should fail the outcome when it has no table and no not-measurable line
ok 8 - should fail the outcome when it has no table and no not-measurable line
  ---
  duration_ms: 0.123949
  type: 'test'
  ...
# Subtest: should fail the outcome when a table row leaves today or target empty
ok 9 - should fail the outcome when a table row leaves today or target empty
  ---
  duration_ms: 0.227059
  type: 'test'
  ...
# Subtest: should pass the outcome when it says not measurable with a reason in either language
ok 10 - should pass the outcome when it says not measurable with a reason in either language
  ---
  duration_ms: 0.369952
  type: 'test'
  ...
# Subtest: should ignore headings inside a fenced code block when it reads sections
ok 11 - should ignore headings inside a fenced code block when it reads sections
  ---
  duration_ms: 0.182059
  type: 'test'
  ...
# Subtest: should not crash and return errors when the body is not a string
ok 12 - should not crash and return errors when the body is not a string
  ---
  duration_ms: 0.06684
  type: 'test'
  ...
# Subtest: should render 4 sections that pass the check when it gets the fields
ok 13 - should render 4 sections that pass the check when it gets the fields
  ---
  duration_ms: 1.407732
  type: 'test'
  ...
# Subtest: should add a result column when results are given
ok 14 - should add a result column when results are given
  ---
  duration_ms: 0.287614
  type: 'test'
  ...
# Subtest: should escape a pipe inside a cell when it renders the table
ok 15 - should escape a pipe inside a cell when it renders the table
  ---
  duration_ms: 0.16954
  type: 'test'
  ...
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 64.321244
```

## Sections
<!-- verify: written by verify.mjs; sha256:f574f470f0817b53 -->
env: cloud (local shell)
run: node --test skills/ticket-writer/fuzz.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Sections
```
TAP version 13
# Subtest: should never throw and pass a random body only when its first 4 headings are the 4 sections in order (Tests, Sections)
ok 1 - should never throw and pass a random body only when its first 4 headings are the 4 sections in order (Tests, Sections)
  ---
  duration_ms: 7.961806
  type: 'test'
  ...
# Subtest: should render bodies that pass the check in Thai and English when the field values are random (Tests, Sections)
ok 2 - should render bodies that pass the check in Thai and English when the field values are random (Tests, Sections)
  ---
  duration_ms: 23.205434
  type: 'test'
  ...
# Subtest: should never throw and find a create call only for gh or glab create when commands and MCP inputs are random (Tests, Guard, GuardMcp)
ok 3 - should never throw and find a create call only for gh or glab create when commands and MCP inputs are random (Tests, Guard, GuardMcp)
  ---
  duration_ms: 4.563328
  type: 'test'
  ...
# Subtest: should accept only true or false in any case and stop with the flag name when the value is random (Tests, GuardFlag)
ok 4 - should accept only true or false in any case and stop with the flag name when the value is random (Tests, GuardFlag)
  ---
  duration_ms: 1.401314
  type: 'test'
  ...
# Subtest: should never throw from the hook and deny only create calls when payloads are random (Tests, Guard)
ok 5 - should never throw from the hook and deny only create calls when payloads are random (Tests, Guard)
  ---
  duration_ms: 3.172241
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 92.249521
```

## DodFields
<!-- verify: written by verify.mjs; sha256:716b7c5730308a07 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with DodFields
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 2.86198
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.251547
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.1472
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.267561
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.399765
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.325151
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.269432
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.206681
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 2.474503
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.31528
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.972773
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.578885
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.208708
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.910853
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.492909
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.18113
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.32601
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 5.348933
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 4.658749
  type: 'test'
  ...
1..19
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 95.040951
```

## OutcomeCheck
<!-- verify: written by verify.mjs; sha256:b58de29d1792b97c -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with OutcomeCheck
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.515273
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.183743
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.559882
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.196587
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.340897
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.175087
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.230026
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.9772
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 0.395961
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.2457
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.274603
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.433097
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.128435
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.625582
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.318717
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.119174
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.222816
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 4.002915
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.416137
  type: 'test'
  ...
1..19
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 79.839976
```

## ProvenBy
<!-- verify: written by verify.mjs; sha256:ef5daa3bab1ca440 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with ProvenBy
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.725857
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.233959
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.135148
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.200603
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.274891
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.203603
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.201091
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 1.036929
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 0.397711
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.26365
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.276439
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.380274
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.118651
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.514659
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.271955
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.113742
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.283894
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 5.775674
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 6.342939
  type: 'test'
  ...
1..19
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 105.822649
```

## CostCheck
<!-- verify: written by verify.mjs; sha256:90d6a82f7b2d356d -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs skills/definition-of-done/why.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with CostCheck
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.822288
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.230529
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.082232
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.307917
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.365507
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.208449
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.205452
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.149563
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.783114
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.338033
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.393154
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.492382
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.165514
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.5532
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.354412
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.125989
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 4.206393
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 22.822524
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 9.354122
  type: 'test'
  ...
# Subtest: should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
ok 20 - should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
  ---
  duration_ms: 194.996405
  type: 'test'
  ...
# Subtest: should pass a DoD without the fields when the session marker is from an older version (NewOnly)
ok 21 - should pass a DoD without the fields when the session marker is from an older version (NewOnly)
  ---
  duration_ms: 118.155599
  type: 'test'
  ...
# Subtest: should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
ok 22 - should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
  ---
  duration_ms: 300.215628
  type: 'test'
  ...
# Subtest: should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
ok 23 - should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
  ---
  duration_ms: 175.603093
  type: 'test'
  ...
# Subtest: should write the PR top with results from docs/verify when render --pr runs (PrBody)
ok 24 - should write the PR top with results from docs/verify when render --pr runs (PrBody)
  ---
  duration_ms: 152.834562
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1035.658189
```

## NewOnly
<!-- verify: written by verify.mjs; sha256:dc1a2aa903652e49 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs skills/definition-of-done/why.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with NewOnly
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.540651
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.227339
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.086756
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.184887
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.348699
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.21889
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.195261
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.144984
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.19284
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.227329
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.327271
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.621482
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.197034
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.516361
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.264478
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.126304
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.262807
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 7.161205
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.415424
  type: 'test'
  ...
# Subtest: should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
ok 20 - should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
  ---
  duration_ms: 217.278156
  type: 'test'
  ...
# Subtest: should pass a DoD without the fields when the session marker is from an older version (NewOnly)
ok 21 - should pass a DoD without the fields when the session marker is from an older version (NewOnly)
  ---
  duration_ms: 98.074164
  type: 'test'
  ...
# Subtest: should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
ok 22 - should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
  ---
  duration_ms: 293.725214
  type: 'test'
  ...
# Subtest: should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
ok 23 - should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
  ---
  duration_ms: 176.890179
  type: 'test'
  ...
# Subtest: should write the PR top with results from docs/verify when render --pr runs (PrBody)
ok 24 - should write the PR top with results from docs/verify when render --pr runs (PrBody)
  ---
  duration_ms: 150.289182
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1063.226066
```

## DodFlag
<!-- verify: written by verify.mjs; sha256:f4c9415a2dfb69f4 -->
env: cloud (local shell)
run: node /root/.cache/verify/skills-d9f431e686d5/ticket-why/probes/dod-flag.mjs /home/user/skills
result: pass
expect: exit 0; regex /^(on: dod\.mjs check refuses a DoD with no why \(exit 1: why: missing|off: dod\.mjs check passes a DoD with no why \(exit 0\))/m
```
--- 1/3 DOD_TICKET_WHY_ENABLED unset (default true): exit 0 ---
on: dod.mjs check refuses a DoD with no why (exit 1: why: missing (the problem today, with evidence, with a quoted source))
--- 2/3 DOD_TICKET_WHY_ENABLED=false: exit 0 ---
off: dod.mjs check passes a DoD with no why (exit 0)
--- 3/3 DOD_TICKET_WHY_ENABLED=maybe (invalid): exit 2 ---

dod: DOD_TICKET_WHY_ENABLED=maybe is not valid: use true or false
```

## Render
<!-- verify: written by verify.mjs; sha256:8c6de22282ed15e7 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs skills/definition-of-done/why.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Render
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.456311
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.168224
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.12676
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.179538
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.262899
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.153676
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.170534
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.154205
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.186385
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.228946
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.262881
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.394624
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.157248
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 1.485785
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.306836
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.111746
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.221497
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 3.606823
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.572946
  type: 'test'
  ...
# Subtest: should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
ok 20 - should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
  ---
  duration_ms: 162.513924
  type: 'test'
  ...
# Subtest: should pass a DoD without the fields when the session marker is from an older version (NewOnly)
ok 21 - should pass a DoD without the fields when the session marker is from an older version (NewOnly)
  ---
  duration_ms: 114.986198
  type: 'test'
  ...
# Subtest: should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
ok 22 - should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
  ---
  duration_ms: 284.209665
  type: 'test'
  ...
# Subtest: should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
ok 23 - should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
  ---
  duration_ms: 180.124985
  type: 'test'
  ...
# Subtest: should write the PR top with results from docs/verify when render --pr runs (PrBody)
ok 24 - should write the PR top with results from docs/verify when render --pr runs (PrBody)
  ---
  duration_ms: 151.240322
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1000.361111
```

## TicketCheck
<!-- verify: written by verify.mjs; sha256:f700d2c7674166f3 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs skills/definition-of-done/why.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with TicketCheck
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.55177
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.179781
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.079416
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.236839
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.268807
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 4.312695
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.262106
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.790221
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 0.493648
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.241782
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.400765
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.543394
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.160766
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.679929
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.305347
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.181855
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.25827
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 9.024374
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.367873
  type: 'test'
  ...
# Subtest: should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
ok 20 - should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
  ---
  duration_ms: 168.868478
  type: 'test'
  ...
# Subtest: should pass a DoD without the fields when the session marker is from an older version (NewOnly)
ok 21 - should pass a DoD without the fields when the session marker is from an older version (NewOnly)
  ---
  duration_ms: 129.12994
  type: 'test'
  ...
# Subtest: should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
ok 22 - should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
  ---
  duration_ms: 271.900586
  type: 'test'
  ...
# Subtest: should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
ok 23 - should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
  ---
  duration_ms: 183.340073
  type: 'test'
  ...
# Subtest: should write the PR top with results from docs/verify when render --pr runs (PrBody)
ok 24 - should write the PR top with results from docs/verify when render --pr runs (PrBody)
  ---
  duration_ms: 188.5589
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1019.943537
```

## Adr
<!-- verify: written by verify.mjs; sha256:bc45456b650c9737 -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Adr
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.523441
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.233312
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.092098
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.194252
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.561645
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.221491
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.186127
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.147313
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.322322
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.258489
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.484459
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.479268
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.135296
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.644628
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.29322
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.114214
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.221883
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 3.903538
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.475071
  type: 'test'
  ...
1..19
# tests 19
# suites 0
# pass 19
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 81.263699
```

## PrBody
<!-- verify: written by verify.mjs; sha256:5a8108c3a03d8f2a -->
env: cloud (local shell)
run: node --test skills/definition-of-done/dodwhy.test.mjs skills/definition-of-done/why.e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with PrBody
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.662594
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.385571
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.150751
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.247281
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.485424
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.265033
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.195692
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.245836
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.421524
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.273501
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.402143
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.480185
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.20152
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.657355
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.343242
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.169934
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
ok 17 - should render the PR top with the 4 sections, the ticket link and a result column when verify ran (PrBody)
  ---
  duration_ms: 0.263373
  type: 'test'
  ...
# Subtest: should write the 4 sections under Context when the ADR is rendered with sections (Adr)
ok 18 - should write the 4 sections under Context when the ADR is rendered with sections (Adr)
  ---
  duration_ms: 4.238874
  type: 'test'
  ...
# Subtest: should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
ok 19 - should list DOD_TICKET_WHY_ENABLED with default true when the README flags table is read (DodFlag, Docs)
  ---
  duration_ms: 3.892616
  type: 'test'
  ...
# Subtest: should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
ok 20 - should refuse a DoD without why, outcomes and cost when the session is new and the flag is unset (NewOnly, CostCheck)
  ---
  duration_ms: 212.363035
  type: 'test'
  ...
# Subtest: should pass a DoD without the fields when the session marker is from an older version (NewOnly)
ok 21 - should pass a DoD without the fields when the session marker is from an older version (NewOnly)
  ---
  duration_ms: 135.715798
  type: 'test'
  ...
# Subtest: should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
ok 22 - should behave as before when DOD_TICKET_WHY_ENABLED is false and stop with the fix when it is not true or false (DodFlag)
  ---
  duration_ms: 280.524779
  type: 'test'
  ...
# Subtest: should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
ok 23 - should render the 4 sections first and pass ticket-check when the flag is unset (Render, TicketCheck)
  ---
  duration_ms: 154.898888
  type: 'test'
  ...
# Subtest: should write the PR top with results from docs/verify when render --pr runs (PrBody)
ok 24 - should write the PR top with results from docs/verify when render --pr runs (PrBody)
  ---
  duration_ms: 125.556775
  type: 'test'
  ...
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1016.141735
```

## IssueCheck
<!-- verify: written by verify.mjs; sha256:32f680ba4b029aaf -->
env: cloud (local shell)
run: node --test skills/ticket-writer/ticket.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with IssueCheck
```
TAP version 13
# Subtest: should pass issue-check and exit 0 when the body file has the 4 sections (IssueCheck)
ok 1 - should pass issue-check and exit 0 when the body file has the 4 sections (IssueCheck)
  ---
  duration_ms: 3.292294
  type: 'test'
  ...
# Subtest: should fail issue-check with exit 1 and point to the template when sections are missing (IssueCheck)
ok 2 - should fail issue-check with exit 1 and point to the template when sections are missing (IssueCheck)
  ---
  duration_ms: 0.740661
  type: 'test'
  ...
# Subtest: should exit 2 with the usage when a command or argument is missing
ok 3 - should exit 2 with the usage when a command or argument is missing
  ---
  duration_ms: 0.113149
  type: 'test'
  ...
# Subtest: should print a template whose headings the check knows when template runs in either language (IssueCheck)
ok 4 - should print a template whose headings the check knows when template runs in either language (IssueCheck)
  ---
  duration_ms: 1.049151
  type: 'test'
  ...
# Subtest: should read a relative --body from the real folder when the cwd is a symlinked folder (IssueCheck edge)
ok 5 - should read a relative --body from the real folder when the cwd is a symlinked folder (IssueCheck edge)
  ---
  duration_ms: 2.95559
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 66.392111
```

## Guard
<!-- verify: written by verify.mjs; sha256:26e00b8faf3d1b2c -->
env: cloud (local shell)
run: node --test hooks/ticket-why-guard.test.mjs skills/ticket-writer/create.test.mjs skills/ticket-writer/e2e.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Guard
```
TAP version 13
# Subtest: should allow a create command when the body has the 4 sections (Guard)
ok 1 - should allow a create command when the body has the 4 sections (Guard)
  ---
  duration_ms: 2.238517
  type: 'test'
  ...
# Subtest: should deny a create command and name the missing sections when the body lacks them (Guard)
ok 2 - should deny a create command and name the missing sections when the body lacks them (Guard)
  ---
  duration_ms: 0.37919
  type: 'test'
  ...
# Subtest: should read a body file relative to cwd and deny it when the file is missing (Guard)
ok 3 - should read a body file relative to cwd and deny it when the file is missing (Guard)
  ---
  duration_ms: 2.340157
  type: 'test'
  ...
# Subtest: should deny with the --body-file fix when it cannot read the body (Guard)
ok 4 - should deny with the --body-file fix when it cannot read the body (Guard)
  ---
  duration_ms: 0.371035
  type: 'test'
  ...
# Subtest: should let a command through when it creates no issue or pull request (Guard)
ok 5 - should let a command through when it creates no issue or pull request (Guard)
  ---
  duration_ms: 0.204001
  type: 'test'
  ...
# Subtest: should check the body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
ok 6 - should check the body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.505064
  type: 'test'
  ...
# Subtest: should let everything through when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
ok 7 - should let everything through when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
  ---
  duration_ms: 0.138014
  type: 'test'
  ...
# Subtest: should deny only create calls with the fix when TICKET_WHY_GUARD_ENABLED is not true or false (GuardFlag)
ok 8 - should deny only create calls with the fix when TICKET_WHY_GUARD_ENABLED is not true or false (GuardFlag)
  ---
  duration_ms: 0.120193
  type: 'test'
  ...
# Subtest: should find no create call when the command does not create an issue or a pull request
ok 9 - should find no create call when the command does not create an issue or a pull request
  ---
  duration_ms: 8.411265
  type: 'test'
  ...
# Subtest: should read an inline body for gh issue create and gh pr create when --body or -b is given (Guard)
ok 10 - should read an inline body for gh issue create and gh pr create when --body or -b is given (Guard)
  ---
  duration_ms: 2.215487
  type: 'test'
  ...
# Subtest: should read a body file when --body-file or -F is given (Guard)
ok 11 - should read a body file when --body-file or -F is given (Guard)
  ---
  duration_ms: 2.181651
  type: 'test'
  ...
# Subtest: should read the heredoc when the body is $(cat <<EOF ...) or the body file is stdin (Guard)
ok 12 - should read the heredoc when the body is $(cat <<EOF ...) or the body file is stdin (Guard)
  ---
  duration_ms: 0.245136
  type: 'test'
  ...
# Subtest: should read the description when glab issue create or glab mr create gets it inline or from $(cat file) (Guard)
ok 13 - should read the description when glab issue create or glab mr create gets it inline or from $(cat file) (Guard)
  ---
  duration_ms: 0.151963
  type: 'test'
  ...
# Subtest: should mark the body unreadable when it comes from the editor, --fill, --web, a template or a variable (Guard)
ok 14 - should mark the body unreadable when it comes from the editor, --fill, --web, a template or a variable (Guard)
  ---
  duration_ms: 0.263249
  type: 'test'
  ...
# Subtest: should find the create call when it sits inside sh -c or after env prefixes (Guard)
ok 15 - should find the create call when it sits inside sh -c or after env prefixes (Guard)
  ---
  duration_ms: 0.131226
  type: 'test'
  ...
# Subtest: should return the kind and body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
ok 16 - should return the kind and body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.44475
  type: 'test'
  ...
# Subtest: should return null when an MCP tool does not create an issue or pull request (GuardMcp)
ok 17 - should return null when an MCP tool does not create an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.222795
  type: 'test'
  ...
# Subtest: should deny gh issue create without the 4 sections when the flag is unset (Guard)
ok 18 - should deny gh issue create without the 4 sections when the flag is unset (Guard)
  ---
  duration_ms: 34.854095
  type: 'test'
  ...
# Subtest: should allow gh pr create with a body file that passes issue-check when the flag is unset (Guard)
ok 19 - should allow gh pr create with a body file that passes issue-check when the flag is unset (Guard)
  ---
  duration_ms: 77.814054
  type: 'test'
  ...
# Subtest: should stay silent when the tool is not guarded or stdin is not JSON (fail open)
ok 20 - should stay silent when the tool is not guarded or stdin is not JSON (fail open)
  ---
  duration_ms: 73.897402
  type: 'test'
  ...
# Subtest: should allow the call when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
ok 21 - should allow the call when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
  ---
  duration_ms: 41.709154
  type: 'test'
  ...
1..21
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 300.430239
```

## GuardMcp
<!-- verify: written by verify.mjs; sha256:978961f51263598c -->
env: cloud (local shell)
run: node --test hooks/ticket-why-guard.test.mjs skills/ticket-writer/create.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with GuardMcp
```
TAP version 13
# Subtest: should allow a create command when the body has the 4 sections (Guard)
ok 1 - should allow a create command when the body has the 4 sections (Guard)
  ---
  duration_ms: 6.389001
  type: 'test'
  ...
# Subtest: should deny a create command and name the missing sections when the body lacks them (Guard)
ok 2 - should deny a create command and name the missing sections when the body lacks them (Guard)
  ---
  duration_ms: 0.275416
  type: 'test'
  ...
# Subtest: should read a body file relative to cwd and deny it when the file is missing (Guard)
ok 3 - should read a body file relative to cwd and deny it when the file is missing (Guard)
  ---
  duration_ms: 1.708473
  type: 'test'
  ...
# Subtest: should deny with the --body-file fix when it cannot read the body (Guard)
ok 4 - should deny with the --body-file fix when it cannot read the body (Guard)
  ---
  duration_ms: 0.298308
  type: 'test'
  ...
# Subtest: should let a command through when it creates no issue or pull request (Guard)
ok 5 - should let a command through when it creates no issue or pull request (Guard)
  ---
  duration_ms: 0.126608
  type: 'test'
  ...
# Subtest: should check the body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
ok 6 - should check the body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.450329
  type: 'test'
  ...
# Subtest: should let everything through when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
ok 7 - should let everything through when TICKET_WHY_GUARD_ENABLED is false (GuardFlag)
  ---
  duration_ms: 0.109679
  type: 'test'
  ...
# Subtest: should deny only create calls with the fix when TICKET_WHY_GUARD_ENABLED is not true or false (GuardFlag)
ok 8 - should deny only create calls with the fix when TICKET_WHY_GUARD_ENABLED is not true or false (GuardFlag)
  ---
  duration_ms: 0.102626
  type: 'test'
  ...
# Subtest: should find no create call when the command does not create an issue or a pull request
ok 9 - should find no create call when the command does not create an issue or a pull request
  ---
  duration_ms: 1.117772
  type: 'test'
  ...
# Subtest: should read an inline body for gh issue create and gh pr create when --body or -b is given (Guard)
ok 10 - should read an inline body for gh issue create and gh pr create when --body or -b is given (Guard)
  ---
  duration_ms: 1.658838
  type: 'test'
  ...
# Subtest: should read a body file when --body-file or -F is given (Guard)
ok 11 - should read a body file when --body-file or -F is given (Guard)
  ---
  duration_ms: 0.162027
  type: 'test'
  ...
# Subtest: should read the heredoc when the body is $(cat <<EOF ...) or the body file is stdin (Guard)
ok 12 - should read the heredoc when the body is $(cat <<EOF ...) or the body file is stdin (Guard)
  ---
  duration_ms: 0.188252
  type: 'test'
  ...
# Subtest: should read the description when glab issue create or glab mr create gets it inline or from $(cat file) (Guard)
ok 13 - should read the description when glab issue create or glab mr create gets it inline or from $(cat file) (Guard)
  ---
  duration_ms: 0.149418
  type: 'test'
  ...
# Subtest: should mark the body unreadable when it comes from the editor, --fill, --web, a template or a variable (Guard)
ok 14 - should mark the body unreadable when it comes from the editor, --fill, --web, a template or a variable (Guard)
  ---
  duration_ms: 0.185488
  type: 'test'
  ...
# Subtest: should find the create call when it sits inside sh -c or after env prefixes (Guard)
ok 15 - should find the create call when it sits inside sh -c or after env prefixes (Guard)
  ---
  duration_ms: 0.162367
  type: 'test'
  ...
# Subtest: should return the kind and body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
ok 16 - should return the kind and body when a GitHub or GitLab MCP tool creates an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.290065
  type: 'test'
  ...
# Subtest: should return null when an MCP tool does not create an issue or pull request (GuardMcp)
ok 17 - should return null when an MCP tool does not create an issue or pull request (GuardMcp)
  ---
  duration_ms: 0.222312
  type: 'test'
  ...
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 78.891247
```

## GuardFlag
<!-- verify: written by verify.mjs; sha256:9b989a5c6fe2d248 -->
env: cloud (local shell)
run: node /root/.cache/verify/skills-d9f431e686d5/ticket-why/probes/guard-flag.mjs /home/user/skills
result: pass
expect: exit 0; regex /^(on: the hook denies gh issue create with no 4 sections \(missing section "Why"\)|off: the hook allows gh issue create with no 4 sections)$/m
```
--- 1/3 TICKET_WHY_GUARD_ENABLED unset (default true): exit 0 ---
on: the hook denies gh issue create with no 4 sections (missing section "Why")
--- 2/3 TICKET_WHY_GUARD_ENABLED=false: exit 0 ---
off: the hook allows gh issue create with no 4 sections
--- 3/3 TICKET_WHY_GUARD_ENABLED=maybe (invalid): exit 2 ---
ticket-writer guard: TICKET_WHY_GUARD_ENABLED=maybe is not valid: use true or false. Fix the flag where it is set (shell or settings.json env) and start again
```

## WorkflowPr
<!-- verify: written by verify.mjs; sha256:43d47a89dece5b3b -->
env: cloud (local shell)
run: node /root/.cache/verify/skills-d9f431e686d5/ticket-why/probes/wf-flag.mjs /home/user/skills
result: pass
expect: exit 0; regex /^(on: next --pr refuses a PR body with no 4 sections \(PR body: missing section "Why"\)|off: next --pr moves tdd -> verify without the 4 sections)$/m
```
--- 1/3 WORKFLOW_PR_WHY_CHECK_ENABLED unset (default true): exit 0 ---
on: next --pr refuses a PR body with no 4 sections (PR body: missing section "Why")
--- 2/3 WORKFLOW_PR_WHY_CHECK_ENABLED=false: exit 0 ---
off: next --pr moves tdd -> verify without the 4 sections
--- 3/3 WORKFLOW_PR_WHY_CHECK_ENABLED=maybe (invalid): exit 2 ---
{"ok":false,"errors":["WORKFLOW_PR_WHY_CHECK_ENABLED=maybe is not valid: use true or false"]}
```

## VerifyOut
<!-- verify: written by verify.mjs; sha256:96dec4d6b6926d8f -->
env: cloud (local shell)
run: node --test skills/verify/adr.test.mjs skills/verify/section.test.mjs skills/verify/verify.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with VerifyOut
```
TAP version 13
# Subtest: should list each DoD item id with its text when the ADR has a Definition of done (Source)
ok 1 - should list each DoD item id with its text when the ADR has a Definition of done (Source)
  ---
  duration_ms: 1.113081
  type: 'test'
  ...
# Subtest: should list no items when the ADR has no Definition of done heading (Source fail)
ok 2 - should list no items when the ADR has no Definition of done heading (Source fail)
  ---
  duration_ms: 0.967887
  type: 'test'
  ...
# Subtest: should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
ok 3 - should book each bracketed env name once, lowercased, when the verify env line names them (Envs)
  ---
  duration_ms: 0.374475
  type: 'test'
  ...
# Subtest: should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
ok 4 - should list new flags from the feature flag line and skip a flag after "no" when the ADR removes it (FlagRuns)
  ---
  duration_ms: 0.350774
  type: 'test'
  ...
# Subtest: should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
ok 5 - should read A<n> answers over several lines and stop at time: when answers.md has them (Ask)
  ---
  duration_ms: 0.21626
  type: 'test'
  ...
# Subtest: should take the four-digit number from the ADR file name when it has one (Run edge)
ok 6 - should take the four-digit number from the ADR file name when it has one (Run edge)
  ---
  duration_ms: 0.26984
  type: 'test'
  ...
# Subtest: should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
ok 7 - should list a flag once with its digits when the text names it twice and it has digits 2 to 9 (FlagRuns edge)
  ---
  duration_ms: 0.151746
  type: 'test'
  ...
# Subtest: should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
ok 8 - should read items right below the heading and a flag removed at the start when the ADR is that short (Source edge)
  ---
  duration_ms: 0.094535
  type: 'test'
  ...
# Subtest: should keep the text whole when an item has no test-kind prefix (Source edge)
ok 9 - should keep the text whole when an item has no test-kind prefix (Source edge)
  ---
  duration_ms: 0.207217
  type: 'test'
  ...
# Subtest: should read each outcome row with its proving items when the ADR has an Expected outcome table (VerifyOut)
ok 10 - should read each outcome row with its proving items when the ADR has an Expected outcome table (VerifyOut)
  ---
  duration_ms: 0.525342
  type: 'test'
  ...
# Subtest: should return no outcomes when the ADR has no Expected outcome section or the table has no Proven by column (VerifyOut edge)
ok 11 - should return no outcomes when the ADR has no Expected outcome section or the table has no Proven by column (VerifyOut edge)
  ---
  duration_ms: 0.140313
  type: 'test'
  ...
# Subtest: should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
ok 12 - should write env, run, result, expect, image and the output block under a marker when an item ran (Run)
  ---
  duration_ms: 1.724057
  type: 'test'
  ...
# Subtest: should keep output that holds fences or headings inside its block when the command printed them (Run edge)
ok 13 - should keep output that holds fences or headings inside its block when the command printed them (Run edge)
  ---
  duration_ms: 0.269787
  type: 'test'
  ...
# Subtest: should cut long output to head and tail and say so when it is over the cap (Run edge)
ok 14 - should cut long output to head and tail and say so when it is over the cap (Run edge)
  ---
  duration_ms: 0.111743
  type: 'test'
  ...
# Subtest: should start a new file with the title and the sections when the verify file does not exist (Rerun)
ok 15 - should start a new file with the title and the sections when the verify file does not exist (Rerun)
  ---
  duration_ms
... [cut: the output was 18132 chars; the first and last 4000 are kept] ...
sage with exit 2 when the CLI runs as a process (Envs)
  ---
  duration_ms: 109.452609
  type: 'test'
  ...
# Subtest: should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
ok 52 - should report an error and exit 1 from run and status when the verify file has a second heading of a code-written section id (Guard)
  ---
  duration_ms: 186.114267
  type: 'test'
  ...
# Subtest: should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
ok 53 - should fail a flag entry when the invalid run names the flag only in a test title and never prints the bad value with it (FlagRuns fail)
  ---
  duration_ms: 164.622858
  type: 'test'
  ...
# Subtest: should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
ok 54 - should refuse record when --from holds a parenthesis or a line break, so the env line stays <env> (relayed: <from>) (Envs edge)
  ---
  duration_ms: 56.070837
  type: 'test'
  ...
# Subtest: should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
ok 55 - should fail every item that ran with the changed files and exit 1 when a planned command changes product files (Fail, Guard)
  ---
  duration_ms: 171.865127
  type: 'test'
  ...
# Subtest: should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
ok 56 - should report product files changed since open as errors from status and close and still close when a file changed outside docs/verify (Fail, Guard)
  ---
  duration_ms: 77.614806
  type: 'test'
  ...
# Subtest: should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
ok 57 - should keep the files that differed at open, the image the plan names and a reopen of the same run out of the change list when they are expected (Fail edge)
  ---
  duration_ms: 153.52998
  type: 'test'
  ...
# Subtest: should report a commit made since open as a product change when HEAD moved (Fail edge)
ok 58 - should report a commit made since open as a product change when HEAD moved (Fail edge)
  ---
  duration_ms: 91.804016
  type: 'test'
  ...
# Subtest: should fail the run and report from status when the run state has no snapshot from open (Fail edge)
ok 59 - should fail the run and report from status when the run state has no snapshot from open (Fail edge)
  ---
  duration_ms: 183.096759
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
ok 60 - should leave the run folder out of the change list when the repo and VERIFY_CACHE_DIR are reached through a symlink (Fail edge)
  ---
  duration_ms: 146.875654
  type: 'test'
  ...
# Subtest: should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
ok 61 - should leave the run folder out of the change list when VERIFY_CACHE_DIR puts it inside the repo (Fail edge)
  ---
  duration_ms: 150.053102
  type: 'test'
  ...
# Subtest: should write an Outcomes section at the end with each outcome met or not run when the ADR has an outcomes table (VerifyOut)
ok 62 - should write an Outcomes section at the end with each outcome met or not run when the ADR has an outcomes table (VerifyOut)
  ---
  duration_ms: 167.094483
  type: 'test'
  ...
# Subtest: should write no Outcomes section when the ADR has no outcomes table (VerifyOut edge)
ok 63 - should write no Outcomes section when the ADR has no outcomes table (VerifyOut edge)
  ---
  duration_ms: 151.207744
  type: 'test'
  ...
1..63
# tests 63
# suites 0
# pass 63
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5250.256937
```

## SkillDocs
<!-- verify: written by verify.mjs; sha256:ecf1f6cc02126d4e -->
env: cloud (local shell)
run: node --test skills/ticket-writer/docs.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with SkillDocs
```
TAP version 13
# Subtest: should name every section heading and the flag in SKILL.md when the docs are read (SkillDocs)
ok 1 - should name every section heading and the flag in SKILL.md when the docs are read (SkillDocs)
  ---
  duration_ms: 0.871468
  type: 'test'
  ...
# Subtest: should register the hook for Bash and MCP tools when hooks.json is read (Guard)
ok 2 - should register the hook for Bash and MCP tools when hooks.json is read (Guard)
  ---
  duration_ms: 0.339563
  type: 'test'
  ...
# Subtest: should list the flag and the guard when README.md and rules/README.md are read (Docs)
ok 3 - should list the flag and the guard when README.md and rules/README.md are read (Docs)
  ---
  duration_ms: 0.165252
  type: 'test'
  ...
# Subtest: should keep evals for the skill when evals.json is read
ok 4 - should keep evals for the skill when evals.json is read
  ---
  duration_ms: 0.154903
  type: 'test'
  ...
# Subtest: should point definition-of-done, dev-workflow and retro to ticket-writer and keep each SKILL.md at most 16,000 bytes when they write issues or PRs (SkillDocs)
ok 5 - should point definition-of-done, dev-workflow and retro to ticket-writer and keep each SKILL.md at most 16,000 bytes when they write issues or PRs (SkillDocs)
  ---
  duration_ms: 0.252026
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 58.394435
```

## Docs
<!-- verify: written by verify.mjs; sha256:e48cedbed22e4f47 -->
env: cloud (local shell)
run: node --test skills/ticket-writer/docs.test.mjs skills/definition-of-done/dodwhy.test.mjs skills/verify/docs.test.mjs
result: pass
expect: exit 0; node --test preset: 0 failed, at least 1 passed, a passing test named with Docs
```
TAP version 13
# Subtest: should pass when why, outcomes and cost are complete and quoted (DodFields)
ok 1 - should pass when why, outcomes and cost are complete and quoted (DodFields)
  ---
  duration_ms: 1.607113
  type: 'test'
  ...
# Subtest: should name each missing field when required and the DoD has none of them (CostCheck)
ok 2 - should name each missing field when required and the DoD has none of them (CostCheck)
  ---
  duration_ms: 0.242141
  type: 'test'
  ...
# Subtest: should report nothing when not required and the DoD has none of the fields (NewOnly)
ok 3 - should report nothing when not required and the DoD has none of the fields (NewOnly)
  ---
  duration_ms: 0.080071
  type: 'test'
  ...
# Subtest: should still check a field when not required but the field is present (NewOnly)
ok 4 - should still check a field when not required but the field is present (NewOnly)
  ---
  duration_ms: 0.204612
  type: 'test'
  ...
# Subtest: should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
ok 5 - should refuse an outcome when metric, baseline or target is missing and it is not marked not measurable (OutcomeCheck)
  ---
  duration_ms: 0.281565
  type: 'test'
  ...
# Subtest: should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
ok 6 - should refuse a not-measurable outcome when no accepted answer names it (OutcomeCheck)
  ---
  duration_ms: 0.229917
  type: 'test'
  ...
# Subtest: should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
ok 7 - should refuse an outcome when provenBy is empty or names an id that is not a DoD item (ProvenBy)
  ---
  duration_ms: 0.199619
  type: 'test'
  ...
# Subtest: should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
ok 8 - should refuse a repeated or bad outcome id when outcomes are checked (OutcomeCheck)
  ---
  duration_ms: 0.330418
  type: 'test'
  ...
# Subtest: should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
ok 9 - should refuse a cost that says there is no clear cost when no answer accepts it (CostCheck)
  ---
  duration_ms: 1.359469
  type: 'test'
  ...
# Subtest: should not crash when the fields have the wrong types
ok 10 - should not crash when the fields have the wrong types
  ---
  duration_ms: 0.284059
  type: 'test'
  ...
# Subtest: should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
ok 11 - should render the 4 sections first and the checklist after them when the DoD has the fields (Render)
  ---
  duration_ms: 1.359179
  type: 'test'
  ...
# Subtest: should render Thai headings when lang is th (Render)
ok 12 - should render Thai headings when lang is th (Render)
  ---
  duration_ms: 0.493003
  type: 'test'
  ...
# Subtest: should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
ok 13 - should render as before when sections is off or the DoD has no why (NewOnly, DodFlag)
  ---
  duration_ms: 0.248413
  type: 'test'
  ...
# Subtest: should list a missing or empty section when ticket-check runs with sections (TicketCheck)
ok 14 - should list a missing or empty section when ticket-check runs with sections (TicketCheck)
  ---
  duration_ms: 0.631485
  type: 'test'
  ...
# Subtest: should read item results from a verify file when it has result lines (PrBody)
ok 15 - should read item results from a verify file when it has result lines (PrBody)
  ---
  duration_ms: 0.308178
  type: 'test'
  ...
# Subtest: should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
ok 16 - should mark an outcome met, not met or not run when its provenBy items passed, failed or did not run (PrBody, VerifyOut)
  ---
  duration_ms: 0.126605
  type: 'test'
  ...
# Subtest: should render the PR top with the 4 sections, the ticket link and a result column whe
... [cut: the output was 8687 chars; the first and last 4000 are kept] ...
12
  type: 'test'
  ...
# Subtest: should name every section heading and the flag in SKILL.md when the docs are read (SkillDocs)
ok 20 - should name every section heading and the flag in SKILL.md when the docs are read (SkillDocs)
  ---
  duration_ms: 0.557169
  type: 'test'
  ...
# Subtest: should register the hook for Bash and MCP tools when hooks.json is read (Guard)
ok 21 - should register the hook for Bash and MCP tools when hooks.json is read (Guard)
  ---
  duration_ms: 0.295192
  type: 'test'
  ...
# Subtest: should list the flag and the guard when README.md and rules/README.md are read (Docs)
ok 22 - should list the flag and the guard when README.md and rules/README.md are read (Docs)
  ---
  duration_ms: 0.205241
  type: 'test'
  ...
# Subtest: should keep evals for the skill when evals.json is read
ok 23 - should keep evals for the skill when evals.json is read
  ---
  duration_ms: 0.106442
  type: 'test'
  ...
# Subtest: should point definition-of-done, dev-workflow and retro to ticket-writer and keep each SKILL.md at most 16,000 bytes when they write issues or PRs (SkillDocs)
ok 24 - should point definition-of-done, dev-workflow and retro to ticket-writer and keep each SKILL.md at most 16,000 bytes when they write issues or PRs (SkillDocs)
  ---
  duration_ms: 0.330698
  type: 'test'
  ...
# Subtest: should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
ok 25 - should keep SKILL.md under 16 KB with the verify name and a quoted description when SKILL.md changes (Docs)
  ---
  duration_ms: 0.761989
  type: 'test'
  ...
# Subtest: should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
ok 26 - should document every CLI command and name only commands that exist when SKILL.md shows one (Docs)
  ---
  duration_ms: 0.365823
  type: 'test'
  ...
# Subtest: should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
ok 27 - should say verify never edits product code, adds no tests and asks before remote runs when SKILL.md sets the rules (Fail, Standalone, Ask)
  ---
  duration_ms: 0.157316
  type: 'test'
  ...
# Subtest: should link only files that exist when SKILL.md links a relative path (Docs edge)
ok 28 - should link only files that exist when SKILL.md links a relative path (Docs edge)
  ---
  duration_ms: 0.159753
  type: 'test'
  ...
# Subtest: should import nothing outside its own folder when the skill code loads (Standalone)
ok 29 - should import nothing outside its own folder when the skill code loads (Standalone)
  ---
  duration_ms: 0.501615
  type: 'test'
  ...
# Subtest: should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
ok 30 - should list verify in the README skills table, install line and flags table with their defaults when the plugin ships it (Docs)
  ---
  duration_ms: 0.170538
  type: 'test'
  ...
# Subtest: should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
ok 31 - should point dev-workflow step 5 at verify and own the VERIFY flag prefix when the repo docs are updated (Docs, Standalone)
  ---
  duration_ms: 0.097459
  type: 'test'
  ...
# Subtest: should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
ok 32 - should take a minor at or above the one verify shipped in and list verify in both plugin descriptions when the plugin is bumped (Docs)
  ---
  duration_ms: 0.140948
  type: 'test'
  ...
# Subtest: should keep evals for the main paths when evals.json lists them (Docs)
ok 33 - should keep evals for the main paths when evals.json lists them (Docs)
  ---
  duration_ms: 0.586596
  type: 'test'
  ...
1..33
# tests 33
# suites 0
# pass 33
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 80.864845
```

## Issues
<!-- verify: written by verify.mjs; sha256:b4cb27898e60f660 -->
env: gh (local shell)
run: node /root/.cache/verify/skills-d9f431e686d5/ticket-why/probes/gh-issues.mjs /home/user/skills
result: pass
expect: exit 0; regex /^9 of 9 issues pass issue-check$/m
```
#36: issue-check ok (1832 chars read back)
#38: issue-check ok (1418 chars read back)
#39: issue-check ok (1237 chars read back)
#40: issue-check ok (1413 chars read back)
#41: issue-check ok (1861 chars read back)
#43: issue-check ok (1497 chars read back)
#44: issue-check ok (2839 chars read back)
#45: issue-check ok (2515 chars read back)
#46: issue-check ok (2604 chars read back)
9 of 9 issues pass issue-check
```

## Tests
<!-- verify: written by verify.mjs; sha256:f87983bcee952140 -->
env: ci (gh check runs)
run: gh api repos/{owner}/{repo}/commits/a669bc222f9dc71b767413b4dbdf439f37bdb77b/check-runs (check "node 24 on ubuntu-latest")
result: pass
expect: exit 0
```
name: node 24 on ubuntu-latest
status: completed
conclusion: success
html_url: https://github.com/PNNutkung/skills/actions/runs/45936897071/job/140309139932
```

## Outcomes: met or not
<!-- verify: written by verify.mjs; sha256:cb17054b12d20f1c -->
| Metric | Today | Target | Proven by | Result |
|---|---|---|---|---|
| Tickets rendered by `dod.mjs` with Why, Expected outcome, If we do nothing and How we know at the top | 0 | every ticket from a DoD session opened by this version | Render, TicketCheck | met |
| New issues and PRs created through `gh`/`glab`/MCP without the 4 sections | not checked | 0 (the hook denies them) | Guard, GuardMcp | met |
| Open issues in the new format | 0 of 9 | 9 of 9 | Issues | met |
