-- Análisis visual frame-por-frame de videos (Claude visión).
create table if not exists video_analyses (
  workspace_id uuid not null references workspaces(id),
  post_id text not null,
  result jsonb not null,
  model text,
  frames_count int,
  analyzed_at timestamptz not null default now(),
  primary key (workspace_id, post_id)
);

alter table video_analyses enable row level security;
do $$ begin
  create policy video_analyses_member on video_analyses
    using (is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
