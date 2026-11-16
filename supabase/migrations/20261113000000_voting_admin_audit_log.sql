create table public.voting_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  edition_id text not null,
  action text not null check (action in (
    'partner_updated',
    'voting_open_changed'
  )),
  resource_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index voting_admin_audit_log_created_at_idx
  on public.voting_admin_audit_log (created_at desc);
create index voting_admin_audit_log_actor_created_idx
  on public.voting_admin_audit_log (actor_user_id, created_at desc);

alter table public.voting_admin_audit_log enable row level security;
revoke all on public.voting_admin_audit_log from public, anon, authenticated;
grant select on public.voting_admin_audit_log to service_role;

create or replace function public.admin_update_voting_partner(
  p_user_id uuid,
  p_edition_id text,
  p_partner_id text,
  p_url text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_url text;
  v_old_active boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.voting_admins where user_id = p_user_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_url is not null and p_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Collaborator URL must use HTTPS' using errcode = '22023';
  end if;
  if p_active and p_url is null then
    raise exception 'An active collaborator needs a URL' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.voting_editions
    where id = p_edition_id and is_open
  ) then
    raise exception 'Close voting before editing collaborator links'
      using errcode = '55000';
  end if;

  select official_url, is_active
  into v_old_url, v_old_active
  from public.voting_partners
  where edition_id = p_edition_id and id = p_partner_id
  for update;
  if not found then
    raise exception 'Collaborator not found' using errcode = '22023';
  end if;

  update public.voting_partners
  set official_url = p_url, is_active = p_active
  where edition_id = p_edition_id and id = p_partner_id;

  insert into public.voting_admin_audit_log
    (actor_user_id, edition_id, action, resource_id, details)
  values (
    p_user_id,
    p_edition_id,
    'partner_updated',
    p_partner_id,
    jsonb_build_object(
      'previousUrl', v_old_url,
      'previousActive', v_old_active,
      'url', p_url,
      'active', p_active
    )
  );
end;
$$;

create or replace function public.admin_set_voting_open(
  p_user_id uuid,
  p_edition_id text,
  p_is_open boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous_open boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.voting_admins where user_id = p_user_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_is_open and exists (
    select 1 from public.voting_partners
    where edition_id = p_edition_id and is_required
      and (not is_active or official_url is null)
  ) then
    raise exception 'Configure all required collaborator pages first'
      using errcode = '55000';
  end if;

  select is_open into v_previous_open
  from public.voting_editions
  where id = p_edition_id
  for update;
  if not found then
    raise exception 'Edition not found' using errcode = '22023';
  end if;

  update public.voting_editions set is_open = p_is_open
  where id = p_edition_id;

  insert into public.voting_admin_audit_log
    (actor_user_id, edition_id, action, resource_id, details)
  values (
    p_user_id,
    p_edition_id,
    'voting_open_changed',
    p_edition_id,
    jsonb_build_object('previousOpen', v_previous_open, 'isOpen', p_is_open)
  );
end;
$$;

revoke all on function public.admin_update_voting_partner(uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_set_voting_open(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_voting_partner(uuid, text, text, text, boolean)
  to service_role;
grant execute on function public.admin_set_voting_open(uuid, text, boolean)
  to service_role;
