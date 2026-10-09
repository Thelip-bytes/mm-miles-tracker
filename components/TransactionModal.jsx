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

export function TransactionModal({ form, bookings, bookingLabel, onCancel, onSave, saving, syncing, saveError }) {
  const [data, setData] = useState(form);
  const [amountTouched, setAmountTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  function changeType(type) {
    setData(d => {
      const category = type === d.type
        ? d.category
        : (type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES.find(c => c !== HOST_PAYOUT_CATEGORY && c !== REFUND_CATEGORY));
      // A payment converted to an expense must never silently become a host
      // payout or retain the old booking link. The user can select those again.
      return { ...d, type, category, bookingId: '' };
    });
    setFormError('');
  }
  function changeCategory(category) {
    setData(d => {
      const hasBookingLink = d.type === 'income' || category === HOST_PAYOUT_CATEGORY || category === REFUND_CATEGORY;
      return { ...d, category, bookingId: hasBookingLink ? d.bookingId : '' };
    });
    setFormError('');
  }
  useEffect(() => {
    // A payout form can be opened while a previous payment is refreshing the
    // ledger. Rebase its suggested amount on the fresh balance before saving.
    if (syncing || amountTouched || data.id || data.category !== HOST_PAYOUT_CATEGORY || !data.bookingId || !String(data.note || '').startsWith('Payout for ')) return;
    const booking = bookings.find(b => b.id === data.bookingId);
    const amount = Number(booking?.calc?.payoutBalance) || 0;
    if (booking && Number(data.amount) !== amount) setData(current => ({ ...current, amount }));
  }, [syncing, bookings, amountTouched, data.id, data.category, data.bookingId, data.note, data.amount]);
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
    const amount = Number(data.amount);
    const categories = data.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!data.date || !Number.isFinite(new Date(data.date).getTime())) {
      setFormError('Choose a valid transaction date.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter an amount greater than ₹0.');
      return;
    }
    if (!categories.includes(data.category)) {
      setFormError('Choose a category that matches the entry type.');
      return;
    }
    setFormError('');
    onSave({ ...data, amount, bookingId: showBookingLink ? data.bookingId : '' });
  }
  return (
    <ModalShell title={data.id ? 'Edit entry' : (isIncome ? 'New income' : 'New expense')} onCancel={onCancel} onSubmit={submit}>
      <Field label="Type">
        <select className="mm-input" value={data.type} onChange={e => changeType(e.target.value)}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </Field>
      <div className="mm-form-grid">
        <Field label="Date"><input type="date" required className="mm-input" value={data.date || ''} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Category">
          <select className="mm-input" value={data.category || ''} onChange={e => changeCategory(e.target.value)}>
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
      <div className="mm-form-grid">
        <Field label="Amount (₹)"><input type="number" min="0" required className="mm-input" value={data.amount || ''} onChange={e => { setAmountTouched(true); set('amount', e.target.value); }} /></Field>
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
      {saveError && (
        <p role="alert" style={{ fontSize: '12px', color: '#A8452F', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '9px 11px', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IconAlert />{saveError}
        </p>
      )}
      {formError && <p role="alert" style={{ fontSize: '12px', color: '#A8452F', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '9px 11px', margin: 0 }}>{formError}</p>}
      <div className="mm-modal-actions">
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary" disabled={saving || syncing} style={{ opacity: (saving || syncing) ? 0.6 : 1 }}>
          {saving ? 'Saving…' : syncing ? 'Updating totals…' : 'Save entry'}
        </button>
      </div>
    </ModalShell>
  );
}
