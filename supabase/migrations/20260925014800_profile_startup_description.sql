alter table public.profiles
  add column startup_description text not null default '';

alter table public.profiles
  add constraint profiles_startup_description_length check (
    char_length(startup_description) <= 8000
  );
