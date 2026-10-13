-- Run once in Supabase → SQL Editor (already included in schema.sql for new setups).
-- Lets people edit or delete their own games with a private edit key.
-- The browser keeps the key; the table stores only its SHA-256 hash.

-- Profile link: LinkedIn, Linktree or any https link.
alter table public.projects drop constraint if exists projects_linkedin_check;
alter table public.projects add constraint projects_linkedin_check
  check (linkedin is null or (linkedin ~* '^https://' and char_length(linkedin) <= 300));

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
