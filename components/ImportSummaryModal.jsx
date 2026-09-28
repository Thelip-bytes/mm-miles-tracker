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

export function ImportSummaryModal({ summary, onClose }) {
  if (summary.error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,37,65,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '400px', maxWidth: '90vw', border: '1px solid var(--border)', padding: '20px' }}>
          <p style={{ fontFamily: 'Fraunces, serif', fontSize: '16px', color: '#A8452F', margin: '0 0 8px' }}>Import failed</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{summary.error}</p>
          <button type="button" className="mm-btn mm-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,37,65,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '460px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)', padding: '20px' }}>
        <p style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 12px' }}>Import complete</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
          <StatCard label="Bookings added" value={summary.bookings} tone="good" />
          <StatCard label="Transactions added" value={summary.transactions} tone="good" />
          <StatCard label="Vehicles added" value={summary.vehicles} tone="default" />
          <StatCard label="Customers added" value={summary.customers} tone="default" />
        </div>
        {summary.hosts > 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>Also created {summary.hosts} new host(s) referenced in the file.</p>}
        {summary.vehiclesUpdated > 0 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>Updated the daily rate on {summary.vehiclesUpdated} existing vehicle(s).</p>}
        {summary.warnings && summary.warnings.length > 0 && (
          <div style={{ background: '#FBEFD9', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#8A5E1E', margin: '0 0 6px' }}>{summary.warnings.length} row(s) skipped</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' }}>
              {summary.warnings.map((w, i) => <p key={i} style={{ fontSize: '11px', color: '#8A5E1E', margin: 0 }}>{w}</p>)}
            </div>
          </div>
        )}
        <button type="button" className="mm-btn mm-btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
