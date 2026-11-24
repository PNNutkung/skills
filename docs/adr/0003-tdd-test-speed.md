---
touches:
  - "skills/paired-agent-tdd/tdd.mjs"
  - "skills/paired-agent-tdd/*.test.mjs"
  - "skills/paired-agent-tdd/test-*.mjs"
  - "skills/zero-trust-review/probelib.mjs"
  - "skills/zero-trust-review/mutate.mjs"
  - "skills/zero-trust-review/note.mjs"
  - "skills/zero-trust-review/mutate.test.mjs"
  - "skills/zero-trust-review/note.test.mjs"
  - "skills/zero-trust-review/probelib.test.mjs"
dod: tdd-test-speed
---
# 3. Speed up the test suite (issue #19)

Date: 2026-11-23
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

T1: keep the CLI as a thin wrapper that runs only when the file is the main script
T2: Watch for global state
T3: Mutation sanity: break one decision in `tdd.mjs` and confirm many tests fail
S1: keeps at least one end-to-end test that runs with that skill's flags unset (rules/flag-defaults-e2e.md:3)

Issue #19 asked to run tdd.mjs in-process in tdd.test.mjs, the critical path of the suite at the time (~94 s suite).

Measured before deciding (main 5bd6985, after PR #22, 4-core cloud container, Node 22): the full suite takes 172 s; tdd.test.mjs 129 s alone, e2e.speed.test.mjs 80 s, e2e.default 22 s, zero-trust-review mutate.test 25 s, note.test 11 s. Inside tdd.test.mjs, tdd.mjs starts 519 times (~60 ms each) and the node stub runner 1,102 times. Without tdd.test.mjs the suite still uses 335 CPU-seconds, so splitting files alone cannot reach 60 s. probelib.mjs always started the runner with node, so a sh stub needed a runtime change. Splitting tdd.test.mjs into 4 parallel files (spike) gave 49 s.

## Decision

### A1: ขอบเขตงาน: เร่งแค่ไหน

Context: หลัง PR #22 ทั้ง suite 172 วิ (เดิม 94). tdd.test 129 วิ, e2e.speed.test 80 วิ, e2e.default 22 วิ. ถ้าเร็วแค่ tdd.test ทั้ง suite ยังเหลือ ~106 วิ (measure.md)
Options considered (the agent's analysis when the question was asked):
- (A) ตาม issue: tdd.mjs in-process อย่างเดียว
  - pro: ตรงกับ issue, แตะโค้ดน้อย
  - con: tdd.test ยัง ~100 วิ, suite ลดแค่ ~20 วิ
- (B) tdd.test ให้สุด: in-process + stub runner เป็น sh + แยกไฟล์ให้วิ่งขนานกัน
  - pro: tdd.test น่าจะเหลือ ~30 วิ, suite ~106 วิ
  - con: เปลี่ยนเยอะขึ้น, ไฟล์ test เพิ่ม
- (C) B + เร่ง e2e.speed และ e2e.default (แยกไฟล์/ขนาน) ใน PR เดียว
  - pro: ใกล้เป้าเดิมของ issue (suite ~35-50 วิ)
  - con: PR ใหญ่กว่า issue #19, e2e ต้องคงเป็น spawn จริง
Recommended: C, เป้าของ issue คือทั้ง suite เร็ว และตอนนี้ e2e.speed คือคอขวดอันถัดไป
Answer: C (B + เร่ง e2e.speed และ e2e.default (แยกไฟล์/ขนาน) ใน PR เดียว)
Trade-off accepted: PR ใหญ่กว่า issue #19, e2e ต้องคงเป็น spawn จริง

### A2: เป้าหมายตัวเลขที่ถือว่า "เสร็จ"

Context: เครื่อง cloud 4 core วัดได้ suite 172 วิ, CI macOS node 26 เป็นตัวช้าสุด
Options considered (the agent's analysis when the question was asked):
- (A) suite บนเครื่อง 4 core <= 60 วิ และ tdd.test <= 40 วิ (วัดก่อน/หลังใส่ใน PR)
  - pro: ตรวจได้ชัด
  - con: ตัวเลขขึ้นกับเครื่อง ต้องวัด 3 รอบเอาค่ากลาง
- (B) แค่ "เร็วขึ้น" มีตัวเลขก่อน/หลังใน PR ไม่ตั้งเพดาน
  - pro: ไม่ติดเกณฑ์ที่ขึ้นกับเครื่อง
  - con: ไม่มีเส้นชัด ตัดสินยากว่าพอหรือยัง
- (C) วัดที่ CI: เวลา test step macOS ลดลง >= 40%
  - pro: เป็นเวลาที่รอจริงตอน PR
  - con: CI แกว่ง, ต้องรอหลาย run
Recommended: A, ตรวจได้ในเครื่องเดียวกับที่วัดก่อนเริ่ม และรายงานเวลา CI ประกอบ
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A3: เทสต์ที่ต้องยังเรียก CLI จริง (spawn)

Context: issue ข้อ 3-4 บอกให้เก็บไว้ "a handful" + parity test. tdd.test.mjs:179 (ZT_DIR หาย) และ test env poisoning ต้องเป็น process ใหม่
Options considered (the agent's analysis when the question was asked):
- (A) เก็บ spawn ไว้ ~5-8 test (exit code, stdin, ZT_DIR, env poisoning, usage) + parity test ที่เทียบ spawn กับ in-process ทุก subcommand
  - pro: เร็ว และยังพิสูจน์ว่า CLI เหมือนเดิม
  - con: parity ครอบแค่ตัวอย่าง
- (B) ทุก test วิ่ง in-process ตอนปกติ แต่มี flag ให้วิ่ง spawn ทั้งไฟล์ (เช่นใน CI 1 job)
  - pro: ครอบ CLI ครบทุก test
  - con: ต้องมี flag ใหม่ และ CI job นั้นช้าเท่าเดิม
Recommended: A, ตรงกับ issue และไม่ต้องมี flag ใหม่
Answer: A (เก็บ spawn ไว้ ~5-8 test (exit code, stdin, ZT_DIR, env poisoning, usage) + parity test ที่เทียบ spawn กับ in-process ทุก subcommand)
Trade-off accepted: parity ครอบแค่ตัวอย่าง

### A4: Feature flag

Context: issue บอก "Test-only plus an export: no runtime behavior change, no flag needed"
Options considered (the agent's analysis when the question was asked):
- (A) ไม่มี flag: เปลี่ยนแค่ test + export, CLI เหมือนเดิมทุก byte
  - pro: ไม่มี flag ที่ไม่มีใครใช้
  - con: ถ้า in-process ผิดพลาด ไม่มีสวิตช์ปิด (แต่ไม่กระทบผู้ใช้ เพราะผู้ใช้เรียก CLI)
- (B) flag PTDD_TEST_INPROCESS_ENABLED (default true) ให้ test กลับไปใช้ spawn ได้
  - pro: ย้อนกลับได้ทันทีถ้า in-process เพี้ยน
  - con: เป็น flag สำหรับ test เท่านั้น ต้องเข้า README Flags table และ e2e default rule
Recommended: A, ผู้ใช้ไม่เห็นการเปลี่ยนแปลง และ parity test จับความเพี้ยนได้
Answer: A (ไม่มี flag: เปลี่ยนแค่ test + export, CLI เหมือนเดิมทุก byte)
Trade-off accepted: ถ้า in-process ผิดพลาด ไม่มีสวิตช์ปิด (แต่ไม่กระทบผู้ใช้ เพราะผู้ใช้เรียก CLI)

### A5: Backward compatibility ของ CLI

Context: issue: "CLI behavior must stay byte-identical". tdd.mjs ใช้ process.exit, process.env.ZT_RUN_DIR (tdd.mjs:111), ตัวแปร module (counter, tdd.mjs:68)
Options considered (the agent's analysis when the question was asked):
- (A) stdout, stderr, exit code ของ CLI เหมือนเดิมทุก byte; ตรวจด้วย parity test + test เดิมทั้งหมดผ่าน
  - pro: พิสูจน์ได้ในโค้ด
  - con: output ที่มีเวลา/pid ต้อง normalize ก่อนเทียบ
- (B) เหมือนเดิมเฉพาะ stdout JSON และ exit code; ข้อความ stderr เปลี่ยนได้
  - pro: ทำง่ายกว่า
  - con: workflow.js และ agent อ่าน stderr อยู่บางจุด อาจพัง
Recommended: A, ตามที่ issue เขียนไว้
Answer: A (stdout, stderr, exit code ของ CLI เหมือนเดิมทุก byte; ตรวจด้วย parity test + test เดิมทั้งหมดผ่าน)
Trade-off accepted: output ที่มีเวลา/pid ต้อง normalize ก่อนเทียบ

### A6: Non-goals

Context: tdd.mjs เองก็ spawn testprobe.mjs/mutate.mjs ที่ gate (216 ครั้งใน test) แต่นั่นคือ runtime behavior. zt mutate.test 26 วิ, note.test 13 วิ ก็ช้า
Options considered (the agent's analysis when the question was asked):
- (A) ไม่ทำ: เปลี่ยนการ spawn testprobe/mutate ใน tdd.mjs, เปลี่ยน CI matrix, ไฟล์ test ของ zero-trust-review
  - pro: PR โฟกัส ไม่เปลี่ยนพฤติกรรมตอนรันจริง
  - con: zt mutate/note ยังช้าอยู่ (ทำทีหลังได้)
- (B) รวม zt mutate.test และ note.test ด้วย
  - pro: suite เร็วขึ้นอีก ~10 วิ
  - con: PR ใหญ่ขึ้น, คนละ skill
Recommended: A, แยกเป็น issue ใหม่ถ้าต้องการ
Answer: agree
Trade-off accepted: none recorded (the answer picks no single option)

### A7: ที่ verify

Context: cloud container 4 core ใช้วัดก่อนเริ่มแล้ว; CI 8 job (Node 22/24/26 Ubuntu+macOS, asdf, WSL)
Options considered (the agent's analysis when the question was asked):
- (A) cloud container (วัด 3 รอบ ก่อน/หลัง) + CI 8/8 เขียว + เทียบเวลา CI test step ก่อน/หลัง
  - pro: ทำได้เลยไม่ต้องใช้เครื่อง Nut
  - con: ไม่ได้ลองบนเครื่อง Nut
- (B) A + รันบน WSL ของ Nut ด้วย
  - pro: เห็นเวลาบนเครื่องจริง
  - con: ต้องใช้ Remote Control และเวลา Nut
Recommended: A, CI มี WSL job อยู่แล้ว
Answer: A (cloud container (วัด 3 รอบ ก่อน/หลัง) + CI 8/8 เขียว + เทียบเวลา CI test step ก่อน/หลัง)
Trade-off accepted: ไม่ได้ลองบนเครื่อง Nut

### A8: ระดับเทสต์

Context: workflow บอก unit, integration, E2E, fuzz. งานนี้คือเปลี่ยนตัวเทสต์เอง
Options considered (the agent's analysis when the question was asked):
- (A) unit: main() คืน {code, stdout, stderr} และไม่ทิ้ง state (env/cwd/ZT_RUN_DIR) ข้ามครั้ง; integration: test เดิมทั้งหมด in-process; E2E: CLI ที่ spawn ไว้ + parity; fuzz: argv สุ่ม (flag ผิด/ค่าแปลก) เทียบ spawn กับ in-process; mutation sanity: ทำลาย 1 decision ใน tdd.mjs แล้วต้อง fail หลาย test (บันทึกผลใน PR)
  - pro: ครบตาม workflow และตาม issue ข้อ 5
  - con: fuzz ที่ spawn ต้องจำกัดจำนวนรอบไม่ให้ช้า
- (B) ไม่มี fuzz, mutation sanity ทำมือครั้งเดียว
  - pro: เร็วกว่า
  - con: ไม่ครบตาม workflow
Recommended: A, fuzz จำกัด ~30 เคสพอ
Answer: A (unit: main() คืน {code, stdout, stderr} และไม่ทิ้ง state (env/cwd/ZT_RUN_DIR) ข้ามครั้ง; integration: test เดิมทั้งหมด in-process; E2E: CLI ที่ spawn ไว้ + parity; fuzz: argv สุ่ม (flag ผิด/ค่าแปลก) เทียบ spawn กับ in-process; mutation sanity: ทำลาย 1 decision ใน tdd.mjs แล้วต้อง fail หลาย test (บันทึกผลใน PR))
Trade-off accepted: fuzz ที่ spawn ต้องจำกัดจำนวนรอบไม่ให้ช้า

### A9: ตอนแยกไฟล์และย้ายเป็น in-process จะยอมให้ test หายหรือรวมกันไหม

Context: tdd.test 83 test, e2e.speed 19, e2e.default 24. บาง test ทำแบบเดียวกันซ้ำๆ เพื่อเรียก CLI
Options considered (the agent's analysis when the question was asked):
- (A) เก็บทุก test ไว้ครบ: ชื่อเหมือนเดิม และจำนวนรวม >= เดิม (มีสคริปต์เทียบรายชื่อก่อน/หลัง)
  - pro: มั่นใจว่าไม่มีอะไรหลุด
  - con: test ที่ซ้ำก็ยังอยู่
- (B) ยอมให้รวม test ที่ซ้ำกันได้ แต่ต้องบอกในเอกสาร PR ว่ารวมอันไหน
  - pro: ไฟล์สั้นลง
  - con: รีวิวยากขึ้น มีโอกาสที่ coverage หาย
Recommended: A, งานนี้เรื่องความเร็ว ไม่ใช่ลบ test
Answer: A (เก็บทุก test ไว้ครบ: ชื่อเหมือนเดิม และจำนวนรวม >= เดิม (มีสคริปต์เทียบรายชื่อก่อน/หลัง))
Trade-off accepted: test ที่ซ้ำก็ยังอยู่

### A10: stub runner เป็น sh ทำไม่ได้ถ้าไม่แตะ runtime

Context: zero-trust-review/probelib.mjs:127 เรียก runner ด้วย spawn(process.execPath, [runner, ...]) เสมอ runner จึงต้องเป็นไฟล์ node (DoD TddFast เขียนว่า sh)
Options considered (the agent's analysis when the question was asked):
- (A) คง stub เป็น node (ไม่แตะ runtime) ตัดคำว่า sh ออกจาก TddFast
  - pro: ไม่เปลี่ยนพฤติกรรมตอนรันจริง ตรงกับ Q4/Q5
  - con: เสีย CPU กับการเปิด node stub ~35 วิ ต่อรอบ tdd.test
- (B) แก้ probelib: ถ้า runner ไม่ใช่ .mjs/.js ให้ exec ตรง แล้วใช้ stub sh
  - pro: ประหยัด CPU ~30 วิ
  - con: เปลี่ยน runtime ของ zero-trust-review (ขัด Q6 non-goal และ "no runtime behavior change")
Recommended: A
Answer: B (แก้ probelib: ถ้า runner ไม่ใช่ .mjs/.js ให้ exec ตรง แล้วใช้ stub sh)
Trade-off accepted: เปลี่ยน runtime ของ zero-trust-review (ขัด Q6 non-goal และ "no runtime behavior change")

### A11: เป้า suite <= 60 วิ เป็นไปไม่ได้ในขอบเขตที่ตกลง

Context: suite ที่ไม่รวม tdd.test ใช้ CPU 335 วิ (user+sys) ใน 108 วิ บน 4 core จึงต้องใช้อย่างน้อย ~84 วิ แม้แยกไฟล์ขนานแล้ว (e2e.speed ต้องเรียก CLI จริง, zt test เป็น non-goal). spike แยก tdd.test เป็น 4 ไฟล์: 129 -> 49 วิ ก่อนทำ in-process
Options considered (the agent's analysis when the question was asked):
- (A) tdd.test (ทุกไฟล์) <= 40 วิ; suite ไม่ตั้งเพดาน รายงานก่อน/หลัง
  - pro: ไม่ติดเกณฑ์ที่ทำไม่ได้
  - con: suite ไม่มีเส้นชัด
- (B) คงเป้า 60 วิ และขยายขอบเขต: ลด CPU ของ e2e.speed (in-process บางส่วน) และ zt mutate/note
  - pro: ได้ suite เร็วจริง
  - con: ขัด Q1 (e2e ยังเรียกจริง) และ Q6, PR ใหญ่มาก
- (C) tdd.test <= 40 วิ และ suite <= 120 วิ (จาก 172) บนเครื่อง 4 core ค่ากลาง 3 รอบ
  - pro: มีเส้นชัดที่ทำได้จริง
  - con: ต่ำกว่าเป้าเดิมใน issue (~35 วิ ซึ่งวัดก่อน PR #22)
Recommended: C
Answer: B (คงเป้า 60 วิ และขยายขอบเขต: ลด CPU ของ e2e.speed (in-process บางส่วน) และ zt mutate/note)
Trade-off accepted: ขัด Q1 (e2e ยังเรียกจริง) และ Q6, PR ใหญ่มาก

### A12: probelib จะ exec runner ตรงเมื่อไร (ต่อจาก A10)

Context: probelib.mjs:127 spawn(process.execPath, [runner,...]) เสมอ; runner จริงทุกตัว (sandbox-run.mjs, direct-run.mjs) เป็น .mjs
Options considered (the agent's analysis when the question was asked):
- (A) runner ที่นามสกุลไม่ใช่ .mjs/.js/.cjs ให้ spawn ตรง (ต้องมี exec bit); .mjs/.js/.cjs ใช้ node เหมือนเดิม; ไม่มี flag
  - pro: runner จริงทำงานเหมือนเดิมทุก byte, test ใช้ stub sh ได้
  - con: เพิ่มทางใหม่ใน runtime ที่ใช้แค่ใน test
- (B) เหมือน A แต่อยู่หลัง flag ZT_RUNNER_EXEC_ENABLED (default false)
  - pro: ปิดได้ทันที
  - con: flag ที่ผู้ใช้ไม่เคยต้องเปิด และ test ต้องตั้ง flag ทุกครั้ง
Recommended: A, ผู้ใช้จริงไม่มีทางเข้าทางใหม่นี้เพราะ runner จริงเป็น .mjs
Answer: A (runner ที่นามสกุลไม่ใช่ .mjs/.js/.cjs ให้ spawn ตรง (ต้องมี exec bit); .mjs/.js/.cjs ใช้ node เหมือนเดิม; ไม่มี flag)
Trade-off accepted: เพิ่มทางใหม่ใน runtime ที่ใช้แค่ใน test

### A13: ลด CPU ของ e2e.speed / e2e.default อย่างไร

Context: e2e.speed 74 วิ: direct-run.mjs 779 ครั้ง, fixture test (test_slug.mjs, test_title.mjs) 1,240 ครั้ง, tdd.mjs 204 ครั้ง. cmd ของ fixture คือ 'node --test {file}' (e2e.speed.test.mjs:67) ซึ่งเปิด node 2 ตัวต่อ 1 ไฟล์ test
Options considered (the agent's analysis when the question was asked):
- (A) เปลี่ยน cmd เป็น 'node {file}' (node 1 ตัวต่อไฟล์) ทุกอย่างอื่นยังจริง
  - pro: ลด process ของ fixture ได้ราวครึ่ง ไม่เสียความสมจริง
  - con: อาจยังไม่ถึง 60 วิ
- (B) A ก่อน วัด ถ้ายังเกิน 60 วิ ให้ fixture ส่วนใหญ่เป็น sh (เหลือ test JS จริงอย่างน้อย 1 ใน e2e.default)
  - pro: ถึงเป้าได้แน่กว่า
  - con: e2e ส่วนใหญ่ไม่ได้รัน JS จริงแล้ว
- (C) ลด mutation.max ใน fixture plan จาก 10 เป็น 4
  - pro: รันน้อยลงตรงๆ
  - con: ทดสอบ mutation ในขนาดจริงน้อยลง
Recommended: B
Answer: B (A ก่อน วัด ถ้ายังเกิน 60 วิ ให้ fixture ส่วนใหญ่เป็น sh (เหลือ test JS จริงอย่างน้อย 1 ใน e2e.default))
Trade-off accepted: e2e ส่วนใหญ่ไม่ได้รัน JS จริงแล้ว

### A14: e2e ยังเรียก tdd.mjs ผ่าน CLI จริงไหม

Context: tdd.mjs 204 ครั้งใน e2e.speed (~12 วิ CPU). A11 ยอมให้ e2e.speed เป็น in-process บางส่วน
Options considered (the agent's analysis when the question was asked):
- (A) e2e ทั้งหมดยังเรียก tdd.mjs จริง
  - pro: E2E ยังเป็น E2E จริง
  - con: ไม่ได้ส่วนลด ~12 วิ
- (B) e2e.speed เรียก main() in-process; e2e.default (ไฟล์ flags: defaults) ยังเรียก CLI จริง
  - pro: ลด CPU อีก ~12 วิ
  - con: e2e.speed ไม่จับปัญหาระดับ process (exit, env)
Recommended: A, ส่วนลดน้อยเทียบกับสิ่งที่เสีย
Answer: A (e2e ทั้งหมดยังเรียก tdd.mjs จริง)
Trade-off accepted: ไม่ได้ส่วนลด ~12 วิ

### A15: zt mutate.test / note.test ทำแบบไหน

Context: mutate.test 25 วิ: mutate.mjs 79 ครั้ง, stub runner node 383 ครั้ง. note.test 11 วิ: spawn note.mjs ทุก test (note.test.mjs:24), test env poisoning 5 วิ
Options considered (the agent's analysis when the question was asked):
- (A) แบบเดียวกับ tdd.mjs: export main ของ mutate.mjs/note.mjs, test เรียก in-process, เก็บ test CLI จริงไว้ (exit code, env poisoning) + parity; stub runner เป็น sh
  - pro: ลด CPU มากสุด, ใช้แบบเดียวกันทั้ง repo
  - con: แตะ runtime ของ zt สองไฟล์ (export อย่างเดียว)
- (B) แค่ stub runner เป็น sh, ไม่ทำ in-process
  - pro: แตะน้อย
  - con: note.test แทบไม่ลด
Recommended: A
Answer: A (แบบเดียวกับ tdd.mjs: export main ของ mutate.mjs/note.mjs, test เรียก in-process, เก็บ test CLI จริงไว้ (exit code, env poisoning) + parity; stub runner เป็น sh)
Trade-off accepted: แตะ runtime ของ zt สองไฟล์ (export อย่างเดียว)

### A16: non-goals ใหม่ (A11 ขยายขอบเขต)

Context: Q6 เดิมกัน zt test ออก; ตอนนี้ mutate/note เข้ามาแล้ว. ที่เหลือ: testprobe.test 10 วิ, proofcheck 6 วิ, sandbox-run 5 วิ
Options considered (the agent's analysis when the question was asked):
- (A) ยังไม่ทำ: การ spawn testprobe/mutate ใน gate ของ tdd.mjs, CI matrix, zt test อื่นนอกจาก mutate/note
  - pro: PR ไม่บานเกินจำเป็น
  - con: suite อาจยังเกิน 60 วิ ถ้า B ใน Q13 ไม่พอ
- (B) zt test ทุกไฟล์ที่ช้า > 5 วิ อยู่ในขอบเขต
  - pro: โอกาสถึง 60 วิ สูงขึ้น
  - con: PR ใหญ่มาก
Recommended: A, ถ้าวัดแล้วยังไม่ถึง 60 วิ จะกลับมาถามอีกรอบพร้อมตัวเลข
Answer: A (ยังไม่ทำ: การ spawn testprobe/mutate ใน gate ของ tdd.mjs, CI matrix, zt test อื่นนอกจาก mutate/note)
Trade-off accepted: suite อาจยังเกิน 60 วิ ถ้า B ใน Q13 ไม่พอ

### A17: ยืนยัน DoD 14 ข้อ

Context: dod.mjs check ok (tdd-test-speed.md)
Options considered (the agent's analysis when the question was asked):
- (A) ยืนยัน แล้วทำ prototype ต่อ
  - pro: ไปขั้นถัดไปได้
  - con: ถ้ามีข้อผิดต้องกลับมาแก้ DoD ทีหลัง
- (B) แก้บางข้อก่อน
  - pro: DoD ตรงขึ้น
  - con: ช้าลงอีกรอบ
Recommended: A
Answer: A (ยืนยัน แล้วทำ prototype ต่อ)
Trade-off accepted: ถ้ามีข้อผิดต้องกลับมาแก้ DoD ทีหลัง

### A18: prototype โอเคไหม

Context: https://claude.ai/artifact/LnnpMZi3XCiTtdnkyq7PBy
Options considered (the agent's analysis when the question was asked):
- (A) โอเค ไป design
  - pro: เร็ว
  - con: จุดเข้าใจผิดไปเจอตอน design
- (B) แก้ก่อน
  - pro: ภาพตรง
  - con: ช้าลง
Recommended: A
Answer: A (โอเค ไป design)
Trade-off accepted: จุดเข้าใจผิดไปเจอตอน design

### A19: design: แยก main() ออกจาก CLI และจัดการ global state อย่างไร

Context: tdd.mjs เรียก fail() -> process.exit จากหลายจุด (tdd.mjs:35), เขียน process.stdout/stderr ตรง 9 จุด, ตั้ง process.env.ZT_RUN_DIR (tdd.mjs:111), let counter (tdd.mjs:68). mutate.mjs ไม่มี isMain (mutate.mjs:171), note.mjs มี isMain แล้ว (note.mjs:162). worker_threads วัดได้ 43 ms/ครั้ง เทียบ spawn 60 ms
Options considered (the agent's analysis when the question was asked):
- (A) Dependency injection เต็มรูป: ส่ง {env, out, err} ผ่าน ctx ทุกฟังก์ชัน, fail() throw ExitError แทน process.exit
  - pro: โค้ดสะอาดสุด ไม่มีการแตะ global ระหว่างรัน
  - con: diff ใหญ่ในสามไฟล์ runtime, เสี่ยงทำ output เพี้ยนจากเดิม
- (B) Shim ครอบ: main(argv, {env, cwd}) สลับ process.env/argv ชั่วคราว, ดัก stdout/stderr write, ให้ process.exit throw ExitSignal, คืนค่าทุกอย่างใน finally; โค้ดข้างในไม่เปลี่ยน (ยกเว้น counter reset และ ZT_RUN_DIR อยู่ใน env ที่สลับ)
  - pro: diff เล็ก, path โค้ดเดียวกับ CLI จึง byte-identical ง่าย
  - con: test ในไฟล์เดียวกันต้องรันทีละอัน (เป็นแบบนี้อยู่แล้ว), ถ้ามี async ค้างหลัง main คืนค่าจะรั่ว -> ต้องมี test NoLeak
- (C) worker_threads: รัน tdd.mjs ใน Worker ใหม่ทุกครั้ง ไม่แก้ runtime เลย
  - pro: ไม่แตะโค้ด runtime, แยก state ได้จริง
  - con: 43 ms/ครั้ง ประหยัดแค่ ~17 ms จาก 60 ms, ไม่ถึงเป้า 40 วิ
Recommended: B
Answer: A (Dependency injection เต็มรูป: ส่ง {env, out, err} ผ่าน ctx ทุกฟังก์ชัน, fail() throw ExitError แทน process.exit)
Trade-off accepted: diff ใหญ่ในสามไฟล์ runtime, เสี่ยงทำ output เพี้ยนจากเดิม

### A20: อัปเดต issue #19 ตาม DoD ไหม

Context: definition-of-done skill ขั้น 5-6 เขียน description ของ ticket ใหม่เป็น checklist และต้องให้ Nut รัน dod.mjs approve เองใน terminal; ADR (ขั้น 7) จะ commit ใน PR
Options considered (the agent's analysis when the question was asked):
- (A) เขียน description ของ issue #19 ใหม่ (เก็บข้อความเดิมครบ) + ADR ใน PR; Nut รัน approve เอง
  - pro: issue ตรงกับงานจริง (ขอบเขตขยายจากเดิมมาก)
  - con: Nut ต้องรันคำสั่งเอง 1 ครั้ง
- (B) ไม่แก้ issue, ใส่ DoD ใน ADR และ PR body แทน
  - pro: ไม่ต้องรันอะไร
  - con: issue ยังเขียนขอบเขตเดิม (แค่ tdd.test)
Recommended: A, ขอบเขตเปลี่ยนไปเยอะจาก issue เดิม
Answer: A (เขียน description ของ issue #19 ใหม่ (เก็บข้อความเดิมครบ) + ADR ใน PR; Nut รัน approve เอง)
Trade-off accepted: Nut ต้องรันคำสั่งเอง 1 ครั้ง

### A21: จะโพสต์ description นี้ลง issue #19 ไหม

Context: ticket-new.md (description ใหม่ของ issue #19) ผ่าน ticket-check แล้ว และ Nut รัน approve แล้ว
Options considered (the agent's analysis when the question was asked):
- (A) approve แล้วโพสต์ตามนี้ เสร็จแล้วอ่านกลับมาเทียบ
  - pro: issue ตรงกับงานจริง
  - con: description เดิมถูกเขียนทับ (แต่ข้อความเดิมยังอยู่ครบใต้ Background)
- (B) แก้ข้อความบางส่วนก่อน
  - pro: ได้ถ้อยคำตามที่ต้องการ
  - con: ต้องขอ approve ใหม่อีกรอบ
Recommended: A
Answer: A (approve แล้วโพสต์ตามนี้ เสร็จแล้วอ่านกลับมาเทียบ)
Trade-off accepted: description เดิมถูกเขียนทับ (แต่ข้อความเดิมยังอยู่ครบใต้ Background)

### A22: suite 74 วิ ยังเกินเป้า 60 วิ จะทำอย่างไรต่อ

Context: ทำครบทุกข้อใน DoD แล้ว: suite 172 -> 74 วิ (ค่ากลาง 3 รอบ, 2,778 ผ่าน), CPU 230 วิ บน 4 core จึงติดที่ CPU ไม่ใช่ไฟล์ช้าไฟล์เดียว. ที่เหลือคือการเปิด process ที่ DoD สั่งให้คงไว้ (direct-run.mjs ~990 ครั้งใน e2e, tdd.mjs ใน e2e 319) และ tdd.mjs gate ที่ spawn testprobe/mutate (~550 ครั้ง, เป็น non-goal Q16)
Options considered (the agent's analysis when the question was asked):
- (A) ยอมรับ ~74 วิ (ลด 57%) แก้เป้าใน DoD เป็น suite <= 80 วิ แล้วไป verify + retro
  - pro: จบงานได้เลย ไม่เปลี่ยน runtime เพิ่ม
  - con: ไม่ถึง 60 วิ ตามที่ตั้งไว้
- (B) ทำต่อ: ให้ tdd.mjs gate เรียก testprobe/mutate แบบ in-process (ตอนนี้เป็น non-goal) คาดว่าลดอีก ~10-15 วิ
  - pro: มีโอกาสเข้าใกล้ 60 วิ
  - con: เปลี่ยนพฤติกรรมตอนรันจริง: probe ไม่ได้แยก process แล้ว (timeout/budget/crash กระทบ tdd.mjs)
- (C) ทำต่อแบบ test อย่างเดียว: ลด mutation max/budget ใน fixture ที่ไม่ได้ assert จำนวน และลด sleep ใน zproc
  - pro: ไม่แตะ runtime
  - con: น่าจะลดได้แค่ ~5 วิ และ test ครอบคลุมน้อยลง
Recommended: A
Answer: A (ยอมรับ ~74 วิ (ลด 57%) แก้เป้าใน DoD เป็น suite <= 80 วิ แล้วไป verify + retro)
Trade-off accepted: ไม่ถึง 60 วิ ตามที่ตั้งไว้

## Consequences

The suite target is 80 s on 4 cores with tdd.test.mjs under 40 s. It started at 60 s; after every other item was done the suite took 74 s, held by the CPU (about 230 CPU-seconds on 4 cores) rather than by one slow file, so the target moved to 80 s (A22). tdd.mjs, mutate.mjs and note.mjs take their environment and output through an injected context and no longer exit from inside; their CLIs stay byte-identical, checked by parity and fuzz tests that run both ways. probelib runs a runner that is not a .mjs/.js/.cjs file directly, so tests can use sh stubs; real runners are unchanged. The e2e tests still start the real CLI.

Trade-offs we accepted:

- A1: PR ใหญ่กว่า issue #19, e2e ต้องคงเป็น spawn จริง
- A3: parity ครอบแค่ตัวอย่าง
- A4: ถ้า in-process ผิดพลาด ไม่มีสวิตช์ปิด (แต่ไม่กระทบผู้ใช้ เพราะผู้ใช้เรียก CLI)
- A5: output ที่มีเวลา/pid ต้อง normalize ก่อนเทียบ
- A7: ไม่ได้ลองบนเครื่อง Nut
- A8: fuzz ที่ spawn ต้องจำกัดจำนวนรอบไม่ให้ช้า
- A9: test ที่ซ้ำก็ยังอยู่
- A10: เปลี่ยน runtime ของ zero-trust-review (ขัด Q6 non-goal และ "no runtime behavior change")
- A11: ขัด Q1 (e2e ยังเรียกจริง) และ Q6, PR ใหญ่มาก
- A12: เพิ่มทางใหม่ใน runtime ที่ใช้แค่ใน test
- A13: e2e ส่วนใหญ่ไม่ได้รัน JS จริงแล้ว
- A14: ไม่ได้ส่วนลด ~12 วิ
- A15: แตะ runtime ของ zt สองไฟล์ (export อย่างเดียว)
- A16: suite อาจยังเกิน 60 วิ ถ้า B ใน Q13 ไม่พอ
- A17: ถ้ามีข้อผิดต้องกลับมาแก้ DoD ทีหลัง
- A18: จุดเข้าใจผิดไปเจอตอน design
- A19: diff ใหญ่ในสามไฟล์ runtime, เสี่ยงทำ output เพี้ยนจากเดิม
- A20: Nut ต้องรันคำสั่งเอง 1 ครั้ง
- A21: description เดิมถูกเขียนทับ (แต่ข้อความเดิมยังอยู่ครบใต้ Background)
- A22: ไม่ถึง 60 วิ ตามที่ตั้งไว้

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:433ffe6ade7efd62 -->

- [ ] InProc (happy, fail, edge): tdd.mjs exports its subcommand entry (main(argv, {env, cwd}) returning {code, stdout, stderr}); the CLI is a thin wrapper that runs only when tdd.mjs is the main script (T1)
- [ ] NoLeak (happy, fail, edge): an in-process call leaves no global state behind: process.exit is never called from main, process.env (ZT_RUN_DIR, flags, TMPDIR, ZT_MARKER_DIR) and cwd are the same before and after, module caches do not carry one call into the next (T2)
- [ ] TddFast (happy, fail, edge): tdd.test runs tdd.mjs in-process, its stub sandbox runners are sh scripts (run directly, see RunnerExec), and it is split into several files that node --test runs in parallel (A10)
- [ ] E2ESplit (happy, fail, edge): e2e.speed.test and e2e.default.test are split so their tests run in parallel and still spawn the real tdd.mjs CLI and direct-run runner; their fixture command becomes 'node {file}' (one node per test file instead of two); if the suite is still over 60 s after that, most fixtures become sh, keeping at least one real JS fixture test in e2e.default (A13)
- [ ] Target (happy, fail, edge): on the 4-core cloud container (median of 3 runs): full suite <= 80 s and all tdd.test files <= 40 s; the PR reports before/after and the CI test step times (A22)
- [ ] Spawned (happy, fail, edge): 5-8 tests still spawn the CLI (exit codes, missing ZT_DIR, env poisoning exit 64, usage), plus a parity test that runs every subcommand both spawned and in-process (A3)
- [ ] Parity (happy, fail, edge): spawned and in-process give byte-identical stdout, stderr and exit code (after normalizing times, pids and temp paths) (A5)
- [ ] Fuzz (happy, fail, edge): a fuzz test (about 30 random argv cases: unknown flags, missing values, odd values) gives the same result spawned and in-process (A8)
- [ ] Mutant (happy, fail, edge): mutation sanity: breaking one decision in tdd.mjs makes many tdd tests fail; the result is recorded in the PR (T3)
- [ ] FlagRule (happy, fail, edge): rules/checks/flag-defaults-e2e.mjs still passes after the split: paired-agent-tdd keeps a spawned e2e test with its flags unset (S1)
- [ ] NoLoss (happy, fail, edge): no test is lost or merged: every test name before the change still exists after it and the total count is >= before; a script compares the name lists (A9)
- [ ] E2EReal (happy, fail, edge): every e2e test still spawns the real tdd.mjs CLI (no in-process call in e2e files) (A14)
- [ ] RunnerExec (happy, fail, edge): probelib.runIn spawns a runner whose name does not end in .mjs, .js or .cjs directly (it needs the exec bit); a .mjs/.js/.cjs runner still runs under node exactly as before; no flag (A12)
- [ ] ZtInProc (happy, fail, edge): zero-trust-review mutate.mjs and note.mjs export their entry like tdd.mjs; mutate.test and note.test call it in-process, keep spawned CLI tests (exit codes, env poisoning) plus a parity test, and use sh stub runners (A15)

- feature flag: none: test changes, exports, and probelib running a non-.mjs runner directly (no runtime change for .mjs runners) (A4)
- backward compat: CLI stdout, stderr and exit code byte-identical; checked by the parity test and every existing test (A5)
- non-goals: changing how tdd.mjs spawns testprobe/mutate at the gates, CI matrix changes, zero-trust-review test files other than mutate.test and note.test (A16)
- verify env: cloud container, 3 runs before/after; CI 8/8 green; CI test step times compared (A7)
- test tiers: unit, integration, e2e, fuzz, mutation sanity (A8)
