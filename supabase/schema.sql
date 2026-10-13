-- Run this once in Supabase → SQL Editor.
-- Anyone can read and add games; nobody can edit or delete through the public key.

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  title         text not null check (char_length(title) between 1 and 60),
  description   text not null check (
                  char_length(description) between 3 and 140
                  and array_length(regexp_split_to_array(btrim(description), '\s+'), 1) >= 2
                ),
  status        text not null check (status in ('Released', 'In development', 'Prototype')),
  platforms     text[] not null default '{}' check (cardinality(platforms) <= 8),
  genre         text check (genre is null or char_length(genre) between 1 and 24),
  creator_name  text not null check (char_length(creator_name) between 1 and 60),
  -- SHA-256 of the email (hashed in the browser). The raw email is never stored.
  creator_key   text check (creator_key is null or creator_key ~ '^[a-z0-9]{8,64}$'),
  -- Profile link for networking: LinkedIn, Linktree, portfolio...
  linkedin      text check (linkedin is null or (linkedin ~* '^https://' and char_length(linkedin) <= 300)),
  url           text not null check (url ~* '^https?://' and char_length(url) <= 500),
  -- Either an https image URL or a small uploaded image (data URL, ~50 KB).
  thumbnail     text check (
                  thumbnail is null
                  or (thumbnail ~ '^(https://|data:image/(png|jpe?g|webp|gif);base64,)' and char_length(thumbnail) <= 250000)
                )
);

alter table public.projects enable row level security;

drop policy if exists "Anyone can read projects" on public.projects;
create policy "Anyone can read projects" on public.projects
  for select using (true);

drop policy if exists "Anyone can add a project" on public.projects;
create policy "Anyone can add a project" on public.projects
  for insert with check (true);
