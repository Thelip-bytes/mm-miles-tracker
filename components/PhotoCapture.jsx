"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  IconPlus, IconTrash, IconEdit, IconDownload, IconSearch, IconClose, IconAlert,
  IconGrid, IconCar, IconKey, IconUsers, IconReceipt, IconWallet, IconChevron,
  IconSun, IconMoon, IconUpload, IconEye, IconLock, IconCamera
} from './icons';
import { labelStyle } from './ui';
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

export function PhotoCapture({ label, value, onChange, loading }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImageFile(file, 640, 0.6);
      onChange(dataUrl);
    } catch (err) { console.error('photo capture failed', err); }
    setBusy(false);
  }
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      {value ? (
        <div style={{ position: 'relative', width: '100%' }}>
          <img src={value} alt={label} style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)', display: 'block' }} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => inputRef.current.click()}>Retake</button>
            <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => onChange('')}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="mm-btn mm-btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => inputRef.current.click()} disabled={busy || loading}>
          <IconCamera /> {busy ? 'Processing…' : loading ? 'Loading photo…' : 'Capture or upload'}
        </button>
      )}
    </div>
  );
}
