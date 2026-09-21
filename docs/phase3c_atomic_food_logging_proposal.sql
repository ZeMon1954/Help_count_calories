-- Phase 3C PROPOSAL ONLY. DO NOT APPLY WITHOUT EXPLICIT APPROVAL.
-- This migration is additive: it does not drop/recreate tables or alter RLS.

begin;

-- Idempotency metadata is nullable for compatibility with existing food_logs.
alter table public.food_logs
  add column if not exists client_request_id uuid,
  add column if not exists idempotency_payload jsonb;

do $migration$
declare
  v_expected record;
  v_actual record;
begin
  for v_expected in
    select * from (values
      ('client_request_id'::name, 'uuid'::regtype),
      ('idempotency_payload'::name, 'jsonb'::regtype)
    ) as expected(column_name, type_id)
  loop
    select a.atttypid, a.atttypmod, a.attnotnull, a.atthasdef, a.attgenerated
    into v_actual
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.food_logs'::regclass
      and a.attname = v_expected.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found
       or v_actual.atttypid is distinct from v_expected.type_id
       or v_actual.atttypmod is distinct from -1
       or v_actual.attnotnull
       or v_actual.atthasdef
       or v_actual.attgenerated is distinct from '' then
      raise exception
        'Existing column public.food_logs.% does not match the reviewed Phase 3C definition',
        v_expected.column_name;
    end if;
  end loop;
end
$migration$;

comment on column public.food_logs.client_request_id is
  'Client-generated UUID used to make food logging retries idempotent per user.';
comment on column public.food_logs.idempotency_payload is
  'Immutable canonical request payload used to reject idempotency-key reuse with different input.';

create unique index if not exists food_logs_user_client_request_uidx
  on public.food_logs (user_id, client_request_id)
  where client_request_id is not null;

-- IF NOT EXISTS only checks the object name. Fail closed if a same-named index
-- exists with a different table, method, key order, uniqueness, predicate, or
-- validity. Do not drop or replace an unexpected production object.
do $migration$
declare
  v_index record;
begin
  select
    i.indrelid,
    am.amname as access_method,
    i.indisunique,
    i.indisvalid,
    i.indisready,
    i.indislive,
    i.indnullsnotdistinct,
    i.indnkeyatts,
    i.indnatts,
    i.indexprs,
    array(
      select a.attname
      from unnest(i.indkey::smallint[]) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as a
        on a.attrelid = i.indrelid
       and a.attnum = key.attnum
      order by key.position
    ) as key_columns,
    array(
      select a.atttypid::regtype::text
      from unnest(i.indkey::smallint[]) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as a
        on a.attrelid = i.indrelid
       and a.attnum = key.attnum
      order by key.position
    ) as key_types,
    array(
      select op_namespace.nspname || '.' || op.opcname
      from unnest(i.indclass::oid[]) with ordinality as classes(opclass_id, position)
      join pg_catalog.pg_opclass as op on op.oid = classes.opclass_id
      join pg_catalog.pg_namespace as op_namespace
        on op_namespace.oid = op.opcnamespace
      order by classes.position
    ) as operator_classes,
    array(
      select option_value
      from unnest(i.indoption::smallint[]) with ordinality
        as options(option_value, position)
      order by options.position
    ) as index_options,
    regexp_replace(
      lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid, false)),
      '[[:space:]()]',
      '',
      'g'
    ) as normalized_predicate
  into v_index
  from pg_catalog.pg_class as index_class
  join pg_catalog.pg_namespace as index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_catalog.pg_index as i on i.indexrelid = index_class.oid
  join pg_catalog.pg_class as table_class on table_class.oid = i.indrelid
  join pg_catalog.pg_namespace as table_namespace
    on table_namespace.oid = table_class.relnamespace
  join pg_catalog.pg_am as am on am.oid = index_class.relam
  where index_namespace.nspname = 'public'
    and index_class.relname = 'food_logs_user_client_request_uidx';

  if not found
     or v_index.indrelid is distinct from 'public.food_logs'::regclass
     or v_index.access_method is distinct from 'btree'
     or not v_index.indisunique
     or not v_index.indisvalid
     or not v_index.indisready
     or not v_index.indislive
     or v_index.indnullsnotdistinct
     or v_index.indnkeyatts is distinct from 2
     or v_index.indnatts is distinct from 2
     or v_index.indexprs is not null
     or v_index.key_columns
          is distinct from array['user_id', 'client_request_id']::name[]
     or v_index.key_types is distinct from array['uuid', 'uuid']::text[]
     or v_index.operator_classes
          is distinct from
          array['pg_catalog.uuid_ops', 'pg_catalog.uuid_ops']::text[]
     or v_index.index_options is distinct from array[0, 0]::smallint[]
     or v_index.normalized_predicate
          is distinct from 'client_request_idisnotnull' then
    raise exception
      'Existing index public.food_logs_user_client_request_uidx does not match the reviewed Phase 3C definition';
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'food_logs_idempotency_metadata_complete'
      and conrelid = 'public.food_logs'::regclass
  ) then
    alter table public.food_logs
      add constraint food_logs_idempotency_metadata_complete
      check (
        (client_request_id is null and idempotency_payload is null)
        or (client_request_id is not null and idempotency_payload is not null)
      ) not valid;
  end if;
end
$migration$;

alter table public.food_logs
  validate constraint food_logs_idempotency_metadata_complete;

-- Immutable nutrition basis for exact quantity edits without consulting a
-- potentially changed food catalog and without cumulative rounding drift.
alter table public.food_log_items
  add column if not exists snapshot_serving_size_g numeric,
  add column if not exists snapshot_calories numeric,
  add column if not exists snapshot_protein_g numeric,
  add column if not exists snapshot_carbs_g numeric,
  add column if not exists snapshot_fat_g numeric;

do $migration$
declare
  v_column name;
  v_actual record;
begin
  foreach v_column in array array[
    'snapshot_serving_size_g'::name,
    'snapshot_calories'::name,
    'snapshot_protein_g'::name,
    'snapshot_carbs_g'::name,
    'snapshot_fat_g'::name
  ]
  loop
    select a.atttypid, a.atttypmod, a.attnotnull, a.atthasdef, a.attgenerated
    into v_actual
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.food_log_items'::regclass
      and a.attname = v_column
      and a.attnum > 0
      and not a.attisdropped;

    if not found
       or v_actual.atttypid is distinct from 'numeric'::regtype
       or v_actual.atttypmod is distinct from -1
       or v_actual.attnotnull
       or v_actual.atthasdef
       or v_actual.attgenerated is distinct from '' then
      raise exception
        'Existing column public.food_log_items.% does not match the reviewed Phase 3C definition',
        v_column;
    end if;
  end loop;
end
$migration$;

-- Preserve compatibility with existing rows. Their current quantity and
-- nutrition snapshot become the immutable basis for future quantity edits.
update public.food_log_items
set
  snapshot_serving_size_g = quantity_g,
  snapshot_calories = calories,
  snapshot_protein_g = protein_g,
  snapshot_carbs_g = carbs_g,
  snapshot_fat_g = fat_g
where quantity_g is not null
  and snapshot_serving_size_g is null
  and snapshot_calories is null
  and snapshot_protein_g is null
  and snapshot_carbs_g is null
  and snapshot_fat_g is null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'food_log_items_snapshot_serving_positive'
      and conrelid = 'public.food_log_items'::regclass
  ) then
    alter table public.food_log_items
      add constraint food_log_items_snapshot_serving_positive
      check (snapshot_serving_size_g is null or snapshot_serving_size_g > 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'food_log_items_snapshot_nutrition_nonnegative'
      and conrelid = 'public.food_log_items'::regclass
  ) then
    alter table public.food_log_items
      add constraint food_log_items_snapshot_nutrition_nonnegative
      check (
        (snapshot_calories is null or snapshot_calories >= 0)
        and (snapshot_protein_g is null or snapshot_protein_g >= 0)
        and (snapshot_carbs_g is null or snapshot_carbs_g >= 0)
        and (snapshot_fat_g is null or snapshot_fat_g >= 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'food_log_items_snapshot_basis_complete'
      and conrelid = 'public.food_log_items'::regclass
  ) then
    alter table public.food_log_items
      add constraint food_log_items_snapshot_basis_complete
      check (
        (
          snapshot_serving_size_g is null
          and snapshot_calories is null
          and snapshot_protein_g is null
          and snapshot_carbs_g is null
          and snapshot_fat_g is null
        )
        or (
          snapshot_serving_size_g is not null
          and snapshot_calories is not null
          and snapshot_protein_g is not null
          and snapshot_carbs_g is not null
          and snapshot_fat_g is not null
        )
      ) not valid;
  end if;
end
$migration$;

alter table public.food_log_items
  validate constraint food_log_items_snapshot_serving_positive;
alter table public.food_log_items
  validate constraint food_log_items_snapshot_nutrition_nonnegative;
alter table public.food_log_items
  validate constraint food_log_items_snapshot_basis_complete;

-- As with the index, ADD CONSTRAINT guards above are name-idempotent only.
-- Validate the actual catalog definitions after creation/validation and abort
-- the whole transaction on any mismatch. Existing objects are never dropped.
do $migration$
declare
  v_expected record;
  v_actual record;
begin
  for v_expected in
    select *
    from (values
      (
        'food_logs_idempotency_metadata_complete'::name,
        'public.food_logs'::regclass,
        'client_request_idisnullandidempotency_payloadisnullorclient_request_idisnotnullandidempotency_payloadisnotnull'::text
      ),
      (
        'food_log_items_snapshot_serving_positive'::name,
        'public.food_log_items'::regclass,
        'snapshot_serving_size_gisnullorsnapshot_serving_size_g>0'::text
      ),
      (
        'food_log_items_snapshot_nutrition_nonnegative'::name,
        'public.food_log_items'::regclass,
        'snapshot_caloriesisnullorsnapshot_calories>=0andsnapshot_protein_gisnullorsnapshot_protein_g>=0andsnapshot_carbs_gisnullorsnapshot_carbs_g>=0andsnapshot_fat_gisnullorsnapshot_fat_g>=0'::text
      ),
      (
        'food_log_items_snapshot_basis_complete'::name,
        'public.food_log_items'::regclass,
        'snapshot_serving_size_gisnullandsnapshot_caloriesisnullandsnapshot_protein_gisnullandsnapshot_carbs_gisnullandsnapshot_fat_gisnullorsnapshot_serving_size_gisnotnullandsnapshot_caloriesisnotnullandsnapshot_protein_gisnotnullandsnapshot_carbs_gisnotnullandsnapshot_fat_gisnotnull'::text
      )
    ) as expected(constraint_name, relation_id, normalized_expression)
  loop
    select
      c.contype,
      c.conrelid,
      c.convalidated,
      c.connoinherit,
      regexp_replace(
        replace(
          lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid, false)),
          '::numeric',
          ''
        ),
        '[[:space:]()]',
        '',
        'g'
      ) as normalized_expression
    into v_actual
    from pg_catalog.pg_constraint as c
    where c.conrelid = v_expected.relation_id
      and c.conname = v_expected.constraint_name;

    if not found
       or v_actual.contype is distinct from 'c'
       or v_actual.conrelid is distinct from v_expected.relation_id
       or not v_actual.convalidated
       or v_actual.connoinherit
       or v_actual.normalized_expression
            is distinct from v_expected.normalized_expression then
      raise exception
        'Existing constraint % on % does not match the reviewed Phase 3C definition',
        v_expected.constraint_name,
        v_expected.relation_id::regclass;
    end if;
  end loop;
end
$migration$;

create or replace function public.log_catalog_food(
  p_food_id uuid,
  p_meal_type text,
  p_quantity_g numeric,
  p_eaten_at timestamptz,
  p_client_request_id uuid
)
returns table (
  log_id uuid,
  item_id uuid,
  food_id uuid,
  food_name text,
  meal_type text,
  quantity_g numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  input_method text,
  eaten_at timestamptz,
  log_created_at timestamptz,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_food public.foods%rowtype;
  v_log public.food_logs%rowtype;
  v_item public.food_log_items%rowtype;
  v_meal_type text := lower(btrim(p_meal_type));
  v_ratio numeric;
  v_payload jsonb;
  v_was_created boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_food_id is null then
    raise exception 'Food ID is required' using errcode = '22023';
  end if;
  if p_client_request_id is null then
    raise exception 'Client request ID is required' using errcode = '22023';
  end if;
  if v_meal_type is null
     or v_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'Invalid meal type' using errcode = '22023';
  end if;
  if p_quantity_g is null or p_quantity_g <= 0 or p_quantity_g > 100000 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;
  -- Stable validation only: this must give the same answer on every retry.
  -- The time-relative "not too far in the future" rule is applied only after
  -- this transaction wins creation of a new idempotency key.
  if p_eaten_at is null
     or p_eaten_at < timestamptz '1900-01-01 00:00:00+00'
     or p_eaten_at = 'infinity'::timestamptz
     or p_eaten_at = '-infinity'::timestamptz then
    raise exception 'Invalid eaten timestamp' using errcode = '22023';
  end if;

  -- Build the fingerprint exclusively from normalized request inputs before
  -- touching the catalog. Epoch seconds avoid session-TimeZone-dependent JSON
  -- rendering; jsonb numeric equality also treats 100 and 100.0 identically.
  v_payload := jsonb_build_object(
    'food_id', p_food_id,
    'meal_type', v_meal_type,
    'quantity_g', p_quantity_g,
    'eaten_at_epoch', extract(epoch from p_eaten_at)
  );

  -- Fast retry path: lock the key row before inspecting its item. This works
  -- even if the source catalog row has since been deleted.
  select l.*
  into v_log
  from public.food_logs as l
  where l.user_id = v_user
    and l.client_request_id = p_client_request_id
  for update;

  if not found then
    -- The partial-index predicate is repeated verbatim so PostgreSQL can infer
    -- food_logs_user_client_request_uidx. A conflicting uncommitted insert is
    -- waited on by the unique-index conflict machinery.
    insert into public.food_logs (
      user_id,
      meal_type,
      eaten_at,
      client_request_id,
      idempotency_payload
    ) values (
      v_user,
      v_meal_type,
      p_eaten_at,
      p_client_request_id,
      v_payload
    )
    on conflict (user_id, client_request_id)
      where client_request_id is not null
    do nothing
    returning * into v_log;

    if found then
      v_was_created := true;
    else
      -- The winner committed before ON CONFLICT completed. Lock and read only
      -- this caller's row; do not consult the catalog on this retry path.
      select l.*
      into v_log
      from public.food_logs as l
      where l.user_id = v_user
        and l.client_request_id = p_client_request_id
      for update;

      if not found then
        raise exception 'Idempotency result is unavailable'
          using errcode = 'PT409';
      end if;
    end if;
  end if;

  if not v_was_created then
    if v_log.idempotency_payload is distinct from v_payload then
      raise exception 'Client request ID was already used with different input'
        using errcode = 'PT409';
    end if;

    select i.*
    into v_item
    from public.food_log_items as i
    where i.food_log_id = v_log.id
    order by i.id
    limit 1
    for share;

    if not found then
      -- The key row deliberately survives item deletion. This terminal result
      -- prevents the request ID from ever creating a replacement diary item.
      raise exception 'Idempotent request item was deleted'
        using errcode = 'PT410';
    end if;

    return query select
      v_log.id,
      v_item.id,
      v_item.food_id,
      v_item.food_name,
      v_log.meal_type,
      v_item.quantity_g,
      v_item.calories,
      v_item.protein_g,
      v_item.carbs_g,
      v_item.fat_g,
      v_item.input_method,
      v_log.eaten_at,
      v_log.created_at,
      false;
    return;
  end if;

  -- Creation-only policy. An already successful request bypasses this moving
  -- time window, so an identical retry remains valid months or years later.
  if p_eaten_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'Invalid eaten timestamp' using errcode = '22023';
  end if;

  -- Only the transaction that inserted the idempotency row reads the catalog.
  -- The share lock prevents a concurrent catalog DELETE/UPDATE from committing
  -- until the immutable item snapshot has been written.
  select f.*
  into v_food
  from public.foods as f
  where f.id = p_food_id
    and (f.created_by is null or f.created_by = v_user)
  for share;

  if not found then
    raise exception 'Food not found' using errcode = 'P0002';
  end if;
  if v_food.serving_size_g is null or v_food.serving_size_g <= 0 then
    raise exception 'Food serving size is invalid' using errcode = '23514';
  end if;

  v_ratio := p_quantity_g / v_food.serving_size_g;

  insert into public.food_log_items (
    food_log_id,
    food_id,
    food_name,
    quantity_g,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    input_method,
    snapshot_serving_size_g,
    snapshot_calories,
    snapshot_protein_g,
    snapshot_carbs_g,
    snapshot_fat_g
  ) values (
    v_log.id,
    v_food.id,
    v_food.name,
    p_quantity_g,
    round(v_food.calories * v_ratio, 4),
    round(v_food.protein_g * v_ratio, 4),
    round(v_food.carbs_g * v_ratio, 4),
    round(v_food.fat_g * v_ratio, 4),
    'manual',
    v_food.serving_size_g,
    v_food.calories,
    v_food.protein_g,
    v_food.carbs_g,
    v_food.fat_g
  )
  returning * into v_item;

  return query select
    v_log.id,
    v_item.id,
    v_item.food_id,
    v_item.food_name,
    v_log.meal_type,
    v_item.quantity_g,
    v_item.calories,
    v_item.protein_g,
    v_item.carbs_g,
    v_item.fat_g,
    v_item.input_method,
    v_log.eaten_at,
    v_log.created_at,
    true;
end;
$function$;

comment on function public.log_catalog_food(uuid, text, numeric, timestamptz, uuid) is
  'Atomically logs a catalog food. PT409 means idempotency-key payload conflict; PT410 means the original item was deleted and the key is terminal.';

create or replace function public.update_food_log_item_quantity(
  p_item_id uuid,
  p_quantity_g numeric
)
returns table (
  item_id uuid,
  food_log_id uuid,
  food_id uuid,
  food_name text,
  quantity_g numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  input_method text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_item public.food_log_items%rowtype;
  v_ratio numeric;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_item_id is null then
    raise exception 'Food log item ID is required' using errcode = '22023';
  end if;
  if p_quantity_g is null or p_quantity_g <= 0 or p_quantity_g > 100000 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

  -- SECURITY DEFINER is required because direct table UPDATE is revoked below.
  -- Ownership is therefore enforced explicitly and exclusively from auth.uid().
  select i.*
  into v_item
  from public.food_log_items as i
  join public.food_logs as l on l.id = i.food_log_id
  where i.id = p_item_id
    and l.user_id = v_user
  for update of i;

  if not found then
    raise exception 'Food log item not found' using errcode = 'P0002';
  end if;
  if v_item.snapshot_serving_size_g is null
     or v_item.snapshot_serving_size_g <= 0
     or v_item.snapshot_calories is null
     or v_item.snapshot_protein_g is null
     or v_item.snapshot_carbs_g is null
     or v_item.snapshot_fat_g is null then
    raise exception 'Food log item has no editable nutrition basis'
      using errcode = '55000';
  end if;

  v_ratio := p_quantity_g / v_item.snapshot_serving_size_g;

  update public.food_log_items as i
  set
    quantity_g = p_quantity_g,
    calories = round(v_item.snapshot_calories * v_ratio, 4),
    protein_g = round(v_item.snapshot_protein_g * v_ratio, 4),
    carbs_g = round(v_item.snapshot_carbs_g * v_ratio, 4),
    fat_g = round(v_item.snapshot_fat_g * v_ratio, 4)
  where i.id = v_item.id
  returning i.* into v_item;

  return query select
    v_item.id,
    v_item.food_log_id,
    v_item.food_id,
    v_item.food_name,
    v_item.quantity_g,
    v_item.calories,
    v_item.protein_g,
    v_item.carbs_g,
    v_item.fat_g,
    v_item.input_method;
end;
$function$;

comment on function public.update_food_log_item_quantity(uuid, numeric) is
  'Updates quantity and recalculates nutrition from the immutable original snapshot basis.';

-- Enforce the RPC-only write boundary. RLS limits rows, not columns, so it
-- cannot make snapshot_* immutable. Column grants are also insufficient here:
-- allowing direct updates to quantity/nutrition would bypass atomic snapshot
-- recalculation. Existing Phase 3B deletion remains available because DELETE
-- on food_log_items is intentionally retained. DELETE on food_logs is revoked
-- so an idempotency key cannot be removed and reused through REST.
--
-- Approval note: this is an intentional API-surface change. Confirm no client
-- outside this repository directly inserts/updates/deletes food_logs or directly
-- inserts/updates food_log_items before applying this proposal.
revoke insert, update, delete on table public.food_logs
  from public, anon, authenticated;
revoke insert, update on table public.food_log_items
  from public, anon, authenticated;

-- Table-level REVOKE does not remove independently granted column privileges.
-- Revoke INSERT/UPDATE on every currently present column as well. The effective
-- privilege assertions below also catch privileges inherited through any role
-- membership that these direct revokes cannot remove.
do $migration$
declare
  v_log_columns text;
  v_item_columns text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
  into v_log_columns
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'public.food_logs'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
  into v_item_columns
  from pg_catalog.pg_attribute as a
  where a.attrelid = 'public.food_log_items'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  execute format(
    'revoke insert (%s), update (%s) on table public.food_logs from public, anon, authenticated',
    v_log_columns,
    v_log_columns
  );
  execute format(
    'revoke insert (%s), update (%s) on table public.food_log_items from public, anon, authenticated',
    v_item_columns,
    v_item_columns
  );
end
$migration$;

-- These are SECURITY DEFINER because authenticated no longer has the underlying
-- INSERT/UPDATE grants. They use an empty search_path, schema-qualified objects,
-- auth.uid()-derived identity, and explicit ownership checks. The migration must
-- be installed by a reviewed trusted owner; do not use anon, authenticated, or
-- authenticator. The catalog assertions below record and verify the actual owner.
revoke all on function public.log_catalog_food(uuid, text, numeric, timestamptz, uuid)
  from public;
revoke all on function public.log_catalog_food(uuid, text, numeric, timestamptz, uuid)
  from anon;
grant execute on function public.log_catalog_food(uuid, text, numeric, timestamptz, uuid)
  to authenticated;

revoke all on function public.update_food_log_item_quantity(uuid, numeric)
  from public;
revoke all on function public.update_food_log_item_quantity(uuid, numeric)
  from anon;
grant execute on function public.update_food_log_item_quantity(uuid, numeric)
  to authenticated;

-- Fail closed if the actual SECURITY DEFINER owner or any effective client
-- privilege differs from the reviewed model. CREATE OR REPLACE preserves an
-- existing function's owner, so checking the catalog is mandatory on reruns.
do $migration$
declare
  v_log_owner name;
  v_update_owner name;
begin
  select r.rolname
  into strict v_log_owner
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as r on r.oid = p.proowner
  where p.oid = 'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)'::regprocedure;

  select r.rolname
  into strict v_update_owner
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as r on r.oid = p.proowner
  where p.oid = 'public.update_food_log_item_quantity(uuid,numeric)'::regprocedure;

  if v_log_owner <> current_user or v_update_owner <> current_user then
    raise exception
      'Unsafe function owner: expected migration role %, got log owner % and update owner %',
      current_user, v_log_owner, v_update_owner;
  end if;

  if current_user in ('anon', 'authenticated', 'authenticator') then
    raise exception 'Client-facing role cannot own SECURITY DEFINER functions';
  end if;

  if not has_schema_privilege(current_user, 'public', 'USAGE')
     or not has_table_privilege(current_user, 'public.foods', 'SELECT')
     or not has_table_privilege(current_user, 'public.food_logs', 'SELECT')
     or not has_table_privilege(current_user, 'public.food_logs', 'INSERT')
     or not has_table_privilege(current_user, 'public.food_log_items', 'SELECT')
     or not has_table_privilege(current_user, 'public.food_log_items', 'INSERT')
     or not has_table_privilege(current_user, 'public.food_log_items', 'UPDATE') then
    raise exception
      'Function owner lacks one or more required schema/table privileges';
  end if;

  if has_table_privilege('authenticated', 'public.food_logs', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.food_logs', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.food_logs', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.food_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.food_log_items', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_log_items', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.food_log_items', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.food_log_items', 'UPDATE')
     or has_table_privilege('anon', 'public.food_logs', 'INSERT')
     or has_table_privilege('anon', 'public.food_logs', 'UPDATE')
     or has_table_privilege('anon', 'public.food_logs', 'DELETE')
     or has_any_column_privilege('anon', 'public.food_logs', 'INSERT')
     or has_any_column_privilege('anon', 'public.food_logs', 'UPDATE')
     or has_table_privilege('anon', 'public.food_log_items', 'INSERT')
     or has_table_privilege('anon', 'public.food_log_items', 'UPDATE')
     or has_any_column_privilege('anon', 'public.food_log_items', 'INSERT')
     or has_any_column_privilege('anon', 'public.food_log_items', 'UPDATE') then
    raise exception
      'Client role still has effective direct write privileges, possibly through role inheritance';
  end if;

  if not has_table_privilege('authenticated', 'public.food_log_items', 'DELETE') then
    raise exception 'Phase 3B item deletion privilege would be broken';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)'::regprocedure,
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.update_food_log_item_quantity(uuid,numeric)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.log_catalog_food(uuid,text,numeric,timestamptz,uuid)'::regprocedure,
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.update_food_log_item_quantity(uuid,numeric)'::regprocedure,
       'EXECUTE'
     ) then
    raise exception 'Unexpected effective RPC EXECUTE privileges';
  end if;
end
$migration$;

commit;
