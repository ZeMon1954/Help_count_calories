-- Phase 5 workout write-security proposal.
-- APPLIED TO PRODUCTION on 2026-09-20 after explicit approval.
-- Migration history: 20260920080401_harden_workout_session_plan_day_ownership
-- This does not create or recreate tables and preserves all existing rows.

begin;

-- Fail closed if the inspected ownership helper is absent or has drifted.
do $audit$
begin
  if to_regprocedure('public.owns_plan_day(uuid)') is null then
    raise exception 'Required helper public.owns_plan_day(uuid) is missing';
  end if;
  if to_regclass('public.workout_sessions') is null then
    raise exception 'Required table public.workout_sessions is missing';
  end if;
end
$audit$;

-- A caller may only attach a session to no plan day or to a day belonging to
-- one of their own plans. Identity is always derived from auth.uid().
alter policy owner_insert on public.workout_sessions
  with check (
    user_id = (select auth.uid())
    and (plan_day_id is null or public.owns_plan_day(plan_day_id))
  );

alter policy owner_update on public.workout_sessions
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (plan_day_id is null or public.owns_plan_day(plan_day_id))
  );

commit;

-- Rollback proposal (review before use): restore the two previous policy
-- expressions recorded by the read-only audit. Do not execute automatically.
-- alter policy owner_insert on public.workout_sessions
--   with check (user_id = (select auth.uid()));
-- alter policy owner_update on public.workout_sessions
--   using (user_id = (select auth.uid()))
--   with check (user_id = (select auth.uid()));
