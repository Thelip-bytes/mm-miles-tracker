import { withUser, handler, HttpError, multi } from '@/lib/server/db';

// One round trip for the whole ledger. This is a small rental business, so the
// app loads everything the way it used to from localStorage — but the money
// columns now come straight from public.booking_financials, computed by
// Postgres, instead of being re-derived in the browser.
//
// The eight SELECTs below are sent as a SINGLE multi-statement query. Sending
// them through `Promise.all` on one pg client would NOT parallelise them — a
// client runs its query queue strictly one at a time — so it would cost eight
// separate round trips to the database region instead of one.
//
// Customer photos (Aadhar / licence / renter, stored as base64 data URLs) are
// deliberately NOT returned here. They are the single largest thing in the
// database and they are only needed on the Customers tab and in the customer
// form, so they are fetched on demand from /api/customers/photos. This endpoint
// returns `has_*_photo` flags instead. Without that, every booking save — which
// re-reads the ledger — re-downloads the entire photo library.
export const dynamic = 'force-dynamic';

const PHOTO_COLUMNS = ['photo', 'aadhar_photo', 'license_photo'];

const STATEMENTS = [
  `select public.current_role() as role`,
  `select booking_id as id, * from public.booking_financials order by starts_at desc`,
  `select * from public.vehicles order by reg_number`,
  `select * from public.hosts order by name`,
  `select * from public.customers order by name`,
  `select * from public.transactions order by booked_on desc, created_at desc`,
  `select * from public.categories order by kind, sort_order`,
  `select key, value from public.app_settings`,
  `select id, full_name, role from public.profiles
    where id = (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid`,
];

export const GET = handler(async (req) => withUser(req, async (c, user) => {
  const [roleRows, bookings, vehicles, hosts, customers, transactions, categories, settings, profile] =
    await multi(c, STATEMENTS);

  const role = roleRows[0]?.role;
  if (!role) throw new HttpError(403, 'No active profile for this account');

  return {
    role,
    profile: profile[0],
    bookings: bookings.map(numericise),
    vehicles: vehicles.map(numericise),
    hosts: hosts.map(numericise),
    customers: customers.map(stripPhotos),
    transactions: transactions.map(numericise),
    categories,
    settings: Object.fromEntries(settings.map(s => [s.key, Number(s.value)])),
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

/** Replace each base64 blob with a boolean flag; keep everything else. */
function stripPhotos(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (PHOTO_COLUMNS.includes(k)) out[`has_${k}`] = !!v;
    else out[k] = v;
  }
  return out;
}
