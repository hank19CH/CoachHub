/**
 * Storefront (Sprint 15) — coaches sell programs, coaching and squad memberships.
 * Payments are direct charges on the coach's Stripe connected account; CoachHub takes 10%.
 * Everything that touches Stripe goes through the `storefront` Edge Function.
 */
import { supabase } from '@/lib/supabase'
import type { CoachPayoutAccount, StoreCurrency, StoreInterval, StoreOrder, StoreProduct, StoreProductKind } from '@/types/database'

export const PLATFORM_FEE_PERCENT = 10

export const KIND_LABELS: Record<StoreProductKind, { name: string; blurb: string }> = {
  program: { name: 'Program', blurb: 'One-off purchase. The whole plan lands on the buyer’s calendar.' },
  coaching: { name: 'Coaching', blurb: 'Recurring. The buyer joins your roster; you program for them.' },
  squad: { name: 'Squad', blurb: 'Recurring. The buyer joins one of your groups.' },
}

export const CURRENCIES: StoreCurrency[] = ['aud', 'nzd', 'usd', 'gbp', 'eur', 'cad']

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function priceLabel(p: Pick<StoreProduct, 'price_cents' | 'currency' | 'billing_interval'>): string {
  const money = formatMoney(p.price_cents, p.currency)
  return p.billing_interval ? `${money} / ${p.billing_interval}` : money
}

// ─── Edge Function calls ────────────────────────────────────────────
async function callStorefront<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('storefront', { body })
  if (error) {
    // Non-2xx: the function's JSON { error } is on the response
    let message = error.message
    try {
      const ctx = (error as any).context
      const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json() : null
      if (parsed?.error) message = parsed.error
    } catch { /* keep the generic message */ }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

// ─── Coach: payouts ─────────────────────────────────────────────────
export async function getPayoutAccount(coachId: string): Promise<CoachPayoutAccount | null> {
  const { data, error } = await (supabase.from('coach_payout_accounts') as any)
    .select('*')
    .eq('coach_id', coachId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function refreshPayoutStatus(): Promise<CoachPayoutAccount | null> {
  const { account } = await callStorefront<{ account: CoachPayoutAccount | null }>({ action: 'connect_status' })
  return account
}

/** Returns the Stripe onboarding URL; the caller redirects to it. */
export async function startPayoutOnboarding(country: string): Promise<string> {
  const back = `${window.location.origin}/coach/store?payouts=return`
  const { url } = await callStorefront<{ url: string }>({
    action: 'connect_onboard',
    country,
    returnUrl: back,
    refreshUrl: `${window.location.origin}/coach/store?payouts=refresh`,
  })
  return url
}

// ─── Coach: products ────────────────────────────────────────────────
export interface ProductDraft {
  id?: string
  kind: StoreProductKind
  title: string
  description: string
  price_cents: number
  currency: StoreCurrency
  billing_interval: StoreInterval | null
  plan_id: string | null
  group_id: string | null
  is_published: boolean
}

export async function listMyProducts(coachId: string): Promise<StoreProduct[]> {
  const { data, error } = await (supabase.from('store_products') as any)
    .select('*')
    .eq('coach_id', coachId)
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export function validateDraft(d: ProductDraft): string | null {
  if (!d.title.trim()) return 'Give it a name.'
  if (!Number.isFinite(d.price_cents) || d.price_cents < 100) return 'The price must be at least 1.00.'
  if (d.price_cents > 1_000_000) return 'The price must be 10,000 or less.'
  if (d.kind !== 'program' && !d.billing_interval) return 'Choose weekly or monthly billing.'
  if (d.is_published && d.kind === 'program' && !d.plan_id) return 'Pick the plan this program delivers.'
  if (d.is_published && d.kind === 'squad' && !d.group_id) return 'Pick the group buyers join.'
  return null
}

export async function saveProduct(coachId: string, d: ProductDraft): Promise<StoreProduct> {
  const problem = validateDraft(d)
  if (problem) throw new Error(problem)
  const row = {
    kind: d.kind,
    title: d.title.trim(),
    description: d.description.trim() || null,
    price_cents: Math.round(d.price_cents),
    currency: d.currency,
    billing_interval: d.kind === 'program' ? null : d.billing_interval,
    plan_id: d.kind === 'squad' ? null : d.plan_id,
    group_id: d.kind === 'squad' ? d.group_id : null,
    is_published: d.is_published,
    updated_at: new Date().toISOString(),
  }
  const q = d.id
    ? (supabase.from('store_products') as any).update(row).eq('id', d.id).eq('coach_id', coachId)
    : (supabase.from('store_products') as any).insert({ ...row, coach_id: coachId })
  const { data, error } = await q.select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await (supabase.from('store_products') as any).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Coach: sales ───────────────────────────────────────────────────
export type SaleRow = StoreOrder & { buyer: { display_name: string; username: string; avatar_url: string | null } | null }

export async function listSales(coachId: string): Promise<SaleRow[]> {
  const { data, error } = await (supabase.from('store_orders') as any)
    .select('*, buyer:profiles!store_orders_buyer_id_fkey(display_name, username, avatar_url)')
    .eq('coach_id', coachId)
    .neq('status', 'pending')
    .neq('status', 'expired')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Gross, CoachHub fee and net for paid orders this calendar month (per currency). */
export function monthTotals(sales: SaleRow[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const by: Record<string, { gross: number; fee: number }> = {}
  for (const s of sales) {
    if (!['paid', 'active', 'past_due', 'canceled'].includes(s.status)) continue
    if (new Date(s.created_at).getTime() < start) continue
    const t = (by[s.currency] ??= { gross: 0, fee: 0 })
    t.gross += s.amount_cents
    t.fee += s.application_fee_cents
  }
  return Object.entries(by).map(([currency, t]) => ({ currency, gross: t.gross, fee: t.fee, net: t.gross - t.fee }))
}

// ─── Public storefront ──────────────────────────────────────────────
export interface Storefront {
  coach: { id: string; display_name: string; username: string; avatar_url: string | null; bio: string | null }
  open: boolean
  products: StoreProduct[]
}

export async function getStorefront(username: string): Promise<Storefront | null> {
  const { data: coach, error } = await (supabase.from('profiles') as any)
    .select('id, display_name, username, avatar_url, bio, user_type')
    .eq('username', username)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!coach || coach.user_type !== 'coach') return null
  const [{ data: products }, { data: open }] = await Promise.all([
    (supabase.from('store_products') as any)
      .select('*')
      .eq('coach_id', coach.id)
      .eq('is_published', true)
      .order('sort_order')
      .order('created_at'),
    (supabase as any).rpc('coach_store_open', { p_coach_id: coach.id }),
  ])
  return { coach, open: open === true, products: products ?? [] }
}

/** Returns the Stripe Checkout URL; the caller redirects to it. */
export async function startCheckout(productId: string, username: string): Promise<string> {
  const base = `${window.location.origin}/store/${encodeURIComponent(username)}`
  const { url } = await callStorefront<{ url: string }>({
    action: 'checkout',
    productId,
    successUrl: `${base}?purchase=success`,
    cancelUrl: `${base}?purchase=cancelled`,
  })
  return url
}

// ─── Buyer: purchases ───────────────────────────────────────────────
export type PurchaseRow = StoreOrder & { coach: { display_name: string; username: string; avatar_url: string | null } | null }

export async function listPurchases(buyerId: string): Promise<PurchaseRow[]> {
  const { data, error } = await (supabase.from('store_orders') as any)
    .select('*, coach:profiles!store_orders_coach_id_fkey(display_name, username, avatar_url)')
    .eq('buyer_id', buyerId)
    .neq('status', 'pending')
    .neq('status', 'expired')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function cancelSubscription(orderId: string): Promise<void> {
  await callStorefront<{ ok: true }>({ action: 'cancel', orderId })
}

export const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'bg-emerald-100 text-emerald-800' },
  active: { label: 'Active', tone: 'bg-emerald-100 text-emerald-800' },
  past_due: { label: 'Payment due', tone: 'bg-amber-100 text-amber-800' },
  canceled: { label: 'Ended', tone: 'bg-gray-100 text-gray-700' },
  refunded: { label: 'Refunded', tone: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Pending', tone: 'bg-gray-100 text-gray-700' },
  expired: { label: 'Expired', tone: 'bg-gray-100 text-gray-700' },
}

// ─── "Come back here after sign-up" (buying from a store while signed out) ──
const RETURN_KEY = 'coachhub:return-to'
export function rememberReturnTo(path: string) {
  try { sessionStorage.setItem(RETURN_KEY, path) } catch { /* storage unavailable */ }
}
export function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null
  } catch {
    return null
  }
}
