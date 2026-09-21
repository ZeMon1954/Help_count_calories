-- Remove the discontinued strength-workout program while preserving GPS activities.
drop function if exists public.create_default_workout_plan() cascade;
drop function if exists public.owns_session(uuid) cascade;
drop function if exists public.owns_plan_day(uuid) cascade;
drop function if exists public.owns_plan(uuid) cascade;

drop table if exists public.workout_sets cascade;
drop table if exists public.workout_sessions cascade;
drop table if exists public.workout_plan_exercises cascade;
drop table if exists public.workout_plan_days cascade;
drop table if exists public.workout_plans cascade;
drop table if exists public.exercise_muscles cascade;
drop table if exists public.exercises cascade;
drop table if exists public.muscle_groups cascade;

delete from public.reminders where type = 'workout';
alter table public.reminders drop constraint if exists reminders_type_check;
alter table public.reminders
  add constraint reminders_type_check check (type = any (array['meal'::text, 'weight'::text]));
