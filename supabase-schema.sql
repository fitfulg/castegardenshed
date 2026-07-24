create table if not exists public.materiales (
  id text primary key,
  codigo text,
  nombre text not null default 'Sin nombre',
  tipo_material text not null default 'Sin tipo',
  estanteria text,
  seccion text,
  cantidad numeric,
  cantidad_comprobada boolean not null default false,
  unidad text,
  ubicacion text,
  estado_stock text not null default 'pendiente',
  pedido_hecho boolean not null default false,
  prestado_cantidad numeric not null default 0,
  prestado_fijo boolean not null default false,
  prestado_fecha date,
  observaciones text,
  ultima_actualizacion date,
  modificado_por text,
  modificado_en timestamptz
);

alter table public.materiales
  alter column cantidad drop not null,
  alter column cantidad drop default;

alter table public.materiales
  add column if not exists cantidad_comprobada boolean not null default false;

alter table public.materiales
  add column if not exists seccion text;

alter table public.materiales
  add column if not exists prestado_cantidad numeric not null default 0;

alter table public.materiales
  add column if not exists prestado_fijo boolean not null default false;

alter table public.materiales
  add column if not exists prestado_fecha date;

alter table public.materiales
  add column if not exists modificado_por text;

alter table public.materiales
  add column if not exists modificado_en timestamptz;

alter table public.materiales enable row level security;

drop policy if exists "Lectura publica de materiales" on public.materiales;
drop policy if exists "Escritura publica de materiales" on public.materiales;

create policy "Lectura publica de materiales"
on public.materiales
for select
to anon
using (true);

create policy "Escritura publica de materiales"
on public.materiales
for all
to anon
using (true)
with check (true);

grant select, insert, update, delete on public.materiales to anon;

create table if not exists public.materiales_cambios (
  id text primary key,
  fecha timestamptz not null default now(),
  usuario text not null default 'Sin identificar',
  accion text not null,
  material_id text,
  codigo text,
  nombre text,
  estado_stock text,
  cantidad numeric,
  pedido_hecho boolean,
  observaciones text
);

alter table public.materiales_cambios enable row level security;

drop policy if exists "Lectura publica de cambios de materiales" on public.materiales_cambios;
drop policy if exists "Insercion publica de cambios de materiales" on public.materiales_cambios;

create policy "Lectura publica de cambios de materiales"
on public.materiales_cambios
for select
to anon
using (true);

create policy "Insercion publica de cambios de materiales"
on public.materiales_cambios
for insert
to anon
with check (true);

grant select, insert on public.materiales_cambios to anon;
