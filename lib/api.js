"use client";

import supabase from './supabase';

// Thin fetch wrapper for the Next.js API routes. Attaches the current Supabase
// access token so the server can authenticate the caller and run the request
// under that user's RLS policies.

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()), ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  load: () => request('/api/data'),

  saveBooking: (b) => request('/api/bookings', { method: 'POST', body: JSON.stringify(b) }),
  deleteBooking: (id) => request(`/api/bookings/${id}`, { method: 'DELETE' }),

  saveVehicle: (v) => request('/api/vehicles', { method: 'POST', body: JSON.stringify(v) }),
  deleteVehicle: (id) => request(`/api/vehicles/${id}`, { method: 'DELETE' }),

  saveHost: (h) => request('/api/hosts', { method: 'POST', body: JSON.stringify(h) }),
  deleteHost: (id) => request(`/api/hosts/${id}`, { method: 'DELETE' }),

  saveCustomer: (cu) => request('/api/customers', { method: 'POST', body: JSON.stringify(cu) }),
  deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),

  saveTransaction: (t) => request('/api/transactions', { method: 'POST', body: JSON.stringify(t) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),

  // admin
  listUsers: () => request('/api/admin/users'),
  createUser: (payload) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (userId, newPassword) =>
    request('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ userId, newPassword }) }),
  setRole: (userId, role) =>
    request('/api/admin/set-role', { method: 'POST', body: JSON.stringify({ userId, role }) }),
};

/**
 * Map a booking_financials row onto the camelCase shape the UI components
 * already expect. The money figures are NOT recomputed here — they come from
 * the database view, which is the single source of truth.
 */
export function toBookingView(row) {
  return {
    id: row.id || row.booking_id,   // /api/data aliases booking_id -> id
    code: row.code,
    vehicleId: row.vehicle_id,
    customerId: row.customer_id,
    start: toLocalInput(row.starts_at),
    end: toLocalInput(row.ends_at),
    closingTime: row.closing_time ? toLocalInput(row.closing_time) : '',
    days: row.days,
    status: row.status,
    notes: row.notes || '',
    startKm: row.start_km ?? '',
    endKm: row.end_km ?? '',
    extraHours: row.extra_hours ?? 0,
    extraKm: row.extra_km ?? 0,
    rentalAmount: row.rental_amount ?? 0,
    extraHourCharge: row.extra_hour_charge ?? 0,
    extraKmCharge: row.extra_km_charge ?? 0,
    tollAmount: row.toll_amount ?? 0,
    fuelAmount: row.fuel_amount ?? 0,
    damageAmount: row.damage_amount ?? 0,
    fineAmount: row.fine_amount ?? 0,
    refundPercent: row.effective_refund_percent ?? '',
    cancelledAt: row.cancelled_at ? toLocalInput(row.cancelled_at) : '',
    priceOverridden: !!row.price_overridden,
    priceOverrideReason: row.price_override_reason || '',
    calc: {
      vehicle: { id: row.vehicle_id, regNumber: row.reg_number, make: row.make, model: row.model },
      host: row.host_id ? { id: row.host_id, name: row.host_name } : null,
      rate: row.rate,
      rental: row.rental_amount,
      extraHourCharge: row.extra_hour_charge,
      extraKmCharge: row.extra_km_charge,
      damageAmount: row.damage_amount,
      fuelAmount: row.fuel_amount,
      fineAmount: row.fine_amount,
      tollAmount: row.toll_amount,
      rentalCommission: row.rental_commission,
      extraHourCommission: row.extra_hour_commission,
      kmDamageBase: row.km_damage_base,
      kmDamageCommission: row.km_damage_commission,
      passThroughBase: row.pass_through_base,
      totalCommission: row.total_commission,
      extras: row.extras,
      grossRevenue: row.gross_revenue,
      hostPayout: row.host_payout,
      totalDue: row.total_due,
      paidOnline: row.paid_online,
      paidCash: row.paid_cash,
      paidTotal: row.paid_total,
      paymentStatus: row.payment_status,
      balance: row.balance,
      payoutPaidAmount: row.payout_paid,
      payoutBalance: row.payout_balance,
      payoutStatus: row.payout_status,
      refundPercent: row.effective_refund_percent,
      refundDue: row.refund_due,
      refundPaidAmount: row.refund_paid,
      refundBalance: row.refund_balance,
      refundStatus: row.refund_status,
      isOverdue: row.is_overdue,
      isUpcoming: row.is_upcoming,
    },
  };
}

/** inverse of toBookingView for writes */
export function fromBookingView(b) {
  return {
    id: b.id,
    vehicle_id: b.vehicleId,
    customer_id: b.customerId,
    starts_at: toIso(b.start),
    ends_at: toIso(b.end),
    days: b.days,
    closing_time: b.closingTime ? toIso(b.closingTime) : null,
    rental_amount: b.rentalAmount,
    extra_hours: b.extraHours,
    extra_hour_charge: b.extraHourCharge,
    extra_km: b.extraKm,
    extra_km_charge: b.extraKmCharge,
    toll_amount: b.tollAmount,
    fuel_amount: b.fuelAmount,
    damage_amount: b.damageAmount,
    fine_amount: b.fineAmount,
    start_km: b.startKm,
    end_km: b.endKm,
    status: b.status,
    refund_percent: b.refundPercent === '' ? null : b.refundPercent,
    cancelled_at: b.cancelledAt ? toIso(b.cancelledAt) : null,
    price_overridden: !!b.priceOverridden,
    price_override_reason: b.priceOverrideReason || null,
    notes: b.notes || '',
  };
}

const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local) {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d) ? null : d.toISOString();
}
