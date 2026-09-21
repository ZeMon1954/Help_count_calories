-- Phase 6 additive settings, macro targets, and food favorites.
begin;

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  units text not null default 'metric' check (units in ('metric','imperial')),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy settings_select on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update on public.user_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_settings to authenticated;

create table if not exists public.food_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);
alter table public.food_favorites enable row level security;
create policy favorites_select on public.food_favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_insert on public.food_favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorites_delete on public.food_favorites for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.food_favorites to authenticated;
create index food_favorites_food_id_idx on public.food_favorites(food_id);

alter table public.user_goals add column if not exists carbs_target_g numeric check (carbs_target_g >= 0);
alter table public.user_goals add column if not exists fat_target_g numeric check (fat_target_g >= 0);

create or replace function public.update_nutrition_targets(
  p_calories integer, p_protein_g numeric, p_carbs_g numeric, p_fat_g numeric
) returns boolean language plpgsql security invoker set search_path = '' as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_calories is null or p_calories < 500 or p_calories > 10000
     or p_protein_g is null or p_protein_g < 0 or p_protein_g > 1000
     or p_carbs_g is null or p_carbs_g < 0 or p_carbs_g > 2000
     or p_fat_g is null or p_fat_g < 0 or p_fat_g > 1000 then
    raise exception 'Invalid nutrition targets' using errcode='22023';
  end if;
  update public.user_goals set calorie_target=p_calories, protein_target_g=p_protein_g,
    carbs_target_g=p_carbs_g, fat_target_g=p_fat_g
  where user_id=v_user and ended_at is null;
  if not found then raise exception 'Active goal not found' using errcode='P0002'; end if;
  return true;
end $function$;
revoke all on function public.update_nutrition_targets(integer,numeric,numeric,numeric) from public, anon;
grant execute on function public.update_nutrition_targets(integer,numeric,numeric,numeric) to authenticated;

commit;
