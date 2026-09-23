create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('food_analysis', 'physique_analysis', 'nutrition_analysis')),
  model text not null,
  request_count integer not null default 1 check (request_count > 0),
  outcome text not null check (outcome in ('success', 'quota_exceeded', 'provider_error', 'timeout', 'invalid_response')),
  upstream_status integer check (upstream_status is null or upstream_status between 100 and 599),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  thinking_tokens integer check (thinking_tokens is null or thinking_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from anon, authenticated;
grant select, insert on public.ai_usage_logs to authenticated;
grant usage, select on sequence public.ai_usage_logs_id_seq to authenticated;

create policy ai_usage_logs_select on public.ai_usage_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy ai_usage_logs_insert on public.ai_usage_logs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
