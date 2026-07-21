-- MVP centralizado: usuarios con contraseña + estrategias CEREBRO + contenido generado.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  role text not null default 'member',
  workspace_id uuid references workspaces(id),
  created_at timestamptz not null default now()
);

create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  user_id uuid references app_users(id),
  business jsonb not null,
  result jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists strategies_ws_idx on strategies (workspace_id, created_at desc);

create table if not exists generated_content (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  user_id uuid references app_users(id),
  kind text not null, -- 'carrusel' | 'historias' | 'guion'
  source_post_id text,
  brief jsonb,
  result jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists gencontent_ws_idx on generated_content (workspace_id, created_at desc);

-- RLS consistente con el resto del proyecto (hoy se bypassa con rol postgres).
alter table app_users enable row level security;
alter table strategies enable row level security;
alter table generated_content enable row level security;

do $$ begin
  create policy strategies_member on strategies
    using (is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy gencontent_member on generated_content
    using (is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
