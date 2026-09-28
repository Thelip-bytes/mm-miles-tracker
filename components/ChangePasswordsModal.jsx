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

export function ChangePasswordsModal({ rolePasswords, onCancel, onSave }) {
  const [pw, setPw] = useState({ ...rolePasswords });
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault();
    if (!pw.admin || !pw.manager || !pw.finance) { setError('All three passwords are required.'); return; }
    onSave(pw);
  }
  return (
    <ModalShell title="Change role passwords" onCancel={onCancel} onSubmit={submit}>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 4px' }}>
        These are the three sign-in passwords used on the login screen — one per role, shared by whoever uses that role. This is a simple screen-lock, not encrypted security; anyone who can edit this file can read them.
        {' '}It's saved with your other data, so it works across every device once synced.
      </p>
      <Field label="Admin password"><input required className="mm-input" value={pw.admin} onChange={e => setPw(p => ({ ...p, admin: e.target.value }))} /></Field>
      <Field label="Manager password"><input required className="mm-input" value={pw.manager} onChange={e => setPw(p => ({ ...p, manager: e.target.value }))} /></Field>
      <Field label="Finance password"><input required className="mm-input" value={pw.finance} onChange={e => setPw(p => ({ ...p, finance: e.target.value }))} /></Field>
      {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary">Save passwords</button>
      </div>
    </ModalShell>
  );
}
