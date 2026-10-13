-- Run this ONCE if you already ran add-knockout.sql before penalty shoot-out scores were added.
-- (add-knockout.sql and schema.sql now include these columns, so new setups do not need this file.)

alter table bracket_matches add column if not exists pen1 int check (pen1 >= 0);
alter table bracket_matches add column if not exists pen2 int check (pen2 >= 0);
