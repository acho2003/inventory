create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_records (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists app_records_collection_idx
  on public.app_records (collection);

create index if not exists app_records_data_gin_idx
  on public.app_records using gin (data);

alter table public.app_state enable row level security;
alter table public.app_records enable row level security;

-- The Node API uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Keep browser clients away from these tables unless you add user-specific policies.
