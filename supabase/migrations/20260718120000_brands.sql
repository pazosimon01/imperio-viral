-- MARCAS: la memoria por cliente/negocio. El onboarding conversacional guarda
-- aquí el perfil consolidado; estrategias y contenido quedan ligados a su marca.

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  user_id uuid references app_users(id),
  nombre text not null,
  resumen text not null, -- perfil del negocio consolidado en la entrevista
  created_at timestamptz not null default now()
);
create index if not exists brands_ws_idx on brands (workspace_id, created_at desc);

alter table strategies add column if not exists brand_id uuid references brands(id);
alter table generated_content add column if not exists brand_id uuid references brands(id);

alter table brands enable row level security;
do $$ begin
  create policy brands_member on brands using (is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;
