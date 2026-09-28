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
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,37,65,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '380px', maxWidth: '90vw', border: '1px solid var(--border)', padding: '20px' }}>
        <p style={{ fontFamily: 'Fraunces, serif', fontSize: '16px', fontWeight: 600, color: '#A8452F', margin: '0 0 8px' }}>Delete this?</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 18px' }}>You're about to permanently delete <b style={{ color: 'var(--text-heading)' }}>{label}</b>. This can't be undone.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="mm-btn" style={{ background: '#A8452F', color: '#fff' }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
