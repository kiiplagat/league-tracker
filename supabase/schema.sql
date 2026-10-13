-- League Tracker schema. Run this once in the Supabase SQL editor.

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  type text not null default 'league' check (type in ('league', 'knockout')),
  format text not null default 'single' check (format in ('single', 'double')),
  status text not null default 'active' check (status in ('active', 'completed')),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  name text not null,
  unique (tournament_id, name)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  round int not null,
  home_team_id uuid not null references teams (id) on delete cascade,
  away_team_id uuid not null references teams (id) on delete cascade,
  home_score int check (home_score >= 0),
  away_score int check (away_score >= 0),
  played boolean not null default false,
  played_at timestamptz,
  -- Participants only see matches the admin has published.
  published boolean not null default false,
  check (home_team_id <> away_team_id)
);

create index if not exists teams_tournament_idx on teams (tournament_id);
create index if not exists matches_tournament_idx on matches (tournament_id, round);
create index if not exists tournaments_owner_idx on tournaments (owner_id);

alter table tournaments enable row level security;
alter table teams enable row level security;
alter table matches enable row level security;

-- Everyone (participants, no login) can read.
create policy "public read tournaments" on tournaments for select using (true);
create policy "public read teams" on teams for select using (true);
-- Matches: the public only sees published ones. The owner sees all (via "owner write matches" below).
create policy "public read published matches" on matches for select using (published = true);

-- Only the signed-in owner (the admin) can change anything.
create policy "owner insert tournaments" on tournaments
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owner update tournaments" on tournaments
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner delete tournaments" on tournaments
  for delete to authenticated using (owner_id = auth.uid());

create policy "owner write teams" on teams
  for all to authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

create policy "owner write matches" on matches
  for all to authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Knockout (bracket) tournaments
-- ---------------------------------------------------------------------------
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

create index if not exists bracket_matches_tournament_idx on bracket_matches (tournament_id, round);

alter table bracket_matches enable row level security;

-- Participants only see rounds the admin has ticked (published).
create policy "public read published bracket matches" on bracket_matches
  for select using (published = true);

create policy "owner write bracket matches" on bracket_matches
  for all to authenticated
  using (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from tournaments t where t.id = tournament_id and t.owner_id = auth.uid()));
