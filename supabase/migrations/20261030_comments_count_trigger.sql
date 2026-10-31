-- ════════════════════════════════════════════════════════════════════
-- posts.comments_count — maintained by a trigger on comments
-- + counters on posts become database-owned (likes_count and comments_count)
-- ────────────────────────────────────────────────────────────────────
-- The client updated comments_count itself (read, +1, write back). Under RLS
-- that only works on the commenter's own posts, so most counts never moved.
--   1. AFTER INSERT/DELETE trigger on comments adjusts posts.comments_count
--      (SECURITY DEFINER, single atomic UPDATE). Replies count too: every
--      comments row is one comment, as the app counted before.
--   2. Guard trigger on posts: direct client writes to likes_count /
--      comments_count are ignored (new posts start at 0). Only the count
--      triggers can change them. This also stops already-deployed clients,
--      which still write comments_count, from double counting.
--   3. One-off recount of both counters from the source tables.
--
-- Requires: 20261026_likes_count_trigger.sql
-- Additive + idempotent. Safe to re-run (the recount is also the repair step).
-- ════════════════════════════════════════════════════════════════════
begin;

-- ─── 1. comments → posts.comments_count ─────────────────────────────
create or replace function public.sync_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
       set comments_count = coalesce(comments_count, 0) + 1
     where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts
       set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
     where id = old.post_id;
  end if;
  return null;  -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists trg_comments_sync_post_count on public.comments;
create trigger trg_comments_sync_post_count
  after insert or delete on public.comments
  for each row execute function public.sync_post_comments_count();

-- ─── 2. Guard: counters on posts are database-owned ─────────────────
-- pg_trigger_depth() = 1 means this guard fired for a statement the client
-- ran itself; > 1 means it fired inside a count trigger (allowed).
-- Maintenance (the recount below) opts in with coachhub.allow_count_write.
create or replace function public.guard_post_counters()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1
     or current_setting('coachhub.allow_count_write', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.likes_count := 0;
    new.comments_count := 0;
  else
    new.likes_count := old.likes_count;
    new.comments_count := old.comments_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_posts_guard_counters on public.posts;
create trigger trg_posts_guard_counters
  before insert or update of likes_count, comments_count on public.posts
  for each row execute function public.guard_post_counters();

-- ─── 3. Recount both counters ───────────────────────────────────────
set local coachhub.allow_count_write = 'on';

update public.posts p
   set likes_count = c.likes, comments_count = c.comments
  from (
    select p2.id,
           (select count(*) from public.likes l where l.post_id = p2.id)::int    as likes,
           (select count(*) from public.comments m where m.post_id = p2.id)::int as comments
      from public.posts p2
  ) c
 where c.id = p.id
   and (p.likes_count is distinct from c.likes or p.comments_count is distinct from c.comments);

commit;
