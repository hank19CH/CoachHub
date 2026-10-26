-- ════════════════════════════════════════════════════════════════════
-- posts.likes_count — maintained by a trigger on likes
-- ────────────────────────────────────────────────────────────────────
-- The client called increment_likes_count / decrement_likes_count RPCs that
-- were never created, so likes_count has not tracked real likes. The count is
-- now kept by the database itself:
--   1. AFTER INSERT/DELETE trigger on likes adjusts posts.likes_count
--      (SECURITY DEFINER: a user liking someone else's post can't update
--      that post under RLS; the single-row UPDATE is atomic, so concurrent
--      likes don't lose counts)
--   2. The two RPCs exist as no-ops so already-deployed clients that still
--      call them succeed instead of falling back to a manual count update
--      (which would double count alongside the trigger)
--   3. One-off recount of every post from the likes table
--
-- Additive + idempotent. Safe to re-run (the recount is also the repair step).
-- ════════════════════════════════════════════════════════════════════
begin;

-- ─── 1. Trigger ─────────────────────────────────────────────────────
create or replace function public.sync_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
       set likes_count = coalesce(likes_count, 0) + 1
     where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts
       set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
     where id = old.post_id;
  end if;
  return null;  -- AFTER trigger: return value ignored
end;
$$;

drop trigger if exists trg_likes_sync_post_count on public.likes;
create trigger trg_likes_sync_post_count
  after insert or delete on public.likes
  for each row execute function public.sync_post_likes_count();

-- ─── 2. No-op RPCs for clients deployed before this migration ───────
create or replace function public.increment_likes_count(post_id_input uuid)
returns void
language plpgsql
as $$
begin
  null;  -- DEPRECATED: likes_count is maintained by trg_likes_sync_post_count
end;
$$;

create or replace function public.decrement_likes_count(post_id_input uuid)
returns void
language plpgsql
as $$
begin
  null;  -- DEPRECATED: likes_count is maintained by trg_likes_sync_post_count
end;
$$;

grant execute on function public.increment_likes_count(uuid) to authenticated;
grant execute on function public.decrement_likes_count(uuid) to authenticated;

-- ─── 3. Recount existing posts ──────────────────────────────────────
update public.posts p
   set likes_count = c.n
  from (
    select p2.id, count(l.id)::int as n
      from public.posts p2
      left join public.likes l on l.post_id = p2.id
     group by p2.id
  ) c
 where c.id = p.id
   and p.likes_count is distinct from c.n;

commit;
