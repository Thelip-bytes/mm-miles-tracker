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

export function DeleteConfirmModal({ label, onCancel, onConfirm }) {
  const isBooking = (label || '').toLowerCase().includes('booking');
  const [typedConfirm, setTypedConfirm] = useState('');
  const canDelete = !isBooking || typedConfirm.trim().toUpperCase() === 'DELETE';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,37,65,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '420px', maxWidth: '90vw', border: '1px solid var(--border)', padding: '22px' }}>
        <p style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: 600, color: '#A8452F', margin: '0 0 8px' }}>Delete {label}?</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          You're about to permanently delete <b style={{ color: 'var(--text-heading)' }}>{label}</b>. This action cannot be undone.
        </p>
        {isBooking && (
          <div style={{ background: '#FDF3F0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
            <p style={{ fontSize: '12px', color: '#8A3B2A', margin: '0 0 6px', fontWeight: 600 }}>⚠️ Sequential numbering warning</p>
            <p style={{ fontSize: '11px', color: '#8A3B2A', margin: 0, lineHeight: 1.4 }}>
              Deleting a booking permanently removes this number and leaves a gap in the consecutive booking sequence. If this booking was cancelled or a customer did not show up, we recommend changing its status to <b>Cancelled</b> or <b>No-show</b> instead of deleting.
            </p>
            <div style={{ marginTop: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Type <b>DELETE</b> to confirm permanent deletion:</label>
              <input
                type="text"
                className="mm-input"
                style={{ width: '100%', fontSize: '12px', padding: '6px 10px', textTransform: 'uppercase' }}
                placeholder="Type DELETE"
                value={typedConfirm}
                onChange={e => setTypedConfirm(e.target.value)}
              />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="mm-btn"
            style={{ background: '#A8452F', color: '#fff', opacity: canDelete ? 1 : 0.45, cursor: canDelete ? 'pointer' : 'not-allowed' }}
            disabled={!canDelete}
            onClick={onConfirm}
          >
            Permanently delete
          </button>
        </div>
      </div>
    </div>
  );
}
