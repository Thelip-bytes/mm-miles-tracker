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

export function ResetConfirmModal({ syncEnabled, counts, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  const total = counts.bookings + counts.vehicles + counts.hosts + counts.customers + counts.transactions;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,37,65,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', width: '420px', maxWidth: '90vw', border: '1px solid var(--border)', padding: '20px' }}>
        <p style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: 600, color: '#A8452F', margin: '0 0 10px' }}>Clear all data?</p>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
          This permanently deletes <b>{counts.bookings}</b> bookings, <b>{counts.vehicles}</b> vehicles, <b>{counts.hosts}</b> hosts, <b>{counts.customers}</b> customers, and <b>{counts.transactions}</b> income/expense entries — everything in the app.
        </p>
        {syncEnabled && (
          <p style={{ fontSize: '13px', color: '#A8452F', background: '#F7E4E0', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', margin: '0 0 14px' }}>
            Sync is on — this will also wipe the data on your other connected devices.
          </p>
        )}
        {total > 0 ? (
          <Fragment>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px' }}>Type <b>DELETE</b> to confirm:</p>
            <input className="mm-input" style={{ marginBottom: '14px' }} value={text} onChange={e => setText(e.target.value)} placeholder="DELETE" />
          </Fragment>
        ) : <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 14px' }}>There's nothing to delete right now.</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="mm-btn" style={{ background: '#A8452F', color: '#fff' }} disabled={total > 0 && text !== 'DELETE'} onClick={onConfirm}>Delete everything</button>
        </div>
      </div>
    </div>
  );
}
