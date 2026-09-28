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

export function VehicleModal({ form, hosts, onCancel, onSave }) {
  const [data, setData] = useState(form);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  function submit(e) { e.preventDefault(); if (!data.regNumber || !data.make || !data.model || !data.hostId) return; onSave(data); }
  const isLimited = data.kmPolicy === 'limited';
  return (
    <ModalShell title={data.id ? 'Edit vehicle' : 'New vehicle'} onCancel={onCancel} onSubmit={submit}>
      <Field label="Registration number"><input required placeholder="TN01BR9111" className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace', textTransform: 'uppercase' }} value={data.regNumber || ''} onChange={e => set('regNumber', e.target.value.toUpperCase())} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: '12px' }}>
        <Field label="Make"><input required placeholder="Maruti Suzuki" className="mm-input" value={data.make || ''} onChange={e => set('make', e.target.value)} /></Field>
        <Field label="Model"><input required placeholder="Fronx" className="mm-input" value={data.model || ''} onChange={e => set('model', e.target.value)} /></Field>
        <Field label="Year"><input type="number" placeholder="2023" min="1980" max="2100" className="mm-input" value={data.year || ''} onChange={e => set('year', e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Daily rate (₹)" hint="for each full 24 hrs">
          <input type="number" min="0" placeholder="e.g. 2700" className="mm-input" value={data.dailyRate || ''} onChange={e => set('dailyRate', e.target.value)} />
        </Field>
        <Field label="Hourly rate (₹)" hint="for the leftover hours under a full day">
          <input type="number" min="0" placeholder="e.g. 150" className="mm-input" value={data.hourlyRate || ''} onChange={e => set('hourlyRate', e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Fuel type">
          <select className="mm-input" value={data.fuel || 'Petrol'} onChange={e => set('fuel', e.target.value)}>
            {['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'].map(f => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Transmission">
          <select className="mm-input" value={data.transmission || 'Automatic'} onChange={e => set('transmission', e.target.value)}>
            {['Automatic', 'Manual'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Host">
        <select required className="mm-input" value={data.hostId || ''} onChange={e => set('hostId', e.target.value)}>
          <option value="">Select host</option>
          {hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </Field>
      <Field label="Kilometer policy">
        <select className="mm-input" value={data.kmPolicy || 'unlimited'} onChange={e => set('kmPolicy', e.target.value)}>
          <option value="unlimited">Unlimited km</option>
          <option value="limited">Limited km</option>
        </select>
      </Field>
      {isLimited && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="KM limit (per booking)"><input type="number" min="0" placeholder="e.g. 300" className="mm-input" value={data.kmLimit || ''} onChange={e => set('kmLimit', e.target.value)} /></Field>
          <Field label="Extra km rate (₹/km)"><input type="number" min="0" placeholder="e.g. 15" className="mm-input" value={data.extraKmRate || ''} onChange={e => set('extraKmRate', e.target.value)} /></Field>
        </div>
      )}
      {!isLimited && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Short-duration packages</p>
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 10px' }}>Optional — only offered on unlimited-km vehicles. Leave blank to skip short bookings for this vehicle; it'll just use the daily/hourly rate above.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <Field label="Up to 4 hrs (₹ flat)"><input type="number" min="0" placeholder="e.g. 600" className="mm-input" value={data.pkg4hrRate || ''} onChange={e => set('pkg4hrRate', e.target.value)} /></Field>
            <Field label="Included km"><input type="number" min="0" placeholder="e.g. 100" className="mm-input" value={data.pkg4hrKm || ''} onChange={e => set('pkg4hrKm', e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <Field label="4–10 hrs (₹/hr)"><input type="number" min="0" placeholder="e.g. 150" className="mm-input" value={data.pkg4to10Rate || ''} onChange={e => set('pkg4to10Rate', e.target.value)} /></Field>
            <Field label="Included km"><input type="number" min="0" placeholder="e.g. 200" className="mm-input" value={data.pkg4to10Km || ''} onChange={e => set('pkg4to10Km', e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Up to 12 hrs (₹ flat)"><input type="number" min="0" placeholder="e.g. 1500" className="mm-input" value={data.pkg12hrRate || ''} onChange={e => set('pkg12hrRate', e.target.value)} /></Field>
            <Field label="Included km"><input type="number" min="0" placeholder="e.g. 300" className="mm-input" value={data.pkg12hrKm || ''} onChange={e => set('pkg12hrKm', e.target.value)} /></Field>
          </div>
          <Field label="Extra km rate for these packages (₹/km)" hint="charged only when a ≤12hr booking exceeds its package's included km">
            <input type="number" min="0" placeholder="e.g. 10" className="mm-input" value={data.extraKmRate || ''} onChange={e => set('extraKmRate', e.target.value)} />
          </Field>
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '10px 0 0' }}>Included-km caps apply only to bookings that fit inside a package (≤12 hrs). Longer bookings on this vehicle stay genuinely unlimited.</p>
        </div>
      )}
      <Field label="Extra hour rate (₹/hr)" hint="charged when a booking runs past its return time"><input type="number" min="0" placeholder="e.g. 150" className="mm-input" value={data.extraHourRate || ''} onChange={e => set('extraHourRate', e.target.value)} /></Field>
      <Field label="Commission % override (optional)" hint="applies to rental & extra hours only"><input type="number" min="0" max="100" placeholder="Leave blank to use host's default" className="mm-input" value={data.commissionRate || ''} onChange={e => set('commissionRate', e.target.value)} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary">Save vehicle</button>
      </div>
    </ModalShell>
  );
}
