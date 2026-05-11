-- Initial schema for Imperio Viral on Postgres.
-- Equivalent to the previous SQLite schema, plus multi-tenancy via workspaces
-- and Row Level Security policies. Each user belongs to one or more workspaces;
-- all content rows are scoped to a workspace_id. RLS enforces that an
-- authenticated user can only access rows in workspaces they belong to.

create extension if not exists pgcrypto;

-- ============================================================
-- Workspaces — the tenancy primitive
-- ============================================================

create table workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index idx_workspace_members_user on workspace_members(user_id);

-- SECURITY DEFINER avoids recursive RLS evaluation when policies on other
-- tables call this function. Marked STABLE so the planner can cache it.
create or replace function is_workspace_member(ws uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- ============================================================
-- Posts
-- ============================================================

create table posts (
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  id               text not null,
  short_code       text,
  url              text not null,
  type             text not null,

  owner_username   text,
  owner_full_name  text,
  owner_id         text,

  caption          text,
  hashtags         text[] not null default '{}',
  mentions         text[] not null default '{}',
  location_name    text,

  video_url        text,
  video_duration   double precision,
  images           text[] not null default '{}',
  display_url      text,

  music_artist     text,
  music_track      text,
  music_id         text,

  likes_count        integer not null default 0,
  comments_count     integer not null default 0,
  video_view_count   integer,
  video_play_count   integer,
  shares_count       integer,

  posted_at        bigint not null,
  scraped_at       bigint not null,
  source_hashtag   text,
  source_profile   text,
  language         text,

  viral_velocity        double precision,
  engagement_score      double precision,
  engagement_rate       double precision,
  view_rate             double precision,
  viral_score           double precision,
  viralidad_multiplier  double precision,
  viral_tier            text,
  hashtag_heat_mult     double precision,
  hashtag_heat_tier     text,

  raw_json         jsonb not null,

  primary key (workspace_id, id)
);

create index idx_posts_workspace_scraped   on posts(workspace_id, scraped_at desc);
create index idx_posts_workspace_posted    on posts(workspace_id, posted_at desc);
create index idx_posts_workspace_viral     on posts(workspace_id, viral_score desc);
create index idx_posts_workspace_engscore  on posts(workspace_id, engagement_score desc);
create index idx_posts_workspace_type      on posts(workspace_id, type);
create index idx_posts_workspace_hashtag   on posts(workspace_id, source_hashtag);
create index idx_posts_workspace_profile   on posts(workspace_id, source_profile);
create index idx_posts_workspace_language  on posts(workspace_id, language);
create index idx_posts_workspace_viraltier on posts(workspace_id, viral_tier);

-- ============================================================
-- Decisions, Transcriptions, Adaptations (per-post)
-- ============================================================

create table decisions (
  workspace_id uuid not null,
  post_id      text not null,
  decision     text not null check (decision in ('replicate','maybe','skip')),
  notes        text,
  decided_at   bigint not null,
  primary key (workspace_id, post_id),
  foreign key (workspace_id, post_id) references posts(workspace_id, id) on delete cascade
);
create index idx_decisions_decision on decisions(workspace_id, decision);

create table transcriptions (
  workspace_id   uuid not null,
  post_id        text not null,
  transcription  text not null,
  language       text,
  transcribed_at bigint not null,
  primary key (workspace_id, post_id),
  foreign key (workspace_id, post_id) references posts(workspace_id, id) on delete cascade
);

create table adaptations (
  workspace_id uuid not null,
  post_id      text not null,
  source_lang  text,
  result_json  jsonb not null,
  model        text not null,
  adapted_at   bigint not null,
  primary key (workspace_id, post_id),
  foreign key (workspace_id, post_id) references posts(workspace_id, id) on delete cascade
);

-- ============================================================
-- Profiles
-- ============================================================

create table profiles (
  workspace_id            uuid not null references workspaces(id) on delete cascade,
  username                text not null,
  full_name               text,
  bio                     text,
  followers_count         integer,
  following_count         integer,
  posts_count             integer,
  profile_pic_url         text,
  is_verified             boolean,
  language                text,
  median_engagement_score double precision,
  median_engagement_rate  double precision,
  median_views            double precision,
  scraped_at              bigint not null,
  primary key (workspace_id, username)
);

-- ============================================================
-- Scrape runs and async jobs
-- ============================================================

create table scrape_runs (
  id           bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  hashtag      text,
  started_at   bigint not null,
  finished_at  bigint,
  items_count  integer,
  apify_run_id text,
  error        text
);
create index idx_scrape_runs_workspace on scrape_runs(workspace_id, started_at desc);

create table jobs (
  id           text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type         text not null,
  input        jsonb not null,
  status       text not null,
  message      text,
  result       jsonb,
  error        text,
  started_at   bigint not null,
  finished_at  bigint
);
create index idx_jobs_workspace_started on jobs(workspace_id, started_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table workspaces        enable row level security;
alter table workspace_members enable row level security;
alter table posts             enable row level security;
alter table decisions         enable row level security;
alter table transcriptions    enable row level security;
alter table adaptations       enable row level security;
alter table profiles          enable row level security;
alter table scrape_runs       enable row level security;
alter table jobs              enable row level security;

create policy "workspaces_select_member" on workspaces
  for select using (is_workspace_member(id));

create policy "workspaces_insert_authenticated" on workspaces
  for insert with check (auth.uid() is not null);

create policy "workspace_members_select_self_or_peer" on workspace_members
  for select using (user_id = auth.uid() or is_workspace_member(workspace_id));

create policy "posts_all_member" on posts
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "decisions_all_member" on decisions
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "transcriptions_all_member" on transcriptions
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "adaptations_all_member" on adaptations
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "profiles_all_member" on profiles
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "scrape_runs_all_member" on scrape_runs
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy "jobs_all_member" on jobs
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
