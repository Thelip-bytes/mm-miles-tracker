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
import { BarPanel, PiePanel } from './charts';

export function periodRange(period, customStart, customEnd) {
  const now = new Date();
  if (period === 'current') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end, label: monthLabel(monthKey(todayStr())) };
  }
  if (period === 'last') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return { start, end, label: monthLabel(key) };
  }
  if (period === 'custom' && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59'), label: `${customStart} to ${customEnd}` };
  }
  return { start: null, end: null, label: 'all time' };
}

export function Overview({ stats, chartData, paymentModeData, bookings, vehicleLabel, customerName, theme }) {
  const [period, setPeriod] = useState('current');
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const periodStats = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'no-show' && (!range.start || (new Date(b.start) >= range.start && new Date(b.start) <= range.end)));
    return { sales: active.reduce((s, b) => s + b.calc.rental, 0), commission: active.reduce((s, b) => s + b.calc.totalCommission, 0) };
  }, [bookings, range]);
  const recent = [...bookings].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 5);
  const periodOptions = [['current', 'Current month'], ['last', 'Last month'], ['all', 'Overall'], ['custom', 'Custom range']];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
<<<<<<< HEAD
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Overview</h1>
=======
          <h1 className="mm-h1" style={{ margin: '0 0 4px' }}>Overview</h1>
>>>>>>> 07f5e40 (mobile)
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Showing {range.label} — a booking counts toward its start date</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="mm-input" style={{ width: 'auto' }} value={period} onChange={e => setPeriod(e.target.value)}>
            {periodOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {period === 'custom' && (
            <Fragment>
              <input type="date" className="mm-input" style={{ width: 'auto' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>to</span>
              <input type="date" className="mm-input" style={{ width: 'auto' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </Fragment>
          )}
        </div>
      </div>
<<<<<<< HEAD
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '26px' }}>
=======
      <div className="mm-stats-4" style={{ marginBottom: '26px' }}>
>>>>>>> 07f5e40 (mobile)
        <StatCard label="Sales" value={periodStats.sales} sub={range.label} tone="default" />
        <StatCard label="Platform commission" value={periodStats.commission} sub={range.label} tone="gold" />
        <StatCard label="Host payouts pending" value={stats.pendingPayouts} sub="see Payouts tab" tone="bad" />
        <StatCard label="Collections pending" value={stats.pendingFromCustomers} sub="not yet paid by customers" tone="bad" />
      </div>
<<<<<<< HEAD
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px', marginBottom: '26px' }}>
=======
      <div className="mm-split" style={{ marginBottom: '26px' }}>
>>>>>>> 07f5e40 (mobile)
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 14px' }}>Sales vs platform commission, last 6 months</p>
          <div style={{ height: 200 }}><BarPanel data={chartData} dark={theme === 'dark'} /></div>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 14px' }}>Payment mode split</p>
          <div style={{ height: 200 }}><PiePanel data={paymentModeData} dark={theme === 'dark'} /></div>
        </div>
      </div>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 12px' }}>Recent bookings</p>
        {recent.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No bookings yet — add one from the Bookings tab.</p> : recent.map(b => (
<<<<<<< HEAD
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}>
=======
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}>
>>>>>>> 07f5e40 (mobile)
            <div>
              <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: 'var(--text-heading)', fontWeight: 600 }}>{b.code}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>{vehicleLabel(b.calc.vehicle)} · {customerName(b.customerId)}</span>
            </div>
            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', color: 'var(--text-heading)', fontWeight: 600 }}>₹{money(b.calc.rental)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
