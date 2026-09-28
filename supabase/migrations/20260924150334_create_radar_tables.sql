-- Startup Radar data model.
-- Dates and optional descriptive fields are nullable.
-- Event writes are privileged (service role). User-owned rows use auth.uid().

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  startup_name text not null,
  industries text[] not null,
  stage text not null,
  preferred_location text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (char_length(btrim(name)) > 0),
  constraint profiles_startup_name_not_blank check (char_length(btrim(startup_name)) > 0),
  constraint profiles_location_not_blank check (char_length(btrim(preferred_location)) > 0),
  constraint profiles_industries_not_empty check (cardinality(industries) > 0),
  constraint profiles_stage_allowed check (
    stage in ('Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B+', 'Other')
  ),
  constraint profiles_industries_allowed check (
    industries <@ array[
      'AI',
      'Fintech',
      'SaaS',
      'E-commerce',
      'Healthcare',
      'Education',
      'Climate Tech',
      'Robotics',
      'Other'
    ]::text[]
  )
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  organizer text,
  category text,
  industry_tags text[] not null default '{}',
  event_type text not null,
  event_date timestamptz,
  registration_deadline timestamptz,
  location text,
  source_name text not null,
  source_url text not null,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  is_mock boolean not null default false,
  constraint events_title_not_blank check (char_length(btrim(title)) > 0),
  constraint events_source_name_not_blank check (char_length(btrim(source_name)) > 0),
  constraint events_source_url_not_blank check (char_length(btrim(source_url)) > 0),
  constraint events_source_url_unique unique (source_url),
  constraint events_type_allowed check (
    event_type in (
      'Meetup',
      'Conference',
      'Competition',
      'Program',
      'Networking',
      'Demo day'
    )
  ),
  constraint events_industry_tags_allowed check (
    industry_tags <@ array[
      'AI',
      'Fintech',
      'SaaS',
      'E-commerce',
      'Healthcare',
      'Education',
      'Climate Tech',
      'Robotics',
      'Other'
    ]::text[]
  )
);

create table public.relevance_evaluations (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  relevance_score smallint not null,
  explanation text not null,
  provider text not null,
  is_newly_discovered boolean not null default false,
  evaluated_at timestamptz not null default now(),
  constraint relevance_evaluations_score_range check (relevance_score between 0 and 100),
  constraint relevance_evaluations_explanation_not_blank check (char_length(btrim(explanation)) > 0),
  constraint relevance_evaluations_provider_allowed check (provider in ('mock', 'jev')),
  constraint relevance_evaluations_profile_event_unique unique (profile_id, event_id)
);

create table public.saved_events (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create index events_event_date_idx
  on public.events (event_date)
  where event_date is not null;

create index events_last_checked_at_idx
  on public.events (last_checked_at);

create index events_event_type_idx
  on public.events (event_type);

create index events_source_name_idx
  on public.events (source_name);

create index events_industry_tags_idx
  on public.events using gin (industry_tags);

create index relevance_evaluations_event_id_idx
  on public.relevance_evaluations (event_id);

create index saved_events_event_id_idx
  on public.saved_events (event_id);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.relevance_evaluations enable row level security;
alter table public.saved_events enable row level security;

alter table public.profiles force row level security;
alter table public.events force row level security;
alter table public.relevance_evaluations force row level security;
alter table public.saved_events force row level security;

revoke all on table public.profiles from anon, authenticated, service_role;
revoke all on table public.events from anon, authenticated, service_role;
revoke all on table public.relevance_evaluations from anon, authenticated, service_role;
revoke all on table public.saved_events from anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.events to authenticated;
grant select, insert, update, delete on table public.relevance_evaluations to authenticated;
grant select, insert, update, delete on table public.saved_events to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.events to service_role;
grant select, insert, update, delete on table public.relevance_evaluations to service_role;
grant select, insert, update, delete on table public.saved_events to service_role;

grant usage, select on sequence public.relevance_evaluations_id_seq to authenticated, service_role;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = id);

create policy events_select_authenticated
  on public.events
  for select
  to authenticated
  using (true);

create policy relevance_select_own
  on public.relevance_evaluations
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy relevance_insert_own
  on public.relevance_evaluations
  for insert
  to authenticated
  with check ((select auth.uid()) = profile_id);

create policy relevance_update_own
  on public.relevance_evaluations
  for update
  to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy relevance_delete_own
  on public.relevance_evaluations
  for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy saved_events_select_own
  on public.saved_events
  for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy saved_events_insert_own
  on public.saved_events
  for insert
  to authenticated
  with check ((select auth.uid()) = profile_id);

create policy saved_events_delete_own
  on public.saved_events
  for delete
  to authenticated
  using ((select auth.uid()) = profile_id);
