-- Phase 3C STAGING TEST HARNESS -- NEVER RUN ON PRODUCTION.
-- This file is intentionally not registered in npm test or any migration tool.
-- It assumes the reviewed Phase 3C migration has already been applied to an
-- isolated staging database. Run ONLY through scripts/run-phase3c-staging-tests.ps1.
-- The wrapper uses psql --single-transaction and ON_ERROR_STOP. This harness
-- deliberately raises sentinel SQLSTATE P3T01 after all assertions pass, so
-- psql rolls back successful test writes as well as failed test writes.
--
-- Required psql variables:
--   -v phase3c_wrapper_guard=PHASE3C_REVIEWED_WRAPPER_V1
--   -v confirm_non_production=PHASE3C_STAGING_ONLY
--   -v test_user_a=<existing staging auth.users UUID>
--   -v test_user_b=<different existing staging auth.users UUID>
--   -v test_food_id=<disposable custom food UUID owned by test_user_a>
--
-- The connection role must be allowed to SET ROLE authenticated for testing.
-- Never pass a password, URL, service key, or JWT as a psql variable.
--
-- REQUIRED BEFORE USE: replace both reviewed constants below in a committed,
-- reviewed staging-only copy. They deliberately cannot be supplied with -v.
-- pg_control_system().system_identifier is server-derived and is not chosen by
-- the person invoking this test. Leave either placeholder unchanged and the
-- script refuses to proceed before any test write.

\set approved_staging_database '__REVIEWED_STAGING_DATABASE_NOT_CONFIGURED__'
\set approved_staging_system_identifier '__REVIEWED_STAGING_SYSTEM_ID_NOT_CONFIGURED__'

\set ON_ERROR_STOP on

\if :{?phase3c_wrapper_guard}
\else
  do $preflight$ begin
    raise exception 'REFUSED: use the reviewed Phase 3C wrapper';
  end $preflight$;
\endif
\if :{?confirm_non_production}
\else
  do $preflight$ begin
    raise exception 'REFUSED: confirm_non_production is required';
  end $preflight$;
\endif
\if :{?test_user_a}
\else
  do $preflight$ begin
    raise exception 'REFUSED: test_user_a is required';
  end $preflight$;
\endif
\if :{?test_user_b}
\else
  do $preflight$ begin
    raise exception 'REFUSED: test_user_b is required';
  end $preflight$;
\endif
\if :{?test_food_id}
\else
  do $preflight$ begin
    raise exception 'REFUSED: test_food_id is required';
  end $preflight$;
\endif

-- Calling pg_control_system() requires effective EXECUTE privilege on that
-- function. The actual ACL can differ by installation, so this harness does
-- not infer access from a role name. Missing EXECUTE fails closed before the
-- function is invoked and before any test write is attempted.
select pg_catalog.has_function_privilege(
  current_user,
  'pg_catalog.pg_control_system()'::regprocedure,
  'EXECUTE'
) as phase3c_can_read_system_identifier
\gset

\if :phase3c_can_read_system_identifier
\else
  do $preflight$ begin
    raise exception 'REFUSED: connection role cannot execute pg_control_system()';
  end $preflight$;
\endif

select
  :'confirm_non_production' = 'PHASE3C_STAGING_ONLY'
  and :'phase3c_wrapper_guard' = 'PHASE3C_REVIEWED_WRAPPER_V1'
  and :'approved_staging_database' <> '__REVIEWED_STAGING_DATABASE_NOT_CONFIGURED__'
  and :'approved_staging_system_identifier' <> '__REVIEWED_STAGING_SYSTEM_ID_NOT_CONFIGURED__'
  and current_database() = :'approved_staging_database'
  and (
    select system_identifier::text
    from pg_catalog.pg_control_system()
  ) = :'approved_staging_system_identifier'
  and current_setting('server_version_num')::integer between 170000 and 179999
  and :'test_user_a' <> :'test_user_b' as phase3c_safety_gate
\gset

\if :phase3c_safety_gate
  \echo 'Safety gate passed for the reviewed staging system fingerprint.'
\else
  do $preflight$ begin
    raise exception 'REFUSED: reviewed staging fingerprint, PostgreSQL 17, acknowledgement, or test users do not match';
  end $preflight$;
\endif

-- Fail before any writes if required objects or effective privileges differ.
do $test$
begin
  if to_regprocedure(
       'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)'
     ) is null
     or to_regprocedure(
       'public.update_food_log_item_quantity(uuid,numeric)'
     ) is null then
    raise exception 'ASSERT: Phase 3C RPCs are not installed';
  end if;

  if has_function_privilege(
       'anon',
       'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.update_food_log_item_quantity(uuid,numeric)',
       'EXECUTE'
     ) then
    raise exception 'ASSERT: anon unexpectedly has RPC EXECUTE';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.update_food_log_item_quantity(uuid,numeric)',
       'EXECUTE'
     ) then
    raise exception 'ASSERT: authenticated lacks RPC EXECUTE';
  end if;

  if has_table_privilege('authenticated', 'public.food_logs', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.food_logs', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.food_logs', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.food_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.food_log_items', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_log_items', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.food_log_items', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.food_log_items', 'UPDATE') then
    raise exception 'ASSERT: authenticated retains a prohibited direct write privilege';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.food_log_items',
    'DELETE'
  ) then
    raise exception 'ASSERT: authenticated lost Phase 3B item DELETE';
  end if;
end
$test$;

select set_config('phase3c.test_user_a', :'test_user_a', true);
select set_config('phase3c.test_user_b', :'test_user_b', true);
select set_config('phase3c.test_food_id', :'test_food_id', true);
select set_config(
  'phase3c.request_id',
  '00000000-0000-4000-8000-000000003c01',
  true
);
select set_config(
  'phase3c.legacy_request_id',
  '00000000-0000-4000-8000-000000003c02',
  true
);

-- Authenticate as user A using the same request claim consumed by auth.uid().
select set_config('request.jwt.claim.sub', current_setting('phase3c.test_user_a'), true);
set local role authenticated;

-- 1. First request creates exactly one log and one item.
select *
from public.log_catalog_food(
  current_setting('phase3c.test_food_id')::uuid,
  'lunch',
  125,
  statement_timestamp(),
  current_setting('phase3c.request_id')::uuid
)
\gset phase3c_first_

select set_config('phase3c.log_id', :'phase3c_first_log_id', true);
select set_config('phase3c.item_id', :'phase3c_first_item_id', true);
select set_config('phase3c.base_calories', :'phase3c_first_calories', true);
select set_config('phase3c.base_protein', :'phase3c_first_protein_g', true);
select set_config('phase3c.base_carbs', :'phase3c_first_carbs_g', true);
select set_config('phase3c.base_fat', :'phase3c_first_fat_g', true);
select set_config('phase3c.eaten_at', :'phase3c_first_eaten_at', true);
select set_config('phase3c.first_was_created', :'phase3c_first_was_created', true);

do $test$
begin
  if not current_setting('phase3c.first_was_created', true)::boolean then
    raise exception 'ASSERT: first request did not report was_created=true';
  end if;
end
$test$;

-- 2. Identical retry returns the same records without creating another row.
select *
from public.log_catalog_food(
  current_setting('phase3c.test_food_id')::uuid,
  'lunch',
  125.0,
  current_setting('phase3c.eaten_at')::timestamptz,
  current_setting('phase3c.request_id')::uuid
)
\gset phase3c_retry_

select set_config('phase3c.retry_log_id', :'phase3c_retry_log_id', true);
select set_config('phase3c.retry_item_id', :'phase3c_retry_item_id', true);
select set_config('phase3c.retry_was_created', :'phase3c_retry_was_created', true);

do $test$
begin
  if current_setting('phase3c.retry_log_id')::uuid
       <> current_setting('phase3c.log_id')::uuid
     or current_setting('phase3c.retry_item_id')::uuid
       <> current_setting('phase3c.item_id')::uuid
     or current_setting('phase3c.retry_was_created')::boolean then
    raise exception 'ASSERT: identical retry was not idempotent';
  end if;
end
$test$;

-- 3. Reusing the key with a different payload must produce PT409.
do $test$
begin
  begin
    perform * from public.log_catalog_food(
      current_setting('phase3c.test_food_id')::uuid,
      'lunch',
      126,
      current_setting('phase3c.eaten_at')::timestamptz,
      current_setting('phase3c.request_id')::uuid
    );
    raise exception 'ASSERT: different payload was accepted';
  exception
    when sqlstate 'PT409' then null;
  end;
end
$test$;

-- 10. anon is denied at execution time, not only by catalog inspection.
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $test$
begin
  begin
    perform * from public.log_catalog_food(
      current_setting('phase3c.test_food_id')::uuid,
      'lunch',
      125,
      current_setting('phase3c.eaten_at')::timestamptz,
      current_setting('phase3c.request_id')::uuid
    );
    raise exception 'ASSERT: anon executed log_catalog_food';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform * from public.update_food_log_item_quantity(
      current_setting('phase3c.item_id')::uuid,
      200
    );
    raise exception 'ASSERT: anon executed quantity update';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;

-- 5. User B cannot read, delete, or update user A's item.
reset role;
select set_config('request.jwt.claim.sub', current_setting('phase3c.test_user_b'), true);
set local role authenticated;
do $test$
declare
  v_deleted_count integer;
begin
  if exists (
    select 1 from public.food_log_items
    where id = current_setting('phase3c.item_id')::uuid
  ) then
    raise exception 'ASSERT: user B read user A item';
  end if;

  if exists (
    select 1 from public.food_logs
    where id = current_setting('phase3c.log_id')::uuid
  ) then
    raise exception 'ASSERT: user B read user A parent log';
  end if;

  delete from public.food_log_items
  where id = current_setting('phase3c.item_id')::uuid;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 0 then
    raise exception 'ASSERT: user B deleted user A item';
  end if;

  begin
    perform * from public.update_food_log_item_quantity(
      current_setting('phase3c.item_id')::uuid,
      200
    );
    raise exception 'ASSERT: user B updated user A item';
  exception
    when no_data_found then null;
  end;
end
$test$;

-- 10. Authenticated is rejected from direct INSERT/UPDATE paths. Expected
-- insufficient_privilege exceptions are caught; any successful write raises a
-- different assertion and its PL/pgSQL subtransaction is rolled back.
reset role;
select set_config('request.jwt.claim.sub', current_setting('phase3c.test_user_a'), true);
set local role authenticated;
do $test$
begin
  begin
    insert into public.food_logs (user_id, meal_type, eaten_at)
    values (
      current_setting('phase3c.test_user_a')::uuid,
      'lunch',
      statement_timestamp()
    );
    raise exception 'ASSERT: authenticated directly inserted food_logs';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.food_logs
    set note = note
    where id = current_setting('phase3c.log_id')::uuid;
    raise exception 'ASSERT: authenticated directly updated food_logs';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.food_log_items (
      food_log_id,
      food_id,
      food_name,
      quantity_g,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      input_method
    ) values (
      current_setting('phase3c.log_id')::uuid,
      current_setting('phase3c.test_food_id')::uuid,
      'privilege-test',
      1,
      1,
      0,
      0,
      0,
      'manual'
    );
    raise exception 'ASSERT: authenticated directly inserted food_log_items';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.food_log_items
    set quantity_g = quantity_g
    where id = current_setting('phase3c.item_id')::uuid;
    raise exception 'ASSERT: authenticated directly updated food_log_items';
  exception
    when insufficient_privilege then null;
  end;
end
$test$;

-- 7. Catalog changes do not mutate an existing item snapshot.
with changed as (
  update public.foods
  set calories = calories + 123,
      protein_g = protein_g + 7
  where id = current_setting('phase3c.test_food_id')::uuid
    and created_by = current_setting('phase3c.test_user_a')::uuid
  returning id
)
select count(*) = 1 as phase3c_catalog_changed from changed
\gset

select set_config('phase3c.catalog_changed', :'phase3c_catalog_changed', true);

do $test$
begin
  if not current_setting('phase3c.catalog_changed')::boolean then
    raise exception 'ASSERT: disposable catalog food was not editable by user A';
  end if;
end
$test$;

do $test$
declare
  v_item public.food_log_items%rowtype;
begin
  select * into strict v_item
  from public.food_log_items
  where id = current_setting('phase3c.item_id')::uuid;

  if v_item.calories <> current_setting('phase3c.base_calories')::numeric
     or v_item.protein_g <> current_setting('phase3c.base_protein')::numeric
     or v_item.carbs_g <> current_setting('phase3c.base_carbs')::numeric
     or v_item.fat_g <> current_setting('phase3c.base_fat')::numeric then
    raise exception 'ASSERT: catalog update changed historical nutrition';
  end if;
end
$test$;

-- 8. Repeated edits always recalculate from the original snapshot basis.
select * from public.update_food_log_item_quantity(
  current_setting('phase3c.item_id')::uuid,
  33
);
select * from public.update_food_log_item_quantity(
  current_setting('phase3c.item_id')::uuid,
  250
);
select *
from public.update_food_log_item_quantity(
  current_setting('phase3c.item_id')::uuid,
  125
)
\gset phase3c_roundtrip_

select set_config('phase3c.roundtrip_calories', :'phase3c_roundtrip_calories', true);
select set_config('phase3c.roundtrip_protein', :'phase3c_roundtrip_protein_g', true);
select set_config('phase3c.roundtrip_carbs', :'phase3c_roundtrip_carbs_g', true);
select set_config('phase3c.roundtrip_fat', :'phase3c_roundtrip_fat_g', true);

do $test$
begin
  if current_setting('phase3c.roundtrip_calories')::numeric
       <> current_setting('phase3c.base_calories')::numeric
     or current_setting('phase3c.roundtrip_protein')::numeric
       <> current_setting('phase3c.base_protein')::numeric
     or current_setting('phase3c.roundtrip_carbs')::numeric
       <> current_setting('phase3c.base_carbs')::numeric
     or current_setting('phase3c.roundtrip_fat')::numeric
       <> current_setting('phase3c.base_fat')::numeric then
    raise exception 'ASSERT: quantity round trip accumulated rounding drift';
  end if;
end
$test$;

-- 9. Simulate a legacy all-null snapshot row, then verify it remains readable
-- and deletable. This admin-only mutation is inside the rollback transaction.
select *
from public.log_catalog_food(
  current_setting('phase3c.test_food_id')::uuid,
  'snack',
  50,
  statement_timestamp(),
  current_setting('phase3c.legacy_request_id')::uuid
)
\gset phase3c_legacy_

select set_config('phase3c.legacy_item_id', :'phase3c_legacy_item_id', true);

reset role;
update public.food_log_items
set snapshot_serving_size_g = null,
    snapshot_calories = null,
    snapshot_protein_g = null,
    snapshot_carbs_g = null,
    snapshot_fat_g = null
where id = current_setting('phase3c.legacy_item_id')::uuid;

select set_config('request.jwt.claim.sub', current_setting('phase3c.test_user_a'), true);
set local role authenticated;
do $test$
begin
  if not exists (
    select 1 from public.food_log_items
    where id = current_setting('phase3c.legacy_item_id')::uuid
  ) then
    raise exception 'ASSERT: legacy row is not readable';
  end if;
end
$test$;
delete from public.food_log_items
where id = current_setting('phase3c.legacy_item_id')::uuid
returning id
\gset phase3c_legacy_deleted_

-- 6. Delete the original item, then retry. PT410 must be terminal and the
-- idempotency parent must remain so no replacement can be created.
delete from public.food_log_items
where id = current_setting('phase3c.item_id')::uuid;

do $test$
begin
  begin
    perform * from public.log_catalog_food(
      current_setting('phase3c.test_food_id')::uuid,
      'lunch',
      125,
      current_setting('phase3c.eaten_at')::timestamptz,
      current_setting('phase3c.request_id')::uuid
    );
    raise exception 'ASSERT: deleted idempotency result was recreated';
  exception
    when sqlstate 'PT410' then null;
  end;

  if not exists (
    select 1 from public.food_logs
    where id = current_setting('phase3c.log_id')::uuid
      and client_request_id = current_setting('phase3c.request_id')::uuid
  ) then
    raise exception 'ASSERT: terminal idempotency parent was removed';
  end if;
end
$test$;

reset role;

-- Success sentinel: with the required wrapper this is the first and only error
-- after all assertions pass. ON_ERROR_STOP stops immediately and psql
-- --single-transaction sends ROLLBACK. The wrapper accepts only this exact
-- SQLSTATE/message combination as success; every earlier error remains FAILED.
do $phase3c_success$
begin
  raise exception using
    errcode = 'P3T01',
    message = 'PHASE3C_ALL_ASSERTIONS_PASSED_ROLLBACK_REQUIRED';
end
$phase3c_success$;
