-- Run this ONCE if you already ran the original schema.sql before publishing was added.
-- (If you are setting up from scratch, just run schema.sql instead; it already includes this.)

alter table matches add column if not exists published boolean not null default false;

drop policy if exists "public read matches" on matches;
drop policy if exists "public read published matches" on matches;
create policy "public read published matches" on matches for select using (published = true);

-- Optional: make any matches you already created visible to participants.
-- update matches set published = true;
