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

export function VehiclesView({ vehicles, hosts, bookings, onAdd, onEdit, onDelete, canEdit, canFinance }) {
  return (
    <div>
      <div className="mm-page-head" style={{ marginBottom: '4px' }}>
        <h1 className="mm-h1">Vehicles</h1>
        {canEdit && <button type="button" className="mm-btn mm-btn-primary" onClick={onAdd} disabled={hosts.length === 0}><IconPlus /> New vehicle</button>}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 20px' }}>{canEdit ? 'The fleet, its km policy, and live status' : 'View-only — ask an admin to add or edit vehicles'}</p>
      {canEdit && hosts.length === 0 && <p style={{ fontSize: '12px', color: '#A8452F', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />Add a host first under the Hosts tab.</p>}
      {vehicles.length === 0 ? <EmptyState text="No vehicles yet." /> : (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {vehicles.map((v, i) => {
            const host = hosts.find(h => h.id === v.hostId);
            const isLive = bookings.some(b => b.vehicleId === v.id && b.timeStatus === 'ongoing');
            return (
              <div key={v.id} className="mm-v-row" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-light)' }}>
                <span className="mm-tag mm-v-status" style={{ background: isLive ? '#E1EFE4' : '#FBEFD9', color: isLive ? '#3F6B4F' : '#8A5E1E', display: 'inline-flex', alignItems: 'center', gap: '5px', width: '58px', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#3F6B4F' : '#B8863C', display: 'inline-block', flexShrink: 0 }}></span>
                  {isLive ? 'Live' : 'Idle'}
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
                </div>
                {canEdit && (
                  <div className="mm-v-actions">
                    <button type="button" className="mm-icon-btn" onClick={() => onEdit(v)}><IconEdit /></button>
                    <button type="button" className="mm-icon-btn" onClick={() => onDelete(v.id)}><IconTrash /></button>
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
