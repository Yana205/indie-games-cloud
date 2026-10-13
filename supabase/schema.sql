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

-- Edit/delete your own game with a private edit key (hash stored, never the key).
alter table public.projects add column if not exists edit_hash text
  check (edit_hash is null or edit_hash ~ '^[0-9a-f]{64}$');

create or replace function public.update_project(p_id uuid, p_token text, p_data jsonb)
returns public.projects
language plpgsql security definer set search_path = public
as $$
declare r public.projects;
begin
  update public.projects set
    title        = coalesce(p_data->>'title', title),
    description  = coalesce(p_data->>'description', description),
    status       = coalesce(p_data->>'status', status),
    platforms    = case when p_data ? 'platforms'
                     then array(select jsonb_array_elements_text(coalesce(p_data->'platforms', '[]'::jsonb)))
                     else platforms end,
    genre        = case when p_data ? 'genre' then nullif(p_data->>'genre', '') else genre end,
    creator_name = coalesce(p_data->>'creator_name', creator_name),
    creator_key  = case when p_data ? 'creator_key' then nullif(p_data->>'creator_key', '') else creator_key end,
    linkedin     = case when p_data ? 'linkedin' then nullif(p_data->>'linkedin', '') else linkedin end,
    url          = coalesce(p_data->>'url', url),
    thumbnail    = case when p_data ? 'thumbnail' then nullif(p_data->>'thumbnail', '') else thumbnail end
  where id = p_id
    and edit_hash is not null
    and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  returning * into r;
  if not found then
    raise exception 'Wrong edit key for this game' using errcode = '42501';
  end if;
  return r;
end $$;

create or replace function public.delete_project(p_id uuid, p_token text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.projects
  where id = p_id
    and edit_hash is not null
    and edit_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    raise exception 'Wrong edit key for this game' using errcode = '42501';
  end if;
  return true;
end $$;

revoke all on function public.update_project(uuid, text, jsonb) from public;
revoke all on function public.delete_project(uuid, text) from public;
grant execute on function public.update_project(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.delete_project(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
