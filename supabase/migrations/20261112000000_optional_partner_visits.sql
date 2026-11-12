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
    'onboardingComplete', true,
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

  update public.voting_editions set is_open = p_is_open
  where id = p_edition_id;
  if not found then
    raise exception 'Edition not found' using errcode = '22023';
  end if;
end;
$$;
