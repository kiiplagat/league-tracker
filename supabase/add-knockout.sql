-- Run this ONCE in the Supabase SQL editor to add knockout (bracket) tournaments.
-- (If you are setting up from scratch, just run schema.sql instead; it already includes this.)

alter table tournaments
  add column if not exists type text not null default 'league' check (type in ('league', 'knockout'));

create table if not exists bracket_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  round int not null,
  position int not null,
  team1_id uuid references teams (id) on delete set null,
  team2_id uuid references teams (id) on delete set null,
  score1 int check (score1 >= 0),
  score2 int check (score2 >= 0),
  pen1 int check (pen1 >= 0),
  pen2 int check (pen2 >= 0),
  winner_id uuid references teams (id) on delete set null,
  published boolean not null default false,
  unique (tournament_id, round, position)
);

-- Penalty shoot-out scores (also added here so re-running this file upgrades an older table).
alter table bracket_matches add column if not exists pen1 int check (pen1 >= 0);
alter table bracket_matches add column if not exists pen2 int check (pen2 >= 0);

create index if not exists bracket_matches_tournament_idx on bracket_matches (tournament_id, round);

alter table bracket_matches enable row level security;

drop policy if exists "public read published bracket matches" on bracket_matches;
drop policy if exists "owner write bracket matches" on bracket_matches;

-- Participants only see rounds the admin has ticked (published).
create policy "public read published bracket matches" on bracket_matches
  for select using (published = true);

-- Only the signed-in owner (the admin) can change anything.
create policy "owner write bracket matches" on bracket_matches
  for all to authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));
