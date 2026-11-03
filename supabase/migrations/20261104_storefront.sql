-- ════════════════════════════════════════════════════════════════════
-- Sprint 15 — Coach storefront (Stripe Connect, direct charges)
-- ────────────────────────────────────────────────────────────────────
-- Coaches sell from their own Stripe connected account; CoachHub takes a
-- 10% application fee. The coach is the merchant of record (handles GST);
-- Stripe processing fees are paid by the coach's account.
--
--   coach_payout_accounts  — the coach's Stripe connected account + status.
--                            Written ONLY by Edge Functions (service role).
--   store_products         — what a coach sells:
--                              program  — one-off; the plan is delivered to the buyer
--                              coaching — recurring; buyer joins the roster (+ optional plan)
--                              squad    — recurring; buyer joins a group
--   store_orders           — purchases. Written ONLY by Edge Functions / webhook.
--   coach_store_open(uuid) — public: can this coach take payments right now?
--
-- Additive + idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════
begin;

-- ─── coach_payout_accounts ──────────────────────────────────────────
create table if not exists public.coach_payout_accounts (
  coach_id           uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id  text not null unique,
  country            text,
  default_currency   text,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.coach_payout_accounts enable row level security;

drop policy if exists payout_accounts_select_own on public.coach_payout_accounts;
create policy payout_accounts_select_own on public.coach_payout_accounts
  for select to authenticated using (coach_id = auth.uid());
-- No insert/update/delete policies: only the service role writes here.

-- ─── store_products ─────────────────────────────────────────────────
create table if not exists public.store_products (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references public.profiles(id) on delete cascade,
  kind              text not null check (kind in ('program', 'coaching', 'squad')),
  title             text not null check (char_length(title) between 1 and 120),
  description       text check (description is null or char_length(description) <= 4000),
  price_cents       integer not null check (price_cents between 100 and 1000000),
  currency          text not null default 'aud' check (currency in ('aud', 'usd', 'nzd', 'gbp', 'eur', 'cad')),
  billing_interval  text check (billing_interval in ('week', 'month')),
  plan_id           uuid references public.plans(id) on delete set null,
  group_id          uuid references public.groups(id) on delete set null,
  is_published      boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- programs are one-off; coaching and squads recur
  constraint store_products_interval_matches_kind check (
    (kind = 'program' and billing_interval is null) or (kind <> 'program' and billing_interval is not null)
  ),
  -- what a published product delivers must exist
  constraint store_products_program_needs_plan check (not is_published or kind <> 'program' or plan_id is not null),
  constraint store_products_squad_needs_group check (not is_published or kind <> 'squad' or group_id is not null)
);
create index if not exists store_products_coach_idx on public.store_products (coach_id, is_published, sort_order);
alter table public.store_products enable row level security;

-- Anyone (including signed-out visitors) can see published products; coaches see their own drafts.
drop policy if exists store_products_select on public.store_products;
create policy store_products_select on public.store_products
  for select using (is_published or coach_id = auth.uid());

-- Coaches manage their own products, and can only attach their own plans and groups.
drop policy if exists store_products_insert_own on public.store_products;
create policy store_products_insert_own on public.store_products
  for insert to authenticated with check (
    coach_id = auth.uid()
    and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.coach_id = auth.uid()))
    and (group_id is null or exists (select 1 from public.groups g where g.id = group_id and g.coach_id = auth.uid()))
  );

drop policy if exists store_products_update_own on public.store_products;
create policy store_products_update_own on public.store_products
  for update to authenticated using (coach_id = auth.uid()) with check (
    coach_id = auth.uid()
    and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.coach_id = auth.uid()))
    and (group_id is null or exists (select 1 from public.groups g where g.id = group_id and g.coach_id = auth.uid()))
  );

drop policy if exists store_products_delete_own on public.store_products;
create policy store_products_delete_own on public.store_products
  for delete to authenticated using (coach_id = auth.uid());

-- ─── store_orders ───────────────────────────────────────────────────
create table if not exists public.store_orders (
  id                          uuid primary key default gen_random_uuid(),
  product_id                  uuid references public.store_products(id) on delete set null,
  coach_id                    uuid not null references public.profiles(id) on delete cascade,
  buyer_id                    uuid not null references public.profiles(id) on delete cascade,
  kind                        text not null check (kind in ('program', 'coaching', 'squad')),
  title                       text not null,           -- snapshot at purchase
  amount_cents                integer not null,
  currency                    text not null,
  billing_interval            text,
  application_fee_cents       integer not null default 0,
  status                      text not null default 'pending'
                              check (status in ('pending', 'paid', 'active', 'past_due', 'canceled', 'refunded', 'expired')),
  stripe_account_id           text not null,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  stripe_subscription_id      text,
  current_period_end          timestamptz,
  cancel_at_period_end        boolean not null default false,
  fulfilled_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists store_orders_buyer_idx on public.store_orders (buyer_id, created_at desc);
create index if not exists store_orders_coach_idx on public.store_orders (coach_id, created_at desc);
create index if not exists store_orders_subscription_idx on public.store_orders (stripe_subscription_id);
alter table public.store_orders enable row level security;

drop policy if exists store_orders_select_party on public.store_orders;
create policy store_orders_select_party on public.store_orders
  for select to authenticated using (buyer_id = auth.uid() or coach_id = auth.uid());
-- No insert/update/delete policies: only the service role writes here.

-- ─── coach_store_open(coach) ────────────────────────────────────────
-- Public storefront check without exposing the payout account itself.
create or replace function public.coach_store_open(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select charges_enabled from public.coach_payout_accounts where coach_id = p_coach_id), false)
$$;
grant execute on function public.coach_store_open(uuid) to anon, authenticated;

commit;
