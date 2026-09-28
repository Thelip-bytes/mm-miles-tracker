"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  IconPlus, IconTrash, IconEdit, IconDownload, IconSearch, IconClose, IconAlert,
  IconGrid, IconCar, IconKey, IconUsers, IconReceipt, IconWallet, IconChevron,
  IconSun, IconMoon, IconUpload, IconEye, IconLock, IconCamera
} from './icons';
import { Field, StatCard, Stub, EmptyState, ModalShell, PayoutBreakdown, LinkedEntriesList, ChargeRow } from './ui';
import {
  HOST_PAYOUT_CATEGORY, REFUND_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  PIE_COLORS, DAMAGE_KM_RATE, REFUND_TIERS, REQUIRED_ALWAYS, MULTIDAY_DISCOUNT_TIERS,
  ROLE_PERMS
} from '@/lib/constants';
import {
  refundTierFor, multiDayDiscountFor, uid, todayStr, nowLocal, money, monthKey,
  monthLabel, nextBookingCode, safeGet, safeSet, getCol, pad2, toLocalInputStr,
  toDateInputStr, parseFlexibleDateTime, parseFlexibleDate, numOrBlank,
  compressImageFile, migrateTransactions
} from '@/lib/helpers';
import { computeBooking } from '@/lib/computeBooking';

export function TransactionModal({ form, bookings, bookingLabel, onCancel, onSave }) {
  const [data, setData] = useState(form);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const isIncome = data.type === 'income';
  const isPayout = !isIncome && data.category === HOST_PAYOUT_CATEGORY;
  const isRefund = !isIncome && data.category === REFUND_CATEGORY;
  const showBookingLink = isIncome || isPayout || isRefund;
  const linkedBooking = data.bookingId ? bookings.find(b => b.id === data.bookingId) : null;
  const dropdownBookings = useMemo(() => {
    return bookings.filter(b => {
      if (b.id === data.bookingId) return true; // always keep the currently selected one, even if since settled
      if (isRefund) return b.calc.refundDue > 0 && b.calc.refundBalance > 0;
      if (isPayout) return b.calc.payoutBalance > 0;
      if (isIncome) return b.calc.balance > 0;
      return true;
    });
  }, [bookings, isRefund, isPayout, isIncome, data.bookingId]);
  const balanceInfo = useMemo(() => {
    if (!linkedBooking) return null;
    if (isPayout) return { label: 'Payout balance pending', value: linkedBooking.calc.payoutBalance };
    if (isRefund) return { label: 'Refund balance pending', value: linkedBooking.calc.refundBalance };
    if (isIncome) return { label: 'Booking balance pending', value: Math.max(0, linkedBooking.calc.balance) };
    return null;
  }, [linkedBooking, isPayout, isRefund, isIncome]);
  function submit(e) {
    e.preventDefault();
    if (!data.date || !data.amount || !data.category) return;
    onSave(data);
  }
  return (
    <ModalShell title={data.id ? 'Edit entry' : (isIncome ? 'New income' : 'New expense')} onCancel={onCancel} onSubmit={submit}>
      <Field label="Type">
        <select className="mm-input" value={data.type} onChange={e => set('type', e.target.value)}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Date"><input type="date" required className="mm-input" value={data.date || ''} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Category">
          <select className="mm-input" value={data.category || ''} onChange={e => set('category', e.target.value)}>
            {(isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {showBookingLink && (
        <Field label="Linked booking" hint={isPayout ? 'settles that booking\u2019s host payout' : isRefund ? 'settles that booking\u2019s refund due' : 'updates that booking\u2019s paid amount'}>
          <select className="mm-input" value={data.bookingId || ''} onChange={e => set('bookingId', e.target.value)}>
            <option value="">No linked booking</option>
            {dropdownBookings.length === 0 && <option value="" disabled>{isRefund ? 'No bookings with a refund due' : isPayout ? 'No bookings with a payout due' : 'No bookings with a balance due'}</option>}
            {dropdownBookings.map(b => <option key={b.id} value={b.id}>{bookingLabel(b)}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Amount (₹)"><input type="number" min="0" required className="mm-input" value={data.amount || ''} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Mode">
          <select className="mm-input" value={data.mode || 'online'} onChange={e => set('mode', e.target.value)}>
            <option value="online">Online</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
      </div>
      {balanceInfo && (
        <p style={{ fontSize: '12px', fontFamily: '"IBM Plex Mono", monospace', color: balanceInfo.value > 0 ? '#A8452F' : '#3F6B4F', margin: '-6px 0 0' }}>
          {balanceInfo.label} for {linkedBooking.code}: <b>₹{money(balanceInfo.value)}</b>{balanceInfo.value === 0 ? ' (fully settled)' : ''}
        </p>
      )}
      <Field label="Note"><input className="mm-input" value={data.note || ''} onChange={e => set('note', e.target.value)} placeholder="What was this for?" /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary">Save entry</button>
      </div>
    </ModalShell>
  );
}
