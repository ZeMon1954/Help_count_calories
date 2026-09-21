-- Phase 3C production pre-migration audit (READ ONLY).
-- Every statement is SELECT-only. Run manually with a database role that is
-- authorized to read catalog metadata. Do not paste connection details or row
-- contents into reports; only retain aggregate and metadata results.

-- Run this permission probe first. If can_read_control_identity is false,
-- stop the audit: do not weaken the staging fingerprint to a client-supplied
-- value or database name alone.
select pg_catalog.has_function_privilege(
  current_user,
  'pg_catalog.pg_control_system()'::regprocedure,
  'EXECUTE'
) as can_read_control_identity;

select
  current_database() as database_name,
  current_user as inspection_role,
  (
    select system_identifier::text
    from pg_catalog.pg_control_system()
  ) as database_system_identifier,
  version() as postgres_version;

select
  n.nspname as table_schema,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  c.reltuples::bigint as estimated_rows
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('foods', 'food_logs', 'food_log_items')
  and c.relkind in ('r', 'p')
order by c.relname;

select 'foods' as table_name, count(*) as exact_rows from public.foods
union all
select 'food_logs', count(*) from public.food_logs
union all
select 'food_log_items', count(*) from public.food_log_items;

select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns as c
where c.table_schema = 'public'
  and c.table_name in ('foods', 'food_logs', 'food_log_items')
order by c.table_name, c.ordinal_position;

select
  con.conrelid::regclass as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated as validated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint as con
where con.conrelid in (
  'public.foods'::regclass,
  'public.food_logs'::regclass,
  'public.food_log_items'::regclass
)
order by table_name, constraint_name;

select
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
from pg_catalog.pg_indexes as i
where i.schemaname = 'public'
  and i.tablename in ('foods', 'food_logs', 'food_log_items')
order by i.tablename, i.indexname;

select
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check
from pg_catalog.pg_policies as p
where p.schemaname = 'public'
  and p.tablename in ('foods', 'food_logs', 'food_log_items')
order by p.tablename, p.policyname;

select
  g.grantee,
  g.table_name,
  g.privilege_type,
  g.is_grantable
from information_schema.role_table_grants as g
where g.table_schema = 'public'
  and g.table_name in ('foods', 'food_logs', 'food_log_items')
order by g.table_name, g.grantee, g.privilege_type;

select
  g.grantee,
  g.table_name,
  g.column_name,
  g.privilege_type
from information_schema.column_privileges as g
where g.table_schema = 'public'
  and g.table_name in ('foods', 'food_logs', 'food_log_items')
order by g.table_name, g.column_name, g.grantee, g.privilege_type;

select
  member_role.rolname as member_role,
  granted_role.rolname as inherited_role,
  m.admin_option,
  m.inherit_option,
  m.set_option
from pg_catalog.pg_auth_members as m
join pg_catalog.pg_roles as member_role on member_role.oid = m.member
join pg_catalog.pg_roles as granted_role on granted_role.oid = m.roleid
where member_role.rolname in ('anon', 'authenticated', 'authenticator')
   or granted_role.rolname in ('anon', 'authenticated', 'authenticator')
order by member_role, inherited_role;

select
  role_name,
  table_name,
  has_table_privilege(role_name, table_name, 'SELECT') as can_select,
  has_table_privilege(role_name, table_name, 'INSERT') as can_insert_table,
  has_any_column_privilege(role_name, table_name, 'INSERT') as can_insert_any_column,
  has_table_privilege(role_name, table_name, 'UPDATE') as can_update_table,
  has_any_column_privilege(role_name, table_name, 'UPDATE') as can_update_any_column,
  has_table_privilege(role_name, table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as roles(role_name)
cross join (
  values
    ('public.foods'),
    ('public.food_logs'),
    ('public.food_log_items')
) as tables(table_name)
order by role_name, table_name;

select
  p.oid::regprocedure as signature,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_settings,
  p.proacl as acl,
  pg_get_function_result(p.oid) as return_type,
  pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'log_catalog_food',
    'update_food_log_item_quantity'
  )
order by signature;

-- Aggregate readiness only; no food names, user IDs, timestamps, or row data.
select
  count(*) filter (where serving_size_g is null) as null_serving_size,
  count(*) filter (where serving_size_g <= 0) as nonpositive_serving_size,
  count(*) filter (
    where calories is null
       or protein_g is null
       or carbs_g is null
       or fat_g is null
  ) as null_nutrition,
  count(*) filter (
    where calories < 0
       or protein_g < 0
       or carbs_g < 0
       or fat_g < 0
  ) as negative_nutrition
from public.foods;

select
  count(*) filter (where quantity_g is null) as null_quantity,
  count(*) filter (where quantity_g <= 0) as nonpositive_quantity,
  count(*) filter (
    where calories is null
       or protein_g is null
       or carbs_g is null
       or fat_g is null
  ) as null_nutrition,
  count(*) filter (
    where calories < 0
       or protein_g < 0
       or carbs_g < 0
       or fat_g < 0
  ) as negative_nutrition
from public.food_log_items;

select
  t.tgrelid::regclass as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger as t
where not t.tgisinternal
  and t.tgrelid in (
    'public.foods'::regclass,
    'public.food_logs'::regclass,
    'public.food_log_items'::regclass
  )
order by table_name, trigger_name;
