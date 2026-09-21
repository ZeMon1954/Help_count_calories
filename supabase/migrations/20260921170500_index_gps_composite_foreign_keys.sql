create index if not exists activity_points_activity_id_user_id_idx
  on public.activity_points (activity_id, user_id);
create index if not exists activity_splits_activity_id_user_id_idx
  on public.activity_splits (activity_id, user_id);
