alter table public.ai_usage_logs
  drop constraint ai_usage_logs_feature_check,
  add constraint ai_usage_logs_feature_check
    check (feature in ('food_analysis', 'physique_analysis', 'nutrition_analysis', 'activity_analysis'));
