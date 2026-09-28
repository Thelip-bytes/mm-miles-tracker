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
import { PhotoCapture } from './PhotoCapture';

export function CustomerModal({ form, onCancel, onSave }) {
  const [data, setData] = useState(form);
  const [error, setError] = useState('');
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  function submit(e) {
    e.preventDefault();
    if (!data.name || !data.aadhar || !data.licenseNumber || !data.address) {
      setError('Name, Aadhar number, license number, and address are all required.');
      return;
    }
    setError('');
    onSave(data);
  }
  return (
    <ModalShell title={data.id ? 'Edit customer' : 'New customer'} onCancel={onCancel} onSubmit={submit}>
      <Field label="Name *"><input required className="mm-input" value={data.name || ''} onChange={e => set('name', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Aadhar number *"><input required placeholder="XXXX XXXX XXXX" className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={data.aadhar || ''} onChange={e => set('aadhar', e.target.value)} /></Field>
        <Field label="License number *"><input required placeholder="DL number" className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={data.licenseNumber || ''} onChange={e => set('licenseNumber', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Phone"><input className="mm-input" value={data.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Address *"><input required className="mm-input" value={data.address || ''} onChange={e => set('address', e.target.value)} /></Field>
      </div>
      {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Photos</p>
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 10px' }}>Optional, but useful for verification. On a phone this opens the camera directly; on a computer it opens a file picker. Photos are compressed and stored with the customer record.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <PhotoCapture label="Renter photo" value={data.photo || ''} onChange={(v) => set('photo', v)} />
          <PhotoCapture label="Aadhar card" value={data.aadharPhoto || ''} onChange={(v) => set('aadharPhoto', v)} />
          <PhotoCapture label="License" value={data.licensePhoto || ''} onChange={(v) => set('licensePhoto', v)} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary">Save customer</button>
      </div>
    </ModalShell>
  );
}
