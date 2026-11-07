-- =====================================================================
-- 0003 — Business Manager connections (Phase 2, path B)
--
-- A Business Manager login belongs to the agency, not to one client, so
-- the OAuth state for that flow has no client. Relaxing only.
-- =====================================================================

begin;

alter table public.meta_oauth_states alter column client_id drop not null;

-- Fast lookup of an agency's Business Manager connections.
create index if not exists meta_connections_user_source_idx
  on public.meta_connections (user_id, source);

commit;
