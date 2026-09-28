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

export function CustomersView({ customers, bookings, onAdd, onEdit, onDelete, canEdit }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Customers</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{customers.length} on file</p>
        </div>
        {canEdit && <button type="button" className="mm-btn mm-btn-primary" onClick={onAdd}><IconPlus /> New customer</button>}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '-10px 0 16px' }}>{canEdit ? 'Tip: you can also add a new customer directly from the "New booking" form.' : 'View-only — ask an admin to add or edit customers.'}</p>
      {customers.length === 0 ? <EmptyState text="No customers yet. Add customers here or directly from a booking." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {customers.map(c => {
            const cb = bookings.filter(b => b.customerId === c.id && b.status !== 'cancelled' && b.status !== 'no-show');
            const total = cb.reduce((s, b) => s + (Number(b.rentalAmount) || 0), 0);
            const repeat = cb.length >= 2;
            return (
              <div key={c.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {c.photo ? <img src={c.photo} alt={c.name} style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--border)', flexShrink: 0 }} />}
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 3px' }}>{c.name} {repeat && <span className="mm-tag" style={{ background: '#FBEFD9', color: '#8A5E1E', marginLeft: '6px' }}>Repeat</span>}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Aadhar: {c.aadhar || '—'} · License: {c.licenseNumber || '—'}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{c.phone || '—'}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '3px 0 0' }}>{c.address || 'No address on file'}</p>
                    </div>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button type="button" className="mm-icon-btn" onClick={() => onEdit(c)}><IconEdit /></button>
                      <button type="button" className="mm-icon-btn" onClick={() => onDelete(c.id)}><IconTrash /></button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cb.length} booking{cb.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '12px', color: 'var(--text-heading)', fontWeight: 600 }}>₹{money(total)} spent</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
