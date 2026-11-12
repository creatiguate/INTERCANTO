create table public.voting_editions (
  id text primary key,
  title text not null,
  max_votes integer not null default 10 check (max_votes = 10),
  is_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.voting_participants (
  id text primary key,
  edition_id text not null references public.voting_editions(id) on delete cascade,
  public_slug text not null unique,
  display_name text not null,
  photo_path text not null,
  ordinal smallint not null,
  unique (edition_id, ordinal)
);

create table public.voting_partners (
  id text not null,
  edition_id text not null references public.voting_editions(id) on delete cascade,
  display_name text not null,
  official_url text,
  is_required boolean not null default true,
  is_active boolean not null default false,
  primary key (edition_id, id),
  check (official_url is null or official_url ~ '^https://')
);

create table public.voting_balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.voting_editions(id) on delete cascade,
  votes_used integer not null default 0 check (votes_used between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, edition_id)
);

create table public.vote_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.voting_editions(id) on delete cascade,
  participant_id text not null references public.voting_participants(id),
  quantity smallint not null check (quantity between 1 and 10),
  created_at timestamptz not null default now()
);

create table public.voting_partner_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null,
  partner_id text not null,
  visited_at timestamptz not null default now(),
  primary key (user_id, edition_id, partner_id),
  foreign key (edition_id, partner_id)
    references public.voting_partners(edition_id, id) on delete cascade
);

create table public.voting_partner_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.voting_editions(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, edition_id)
);

create table public.voting_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.voting_ip_events (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index vote_transactions_user_edition_idx
  on public.vote_transactions (user_id, edition_id, created_at desc);
create index vote_transactions_edition_participant_idx
  on public.vote_transactions (edition_id, participant_id);
create index voting_partner_visits_user_edition_idx
  on public.voting_partner_visits (user_id, edition_id);
create index voting_ip_events_hash_created_idx
  on public.voting_ip_events (ip_hash, created_at desc);

alter table public.voting_editions enable row level security;
alter table public.voting_participants enable row level security;
alter table public.voting_partners enable row level security;
alter table public.voting_balances enable row level security;
alter table public.vote_transactions enable row level security;
alter table public.voting_partner_visits enable row level security;
alter table public.voting_partner_confirmations enable row level security;
alter table public.voting_admins enable row level security;
alter table public.voting_ip_events enable row level security;

revoke all on public.voting_editions, public.voting_participants,
  public.voting_partners, public.voting_balances, public.vote_transactions,
  public.voting_partner_visits, public.voting_partner_confirmations,
  public.voting_admins, public.voting_ip_events
from public, anon, authenticated;

insert into public.voting_editions (id, title)
values ('intercanto-t3', 'Intercanto Temporada 3')
on conflict (id) do nothing;

insert into public.voting_participants
  (id, edition_id, public_slug, display_name, photo_path, ordinal)
values
  ('eyfrid-enrique-matias', 'intercanto-t3', 'mercurio', 'Eyfrid Enrique Matías', '/assets/eyfrid-enrique-matias.webp', 1),
  ('angel-gabriel-tevalan', 'intercanto-t3', 'venus', 'Ángel Gabriel Tevalán', '/assets/angel-gabriel-tevalan.webp', 2),
  ('anyeli-eunice-perez', 'intercanto-t3', 'tierra', 'Anyeli Eunice Pérez', '/assets/anyeli-eunice-perez.webp', 3),
  ('elian-daniel-aguilar', 'intercanto-t3', 'marte', 'Elián Daniel Aguilar', '/assets/elian-daniel-aguilar.webp', 4),
  ('yinyel-maricecy-santizo', 'intercanto-t3', 'jupiter', 'Yinyel Maricecy Santizo', '/assets/yinyel-maricecy-santizo.webp', 5),
  ('nelida-etelvina', 'intercanto-t3', 'saturno', 'Nélida Etelvina R.', '/assets/nelida-etelvina.webp', 6),
  ('yhetel-zucely-molina', 'intercanto-t3', 'neptuno', 'Yhetel Zucely Molina', '/assets/yhetel-zucely-molina.webp', 7)
on conflict (id) do nothing;

insert into public.voting_partners
  (id, edition_id, display_name, is_required, is_active)
values
  ('cci', 'intercanto-t3', 'Centro Comercial Internacional', true, false),
  ('esmeraldas', 'intercanto-t3', 'Esmeralda''s Cosmetic', true, false),
  ('aguileon', 'intercanto-t3', 'Restaurante Aguileón', true, false),
  ('genesis', 'intercanto-t3', 'Financiera Génesis', true, false),
  ('creatiguate', 'intercanto-t3', 'CreatiGuate', true, false),
  ('despensa', 'intercanto-t3', 'Despensa Familiar', false, false)
on conflict (edition_id, id) do nothing;

create or replace function public.get_voting_public_state(p_edition_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with participant_totals as (
    select p.id, p.public_slug, p.display_name, p.photo_path, p.ordinal,
      coalesce(legacy.votes, 0) + coalesce(current.votes, 0) as votes
    from public.voting_participants p
    left join (
      select candidate_id, count(*)::bigint as votes
      from public.votes
      group by candidate_id
    ) legacy on legacy.candidate_id = p.id
    left join (
      select participant_id, sum(quantity)::bigint as votes
      from public.vote_transactions
      where edition_id = p_edition_id
      group by participant_id
    ) current on current.participant_id = p.id
    where p.edition_id = p_edition_id
  )
  select jsonb_build_object(
    'editionId', e.id,
    'title', e.title,
    'isOpen', e.is_open,
    'maxVotes', e.max_votes,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'slug', public_slug, 'name', display_name,
        'photo', photo_path, 'ordinal', ordinal, 'votes', votes
      ) order by ordinal)
      from participant_totals
    ), '[]'::jsonb),
    'totalVotes', coalesce((select sum(votes) from participant_totals), 0)
  )
  from public.voting_editions e
  where e.id = p_edition_id;
$$;

create or replace function public.get_voting_user_state(
  p_user_id uuid,
  p_edition_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := p_user_id;
  v_state jsonb;
begin
  if v_user_id is null or not exists (
    select 1 from auth.users
    where id = v_user_id and raw_app_meta_data ->> 'provider' = 'google'
  ) then
    raise exception 'Valid Google user required' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'votesUsed', coalesce(b.votes_used, 0),
    'votesRemaining', e.max_votes - coalesce(b.votes_used, 0),
    'onboardingComplete', exists (
      select 1 from public.voting_partner_confirmations c
      where c.user_id = v_user_id and c.edition_id = e.id
    ),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'url', p.official_url,
        'required', p.is_required, 'active', p.is_active,
        'visited', exists (
          select 1 from public.voting_partner_visits v
          where v.user_id = v_user_id and v.edition_id = e.id
            and v.partner_id = p.id
        )
      ) order by p.display_name)
      from public.voting_partners p
      where p.edition_id = e.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participantId', t.participant_id,
        'participantName', p.display_name,
        'quantity', t.quantity,
        'createdAt', t.created_at
      ) order by t.created_at desc)
      from (
        select participant_id, quantity, created_at
        from public.vote_transactions
        where user_id = v_user_id and edition_id = e.id
        order by created_at desc
        limit 20
      ) t
      join public.voting_participants p on p.id = t.participant_id
    ), '[]'::jsonb)
  )
  into v_state
  from public.voting_editions e
  left join public.voting_balances b
    on b.user_id = v_user_id and b.edition_id = e.id
  where e.id = p_edition_id;

  if v_state is null then
    raise exception 'Edition not found' using errcode = '22023';
  end if;
  return v_state;
end;
$$;

create or replace function public.record_voting_partner_visit(
  p_user_id uuid,
  p_edition_id text,
  p_partner_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := p_user_id;
begin
  if v_user_id is null or not exists (
    select 1 from auth.users
    where id = v_user_id and raw_app_meta_data ->> 'provider' = 'google'
  ) then
    raise exception 'Valid Google user required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.voting_partners p
    where p.edition_id = p_edition_id and p.id = p_partner_id
      and p.is_active and p.official_url is not null
  ) then
    raise exception 'Partner is not configured' using errcode = '22023';
  end if;

  insert into public.voting_partner_visits (user_id, edition_id, partner_id)
  select v_user_id, p.edition_id, p.id
  from public.voting_partners p
  where p.edition_id = p_edition_id and p.id = p_partner_id
    and p.is_active and p.official_url is not null
  on conflict (user_id, edition_id, partner_id) do nothing;
end;
$$;

create or replace function public.confirm_voting_partners(
  p_user_id uuid,
  p_edition_id text,
  p_acknowledged boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := p_user_id;
  v_required integer;
  v_visited integer;
begin
  if v_user_id is null or not exists (
    select 1 from auth.users
    where id = v_user_id and raw_app_meta_data ->> 'provider' = 'google'
  ) then
    raise exception 'Valid Google user required' using errcode = '28000';
  end if;
  if p_acknowledged is distinct from true then
    raise exception 'Explicit collaborator confirmation is required'
      using errcode = '22023';
  end if;

  select count(*) into v_required
  from public.voting_partners
  where edition_id = p_edition_id and is_required;

  if v_required = 0 or exists (
    select 1 from public.voting_partners
    where edition_id = p_edition_id and is_required
      and (not is_active or official_url is null)
  ) then
    raise exception 'Required collaborator pages are not configured'
      using errcode = '55000';
  end if;

  select count(*) into v_visited
  from public.voting_partner_visits v
  join public.voting_partners p
    on p.edition_id = v.edition_id and p.id = v.partner_id
  where v.user_id = v_user_id and v.edition_id = p_edition_id
    and p.is_required and p.is_active and p.official_url is not null;

  if v_visited <> v_required then
    raise exception 'Visit every required collaborator before continuing'
      using errcode = '55000';
  end if;

  insert into public.voting_partner_confirmations (user_id, edition_id)
  values (v_user_id, p_edition_id)
  on conflict (user_id, edition_id)
  do update set confirmed_at = excluded.confirmed_at;
end;
$$;

create or replace function public.cast_intercanto_votes(
  p_user_id uuid,
  p_edition_id text,
  p_participant_id text,
  p_quantity integer,
  p_request_id uuid,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := p_user_id;
  v_max_votes integer;
  v_is_open boolean;
  v_used integer;
  v_existing public.vote_transactions%rowtype;
begin
  if v_user_id is null or not exists (
    select 1 from auth.users
    where id = v_user_id and raw_app_meta_data ->> 'provider' = 'google'
  ) then
    raise exception 'Valid user required' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10 or p_request_id is null
    or p_ip_hash is null
    or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid vote request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('request:' || p_request_id::text, 0));
  select * into v_existing
  from public.vote_transactions
  where request_id = p_request_id;
  if found then
    if v_existing.user_id <> v_user_id
      or v_existing.edition_id <> p_edition_id
      or v_existing.participant_id <> p_participant_id
      or v_existing.quantity <> p_quantity then
      raise exception 'Idempotency key already used' using errcode = '22023';
    end if;
    select votes_used into v_used
    from public.voting_balances
    where user_id = v_user_id and edition_id = p_edition_id;
    return jsonb_build_object(
      'votesUsed', coalesce(v_used, 0),
      'votesRemaining', 10 - coalesce(v_used, 0),
      'replayed', true
    );
  end if;

  select max_votes, is_open into v_max_votes, v_is_open
  from public.voting_editions where id = p_edition_id;
  if not found then
    raise exception 'Edition not found' using errcode = '22023';
  end if;
  if not v_is_open then
    raise exception 'Voting is closed' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.voting_participants
    where id = p_participant_id and edition_id = p_edition_id
  ) then
    raise exception 'Participant not found' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.voting_partner_confirmations
    where user_id = v_user_id and edition_id = p_edition_id
  ) then
    raise exception 'Complete collaborator onboarding before voting'
      using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ip:' || p_ip_hash, 0));
  if (
    select count(*) from public.voting_ip_events
    where ip_hash = p_ip_hash and created_at > now() - interval '5 minutes'
  ) >= 20 then
    raise exception 'Too many voting requests from this network'
      using errcode = '53300';
  end if;
  insert into public.voting_ip_events (ip_hash) values (p_ip_hash);

  insert into public.voting_balances (user_id, edition_id)
  values (v_user_id, p_edition_id)
  on conflict (user_id, edition_id) do nothing;
  select votes_used into v_used
  from public.voting_balances
  where user_id = v_user_id and edition_id = p_edition_id
  for update;

  if v_used + p_quantity > v_max_votes then
    raise exception 'Vote allowance exceeded' using errcode = '22023';
  end if;

  insert into public.vote_transactions
    (request_id, user_id, edition_id, participant_id, quantity)
  values
    (p_request_id, v_user_id, p_edition_id, p_participant_id, p_quantity);
  update public.voting_balances
  set votes_used = v_used + p_quantity, updated_at = now()
  where user_id = v_user_id and edition_id = p_edition_id;

  return jsonb_build_object(
    'votesUsed', v_used + p_quantity,
    'votesRemaining', v_max_votes - v_used - p_quantity,
    'replayed', false
  );
end;
$$;

create or replace function public.get_voting_admin_overview(
  p_user_id uuid,
  p_edition_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.voting_admins where user_id = p_user_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'voting', public.get_voting_public_state(p_edition_id),
    'partners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', display_name, 'url', official_url,
        'required', is_required, 'active', is_active
      ) order by display_name)
      from public.voting_partners
      where edition_id = p_edition_id
    ), '[]'::jsonb)
  );
end;
$$;

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

  update public.voting_partners
  set official_url = p_url, is_active = p_active
  where edition_id = p_edition_id and id = p_partner_id;
  if not found then
    raise exception 'Collaborator not found' using errcode = '22023';
  end if;

  delete from public.voting_partner_confirmations where edition_id = p_edition_id;
  delete from public.voting_partner_visits where edition_id = p_edition_id;
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
  update public.voting_editions set is_open = p_is_open
  where id = p_edition_id;
  if not found then
    raise exception 'Edition not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.get_voting_public_state(text) from public;
revoke all on function public.get_voting_user_state(uuid, text) from public, anon, authenticated;
revoke all on function public.record_voting_partner_visit(uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_voting_partners(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.cast_intercanto_votes(uuid, text, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.get_voting_admin_overview(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_voting_partner(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_set_voting_open(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.get_voting_public_state(text) to anon, authenticated;
grant execute on function public.get_voting_user_state(uuid, text) to service_role;
grant execute on function public.record_voting_partner_visit(uuid, text, text) to service_role;
grant execute on function public.confirm_voting_partners(uuid, text, boolean) to service_role;
grant execute on function public.cast_intercanto_votes(uuid, text, text, integer, uuid, text) to service_role;
grant execute on function public.get_voting_admin_overview(uuid, text) to service_role;
grant execute on function public.admin_update_voting_partner(uuid, text, text, text, boolean) to service_role;
grant execute on function public.admin_set_voting_open(uuid, text, boolean) to service_role;
