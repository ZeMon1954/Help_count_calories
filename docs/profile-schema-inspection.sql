-- Read-only inspection: this file does not create or modify database objects.

-- 1. Confirm public.profiles and inspect its columns.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;

-- 2. Find triggers that could create a profile after auth.users inserts.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where (event_object_schema = 'auth' and event_object_table = 'users')
   or (event_object_schema = 'public' and event_object_table = 'profiles')
order by event_object_schema, event_object_table, trigger_name;

-- 3. Inspect RLS policies on public.profiles.
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
  and tablename = 'profiles'
order by policyname;

-- 4. Confirm profiles.id has a foreign key to auth.users.id.
select
  constraint_name,
  source_schema,
  source_table,
  source_column,
  target_schema,
  target_table,
  target_column
from (
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
) foreign_keys
where source_schema = 'public'
  and source_table = 'profiles'
  and source_column = 'id';
