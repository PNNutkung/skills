---
touches:
  - "skills/dev-workflow/**"
  - "hooks/workflow-guard.mjs"
  - "hooks/workflow-guard.test.mjs"
  - "hooks/hooks.json"
  - "README.md"
  - "rules/README.md"
  - ".claude-plugin/*.json"
  - "docs/adr/**"
dod: dev-workflow
---
# 4. Dev workflow

Date: 2026-11-23
Status: Accepted

## Context

Quoted verbatim from the ticket and the specs this decision rests on:

(no ticket or spec quotes)

## Decision

### A1: จะฝัง workflow 6 ขั้นเข้า plugin แบบไหน

Context: plugin มี skill ขั้น 1, 4, 6 แล้ว แต่ขั้น 2 prototype, 3 design, 5 verify ทำด้วยมือทุก thread และไม่มีจุดเริ่มที่บอกลำดับ (options.md)
Options considered (the agent's analysis when the question was asked):
- (A) skill ใหม่บาง ๆ dev-workflow คุมลำดับ ส่งต่อ skill เดิม เติมขั้นที่ขาด workflow.mjs เป็น gate, hook ผ่าน WORKFLOW_GUARD_ENABLED ค่าเริ่ม false
  - pro: ใช้ได้ทั้ง plugin และ npx skills, จุดเริ่มเดียว, บังคับด้วยโค้ด
  - con: โค้ดและ test เพิ่ม, มีไฟล์สถานะเพิ่ม
- (B) ข้อความอย่างเดียว rules/workflow.md + slash command /workflow
  - pro: เล็กสุด เร็ว
  - con: ไม่มีอะไรบังคับ, npx skills ไม่ได้ rules และ command
- (C) กระจายเข้า skill เดิม (definition-of-done ทำ prototype และ design)
  - pro: ไม่มี skill ใหม่, ADR ครั้งเดียว
  - con: SKILL.md ของ DoD เกินขนาด, ปนหน้าที่, ไม่มีภาพรวม
Recommended: A, ปิดช่องขั้น 2, 3, 5 โดยไม่แตะ skill ที่ใช้ได้ดีอยู่แล้ว
Answer: A (skill ใหม่บาง ๆ dev-workflow คุมลำดับ ส่งต่อ skill เดิม เติมขั้นที่ขาด workflow.mjs เป็น gate, hook ผ่าน WORKFLOW_GUARD_ENABLED ค่าเริ่ม false)
Trade-off accepted: โค้ดและ test เพิ่ม, มีไฟล์สถานะเพิ่ม

### A2: ลำดับขั้น

Context: thread ก่อน ๆ ย้อนกลับ: spike หลัง grill ล้มคำตอบ (tdd-test-speed Q11), prototype และ design แยกสองรอบ, ADR รอ design, จองเครื่อง verify หลังเปิด PR (options.md)
Options considered (the agent's analysis when the question was asked):
- (A) 0 รับงาน+ข้อเท็จจริง+spike โดย sub-agent, 1 grill DoD (จอง env verify), 2 concept board (concept + design 2-3 แบบ รอบเดียว), 3 ล็อก ADR+ticket ครั้งเดียว, 4 TDD+draft PR, 5 verify+review อิสระ, 6 retro ก่อน merge
  - pro: ตัดรอบอนุมัติสองรอบ, ไม่มี spike ล้มคำตอบ, ADR ไม่เขียนซ้ำ
  - con: prototype หลายแบบพร้อมกัน แต่ละแบบละเอียดน้อยลง
- (B) คง 6 ขั้นเดิม ย้าย ADR+ticket ไปหลัง design
  - pro: เปลี่ยนน้อย คุ้นมือ
  - con: ยังอนุมัติ prototype กับ design แยกสองรอบ
- (C) design ก่อน prototype แล้ว prototype เฉพาะแบบที่เลือก
  - pro: prototype ละเอียดตรงของจริง
  - con: เลือก design ก่อนเห็นภาพ
Recommended: A, ลดรอบย้อนกลับที่เจอจริง
Answer: A (0 รับงาน+ข้อเท็จจริง+spike โดย sub-agent, 1 grill DoD (จอง env verify), 2 concept board (concept + design 2-3 แบบ รอบเดียว), 3 ล็อก ADR+ticket ครั้งเดียว, 4 TDD+draft PR, 5 verify+review อิสระ, 6 retro ก่อน merge)
Trade-off accepted: prototype หลายแบบพร้อมกัน แต่ละแบบละเอียดน้อยลง

### A3: retro ทำตอนไหน

Context: PR #18 ใส่ข้อเสนอ retro ใน PR เดียวกันก่อน merge (retro-skill.md)
Options considered (the agent's analysis when the question was asked):
- (A) ก่อน merge ข้อเสนอที่อนุมัติเข้า PR เดียวกัน
  - pro: ไม่ต้องมี PR ตามมา
  - con: PR ใหญ่ขึ้น, ไม่เห็นคอมเมนต์หลัง merge
- (B) หลัง merge เปิด PR แยก
  - pro: เห็นข้อมูลครบรวม CI หลัง merge
  - con: PR และรอบ review เพิ่ม
Recommended: A, แบบที่ PR #18 ทำได้ดี
Answer: A (ก่อน merge ข้อเสนอที่อนุมัติเข้า PR เดียวกัน)
Trade-off accepted: PR ใหญ่ขึ้น, ไม่เห็นคอมเมนต์หลัง merge

### A4: ชื่อ skill

Context: skill เดิมตั้งชื่อตามสิ่งที่ทำ (definition-of-done, paired-agent-tdd, retro)
Options considered (the agent's analysis when the question was asked):
- (A) dev-workflow
  - pro: บอกว่าเป็น workflow งาน dev, ตรงกับที่คุยมา
  - con: กว้าง อาจสับสนกับ workflow.js ของ ptdd/zt
- (B) feature-workflow
  - pro: ชัดว่าใช้กับงาน feature
  - con: งาน bugfix/perf ก็ใช้ แต่ชื่อไม่สื่อ
- (C) ship-it
  - pro: สั้น จำง่าย
  - con: ไม่บอกว่ามีขั้นตอน
Recommended: A, ตรงกับที่ใช้ใน thread นี้แล้ว
Answer: A (dev-workflow)
Trade-off accepted: กว้าง อาจสับสนกับ workflow.js ของ ptdd/zt

### A5: งานเล็กต้องเดินครบทุกขั้นไหม

Context: ptdd บอกว่าไม่ใช้กับงานไฟล์เดียว/บรรทัดเดียว (skills/paired-agent-tdd/SKILL.md:3)
Options considered (the agent's analysis when the question was asked):
- (A) ทางสั้นสำหรับงานเล็ก: ข้าม concept board ได้ แต่ต้องมี DoD, verify, retro เสมอ และผู้ใช้ต้องยืนยันการข้ามเป็นลายลักษณ์อักษร
  - pro: งานเล็กไม่ช้า, ยังมีหลักฐานว่าใครให้ข้าม
  - con: มีสองเส้นทางต้องเทสต์
- (B) ครบทุกขั้นทุกงาน
  - pro: กฎเดียว ง่าย
  - con: งานแก้บรรทัดเดียวช้าเกินจำเป็น
- (C) ถามผู้ใช้ตอนเริ่มทุกครั้งว่าจะเดินขั้นไหนบ้าง
  - pro: ยืดหยุ่นสุด
  - con: ถามเพิ่มทุกงาน, ข้ามง่ายเกิน
Recommended: A, ลดเวลางานเล็กโดยไม่เสียหลักฐาน
Answer: A (ทางสั้นสำหรับงานเล็ก: ข้าม concept board ได้ แต่ต้องมี DoD, verify, retro เสมอ และผู้ใช้ต้องยืนยันการข้ามเป็นลายลักษณ์อักษร)
Trade-off accepted: มีสองเส้นทางต้องเทสต์

### A6: ไฟล์สถานะ workflow อยู่ที่ไหน

Context: container cloud ถูกเก็บคืนเมื่อว่าง, DoD run folder อยู่ใน /tmp และหมดอายุ 8 ชม. (tdd-test-speed ต้อง reopen)
Options considered (the agent's analysis when the question was asked):
- (A) commit บน branch ที่ docs/workflow/<slug>.json แล้วลบออกตอน merge (หรือเก็บไว้)
  - pro: session ใหม่/เครื่องใหม่ทำต่อได้จาก branch
  - con: มีไฟล์เพิ่มใน diff
- (B) run folder ชั่วคราวแบบ DoD
  - pro: repo สะอาด
  - con: หายเมื่อ container หรือ /tmp หาย ต้องเริ่มใหม่
- (C) เก็บไว้ในคำอธิบาย PR/ticket
  - pro: ไม่มีไฟล์ใน repo
  - con: ต้องมี PR/ticket ก่อน, อ่านเขียนผ่าน network
Recommended: A, งานข้าม session บ่อย และ thread ถูกปิด container บ่อย
Answer: B (run folder ชั่วคราวแบบ DoD)
Trade-off accepted: หายเมื่อ container หรือ /tmp หาย ต้องเริ่มใหม่

### A7: ข้ามขั้นได้ไหม

Context: dod.mjs ให้ assumption ผ่านเฉพาะเมื่อผู้ใช้ accept เป็น id (skills/definition-of-done/SKILL.md ข้อ 4)
Options considered (the agent's analysis when the question was asked):
- (A) workflow.mjs next ไม่ให้ไปขั้นถัดไปถ้าไม่มีหลักฐานของขั้นก่อน ข้ามได้เฉพาะเมื่อผู้ใช้ตอบว่าให้ข้าม (บันทึกใน answers.md) พร้อมเหตุผล
  - pro: บังคับจริงแต่ไม่ติดตาย
  - con: ต้องบันทึกคำตอบทุกครั้งที่ข้าม
- (B) ห้ามข้ามเด็ดขาด
  - pro: เข้มสุด
  - con: งานพิเศษติดไม่มีทางออก
- (C) เตือนอย่างเดียว
  - pro: ไม่ขวางงาน
  - con: เท่ากับ rules ไม่ใช่ gate
Recommended: A, ตรงกับหลัก guardrail ด้วยโค้ดและแบบที่ dod.mjs ทำ
Answer: A (workflow.mjs next ไม่ให้ไปขั้นถัดไปถ้าไม่มีหลักฐานของขั้นก่อน ข้ามได้เฉพาะเมื่อผู้ใช้ตอบว่าให้ข้าม (บันทึกใน answers.md) พร้อมเหตุผล)
Trade-off accepted: ต้องบันทึกคำตอบทุกครั้งที่ข้าม

### A8: hook WORKFLOW_GUARD_ENABLED (ค่าเริ่ม false) ห้ามอะไร

Context: dod-guard ห้ามแก้ product code ระหว่าง DoD (hooks/dod-guard.mjs); Q3 เลือก retro ก่อน merge
Options considered (the agent's analysis when the question was asked):
- (A) ห้ามแก้ product code ก่อนล็อก design (ขั้น 3) อย่างเดียว
  - pro: เล็ก ตรงจุดที่ย้อนบ่อย
  - con: merge ก่อน verify/retro ได้
- (B) A + ห้าม gh pr merge / glab mr merge ก่อน verify และ retro เสร็จ
  - pro: บังคับ Q3 จริง
  - con: hook ต้องรู้จักคำสั่ง merge หลายแบบ
- (C) ไม่มี hook ใช้ gate ใน workflow.mjs อย่างเดียว
  - pro: โค้ดน้อย
  - con: agent ข้าม workflow.mjs ได้
Recommended: B, Q3 เลือก retro ก่อน merge จึงควรบังคับตรง merge
Answer: B (A + ห้าม gh pr merge / glab mr merge ก่อน verify และ retro เสร็จ)
Trade-off accepted: hook ต้องรู้จักคำสั่ง merge หลายแบบ

### A9: concept board ทำเป็นอะไร

Context: prototype ทุกครั้งเป็น Artifact HTML (ptdd-speed, tdd-test-speed, retro-skill); Artifact publish เป็น tool result ใหญ่สุด 40 KB (retro-skill F4)
Options considered (the agent's analysis when the question was asked):
- (A) HTML ไฟล์เดียวใน run/branch ให้ sub-agent สร้าง แล้ว publish เป็น Artifact ถ้า host มี ไม่มีก็เปิดไฟล์เอง
  - pro: เหมือนที่ใช้อยู่ ใช้ได้ทุก host, sub-agent ช่วยลด context
  - con: HTML ต้องทำมือทุกครั้ง
- (B) markdown + mermaid
  - pro: เบา อ่านใน PR ได้
  - con: UI variant ดูไม่ออก
- (C) template HTML ที่ workflow.mjs สร้างจาก JSON (concept + variants)
  - pro: หน้าตาเหมือนกันทุกงาน, sub-agent เขียนแค่ JSON
  - con: template จำกัดสิ่งที่แสดงได้
Recommended: A, ยืดหยุ่นสุดและตรงกับที่ใช้ได้ผล
Answer: A แบบกระชับพร้อม mermaid diagram ถ้าเนื้อหาสามารถทำ diagram ได้
Trade-off accepted: none recorded (the answer picks no single option)

### A10: จำนวน variant บน concept board

Context: Nut เขียนไว้ "pick 2-3 variant"; ทุกคำถามต้องมีทางเลือกจริงพร้อม pro/con
Options considered (the agent's analysis when the question was asked):
- (A) gate บังคับ 2-3 แบบ แต่ละแบบมี pro และ con และมีแบบที่แนะนำ
  - pro: ตรงคำสั่งเดิม ตรวจได้
  - con: งานที่มีทางเดียวจริงต้องคิด variant มา
- (B) อย่างน้อย 2 ไม่จำกัดบน
  - pro: ไม่ตัดทางเลือก
  - con: ตัดสินใจยากขึ้น
Recommended: A
Answer: B (อย่างน้อย 2 ไม่จำกัดบน)
Trade-off accepted: ตัดสินใจยากขึ้น

### A11: ขั้น 0 ข้อเท็จจริง+spike บังคับไหม

Context: tdd-test-speed วัดผลหลัง grill รอบแรกทำให้ Q11 ล้ม Q1 กับ Q6
Options considered (the agent's analysis when the question was asked):
- (A) บังคับ facts.md (file:line) ก่อนถามคำถามแรก และ measure.md ถ้างานเกี่ยวกับความเร็ว/ขนาด ให้ sub-agent ระดับถูกทำ
  - pro: ไม่มีผลวัดมาล้มคำตอบ
  - con: เริ่มถามช้าลงเล็กน้อย
- (B) แนะนำแต่ไม่บังคับ
  - pro: เร็วตอนเริ่ม
  - con: ปัญหาเดิมยังเกิดได้
Recommended: A
Answer: A (บังคับ facts.md (file:line) ก่อนถามคำถามแรก และ measure.md ถ้างานเกี่ยวกับความเร็ว/ขนาด ให้ sub-agent ระดับถูกทำ)
Trade-off accepted: เริ่มถามช้าลงเล็กน้อย

### A12: verify (ขั้น 5) นับว่าผ่านเมื่อไร

Context: verify.md ทำด้วยมือทุก thread; ticket checklist ให้ติ๊กตอน verify (dod-skill.md)
Options considered (the agent's analysis when the question was asked):
- (A) verify.md ทุก DoD item มีหลักฐาน (คำสั่ง+ผลลัพธ์ หรือภาพ) ใน env ที่ DoD ระบุ, gate เช็คครบทุก item, item ไหนพิสูจน์ไม่ได้ต้องให้ผู้ใช้ accept, แล้วติ๊ก checklist ใน ticket
  - pro: ตรวจได้ด้วยโค้ด
  - con: เขียนหลักฐานเยอะ
- (B) สรุปเป็นข้อความ
  - pro: เร็ว
  - con: ตรวจไม่ได้
Recommended: A
Answer: A (verify.md ทุก DoD item มีหลักฐาน (คำสั่ง+ผลลัพธ์ หรือภาพ) ใน env ที่ DoD ระบุ, gate เช็คครบทุก item, item ไหนพิสูจน์ไม่ได้ต้องให้ผู้ใช้ accept, แล้วติ๊ก checklist ใน ticket)
Trade-off accepted: เขียนหลักฐานเยอะ

### A13: งานไหนส่งให้ sub-agent

Context: project topic บอกให้ใช้ sub-agent ทำ research, prototype, merge, retro เพื่อลด context
Options considered (the agent's analysis when the question was asked):
- (A) ตายตัวใน SKILL.md: facts/spike (ระดับถูก), สร้าง concept board, TDD (ptdd), review (zero-trust-review session ใหม่), retro collect; คำถามและการตัดสินใจอยู่ session หลัก
  - pro: ชัด ทุกงานเหมือนกัน
  - con: ไม่ปรับตามงาน
- (B) มี flag WORKFLOW_SUBAGENTS_MODE ให้เลือก
  - pro: ปรับได้
  - con: flag เพิ่ม ต้องเทสต์ทุกโหมด
Recommended: A
Answer: A (ตายตัวใน SKILL.md: facts/spike (ระดับถูก), สร้าง concept board, TDD (ptdd), review (zero-trust-review session ใหม่), retro collect; คำถามและการตัดสินใจอยู่ session หลัก)
Trade-off accepted: ไม่ปรับตามงาน

### A14: ความเข้ากันได้ย้อนหลัง

Context: skill เดิมใช้เดี่ยว ๆ ได้ (README Install); plugin 2.2.0
Options considered (the agent's analysis when the question was asked):
- (A) เพิ่มอย่างเดียว ไม่เปลี่ยนพฤติกรรม skill เดิม เพิ่มบรรทัด "ใช้ใน dev-workflow ขั้น X" ใน SKILL.md เดิม, plugin 2.3.0
  - pro: ไม่มีอะไรพัง
  - con: SKILL.md เดิมยาวขึ้นนิด (ptdd มีเพดาน 14000 bytes)
- (B) เพิ่มอย่างเดียว ไม่แตะ SKILL.md เดิมเลย
  - pro: ไม่ชน PR #24
  - con: skill เดิมไม่รู้ว่ามี workflow
Recommended: B, PR #24 กำลังแก้ ptdd และ SKILL.md ของ ptdd ใกล้เพดาน
Answer: B (เพิ่มอย่างเดียว ไม่แตะ SKILL.md เดิมเลย)
Trade-off accepted: skill เดิมไม่รู้ว่ามี workflow

### A15: non-goals

Context: memory: Windows native เลื่อนไป, ไม่สร้าง ticket ใหม่ (dod-skill)
Options considered (the agent's analysis when the question was asked):
- (A) ไม่ทำ: auto-merge, gating ใน CI, Windows native, สร้าง ticket, แทนที่ skill เดิม, รันขั้นไหนเองโดยไม่ถาม
  - pro: ขอบเขตชัด
  - con: ถ้าอยากได้ CI gate ต้องทำทีหลัง
- (B) A แต่เอา gating ใน CI เข้ามาด้วย
  - pro: บังคับทุก PR
  - con: repo อื่นที่ใช้ skill ต้องแก้ CI
Recommended: A
Answer: A (ไม่ทำ: auto-merge, gating ใน CI, Windows native, สร้าง ticket, แทนที่ skill เดิม, รันขั้นไหนเองโดยไม่ถาม)
Trade-off accepted: ถ้าอยากได้ CI gate ต้องทำทีหลัง

### A16: verify skill นี้ที่ไหน และ test tier

Context: ptdd-speed ต้องใช้เครื่อง Nut (WSL) สำหรับรันจริง; cloud ไม่มี Workflow tool
Options considered (the agent's analysis when the question was asked):
- (A) e2e บน repo จำลอง (unit+fuzz state machine, integration กับ dod.mjs จริง, e2e เดินครบ 7 ขั้นแบบ flags ค่าเริ่ม/เปิด/ปิด, hook test) + dogfood: งานถัดไปใน repo นี้เดินผ่าน dev-workflow ใน cloud
  - pro: ทำได้ใน cloud ทั้งหมด
  - con: ไม่ได้ลองบนเครื่อง Nut
- (B) A + รันจริงบน WSL ของ Nut ผ่าน Remote Control
  - pro: เหมือนใช้จริงที่สุด
  - con: ต้องรอเครื่อง Nut
Recommended: A, skill นี้ไม่ต้องใช้ Workflow tool จึงรันใน cloud ได้ครบ
Answer: A (e2e บน repo จำลอง (unit+fuzz state machine, integration กับ dod.mjs จริง, e2e เดินครบ 7 ขั้นแบบ flags ค่าเริ่ม/เปิด/ปิด, hook test) + dogfood: งานถัดไปใน repo นี้เดินผ่าน dev-workflow ใน cloud)
Trade-off accepted: ไม่ได้ลองบนเครื่อง Nut

### A17: ไฟล์ที่งานนี้แตะ (touches)

Context: โครงสร้าง repo ปัจจุบัน
Options considered (the agent's analysis when the question was asked):
- (A) skills/dev-workflow/**, hooks/workflow-guard.mjs, hooks/workflow-guard.test.mjs, hooks/hooks.json, README.md, rules/README.md, .claude-plugin/*.json, docs/adr/**
  - pro: ไม่แตะไฟล์ของ PR #24
  - con: ถ้า Q14 เป็น A ต้องเพิ่ม skills/*/SKILL.md
- (B) A + skills/*/SKILL.md
  - pro: รองรับ Q14 A
  - con: ชน PR #24
Recommended: A
Answer: A (skills/dev-workflow/**, hooks/workflow-guard.mjs, hooks/workflow-guard.test.mjs, hooks/hooks.json, README.md, rules/README.md, .claude-plugin/*.json, docs/adr/**)
Trade-off accepted: ถ้า Q14 เป็น A ต้องเพิ่ม skills/*/SKILL.md

### A18: run folder หมดอายุแล้วทำต่ออย่างไร

Context: A6 เลือก run folder ชั่วคราว; DoD run folder ใน /tmp หมดอายุหลังว่าง 8 ชม. (tdd-test-speed ต้อง reopen)
Options considered (the agent's analysis when the question was asked):
- (A) workflow.mjs status เดาขั้นปัจจุบันจากหลักฐานใน repo (ADR มีแล้ว, PR เปิดแล้ว, verify.md, บรรทัดใน docs/retro/log.md) แล้วเปิด run ใหม่ต่อจากขั้นนั้น
  - pro: ไม่ต้องเริ่มใหม่, repo ยังสะอาด
  - con: ขั้น 0-2 (facts, คำตอบ, concept board) ที่ยังไม่ถึง ADR จะหาย ต้องทำซ้ำ
- (B) เก็บ run folder ใน ~/.cache/dev-workflow แทน /tmp ไม่มีหมดอายุ
  - pro: อยู่รอดข้ามวันบนเครื่องเดียวกัน
  - con: container cloud ถูกเก็บคืนก็หายเหมือนกัน
- (C) A + B
  - pro: รอดทั้งกรณี /tmp และกรณีเครื่องใหม่ (ถึงขั้น ADR)
  - con: โค้ดสองทาง
Recommended: C
Answer: C (A + B)
Trade-off accepted: โค้ดสองทาง

### A19: hook ทำอย่างไรเมื่อไม่มี workflow เปิดอยู่

Context: dod-guard ทำงานเฉพาะตอน DoD session เปิด (hooks/dod-guard.mjs); A8 เลือก B (ห้ามแก้ code ก่อนล็อก, ห้าม merge ก่อน verify+retro)
Options considered (the agent's analysis when the question was asked):
- (A) ไม่มี workflow เปิด = ไม่ขวางอะไร
  - pro: ไม่รบกวนงานที่ไม่ได้ใช้ workflow
  - con: run folder หาย = merge ได้โดยไม่ retro
- (B) ห้าม merge ทุกครั้งที่ flag เปิดแต่ไม่มี workflow
  - pro: เข้มสุด
  - con: งานเล็กนอก workflow merge ไม่ได้เลย
Recommended: A, flag เปิดเองโดยผู้ใช้ และงานนอก workflow ต้องทำได้
Answer: A (ไม่มี workflow เปิด = ไม่ขวางอะไร)
Trade-off accepted: run folder หาย = merge ได้โดยไม่ retro

### A20: ติ๊ก checklist ใน ticket ตอน verify

Context: dod-guard ไม่ให้เขียน ticket ก่อนผู้ใช้ approve ข้อความ (skills/definition-of-done/SKILL.md 5-6); A12 ให้ติ๊ก checklist ตอน verify
Options considered (the agent's analysis when the question was asked):
- (A) แสดงข้อความ ticket ที่ติ๊กแล้วให้ผู้ใช้ approve ก่อนโพสต์ (แบบเดียวกับ dod.mjs approve)
  - pro: ไม่มีการเขียนออกภายนอกโดยไม่ได้อนุญาต
  - con: เพิ่มหนึ่งรอบ
- (B) ติ๊กเองได้ เพราะเนื้อหา checklist ถูก approve แล้วตอน DoD
  - pro: ไม่ต้องรอ
  - con: เขียนออกภายนอกโดยไม่ถาม
Recommended: A, ถามครั้งเดียวรวมกับรายงาน verify
Answer: A (แสดงข้อความ ticket ที่ติ๊กแล้วให้ผู้ใช้ approve ก่อนโพสต์ (แบบเดียวกับ dod.mjs approve))
Trade-off accepted: เพิ่มหนึ่งรอบ

### A21: ยืนยัน DoD (dod.md, 18 items + 5 required sections)

Context: dod.mjs check ok (18 items)
Options considered (the agent's analysis when the question was asked):
- (A) ยืนยันตามนี้ ไปทำ concept board
  - pro: ไปต่อได้ทันที
  - con: ถ้ามีจุดผิดจะเจอตอน concept board
- (B) แก้บางข้อก่อน (บอกข้อที่จะแก้)
  - pro: DoD ตรงขึ้นก่อนเริ่มออกแบบ
  - con: เพิ่มหนึ่งรอบ
Recommended: A
Answer: A (ยืนยันตามนี้ ไปทำ concept board)
Trade-off accepted: ถ้ามีจุดผิดจะเจอตอน concept board

### A22: งานนี้ใช้ ticket อะไร

Context: งานนี้ไม่มี issue; definition-of-done ไม่สร้าง ticket ใหม่ (SKILL.md 5-6)
Options considered (the agent's analysis when the question was asked):
- (A) ไม่มี ticket ใช้ ADR + PR เป็นบันทึก
  - pro: ไม่ต้องสร้างอะไรภายนอก
  - con: ไม่มี issue ให้ติดตามใน GitHub
- (B) Nut สร้าง issue เองแล้วส่งเลขมา ให้ rewrite description เป็น DoD
  - pro: ติดตามใน issue ได้เหมือน #19
  - con: Nut ต้องสร้างเอง
Recommended: A
Answer: A (ไม่มี ticket ใช้ ADR + PR เป็นบันทึก)
Trade-off accepted: ไม่มี issue ให้ติดตามใน GitHub

### A23: ติ๊ก checklist ใน ticket (แก้ Q20)

Context: หลังตอบ Q20 A Nut เพิ่มว่าถ้า verify ด้วยการรันจริงผ่านเกณฑ์ ติ๊กเองได้
Options considered (the agent's analysis when the question was asked):
- (A) ติ๊กเองโดยไม่ถาม เฉพาะ item ที่มีหลักฐานจากการรันจริงผ่านเกณฑ์ item อื่นเว้นไว้และรายงาน
  - pro: ไม่ต้องรอ approve เมื่อผ่านจริง
  - con: เขียนออก ticket โดยไม่ถามทีละครั้ง
- (B) ถามก่อนทุกครั้งตาม Q20 A
  - pro: ควบคุมทุกการเขียน
  - con: เพิ่มรอบเมื่อผ่านอยู่แล้ว
Recommended: A
Answer: แต่จริง ๆ ถ้า verify กับการ run จริงแล้ว ถ้าผ่านตามเกณฑ์ก็ check เองได้เลย
Trade-off accepted: none recorded (the answer picks no single option)

### A24: เลือก design ของ dev-workflow (concept board https://claude.ai/artifact/D3tfgnwKBkcERCEbVs4h5S)

Context: ขั้น 2 concept board; DoD 18 items ยืนยันแล้ว (A21); retro ใช้ pure core + IO ได้ผล (ADR 0001 A6)
Options considered (the agent's analysis when the question was asked):
- (A) แกนเดียว: steps.mjs pure + io.mjs, เรียก dod.mjs เมื่อติดตั้งข้างกัน ไม่มีก็ตรวจไฟล์เอง
  - pro: โครงเดียวกับ retro, test in-process เร็ว, ติดตั้ง skill เดียวก็ใช้ได้
  - con: ตรวจไฟล์ซ้ำกับ dod.mjs บางส่วน
- (B) ผู้ประสาน: ทุก gate เรียก CLI ของ skill เจ้าของ + board.mjs, verify.mjs ใหม่
  - pro: ไม่มี logic ซ้ำ, tool เล็ก
  - con: ต้องติดตั้ง skill พี่น้องครบ, spawn เยอะ test ช้า, ผูกข้าม skill
- (C) ประกาศขั้นใน steps.json, repo เขียนทับได้
  - pro: ปรับขั้นต่อ repo ได้
  - con: เขียนทับเป็นทางข้าม gate (ขัด A7), ต้อง test ทุกแบบ
Recommended: A
Answer: A (แกนเดียว: steps.mjs pure + io.mjs, เรียก dod.mjs เมื่อติดตั้งข้างกัน ไม่มีก็ตรวจไฟล์เอง)
Trade-off accepted: ตรวจไฟล์ซ้ำกับ dod.mjs บางส่วน

## Consequences

Trade-offs we accepted:

- A1: โค้ดและ test เพิ่ม, มีไฟล์สถานะเพิ่ม
- A2: prototype หลายแบบพร้อมกัน แต่ละแบบละเอียดน้อยลง
- A3: PR ใหญ่ขึ้น, ไม่เห็นคอมเมนต์หลัง merge
- A4: กว้าง อาจสับสนกับ workflow.js ของ ptdd/zt
- A5: มีสองเส้นทางต้องเทสต์
- A6: หายเมื่อ container หรือ /tmp หาย ต้องเริ่มใหม่
- A7: ต้องบันทึกคำตอบทุกครั้งที่ข้าม
- A8: hook ต้องรู้จักคำสั่ง merge หลายแบบ
- A10: ตัดสินใจยากขึ้น
- A11: เริ่มถามช้าลงเล็กน้อย
- A12: เขียนหลักฐานเยอะ
- A13: ไม่ปรับตามงาน
- A14: skill เดิมไม่รู้ว่ามี workflow
- A15: ถ้าอยากได้ CI gate ต้องทำทีหลัง
- A16: ไม่ได้ลองบนเครื่อง Nut
- A17: ถ้า Q14 เป็น A ต้องเพิ่ม skills/*/SKILL.md
- A18: โค้ดสองทาง
- A19: run folder หาย = merge ได้โดยไม่ retro
- A20: เพิ่มหนึ่งรอบ
- A21: ถ้ามีจุดผิดจะเจอตอน concept board
- A22: ไม่มี issue ให้ติดตามใน GitHub
- A24: ตรวจไฟล์ซ้ำกับ dod.mjs บางส่วน

## Definition of done

<!-- dod: written by dod.mjs adr; do not edit; sha256:da8a71e1b5fb6db2 -->

- [ ] Skill (happy, fail, edge): a new skill skills/dev-workflow (SKILL.md + workflow.mjs) orchestrates the workflow and hands off to the existing skills; installable through the plugin and npx skills (A1)
- [ ] Name (happy, fail, edge): the skill is named dev-workflow (A4)
- [ ] Order (happy, fail, edge): steps run in this order: 0 intake + facts + spike, 1 DoD grill (incl. booking the verify env), 2 concept board, 3 lock (ADR + ticket written once), 4 TDD + draft PR, 5 verify + independent review, 6 retro, then merge (A2)
- [ ] RetroFirst (happy, fail, edge): retro runs before merge and its approved proposals land in the same PR (A3)
- [ ] ShortPath (happy, fail, edge): small work may take a short path that skips the concept board only; DoD, verify and retro always run; the skip needs the user's written answer (A5)
- [ ] RunDir (happy, fail, edge): workflow state lives in a run folder outside the repo, never committed (A6)
- [ ] RunCache (happy, fail, edge): the run folder lives under ~/.cache/dev-workflow (not /tmp), so it survives /tmp cleanup on the same machine (A18)
- [ ] Resume (happy, fail, edge): workflow.mjs status infers the current step from repo evidence (ADR, PR, verify.md, retro log line) when no run folder exists, and opens a new run from that step (A18)
- [ ] Gate (happy, fail, edge): workflow.mjs next refuses to move on without the previous step's evidence; a step is skipped only when an answer in answers.md says so with a reason (A7)
- [ ] GuardEdit (happy, fail, edge): with WORKFLOW_GUARD_ENABLED=true the hook denies product-code edits while a workflow is open and its design is not locked (A8)
- [ ] GuardMerge (happy, fail, edge): with WORKFLOW_GUARD_ENABLED=true the hook denies gh pr merge / glab mr merge while a workflow is open and verify or retro is not done (A8)
- [ ] GuardIdle (happy, fail, edge): with no open workflow the hook blocks nothing (A19)
- [ ] Board (happy, fail, edge): the concept board is one concise HTML file built by a subagent, with a mermaid diagram when the content fits one, published as an Artifact when the host has it, else opened as a file (A9)
- [ ] Variants (happy, fail, edge): the concept board gate requires at least 2 variants, no upper limit, each with a pro and a con, and one recommended (A10)
- [ ] Facts (happy, fail, edge): facts.md (with file:line) must exist before the first grill question, and measure.md when the work is about speed or size; a low-tier subagent writes them (A11)
- [ ] Verify (happy, fail, edge): verify passes only when verify.md gives every DoD item evidence (command + output, or an image) from the DoD's verify env, or the user accepted the item by answer id (A12)
- [ ] TicketTick (happy, fail, edge): at verify, a ticket checklist item is ticked without asking when the real-run evidence for it passes its criteria; other items stay unticked and are reported (A23)
- [ ] Subagents (happy, fail, edge): SKILL.md fixes which work goes to subagents: facts/spike (low tier), concept board build, TDD (paired-agent-tdd), review (zero-trust-review in a new session), retro collect; questions and decisions stay in the main session (A13)

- feature flag: WORKFLOW_GUARD_ENABLED, true|false, default false (README Flags row); invalid value or old name is a hard error (A8)
- backward compat: additive only: no existing SKILL.md, hook or flag changes behavior or text; plugin 2.3.0 (A14)
- non-goals: auto-merge, CI gating, native Windows, creating tickets, replacing existing skills, running a step without asking (A15)
- verify env: cloud container: e2e on a fixture repo with flags default/on/off, plus dogfooding the next task in this repo; CI green (A16)
- test tiers: unit, fuzz, integration, e2e, hook (A16)
