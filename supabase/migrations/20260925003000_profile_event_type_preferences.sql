alter table public.profiles
  add column preferred_event_types text[] not null default '{}';

alter table public.profiles
  add constraint profiles_preferred_event_types_allowed check (
    preferred_event_types <@ array[
      'Meetup',
      'Conference',
      'Competition',
      'Program',
      'Networking',
      'Demo day'
    ]::text[]
  );
