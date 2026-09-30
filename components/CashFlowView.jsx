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

export function CashFlowView({ cashFlow, transactions, bookings, bookingLabel, onAddIncome, onAddExpense, onEdit, onDelete }) {
  const [filter, setFilter] = useState('all');
  const list = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);
  const total = transactions.reduce((s, t) => s + (t.type === 'income' ? (Number(t.amount) || 0) : -(Number(t.amount) || 0)), 0);
  return (
    <div>
<<<<<<< HEAD
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Income, expenses & cash flow</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>Log every payment and cost here. Income linked to a booking updates its paid amount; expenses categorized "Host payout" and linked to a booking settle that host automatically.</p>

      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>Online</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '18px' }}>
=======
      <h1 className="mm-h1" style={{ margin: '0 0 4px' }}>Income, expenses & cash flow</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>Log every payment and cost here. Income linked to a booking updates its paid amount; expenses categorized "Host payout" and linked to a booking settle that host automatically.</p>

      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>Online</p>
      <div className="mm-stats-3" style={{ marginBottom: '18px' }}>
>>>>>>> 07f5e40 (mobile)
        <StatCard label="Online credit" value={cashFlow.onlineIncome} tone="good" />
        <StatCard label="Online debit" value={cashFlow.onlineOutgo} sub="expenses + payouts, online" tone="bad" />
        <StatCard label="Online balance" value={cashFlow.onlineNet} tone={cashFlow.onlineNet >= 0 ? 'good' : 'bad'} />
      </div>
      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>Cash</p>
<<<<<<< HEAD
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '26px' }}>
=======
      <div className="mm-stats-3" style={{ marginBottom: '26px' }}>
>>>>>>> 07f5e40 (mobile)
        <StatCard label="Cash credit" value={cashFlow.cashIncome} tone="good" />
        <StatCard label="Cash debit" value={cashFlow.cashOutgo} sub="expenses + payouts, cash" tone="bad" />
        <StatCard label="Cash balance" value={cashFlow.cashNet} tone={cashFlow.cashNet >= 0 ? 'good' : 'bad'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Entries</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{transactions.length} entries · net ₹{money(total)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" onClick={onAddExpense}><IconPlus size={13} /> New expense</button>
          <button type="button" className="mm-btn mm-btn-primary" onClick={onAddIncome}><IconPlus size={13} /> New income</button>
        </div>
      </div>
<<<<<<< HEAD
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {[['all', 'All'], ['income', 'Income'], ['expense', 'Expense']].map(([f, label]) => (
          <span key={f} onClick={() => setFilter(f)} style={{ cursor: 'pointer', fontSize: '12px', padding: '6px 12px', borderRadius: '20px', background: filter === f ? 'var(--text-heading)' : 'var(--card-bg)', color: filter === f ? 'var(--page-bg)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{label}</span>
=======
      <div className="mm-chips" style={{ marginBottom: '16px' }}>
        {[['all', 'All'], ['income', 'Income'], ['expense', 'Expense']].map(([f, label]) => (
          <span key={f} onClick={() => setFilter(f)} className={`mm-chip${filter === f ? ' active' : ''}`}>{label}</span>
>>>>>>> 07f5e40 (mobile)
        ))}
      </div>

      {list.length === 0 ? <EmptyState text="No entries yet. Log a booking payment, a host payout, or an expense to get started." /> : (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {list.map((t, i) => {
            const linked = bookings.find(b => b.id === t.bookingId);
            return (
<<<<<<< HEAD
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border-light)', flexWrap: 'wrap', gap: '8px' }}>
                <span className="mm-tag" style={{ background: t.type === 'income' ? '#E1EFE4' : '#F7E4E0', color: t.type === 'income' ? '#3F6B4F' : '#A8452F', width: '58px', textAlign: 'center' }}>{t.type === 'income' ? 'Income' : 'Expense'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-faint)', width: '84px' }}>{t.date}</span>
                <span className="mm-tag" style={{ background: 'var(--border-light)', color: 'var(--text-muted)' }}>{t.category}</span>
                {linked && <span className="mm-tag" style={{ background: '#EEF0FA', color: '#3B4A8C', fontFamily: '"IBM Plex Mono", monospace' }}>{linked.code}</span>}
                <span className="mm-tag" style={{ background: t.mode === 'online' ? '#E6F0FA' : 'var(--border-light)', color: t.mode === 'online' ? '#1D5A9E' : '#6B6555' }}>{t.mode === 'online' ? 'Online' : 'Cash'}</span>
                <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-heading)', minWidth: '80px' }}>{t.note}</span>
                <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color: t.type === 'income' ? '#3F6B4F' : '#A8452F' }}>{t.type === 'income' ? '+' : '−'}₹{money(t.amount)}</span>
                <div style={{ display: 'flex', gap: '2px' }}>
=======
              <div key={t.id} className="mm-e-row" style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-light)' }}>
                <span className="mm-tag mm-e-type" style={{ background: t.type === 'income' ? '#E1EFE4' : '#F7E4E0', color: t.type === 'income' ? '#3F6B4F' : '#A8452F', width: '58px', textAlign: 'center' }}>{t.type === 'income' ? 'Income' : 'Expense'}</span>
                <span className="mm-e-date" style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{t.date}</span>
                <div className="mm-e-tags">
                  <span className="mm-tag" style={{ background: 'var(--border-light)', color: 'var(--text-muted)' }}>{t.category}</span>
                  {linked && <span className="mm-tag" style={{ background: '#EEF0FA', color: '#3B4A8C', fontFamily: '"IBM Plex Mono", monospace' }}>{linked.code}</span>}
                  <span className="mm-tag" style={{ background: t.mode === 'online' ? '#E6F0FA' : 'var(--border-light)', color: t.mode === 'online' ? '#1D5A9E' : '#6B6555' }}>{t.mode === 'online' ? 'Online' : 'Cash'}</span>
                </div>
                <span className="mm-e-note" style={{ fontSize: '13px', color: 'var(--text-heading)' }}>{t.note}</span>
                <span className="mm-e-amount" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color: t.type === 'income' ? '#3F6B4F' : '#A8452F' }}>{t.type === 'income' ? '+' : '−'}₹{money(t.amount)}</span>
                <div className="mm-e-actions">
>>>>>>> 07f5e40 (mobile)
                  <button type="button" className="mm-icon-btn" onClick={() => onEdit(t)}><IconEdit /></button>
                  <button type="button" className="mm-icon-btn" onClick={() => onDelete(t.id)}><IconTrash /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
