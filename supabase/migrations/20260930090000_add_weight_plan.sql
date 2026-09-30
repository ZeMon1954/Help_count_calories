create table public.user_weight_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sex text not null check (sex in ('male', 'female')),
  target_weight_kg numeric(5, 2) not null check (target_weight_kg between 30 and 500),
  start_weight_kg numeric(5, 2) not null check (start_weight_kg between 30 and 500),
  pace text not null default 'normal' check (pace in ('easy', 'normal', 'fast')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_weight_plans enable row level security;
revoke all on public.user_weight_plans from anon, authenticated;
grant select, insert, update on public.user_weight_plans to authenticated;

create policy user_weight_plans_select on public.user_weight_plans
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_weight_plans_insert on public.user_weight_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_weight_plans_update on public.user_weight_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
