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

// Live wins over a manual status: a car on a trip is on the road whatever it's set to.
const STATUS_STYLE = {
  live: { label: 'Live', bg: '#E1EFE4', fg: '#3F6B4F', dot: '#3F6B4F' },
  idle: { label: 'Idle', bg: '#FBEFD9', fg: '#8A5E1E', dot: '#B8863C' },
  maintenance: { label: 'Maintenance', bg: '#F7E4E0', fg: '#A8452F', dot: '#A8452F' },
  paused: { label: 'Paused', bg: '#ECEDF1', fg: '#5A6178', dot: '#8A90A3' },
};

export function VehiclesView({ vehicles, hosts, bookings, onAdd, onEdit, onDelete, onSetStatus, canEdit, canSetStatus, canFinance }) {
  const [statusFilter, setStatusFilter] = useState(() => safeGet('mm-vehicle-status') || 'all');
  const [hostFilter, setHostFilter] = useState(() => safeGet('mm-vehicle-host') || 'all');
  useEffect(() => { safeSet('mm-vehicle-status', statusFilter); }, [statusFilter]);
  useEffect(() => { safeSet('mm-vehicle-host', hostFilter); }, [hostFilter]);
  // A remembered host may have been deleted since; fall back to all hosts.
  const activeHost = hostFilter === 'all' || hosts.some(h => h.id === hostFilter) ? hostFilter : 'all';

  const liveIds = useMemo(() => new Set(bookings.filter(b => b.timeStatus === 'ongoing' || b.timeStatus === 'overdue').map(b => b.vehicleId)), [bookings]);
  // Chip counts respect the host filter so they always match what a click shows.
  const hostVehicles = activeHost === 'all' ? vehicles : vehicles.filter(v => v.hostId === activeHost);
  const statusOf = v => liveIds.has(v.id) ? 'live' : (v.status === 'maintenance' || v.status === 'paused') ? v.status : 'idle';
  const counts = { all: hostVehicles.length, live: 0, idle: 0, maintenance: 0, paused: 0 };
  for (const v of hostVehicles) counts[statusOf(v)]++;
  const shown = statusFilter === 'all' ? hostVehicles : hostVehicles.filter(v => statusOf(v) === statusFilter);
  const filters = [['all', 'All'], ['live', 'Live'], ['idle', 'Idle'], ['maintenance', 'Maintenance'], ['paused', 'Paused']];
  const sortedHosts = useMemo(() => [...hosts].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [hosts]);

  return (
    <div>
      <div className="mm-page-head" style={{ marginBottom: '4px' }}>
        <h1 className="mm-h1">Vehicles</h1>
        {canEdit && <button type="button" className="mm-btn mm-btn-primary" onClick={onAdd} disabled={hosts.length === 0}><IconPlus /> New vehicle</button>}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 20px' }}>{canEdit ? 'The fleet, its km policy, and live status' : 'View-only — ask an admin to add or edit vehicles'}</p>
      {canEdit && hosts.length === 0 && <p style={{ fontSize: '12px', color: '#A8452F', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />Add a host first under the Hosts tab.</p>}
      {vehicles.length > 0 && (
        <div className="mm-toolbar">
          <select className="mm-input" style={{ width: 'auto', minWidth: '180px' }} value={activeHost} onChange={e => setHostFilter(e.target.value)} aria-label="Filter by host">
            <option value="all">All hosts</option>
            {sortedHosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div className="mm-chips">
            {filters.map(([f, label]) => (
              <span key={f} onClick={() => setStatusFilter(f)} className={`mm-chip${statusFilter === f ? ' active' : ''}`}>{label} ({counts[f]})</span>
            ))}
          </div>
        </div>
      )}
      {vehicles.length === 0 ? <EmptyState text="No vehicles yet." /> : shown.length === 0 ? <EmptyState text="No vehicles match these filters." /> : (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {shown.map((v, i) => {
            const host = hosts.find(h => h.id === v.hostId);
            const st = STATUS_STYLE[statusOf(v)];
            return (
              <div key={v.id} className="mm-v-row" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-light)' }}>
                <span className="mm-tag mm-v-status" title={v.status !== 'available' && v.statusNote ? v.statusNote : undefined} style={{ background: st.bg, color: st.fg, display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: '58px', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot, display: 'inline-block', flexShrink: 0 }}></span>
                  {st.label}
                </span>
                <span className="mm-v-reg" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{v.regNumber}</span>
                <span className="mm-v-desc" style={{ fontSize: '13px', color: 'var(--text-heading)' }}>{v.year ? `${v.year} ` : ''}{v.make} {v.model} · {v.fuel} · {v.transmission}</span>
                <div className="mm-v-meta">
                  <span className="mm-tag" style={{ background: '#E1EFE4', color: '#3F6B4F', marginRight: '10px' }}>{v.dailyRate ? `₹${money(v.dailyRate)}/day${v.hourlyRate ? ` + ₹${money(v.hourlyRate)}/hr` : ''}` : 'No rate set'}</span>
                  {v.pkg4hrRate > 0 && <span className="mm-tag" style={{ background: '#EEF0FA', color: '#3B4A8C', marginRight: '10px' }}>4hr ₹{money(v.pkg4hrRate)} · 12hr ₹{money(v.pkg12hrRate)}</span>}
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '10px' }}>{host ? host.name : '—'}</span>
                  <span className="mm-tag" style={{ background: v.kmPolicy === 'limited' ? '#FBEFD9' : '#E1EFE4', color: v.kmPolicy === 'limited' ? '#8A5E1E' : '#3F6B4F', marginRight: '10px' }}>
                    {v.kmPolicy === 'limited' ? `${v.kmLimit || '—'} km limit · ₹${v.extraKmRate || 0}/km` : 'Unlimited km'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '10px' }}>₹{v.extraHourRate || 0}/extra hr</span>
                  {canFinance && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '10px' }}>{v.commissionRate ? `${v.commissionRate}% (override)` : 'default rate'}</span>}
                  {v.status !== 'available' && v.statusNote && <span style={{ fontSize: '12px', color: '#A8452F', marginRight: '10px' }}>{STATUS_STYLE[v.status]?.label}: {v.statusNote}</span>}
                </div>
                {(canEdit || canSetStatus) && (
                  <div className="mm-v-actions">
                    {canSetStatus && <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => onSetStatus(v)}>Set status</button>}
                    {canEdit && <button type="button" className="mm-icon-btn" onClick={() => onEdit(v)}><IconEdit /></button>}
                    {canEdit && <button type="button" className="mm-icon-btn" onClick={() => onDelete(v.id)}><IconTrash /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
