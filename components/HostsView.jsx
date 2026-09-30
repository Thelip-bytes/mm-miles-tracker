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

export function HostsView({ hosts, vehicles, bookings, onAdd, onEdit, onDelete, canEdit, canFinance }) {
  return (
    <div>
      <div className="mm-page-head" style={{ marginBottom: '4px' }}>
        <h1 className="mm-h1">Hosts</h1>
        {canEdit && <button type="button" className="mm-btn mm-btn-primary" onClick={onAdd}><IconPlus /> New host</button>}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 20px' }}>{canEdit ? 'Who each vehicle is hosted by, and their commission rate' : 'View-only — ask an admin to add or edit hosts'}</p>
      {hosts.length === 0 ? <EmptyState text="No hosts yet. Add a host before adding their vehicles." /> : (
        <div className="mm-card-grid">
          {hosts.map(h => {
            const hb = bookings.filter(b => b.calc.host && b.calc.host.id === h.id && b.status !== 'cancelled' && b.status !== 'no-show');
            const pending = hb.reduce((s, b) => s + b.calc.payoutBalance, 0);
            const hostVehicles = vehicles.filter(v => v.hostId === h.id);
            return (
              <div key={h.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 3px' }}>{h.name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{h.phone || '—'}{canFinance ? ` · ${h.commissionRate}% on rental & hours` : ''}</p>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button type="button" className="mm-icon-btn" onClick={() => onEdit(h)}><IconEdit /></button>
                      <button type="button" className="mm-icon-btn" onClick={() => onDelete(h.id)}><IconTrash /></button>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                  {hostVehicles.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>No vehicles yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {hostVehicles.map(v => {
                        const isLive = bookings.some(b => b.vehicleId === v.id && b.status === 'ongoing' && !b.calc.isUpcoming);
                        return (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#3F6B4F' : '#B8863C', display: 'inline-block', flexShrink: 0 }}></span>
                            <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, color: 'var(--text-heading)' }}>{v.regNumber}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{v.year ? `${v.year} ` : ''}{v.make} {v.model} · {v.fuel} · {v.transmission}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {canFinance && (
                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                    <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: pending > 0 ? '#A8452F' : '#3F6B4F', fontWeight: 600 }}>₹{money(pending)} payout pending</span>
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
