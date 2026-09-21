-- Phase 5 shared exercise catalog and idempotent default-plan RPC.
-- APPLIED TO PRODUCTION on 2026-09-20.
-- Migration history: 20260920080747_add_default_workout_catalog_and_plan_rpc

begin;

insert into public.exercises
  (id, name, description, instructions, equipment, location, difficulty, safety_notes)
values
  ('10000000-0000-4000-8000-000000000001', 'Bodyweight Squat', 'ฝึกขาและสะโพก', 'ยืนแยกเท้า ลดสะโพกลงโดยรักษาหลังตรง แล้วดันตัวขึ้น', 'bodyweight', 'both', 'beginner', 'เข่าเคลื่อนไปตามแนวปลายเท้า'),
  ('10000000-0000-4000-8000-000000000002', 'Incline Push-up', 'ฝึกอก ไหล่ และแขนหลัง', 'วางมือบนพื้นยกระดับ เกร็งลำตัว ลดอกเข้าหาจุดรองรับแล้วดันกลับ', 'bodyweight', 'both', 'beginner', 'รักษาลำตัวเป็นเส้นตรง'),
  ('10000000-0000-4000-8000-000000000003', 'Glute Bridge', 'ฝึกสะโพกและต้นขาด้านหลัง', 'นอนหงาย ชันเข่า เกร็งสะโพกและยกขึ้นอย่างควบคุม', 'bodyweight', 'both', 'beginner', 'อย่าแอ่นหลังส่วนล่างมากเกินไป'),
  ('10000000-0000-4000-8000-000000000004', 'Plank', 'ฝึกแกนกลางลำตัว', 'วางศอกใต้ไหล่ เกร็งหน้าท้องและรักษาลำตัวเป็นเส้นตรง', 'bodyweight', 'both', 'beginner', 'หยุดเมื่อหลังส่วนล่างเริ่มแอ่น'),
  ('10000000-0000-4000-8000-000000000005', 'Reverse Lunge', 'ฝึกขาและการทรงตัว', 'ก้าวขาไปด้านหลัง ลดเข่าลง แล้วดันกลับสู่ท่ายืน', 'bodyweight', 'both', 'beginner', 'ใช้ที่พยุงหากการทรงตัวยังไม่มั่นคง'),
  ('10000000-0000-4000-8000-000000000006', 'Bird Dog', 'ฝึกแกนกลางและการควบคุมลำตัว', 'ตั้งสี่ขา เหยียดแขนและขาฝั่งตรงข้ามโดยไม่บิดสะโพก', 'bodyweight', 'both', 'beginner', 'เคลื่อนไหวช้าและรักษาหลังเป็นกลาง')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  instructions = excluded.instructions,
  equipment = excluded.equipment,
  location = excluded.location,
  difficulty = excluded.difficulty,
  safety_notes = excluded.safety_notes;

-- Database-enforced protection against concurrent duplicate active plans.
create unique index if not exists workout_plans_one_active_per_user_uidx
  on public.workout_plans (user_id)
  where status = 'active';

create or replace function public.create_default_workout_plan()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
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
    when 2 then array[2,5]
    when 3 then array[1,3,5]
    when 4 then array[1,2,4,6]
    when 5 then array[1,2,3,5,6]
    when 6 then array[1,2,3,4,5,6]
    else array[1,2,3,4,5,6,7]
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
end
$function$;

revoke all on function public.create_default_workout_plan() from public;
revoke all on function public.create_default_workout_plan() from anon;
grant execute on function public.create_default_workout_plan() to authenticated;

commit;
