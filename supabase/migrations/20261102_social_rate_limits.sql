-- ════════════════════════════════════════════════════════════════════
-- Sprint 14.5 — Rate limits on likes, comments and follows
-- ────────────────────────────────────────────────────────────────────
-- A BEFORE INSERT trigger rejects a write when the same user has made
-- too many of that action recently. Enforced in the database so it holds
-- however the request arrives (app, script, direct API call).
--
--   likes     30 per minute, 300 per hour
--   comments   5 per minute,  60 per hour
--   follows   20 per minute, 200 per hour
--
-- Rejected writes raise 'rate_limited: …' (SQLSTATE P0001); the app shows
-- "You're going a bit fast" and undoes its optimistic update.
-- Only signed-in users are limited (auth.uid() set); server-side inserts
-- (service role, other triggers) pass through.
-- Known gap: unliking deletes the row, so like/unlike toggling isn't
-- counted. Acceptable for beta; revisit with an event log if abused.
--
-- Additive + idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════
begin;

create index if not exists idx_likes_user_created     on public.likes(user_id, created_at);
create index if not exists idx_comments_author_created on public.comments(author_id, created_at);
create index if not exists idx_follows_follower_created on public.follows(follower_id, created_at);

create or replace function public.enforce_social_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor     uuid := auth.uid();
  per_min   int;
  per_hour  int;
  n_min     int;
  n_hour    int;
begin
  if actor is null then
    return new;
  end if;

  if tg_table_name = 'likes' then
    per_min := 30; per_hour := 300;
    select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
      into n_min, n_hour
      from public.likes
     where user_id = new.user_id and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'comments' then
    per_min := 5; per_hour := 60;
    select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
      into n_min, n_hour
      from public.comments
     where author_id = new.author_id and created_at > now() - interval '1 hour';
  elsif tg_table_name = 'follows' then
    per_min := 20; per_hour := 200;
    select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
      into n_min, n_hour
      from public.follows
     where follower_id = new.follower_id and created_at > now() - interval '1 hour';
  else
    return new;
  end if;

  if n_min >= per_min or n_hour >= per_hour then
    raise exception 'rate_limited: too many % in a short time', tg_table_name
      using errcode = 'P0001', hint = 'Wait a moment and try again.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_likes_rate_limit on public.likes;
create trigger trg_likes_rate_limit
  before insert on public.likes
  for each row execute function public.enforce_social_rate_limit();

drop trigger if exists trg_comments_rate_limit on public.comments;
create trigger trg_comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_social_rate_limit();

drop trigger if exists trg_follows_rate_limit on public.follows;
create trigger trg_follows_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_social_rate_limit();

commit;
