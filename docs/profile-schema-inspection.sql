-- Read-only inspection for Phase 2. This file does not create or modify objects.
-- Run each result set in Supabase SQL Editor and share the results before applying
-- any onboarding/profile migration.

-- 1. Tables and columns (including defaults and nullability).
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by table_name, ordinal_position;

-- 2. Primary keys, foreign keys, unique constraints, and CHECK constraints.
select
  c.conrelid::regclass as table_name,
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public'
  and c.conrelid::regclass::text in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by table_name, constraint_type, constraint_name;

-- 3. Confirm profiles.id points to auth.users.id (shown explicitly for review).
select
  tc.constraint_name,
  tc.table_schema as source_schema,
  tc.table_name as source_table,
  kcu.column_name as source_column,
  ccu.table_schema as target_schema,
  ccu.table_name as target_table,
  ccu.column_name as target_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.constraint_schema = ccu.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by source_table, constraint_name;

-- 4. RLS enabled/forced state.
select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by tablename;

-- 5. Existing RLS policies.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by tablename, policyname;

-- 6. Indexes needed to understand history and retry/idempotency behavior.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'profiles',
    'user_goals',
    'body_measurements',
    'user_workout_preferences'
  )
order by tablename, indexname;

-- 7. Triggers on auth.users and the Phase 2 tables.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where (event_object_schema = 'auth' and event_object_table = 'users')
   or (
     event_object_schema = 'public'
     and event_object_table in (
       'profiles',
       'user_goals',
       'body_measurements',
       'user_workout_preferences'
     )
   )
order by event_object_schema, event_object_table, trigger_name;

-- 8. Existing public functions/RPCs that might already implement atomic onboarding.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by function_name, arguments;
