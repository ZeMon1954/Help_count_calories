create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('walk', 'run', 'cycle')),
  status text not null default 'in_progress' check (status in ('in_progress', 'paused', 'completed', 'discarded')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  moving_seconds integer not null default 0 check (moving_seconds >= 0),
  distance_m numeric(12,2) not null default 0 check (distance_m >= 0),
  elevation_gain_m numeric(10,2) not null default 0 check (elevation_gain_m >= 0),
  average_speed_mps numeric(8,3),
  average_pace_seconds_per_km integer,
  calories numeric(10,2) not null default 0 check (calories >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.activity_points (
  id bigint generated always as identity primary key,
  activity_id uuid not null,
  user_id uuid not null,
  sequence integer not null check (sequence >= 0),
  recorded_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  altitude_m real,
  speed_mps real check (speed_mps is null or speed_mps >= 0),
  is_moving boolean not null default true,
  foreign key (activity_id, user_id) references public.activities(id, user_id) on delete cascade,
  unique (activity_id, sequence)
);

create table public.activity_splits (
  id bigint generated always as identity primary key,
  activity_id uuid not null,
  user_id uuid not null,
  split_number integer not null check (split_number > 0),
  distance_m numeric(10,2) not null check (distance_m > 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  pace_seconds_per_km integer,
  foreign key (activity_id, user_id) references public.activities(id, user_id) on delete cascade,
  unique (activity_id, split_number)
);

create index activities_user_started_idx on public.activities (user_id, started_at desc);
create index activity_points_activity_time_idx on public.activity_points (activity_id, recorded_at);
create index activity_points_user_idx on public.activity_points (user_id);
create index activity_splits_activity_idx on public.activity_splits (activity_id);
create index activity_splits_user_idx on public.activity_splits (user_id);

alter table public.activities enable row level security;
alter table public.activity_points enable row level security;
alter table public.activity_splits enable row level security;

revoke all on public.activities, public.activity_points, public.activity_splits from anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert, update, delete on public.activity_points to authenticated;
grant select, insert, update, delete on public.activity_splits to authenticated;
grant usage, select on sequence public.activity_points_id_seq to authenticated;
grant usage, select on sequence public.activity_splits_id_seq to authenticated;

create policy activities_select on public.activities for select to authenticated using ((select auth.uid()) = user_id);
create policy activities_insert on public.activities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activities_update on public.activities for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activities_delete on public.activities for delete to authenticated using ((select auth.uid()) = user_id);

create policy activity_points_select on public.activity_points for select to authenticated using ((select auth.uid()) = user_id);
create policy activity_points_insert on public.activity_points for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activity_points_update on public.activity_points for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activity_points_delete on public.activity_points for delete to authenticated using ((select auth.uid()) = user_id);

create policy activity_splits_select on public.activity_splits for select to authenticated using ((select auth.uid()) = user_id);
create policy activity_splits_insert on public.activity_splits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activity_splits_update on public.activity_splits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activity_splits_delete on public.activity_splits for delete to authenticated using ((select auth.uid()) = user_id);
