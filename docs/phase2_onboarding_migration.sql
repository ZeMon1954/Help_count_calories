-- Phase 2 migration: review and run once on the intended Supabase project.
-- Based on inspected schema. No existing table is dropped or recreated.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_workout_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  training_location text NOT NULL CHECK (training_location IN ('home', 'gym', 'both')),
  experience_level text NOT NULL CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  available_equipment text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_allowed CHECK (
    available_equipment <@ ARRAY['bodyweight','dumbbells','resistance_bands','barbell','bench','machines']::text[]
  )
);

ALTER TABLE public.user_workout_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY workout_preferences_select ON public.user_workout_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY workout_preferences_insert ON public.user_workout_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY workout_preferences_update ON public.user_workout_preferences
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY workout_preferences_delete ON public.user_workout_preferences
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workout_preferences TO authenticated;

-- SECURITY INVOKER: all writes remain subject to the existing RLS policies.
-- A function call is one database transaction. Locking the profile serializes
-- concurrent first-time submissions; later retries do not create extra history.
CREATE FUNCTION public.complete_onboarding(p_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_name text;
  v_goal text;
  v_location text;
  v_experience text;
  v_equipment text[];
  v_height numeric;
  v_weight numeric;
  v_days integer;
  v_birth date;
  v_activity text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Invalid onboarding payload';
  END IF;

  v_name := nullif(btrim(p_data->>'display_name'), '');
  v_goal := p_data->>'goal_type';
  v_location := p_data->>'training_location';
  v_experience := p_data->>'experience_level';
  IF v_name IS NULL OR length(v_name) > 100
     OR v_goal IS NULL OR v_goal NOT IN ('lose_fat','build_muscle','maintain')
     OR v_location IS NULL OR v_location NOT IN ('home','gym','both')
     OR v_experience IS NULL OR v_experience NOT IN ('beginner','intermediate','advanced') THEN
    RAISE EXCEPTION 'Invalid required onboarding fields';
  END IF;

  IF p_data ? 'available_equipment' AND jsonb_typeof(p_data->'available_equipment') <> 'array' THEN
    RAISE EXCEPTION 'Equipment must be an array';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO v_equipment
    FROM jsonb_array_elements_text(COALESCE(p_data->'available_equipment','[]'::jsonb)) AS e(x);
  IF NOT (v_equipment <@ ARRAY['bodyweight','dumbbells','resistance_bands','barbell','bench','machines']::text[]) THEN
    RAISE EXCEPTION 'Invalid equipment';
  END IF;

  v_height := NULLIF(p_data->>'height_cm','')::numeric;
  v_weight := NULLIF(p_data->>'weight_kg','')::numeric;
  v_days := NULLIF(p_data->>'workout_days','')::integer;
  v_birth := NULLIF(p_data->>'birth_date','')::date;
  v_activity := NULLIF(p_data->>'activity_level','');
  IF (v_height IS NOT NULL AND (v_height <= 0 OR v_height > 300))
     OR (v_weight IS NOT NULL AND (v_weight <= 0 OR v_weight > 500))
     OR (v_days IS NOT NULL AND (v_days < 0 OR v_days > 7))
     OR (v_birth IS NOT NULL AND (v_birth > current_date OR v_birth < DATE '1900-01-01'))
     OR (v_activity IS NOT NULL AND v_activity NOT IN ('sedentary','light','moderate','active','very_active')) THEN
    RAISE EXCEPTION 'Invalid optional onboarding fields';
  END IF;

  -- No signup trigger is required: safely create the caller's own profile.
  INSERT INTO public.profiles(id) VALUES (v_user)
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile unavailable';
  END IF;
  IF v_profile.onboarding_completed THEN
    RETURN true; -- Idempotent retry: do not insert new goal/weight.
  END IF;

  UPDATE public.profiles
  SET display_name = v_name, height_cm = v_height, birth_date = v_birth,
      activity_level = v_activity, updated_at = now()
  WHERE id = v_user;

  INSERT INTO public.user_goals(user_id, goal_type, workout_days)
  VALUES (v_user, v_goal, v_days);

  IF v_weight IS NOT NULL THEN
    INSERT INTO public.body_measurements(user_id, weight_kg)
    VALUES (v_user, v_weight);
  END IF;

  INSERT INTO public.user_workout_preferences
    (user_id, training_location, experience_level, available_equipment)
  VALUES (v_user, v_location, v_experience, v_equipment)
  ON CONFLICT (user_id) DO UPDATE SET
    training_location = EXCLUDED.training_location,
    experience_level = EXCLUDED.experience_level,
    available_equipment = EXCLUDED.available_equipment,
    updated_at = now();

  UPDATE public.profiles
  SET onboarding_completed = true, updated_at = now()
  WHERE id = v_user;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_onboarding(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_onboarding(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(jsonb) TO authenticated;

COMMIT;
