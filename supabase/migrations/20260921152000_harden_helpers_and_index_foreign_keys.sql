revoke all on function public.owns_food_log(uuid) from public, anon;
revoke all on function public.owns_plan(uuid) from public, anon;
revoke all on function public.owns_plan_day(uuid) from public, anon;
revoke all on function public.owns_session(uuid) from public, anon;

grant execute on function public.owns_food_log(uuid) to authenticated;
grant execute on function public.owns_plan(uuid) to authenticated;
grant execute on function public.owns_plan_day(uuid) to authenticated;
grant execute on function public.owns_session(uuid) to authenticated;

create index if not exists food_analyses_food_log_id_user_id_idx
  on public.food_analyses (food_log_id, user_id);
create index if not exists food_log_items_food_id_idx
  on public.food_log_items (food_id);
create index if not exists workout_plan_exercises_exercise_id_idx
  on public.workout_plan_exercises (exercise_id);
create index if not exists workout_sessions_plan_day_id_idx
  on public.workout_sessions (plan_day_id);
create index if not exists workout_sets_exercise_id_idx
  on public.workout_sets (exercise_id);
