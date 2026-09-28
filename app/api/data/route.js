import { withUser, handler, HttpError } from '@/lib/server/db';

// One round trip for the whole ledger. This is a small rental business, so the
// app loads everything the way it used to from localStorage — but the money
// columns now come straight from public.booking_financials, computed by
// Postgres, instead of being re-derived in the browser.
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => withUser(req, async (c, user) => {
  const role = (await c.query('select public.current_role() as role')).rows[0].role;
  if (!role) throw new HttpError(403, 'No active profile for this account');

  const [bookings, vehicles, hosts, customers, transactions, categories, settings, profile] =
    await Promise.all([
      // booking_id is aliased to id so every endpoint speaks the same key
      c.query('select booking_id as id, * from public.booking_financials order by starts_at desc'),
      c.query('select * from public.vehicles order by reg_number'),
      c.query('select * from public.hosts order by name'),
      c.query('select * from public.customers order by name'),
      c.query('select * from public.transactions order by booked_on desc, created_at desc'),
      c.query('select * from public.categories order by kind, sort_order'),
      c.query('select key, value from public.app_settings'),
      c.query('select id, full_name, role from public.profiles where id = $1', [user.id]),
    ]);

  return {
    role,
    profile: profile.rows[0],
    bookings: bookings.rows.map(numericise),
    vehicles: vehicles.rows.map(numericise),
    hosts: hosts.rows.map(numericise),
    customers: customers.rows,
    transactions: transactions.rows.map(numericise),
    categories: categories.rows,
    settings: Object.fromEntries(settings.rows.map(s => [s.key, Number(s.value)])),
  };
}));

// pg returns numeric as a string; the UI does arithmetic and renders money, so
// hand it real numbers rather than making every component remember to cast.
const MONEY = new Set([
  'rate', 'damage_km_rate', 'rental_amount', 'extra_hour_charge', 'extra_km_charge',
  'damage_amount', 'fuel_amount', 'fine_amount', 'toll_amount', 'rental_commission',
  'extra_hour_commission', 'km_damage_base', 'km_damage_commission', 'pass_through_base',
  'total_commission', 'gross_revenue', 'extras', 'host_payout', 'total_due',
  'paid_online', 'paid_cash', 'paid_total', 'balance', 'payout_paid', 'payout_balance',
  'refund_due', 'refund_paid', 'refund_balance', 'effective_refund_percent',
  'daily_rate', 'hourly_rate', 'pkg4hr_rate', 'pkg4hr_km', 'pkg4to10_rate', 'pkg4to10_km',
  'pkg12hr_rate', 'pkg12hr_km', 'km_limit', 'extra_km_rate', 'extra_hour_rate',
  'commission_rate', 'amount', 'start_km', 'end_km', 'extra_hours', 'extra_km',
  'refund_percent', 'days', 'year',
]);

function numericise(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = MONEY.has(k) && v !== null && v !== undefined ? Number(v) : v;
  }
  return out;
}
