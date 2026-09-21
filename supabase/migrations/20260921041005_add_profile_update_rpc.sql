begin;

revoke all on table public.user_workout_preferences from anon;

create or replace function public.update_profile_settings(p_data jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_goal text;
  v_location text;
  v_experience text;
  v_equipment text[];
  v_height numeric;
  v_days integer;
  v_birth date;
  v_activity text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid profile payload' using errcode = '22023';
  end if;

  v_name := nullif(btrim(p_data->>'display_name'), '');
  v_goal := p_data->>'goal_type';
  v_location := p_data->>'training_location';
  v_experience := p_data->>'experience_level';
  if v_name is null or length(v_name) > 100
     or v_goal is null or v_goal not in ('lose_fat','build_muscle','maintain')
     or v_location is null or v_location not in ('home','gym','both')
     or v_experience is null or v_experience not in ('beginner','intermediate','advanced') then
    raise exception 'Invalid required profile fields' using errcode = '22023';
  end if;

  if p_data ? 'available_equipment'
     and jsonb_typeof(p_data->'available_equipment') <> 'array' then
    raise exception 'Equipment must be an array' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), array[]::text[])
    into v_equipment
    from jsonb_array_elements_text(
      coalesce(p_data->'available_equipment', '[]'::jsonb)
    ) as e(x);
  if not (
    v_equipment <@ array[
      'bodyweight','dumbbells','resistance_bands','barbell','bench','machines'
    ]::text[]
  ) then
    raise exception 'Invalid equipment' using errcode = '22023';
  end if;

  v_height := nullif(p_data->>'height_cm','')::numeric;
  v_days := nullif(p_data->>'workout_days','')::integer;
  v_birth := nullif(p_data->>'birth_date','')::date;
  v_activity := nullif(p_data->>'activity_level','');
  if (v_height is not null and (v_height <= 0 or v_height > 300))
     or v_days is null or v_days < 0 or v_days > 7
     or (v_birth is not null and (v_birth > current_date or v_birth < date '1900-01-01'))
     or (v_activity is not null and v_activity not in ('sedentary','light','moderate','active','very_active')) then
    raise exception 'Invalid optional profile fields' using errcode = '22023';
  end if;

  update public.profiles
  set display_name = v_name,
      height_cm = v_height,
      birth_date = v_birth,
      activity_level = v_activity,
      updated_at = now()
  where id = v_user and onboarding_completed = true;
  if not found then
    raise exception 'Completed profile not found' using errcode = 'P0002';
  end if;

  update public.user_goals
  set goal_type = v_goal, workout_days = v_days
  where user_id = v_user and ended_at is null;
  if not found then
    insert into public.user_goals(user_id, goal_type, workout_days)
    values (v_user, v_goal, v_days);
  end if;

  insert into public.user_workout_preferences
    (user_id, training_location, experience_level, available_equipment)
  values (v_user, v_location, v_experience, v_equipment)
  on conflict (user_id) do update set
    training_location = excluded.training_location,
    experience_level = excluded.experience_level,
    available_equipment = excluded.available_equipment,
    updated_at = now();

  return true;
end;
$function$;

revoke all on function public.update_profile_settings(jsonb) from public;
revoke all on function public.update_profile_settings(jsonb) from anon;
grant execute on function public.update_profile_settings(jsonb) to authenticated;

commit;
