# Phase 3C Production Read-only Audit

วันที่ตรวจ: 2026-09-20  
เป้าหมาย: Supabase Project `Help_count_calories`  
วิธีตรวจ: Supabase MCP โดยรันเฉพาะคำสั่ง `SELECT` จาก `docs/phase3c_production_read_only_audit.sql` และอ่าน migration history  
สถานะ: **METADATA AUDIT PASSED — DO NOT REAPPLY MIGRATION**

รอบนี้ไม่มีการรัน Migration, DDL, DML หรือ RPC ที่เขียนข้อมูล และไม่มีการเปลี่ยน RLS, Grants, Secrets หรือ Production data

## ผลที่ยืนยันจาก Production

| รายการ | สถานะ | ผลตรวจ |
|---|---|---|
| PostgreSQL | VERIFIED | PostgreSQL 17.6 |
| ตารางหลัก | VERIFIED | `foods`, `food_logs`, `food_log_items` มีอยู่จริง, owner เป็น `postgres`, เปิด RLS และไม่ได้ force RLS |
| Phase 3C columns | VERIFIED | `client_request_id`, `idempotency_payload` และ `snapshot_*` มีอยู่ครบ |
| Phase 3C constraints | VERIFIED | constraints ด้าน idempotency และ nutrition snapshot มีอยู่และ validated |
| Idempotency index | VERIFIED | unique index `(user_id, client_request_id)` พร้อม predicate `client_request_id IS NOT NULL` มีอยู่และ valid |
| Phase 3C RPCs | VERIFIED | พบ `log_catalog_food(uuid,text,numeric,timestamptz,uuid)` และ `update_food_log_item_quantity(uuid,numeric)` |
| Function security | VERIFIED | ทั้งสอง RPC owner=`postgres`, `SECURITY DEFINER`, `search_path=''`; EXECUTE มีเฉพาะ `postgres`, `authenticated`, `service_role` ไม่พบ `PUBLIC` หรือ `anon` |
| Effective direct-write privileges | VERIFIED | `authenticated` ไม่มี INSERT/UPDATE บน `food_logs` และ `food_log_items`; ยัง SELECT ได้ และ DELETE item ได้ตาม Phase 3B |
| RLS ownership | VERIFIED | policies จำกัด log/item ตาม `auth.uid()` และ `owns_food_log(...)`; foods รองรับ shared/owner |
| Existing food data | VERIFIED | ทั้งสามตารางมี 0 แถว ณ เวลาตรวจ จึงไม่มี legacy row ที่ต้อง backfill |
| Invalid existing values | VERIFIED | ไม่พบ quantity/nutrition/serving ที่ null, ติดลบ หรือไม่เป็นบวก |
| Relevant triggers | VERIFIED | ไม่พบ trigger บนสามตารางนี้ |
| Migration history | VERIFIED | Supabase migration history ว่าง แม้ Phase 3C objects มีอยู่แล้ว |

## ข้อสรุปสำคัญ

Production มีผลลัพธ์ของ Phase 3C อยู่ครบในระดับ metadata แล้ว การนำไฟล์ proposal ไปรันซ้ำไม่ควรทำ เพราะจะไม่เพิ่มประโยชน์และ migration history ก็ไม่ได้บันทึกว่ามาจาก migration ใด มีความเป็นไปได้สูงว่า SQL ถูกใช้ผ่าน SQL Editor หรือช่องทางที่ไม่บันทึก migration history

RPC ที่ติดตั้งตรงกับ proposal ล่าสุดในสาระสำคัญ:

- ตรวจ `auth.uid()` และไม่รับ `user_id` จาก client
- ปฏิเสธทั้ง `infinity` และ `-infinity`
- canonical idempotency payload ถูกสร้างก่อนอ่าน catalog
- identical retry คืนรายการเดิม, payload ต่างใช้ `PT409`, item ถูกลบใช้ `PT410`
- concurrent first-create ใช้ database unique constraint และ `ON CONFLICT`
- quantity update ล็อก item และคำนวณใหม่จาก `snapshot_*` เดิม ไม่คูณต่อจากค่าที่ปัดแล้ว

## ผลกระทบต่อ Phase 3B

- Food search และ custom food creation ยังใช้สิทธิ์บน `foods` ได้ตามเดิม
- Diary read และ nutrition summary ยัง SELECT ได้
- Diary item deletion ยัง DELETE ได้ และ RLS จำกัดเจ้าของ
- Direct INSERT/UPDATE ของ `food_logs`/`food_log_items` ถูกปิดตาม security boundary ของ Phase 3C ดังนั้น endpoint เพิ่มและแก้จำนวนต้องเรียก RPC เท่านั้น
- ตารางว่าง จึงไม่มีผลกระทบต่อประวัติอาหารเดิมใน Production ณ เวลาตรวจ

## สิ่งที่ยังไม่ได้ทดสอบ

สถานะต่อไปนี้ยังเป็น **NOT TESTED** เพราะการ audit รอบนี้ได้รับอนุญาตให้อ่านอย่างเดียว:

- การสร้างรายการจริงและ identical retry
- `PT409` เมื่อ request ID เดิมแต่ payload ต่าง
- `PT410` หลังลบ diary item
- concurrent requests จากสอง database sessions
- anonymous/authenticated/cross-user runtime behavior
- quantity update และ rounding drift บนข้อมูลจริง
- Fastify POST/PATCH integration กับ RPC จริง

การตรวจ source และ metadata ไม่สามารถแทน behavioral runtime tests เหล่านี้ได้

## Blocker และ Warning

### BLOCKER

1. ห้ามรัน Phase 3C migration ซ้ำจนกว่าจะตัดสินใจวิธี reconcile migration history อย่างชัดเจน
2. ยังไม่มีผล runtime test บน environment ที่อนุญาตให้เขียน จึงยังไม่ควรอ้างว่า RPC ผ่าน end-to-end

### WARNING

1. Migration history ว่างแต่ schema มี Phase 3C แล้ว เป็น schema-history drift ที่ต้องบันทึกและจัดการก่อน migration ในอนาคต
2. Production ไม่มีข้อมูล foods จึงยังไม่สามารถเพิ่ม diary จาก catalog ได้จนกว่าจะมี shared food หรือผู้ใช้สร้าง custom food
3. `service_role` มี EXECUTE ตาม ACL แต่ backend ต้องใช้ JWT ของผู้ใช้ตามเดิม ห้ามนำ service-role มาใช้แทน identity

## Backup / Rollback ก่อนเปลี่ยน Production ครั้งถัดไป

1. ยืนยันสถานะ backup/PITR และ restore procedure ของ Supabase
2. เก็บ metadata snapshot ของ columns, constraints, indexes, policies, grants, function definitions และ ACL
3. ห้าม rollback ด้วยการลบ snapshot/idempotency columns หากมีข้อมูล Phase 3C ถูกสร้างแล้ว
4. หาก endpoint ใหม่มีปัญหา ให้ rollback application deployment ก่อน ไม่ต้องแก้ schema ที่มีอยู่
5. จัดทำ migration baseline/reconciliation แยกต่างหากและ review ก่อนบันทึก migration history

## ขั้นถัดไปที่แนะนำ

1. ไม่รัน Migration ซ้ำ
2. เพิ่ม Fastify POST diary และ PATCH quantity ให้เรียก RPC ที่ติดตั้งแล้ว
3. ทดสอบด้วย mocks/local suite ก่อน
4. ขออนุญาตแยกต่างหากก่อนทำ write-based smoke test กับ Production หรือสร้างข้อมูลทดสอบจริง
5. หลัง endpoint ผ่าน จึงเชื่อมปุ่มบันทึกจาก AI scanner

