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

export function HostModal({ form, onCancel, onSave }) {
  const [data, setData] = useState(form);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  function submit(e) { e.preventDefault(); if (!data.name || data.commissionRate === undefined || data.commissionRate === '') return; onSave(data); }
  return (
    <ModalShell title={data.id ? 'Edit host' : 'New host'} onCancel={onCancel} onSubmit={submit}>
      <Field label="Name"><input required placeholder="Mohamed Faiyaz" className="mm-input" value={data.name || ''} onChange={e => set('name', e.target.value)} /></Field>
      <div className="mm-form-grid">
        <Field label="Phone"><input className="mm-input" value={data.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Commission %" hint="on rental & extra hours"><input type="number" min="0" max="100" required className="mm-input" value={data.commissionRate === undefined ? '' : data.commissionRate} onChange={e => set('commissionRate', e.target.value)} /></Field>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>Extra km & damage are always commissioned at a fixed {DAMAGE_KM_RATE}%; fuel, toll & fines pass through at 0% (this platform-wide rule isn't editable per host).</p>
      <Field label="Bank / payout details"><input className="mm-input" value={data.bank || ''} onChange={e => set('bank', e.target.value)} placeholder="Account number / UPI ID" /></Field>
      <div className="mm-modal-actions">
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary">Save host</button>
      </div>
    </ModalShell>
  );
}
