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
  ultima_actualizacion date
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
