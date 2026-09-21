-- Phase 3A read-only inspection for Supabase SQL Editor.
-- Every statement in this file is SELECT-only and does not modify data,
-- permissions, RLS, functions, or schema objects.

-- 1. Confirm which expected tables exist and who owns them.
select
  n.nspname as table_schema,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by c.relname;

-- 2. Exact columns, types, nullability, defaults, identity, and generated state.
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default,
  is_identity,
  identity_generation,
  is_generated,
  generation_expression
from information_schema.columns
where table_schema = 'public'
  and table_name in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by table_name, ordinal_position;

-- 3. Primary keys, foreign keys, UNIQUE, CHECK, and exclusion constraints.
select
  c.conrelid::regclass as table_name,
  c.conname as constraint_name,
  case c.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else c.contype::text
  end as constraint_type,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public'
  and c.conrelid::regclass::text in (
    'foods',
    'food_logs',
    'food_log_items',
    'food_analyses'
  )
order by table_name, constraint_type, constraint_name;

-- 4. Foreign-key relationships with source and target columns expanded.
select
  tc.constraint_name,
  tc.table_schema as source_schema,
  tc.table_name as source_table,
  kcu.column_name as source_column,
  ccu.table_schema as target_schema,
  ccu.table_name as target_table,
  ccu.column_name as target_column,
  rc.update_rule,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.constraint_schema = ccu.constraint_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
 and tc.constraint_schema = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by source_table, constraint_name, kcu.ordinal_position;

-- 5. Indexes used by catalog search, per-user diary lookup, and date ordering.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by tablename, indexname;

-- 6. RLS policies, including role, command, USING, and WITH CHECK expressions.
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
  and tablename in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by tablename, policyname;

-- 7. Table and column grants for anon/authenticated and any other roles.
select
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by table_name, grantee, privilege_type;

select
  grantee,
  table_schema,
  table_name,
  column_name,
  privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by table_name, column_name, grantee, privilege_type;

-- 8. Triggers that may maintain timestamps, totals, snapshots, or audit data.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_condition,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in (
    'foods',
    'food_logs',
    'food_log_items',
    'food_analyses'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 9. Public functions whose names suggest food, nutrition, diary, or analysis work.
-- Function definitions are needed to verify transaction and ownership behavior.
select
  n.nspname as function_schema,
  p.proname as function_name,
  p.oid::regprocedure as signature,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proacl as permissions,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and (
    p.proname ilike '%food%'
    or p.proname ilike '%nutrition%'
    or p.proname ilike '%diary%'
    or p.proname ilike '%analysis%'
  )
order by function_name, signature;

-- 10. Enum definitions, if any food columns use PostgreSQL enums.
select
  n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by enum_name, e.enumsortorder;

-- 11. Comments can document ownership, units, or snapshot semantics.
select
  n.nspname as table_schema,
  c.relname as table_name,
  a.attname as column_name,
  case
    when a.attnum is null then obj_description(c.oid, 'pg_class')
    else col_description(c.oid, a.attnum)
  end as description
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_attribute a
  on a.attrelid = c.oid
 and a.attnum > 0
 and not a.attisdropped
where n.nspname = 'public'
  and c.relname in ('foods', 'food_logs', 'food_log_items', 'food_analyses')
order by table_name, a.attnum nulls first;
