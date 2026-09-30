-- Indexes for the hot read paths (stats, weekly report, food diary, history).
-- Every statement is idempotent, but `if not exists` only matches by name: if
-- an equivalent index was created earlier under another name (the base schema
-- is not tracked in this folder) it will now exist twice. Check with
--   select indexname, indexdef from pg_indexes where schemaname = 'public';
-- and drop the redundant one if so.

-- Diary, stats and weekly report: "this user's logs in a date range".
create index if not exists food_logs_user_eaten_at_idx
  on public.food_logs (user_id, eaten_at desc);

-- Embedded items are loaded per log.
create index if not exists food_log_items_food_log_id_idx
  on public.food_log_items (food_log_id);

-- Weight history and "latest weight".
create index if not exists body_measurements_user_recorded_at_idx
  on public.body_measurements (user_id, recorded_at desc);

-- Activity totals / stats by completion date.
create index if not exists activities_user_ended_at_idx
  on public.activities (user_id, ended_at desc)
  where status = 'completed';

-- "Is there an unfinished activity?" runs on every activity screen load.
create index if not exists activities_user_active_idx
  on public.activities (user_id, started_at desc)
  where status in ('in_progress', 'paused');

-- Paged route reads order by sequence.
create index if not exists activity_points_activity_sequence_idx
  on public.activity_points (activity_id, sequence);

-- Food search uses `name ilike '%term%'`, which a plain btree cannot serve.
create extension if not exists pg_trgm with schema extensions;
create index if not exists foods_name_trgm_idx
  on public.foods using gin (name extensions.gin_trgm_ops);
