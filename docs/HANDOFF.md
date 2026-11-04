# Handoff — next session (2026-11-04)

Work lives on branch `claude/relaxed-planck-ps3xp9` (2 commits ahead of `main`, not merged):
`c55abc4` Publish Week fix · `99df62a` Sprint 15 storefront. See `docs/ROADMAP.md` (Sprint 15) for scope.

## Done by Henry
- Migration `20261104_storefront.sql` applied and verified (store_products / store_orders /
  coach_payout_accounts reachable; `coach_store_open()` callable).
- Supabase access token added to the cloud environment's **Network secrets** (needs a new session).

## Deployed 2026-11-04 (this session)
`storefront` v1, `stripe-webhook` v2, `create-checkout-session` v2 — all ACTIVE, verify_jwt=false,
verified live (CORS 200; storefront rejects unauthenticated; webhook rejects unsigned/forged).
Also fixed: standard-price secrets are named `STRIPE_PRICE_<TIER>_<INTERVAL>_STANDARD` but the code
read the name without `_STANDARD`, so non-beta coach subscriptions failed. Both names now accepted.
Steps 1–3 below are DONE; continue from step 4.

## Next steps
1. Confirm the Supabase token works: `curl -sS https://api.supabase.com/v1/projects` should list
   project `mzrmivqwywinsffkaimw` (CoachHub, "hank19ch Development/Research" org).
2. Deploy (server-side bundling, no Docker):
   `npx supabase functions deploy storefront stripe-webhook create-checkout-session --project-ref mzrmivqwywinsffkaimw --use-api`
   (`verify_jwt = false` for all three comes from `supabase/config.toml` — that is deliberate.)
3. Verify: `OPTIONS https://mzrmivqwywinsffkaimw.supabase.co/functions/v1/storefront` returns 200
   (it was 404 before deploy); `stripe-webhook` and `create-checkout-session` still 200.
4. Henry, in Stripe (test mode): Connect settings (platform profile, branding, enable Australia);
   Webhooks → add endpoint "Events on connected accounts" →
   `https://mzrmivqwywinsffkaimw.supabase.co/functions/v1/stripe-webhook` with events
   `account.updated, checkout.session.completed, checkout.session.async_payment_succeeded,
   checkout.session.expired, customer.subscription.updated, customer.subscription.deleted, charge.refunded`;
   save its signing secret as Supabase secret `STRIPE_CONNECT_WEBHOOK_SECRET`.
5. Walk Henry through a test-mode purchase (coach sets up payouts → publishes a program →
   athlete buys with card 4242 4242 4242 4242 → order `paid`, sessions on the athlete calendar).
6. Then open the PR `claude/relaxed-planck-ps3xp9` → `main`.

## Open decisions
- Stripe platform account is US-registered; if the company is Australian, switch to an AU
  platform account before going live (coaches would otherwise re-onboard later).
- Final name (CoachHub vs Ascend).
- Notion connector was disconnected — Notion not yet updated for the Publish Week fix + Sprint 15.
