# Phase 5 Workout Schema Audit

วันที่ตรวจ: 2026-09-20  
วิธีตรวจ: Supabase MCP แบบ read-only  
สถานะ: **SECURITY POLICY APPLIED AND VERIFIED; RUNTIME WRITE TEST NOT YET RUN**

## Production change record

- Applied: 2026-09-20
- Migration: `20260920080401_harden_workout_session_plan_day_ownership`
- Result: Supabase migration API returned success
- Read-only verification confirmed both `owner_insert` and `owner_update` now require `plan_day_id IS NULL OR owns_plan_day(plan_day_id)` in `WITH CHECK`
- No tables or application data were created, updated, or deleted by this migration

### Default catalog and plan generator

- Applied migration: `20260920080747_add_default_workout_catalog_and_plan_rpc`
- Added six shared beginner bodyweight exercises using deterministic UUIDs
- Added a partial unique index enforcing at most one active plan per user
- Added idempotent `create_default_workout_plan()` as `SECURITY INVOKER`
- RPC derives identity from `auth.uid()`, requires an active goal, and creates seven plan days with the configured number of training days
- `authenticated` has EXECUTE; `anon` does not
- The migration did not create a workout plan for any user automatically; the authenticated user must request it from the app

## ยืนยันจาก Production

- มีตาราง `exercises`, `muscle_groups`, `exercise_muscles`, `workout_plans`, `workout_plan_days`, `workout_plan_exercises`, `workout_sessions`, `workout_sets` และ `reminders`
- ทุกตารางเปิด RLS
- exercise catalog เป็น read-only สำหรับ `authenticated`
- plan/day/plan-exercise/session/set มี owner policies และ grants สำหรับ authenticated
- มี unique/index ที่จำเป็นสำหรับลำดับท่า, วันในแผน, session history และ set number
- workout-related tables มี 0 แถว ณ เวลาตรวจ จึงยังไม่มี active plan หรือ exercise catalog ให้แสดง
- `body_measurements` และ `user_workout_preferences` มีข้อมูลผู้ใช้เดิมอย่างละ 1 แถว

## Blocker ที่แก้แล้ว

Policy `owner_insert` และ `owner_update` ของ `workout_sessions` ตรวจเฉพาะว่า `user_id = auth.uid()` แต่ไม่ได้ตรวจว่า `plan_day_id` เป็นวันในแผนของผู้ใช้เดียวกัน ผู้ใช้ authenticated ที่ทราบ UUID ของ plan day อื่นอาจสร้าง session ของตัวเองที่อ้างถึง plan day นั้นได้

Cross-owner reference ผ่าน `plan_day_id` ถูกปิดแล้วใน policy ทั้ง INSERT และ UPDATE

## สิ่งที่ implement ได้โดยไม่เปลี่ยนฐานข้อมูล

- `GET /api/workouts/active`
- `GET /api/workouts/history?limit=`
- Identity มาจาก verified JWT เท่านั้น
- Backend ใช้ publishable key พร้อม access token ของผู้ใช้ ไม่ใช้ service role
- Database errors ถูกแปลงเป็นข้อความทั่วไป

## สิ่งที่ยังต้องทำ

1. ทำ authenticated/cross-user runtime test เมื่อมี test users และข้อมูลทดสอบที่ได้รับอนุมัติ
2. Deploy start session, record set และ finish session endpoints หลัง review application deployment
3. ตัดสินใจวิธีเติม exercise catalog และสร้างแผนแรก โดยห้าม seed Production โดยไม่ได้อนุมัติ
