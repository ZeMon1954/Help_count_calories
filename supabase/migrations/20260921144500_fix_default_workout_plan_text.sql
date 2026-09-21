create or replace function public.create_default_workout_plan()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_plan uuid;
  v_day uuid;
  v_workout_days integer;
  v_goal text;
  v_training_days integer[];
  v_dow integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.id into v_existing
  from public.workout_plans p
  where p.user_id = v_user and p.status = 'active'
  order by p.created_at desc
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select greatest(1, least(7, coalesce(g.workout_days, 3))), g.goal_type
  into v_workout_days, v_goal
  from public.user_goals g
  where g.user_id = v_user and g.ended_at is null
  order by g.started_at desc
  limit 1;

  if not found then
    raise exception 'Active goal is required' using errcode = 'P0002';
  end if;

  v_training_days := case v_workout_days
    when 1 then array[3]
    when 2 then array[2, 5]
    when 3 then array[1, 3, 5]
    when 4 then array[1, 2, 4, 6]
    when 5 then array[1, 2, 3, 5, 6]
    when 6 then array[1, 2, 3, 4, 5, 6]
    else array[1, 2, 3, 4, 5, 6, 7]
  end;

  insert into public.workout_plans (user_id, name, goal_type, source, status)
  values (v_user, 'โปรแกรมพื้นฐานแบบ Full Body', v_goal, 'manual', 'active')
  on conflict (user_id) where status = 'active' do nothing
  returning id into v_plan;

  if v_plan is null then
    select p.id into v_plan
    from public.workout_plans p
    where p.user_id = v_user and p.status = 'active'
    order by p.created_at desc
    limit 1;
    if v_plan is null then
      raise exception 'Active workout plan is unavailable' using errcode = 'PT409';
    end if;
    return v_plan;
  end if;

  for v_dow in 1..7 loop
    insert into public.workout_plan_days (plan_id, day_of_week, name, is_rest_day)
    values (
      v_plan,
      v_dow,
      case when v_dow = any(v_training_days) then 'Full Body' else 'วันพัก' end,
      not (v_dow = any(v_training_days))
    )
    returning id into v_day;

    if v_dow = any(v_training_days) then
      insert into public.workout_plan_exercises
        (plan_day_id, exercise_id, sort_order, target_sets, target_reps, rest_seconds)
      values
        (v_day, '10000000-0000-4000-8000-000000000001', 1, 3, '10-12', 75),
        (v_day, '10000000-0000-4000-8000-000000000002', 2, 3, '8-12', 75),
        (v_day, '10000000-0000-4000-8000-000000000003', 3, 3, '12-15', 60),
        (v_day, '10000000-0000-4000-8000-000000000004', 4, 3, '30-45 วินาที', 45);
    end if;
  end loop;

  return v_plan;
end;
$$;

revoke all on function public.create_default_workout_plan() from public, anon;
grant execute on function public.create_default_workout_plan() to authenticated;
