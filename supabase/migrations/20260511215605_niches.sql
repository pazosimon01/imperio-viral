-- Niches: agrupación dentro de un workspace para separar investigaciones por
-- nicho/cliente (ej: Inteligencia Artificial, Belleza, Cocina). Cada post,
-- perfil, scrape_run y job pertenece a UN nicho. La UI tiene un selector de
-- nicho activo (vía cookie) que filtra todo lo que el usuario ve.

create table niches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  slug         text not null,
  color        text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index idx_niches_workspace on niches(workspace_id);

alter table niches enable row level security;
create policy "niches_all_member" on niches
  for all using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- Agregar niche_id nullable para poder hacer el backfill antes del NOT NULL.
alter table posts        add column niche_id uuid references niches(id) on delete cascade;
alter table profiles     add column niche_id uuid references niches(id) on delete cascade;
alter table scrape_runs  add column niche_id uuid references niches(id) on delete cascade;
alter table jobs         add column niche_id uuid references niches(id) on delete cascade;

-- Por cada workspace existente, crear un nicho default ("Inteligencia Artificial")
-- y asignarle todos los rows del workspace.
do $$
declare
  ws record;
  default_id uuid;
begin
  for ws in select id from workspaces loop
    insert into niches (workspace_id, name, slug)
    values (ws.id, 'Inteligencia Artificial', 'ia')
    on conflict (workspace_id, slug) do update set name = excluded.name
    returning id into default_id;

    update posts        set niche_id = default_id where workspace_id = ws.id and niche_id is null;
    update profiles     set niche_id = default_id where workspace_id = ws.id and niche_id is null;
    update scrape_runs  set niche_id = default_id where workspace_id = ws.id and niche_id is null;
    update jobs         set niche_id = default_id where workspace_id = ws.id and niche_id is null;
  end loop;
end $$;

-- Ahora sí, NOT NULL.
alter table posts        alter column niche_id set not null;
alter table profiles     alter column niche_id set not null;
alter table scrape_runs  alter column niche_id set not null;
alter table jobs         alter column niche_id set not null;

-- Índices compuestos para queries que filtran por nicho activo.
create index idx_posts_niche       on posts(workspace_id, niche_id);
create index idx_profiles_niche    on profiles(workspace_id, niche_id);
create index idx_scrape_runs_niche on scrape_runs(workspace_id, niche_id);
create index idx_jobs_niche        on jobs(workspace_id, niche_id);
