create table public.votes (
  id bigint generated always as identity primary key,
  candidate_id text not null check (candidate_id in (
    'eyfrid-enrique-matias',
    'angel-gabriel-tevalan',
    'anyeli-eunice-perez',
    'elian-daniel-aguilar',
    'yinyel-maricecy-santizo',
    'nelida-etelvina',
    'yhetel-zucely-molina'
  )),
  voter_hash text not null unique check (voter_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index votes_candidate_id_idx on public.votes (candidate_id);
create index votes_created_at_idx on public.votes (created_at);

alter table public.votes enable row level security;
revoke all on public.votes from public, anon, authenticated;
grant select, insert on public.votes to service_role;
grant usage, select on sequence public.votes_id_seq to service_role;

create function public.get_voting_state(p_voter_hash text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  with participants (ordinal, id) as (
    values
      (1, 'eyfrid-enrique-matias'),
      (2, 'angel-gabriel-tevalan'),
      (3, 'anyeli-eunice-perez'),
      (4, 'elian-daniel-aguilar'),
      (5, 'yinyel-maricecy-santizo'),
      (6, 'nelida-etelvina'),
      (7, 'yhetel-zucely-molina')
  ),
  tallies as (
    select candidate_id, count(*)::bigint as votes
    from public.votes
    group by candidate_id
  )
  select jsonb_build_object(
    'results',
    jsonb_agg(
      jsonb_build_object('id', participants.id, 'votes', coalesce(tallies.votes, 0))
      order by participants.ordinal
    ),
    'myVote',
    (select candidate_id from public.votes where voter_hash = p_voter_hash limit 1)
  )
  from participants
  left join tallies on tallies.candidate_id = participants.id;
$$;

revoke all on function public.get_voting_state(text) from public, anon, authenticated;
grant execute on function public.get_voting_state(text) to service_role;
