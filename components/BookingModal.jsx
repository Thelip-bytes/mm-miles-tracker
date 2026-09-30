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

export function BookingModal({ form, vehicles, hosts, customers, transactions, bookings, onCancel, onSave, onQuickAddCustomer, readOnly, canFinance, canOverridePrice, canBypassTimeGuards }) {
  const [data, setData] = useState(form);
  const [addedCustomers, setAddedCustomers] = useState([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', aadhar: '', licenseNumber: '', phone: '', address: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [closingError, setClosingError] = useState('');
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const setNC = (k, v) => setNewCustomer(d => ({ ...d, [k]: v }));

  const allCustomers = useMemo(() => {
    const merged = [...customers];
    addedCustomers.forEach(ac => { if (!merged.find(c => c.id === ac.id)) merged.push(ac); });
    return merged;
  }, [customers, addedCustomers]);

  function saveNewCustomer() {
    if (!newCustomer.name.trim() || !newCustomer.aadhar.trim() || !newCustomer.licenseNumber.trim() || !newCustomer.address.trim()) {
      setNewCustomerError('Name, Aadhar number, license number, and address are all required.');
      return;
    }
    const c = { ...newCustomer, id: uid() };
    onQuickAddCustomer(c);
    setAddedCustomers(a => [...a, c]);
    set('customerId', c.id);
    setNewCustomer({ name: '', aadhar: '', licenseNumber: '', phone: '', address: '' });
    setNewCustomerError('');
    setShowNewCustomer(false);
  }

  useEffect(() => {
    if (data.start && data.end) {
      const s = new Date(data.start), e = new Date(data.end);
      const diffMs = e - s;
      if (diffMs > 0) { const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))); if (days !== Number(data.days)) set('days', days); }
    }
  }, [data.start, data.end]);

  const vehicle = vehicles.find(v => v.id === data.vehicleId);
  const isLimited = vehicle && vehicle.kmPolicy === 'limited';
  const hourRate = vehicle ? Number(vehicle.extraHourRate) || 0 : 0;
  const kmRate = vehicle ? Number(vehicle.extraKmRate) || 0 : 0;
  const dailyRate = vehicle ? Number(vehicle.dailyRate) || 0 : 0;
  const baseHourlyRate = vehicle ? Number(vehicle.hourlyRate) || 0 : 0;
  const hasRateCard = dailyRate > 0;
  const priceLocked = hasRateCard && data.priceOverridden !== true;
  const datesLocked = !!data.id && !canBypassTimeGuards;

  const pricingInfo = useMemo(() => {
    if (!data.start || !data.end || !vehicle) return { amount: 0, breakdown: '' };
    const totalMinutes = Math.max(0, Math.round((new Date(data.end) - new Date(data.start)) / 60000));
    const totalHours = totalMinutes / 60;
    const fullDays = Math.floor(totalMinutes / 1440);
    const leftoverMinutes = totalMinutes - fullDays * 1440;
    const leftoverHours = Math.ceil(leftoverMinutes / 60);

    const hasPackages = !isLimited && Number(vehicle.pkg4hrRate) > 0;
    if (hasPackages && totalHours <= 12) {
      const p4 = Number(vehicle.pkg4hrRate) || 0;
      const p410 = Number(vehicle.pkg4to10Rate) || 0;
      const p12 = Number(vehicle.pkg12hrRate) || 0;
      if (totalHours <= 4) return { amount: p4, breakdown: `4-hr package (${vehicle.pkg4hrKm || '—'} km incl.)` };
      if (totalHours <= 10) {
        const extraHrs = Math.ceil(totalHours - 4);
        return { amount: p4 + extraHrs * p410, breakdown: `4-hr base ₹${money(p4)} + ${extraHrs}hr @ ₹${money(p410)} (${vehicle.pkg4to10Km || '—'} km incl.)` };
      }
      return { amount: p12, breakdown: `12-hr package (${vehicle.pkg12hrKm || '—'} km incl.)` };
    }

    const base = fullDays * dailyRate + leftoverHours * baseHourlyRate;
    const discountPct = multiDayDiscountFor(fullDays);
    const amount = Math.round(base * (1 - discountPct / 100));
    const breakdown = `${fullDays}d @ ₹${money(dailyRate)}${leftoverHours > 0 ? ` + ${leftoverHours}hr @ ₹${money(baseHourlyRate)}` : ''}${discountPct > 0 ? ` − ${discountPct}% (${fullDays}-day discount)` : ''}`;
    return { amount, breakdown };
  }, [data.start, data.end, vehicle, isLimited, dailyRate, baseHourlyRate]);

  useEffect(() => {
    if (!hasRateCard || data.priceOverridden === true) return;
    // Auto-fill for a brand-new booking, right after an explicit "use rate
    // card price" reset, or when the dates have actually been changed this
    // session (e.g. extending an overdue trip) — but never just because an
    // existing booking was opened for an unrelated edit, so untouched
    // historical/imported prices are never silently overwritten.
    const datesChanged = data.start !== form.start || data.end !== form.end;
    const shouldAutoFill = !data.id || data.priceOverridden === false || datesChanged;
    if (!shouldAutoFill) return;
    if (Number(data.rentalAmount || 0) !== pricingInfo.amount) set('rentalAmount', pricingInfo.amount);
  }, [pricingInfo, hasRateCard, data.priceOverridden, data.id, data.start, data.end, form.start, form.end]);

  const kmDriven = useMemo(() => {
    if (data.startKm === undefined || data.startKm === '' || data.endKm === undefined || data.endKm === '') return null;
    return Math.max(0, (Number(data.endKm) || 0) - (Number(data.startKm) || 0));
  }, [data.startKm, data.endKm]);

  const tripDurationDays = useMemo(() => {
    const effectiveEnd = data.closingTime || data.end;
    if (!data.start || !effectiveEnd) return 1;
    return Math.max(1, Math.ceil((new Date(effectiveEnd) - new Date(data.start)) / (1000 * 60 * 60 * 24)));
  }, [data.start, data.end, data.closingTime]);

  const totalHoursForBooking = useMemo(() => {
    if (!data.start || !data.end) return null;
    return Math.max(0, (new Date(data.end) - new Date(data.start)) / (1000 * 60 * 60));
  }, [data.start, data.end]);

  const hasPackages = !isLimited && vehicle && Number(vehicle.pkg4hrRate) > 0;
  const inPackageMode = hasPackages && totalHoursForBooking != null && totalHoursForBooking <= 12;
  const activePackageKmCap = useMemo(() => {
    if (!inPackageMode) return null;
    if (totalHoursForBooking <= 4) return Number(vehicle.pkg4hrKm) || 0;
    if (totalHoursForBooking <= 10) return Number(vehicle.pkg4to10Km) || 0;
    return Number(vehicle.pkg12hrKm) || 0;
  }, [inPackageMode, totalHoursForBooking, vehicle]);

  useEffect(() => {
    if (data.closingTime && data.end) {
      const overageMs = new Date(data.closingTime) - new Date(data.end);
      const computed = overageMs > 0 ? Math.ceil(overageMs / (1000 * 60 * 60)) : 0;
      if (Number(data.extraHours || 0) !== computed) set('extraHours', computed);
    }
  }, [data.closingTime, data.end]);
  useEffect(() => {
    if (hourRate > 0) {
      const computed = (Number(data.extraHours) || 0) * hourRate;
      if (Number(data.extraHourCharge || 0) !== computed) set('extraHourCharge', computed);
    }
  }, [data.extraHours, hourRate]);
  useEffect(() => {
    if (kmDriven == null || !vehicle) return;
    if (isLimited) {
      const limit = (Number(vehicle.kmLimit) || 0) * tripDurationDays;
      const computed = Math.max(0, kmDriven - limit);
      if (Number(data.extraKm || 0) !== computed) set('extraKm', computed);
    } else if (inPackageMode && activePackageKmCap != null) {
      const computed = Math.max(0, kmDriven - activePackageKmCap);
      if (Number(data.extraKm || 0) !== computed) set('extraKm', computed);
    } else if (Number(data.extraKm || 0) !== 0) {
      set('extraKm', 0);
    }
  }, [kmDriven, isLimited, vehicle, tripDurationDays, inPackageMode, activePackageKmCap]);
  useEffect(() => {
    if ((isLimited || inPackageMode) && kmRate > 0) {
      const computed = (Number(data.extraKm) || 0) * kmRate;
      if (Number(data.extraKmCharge || 0) !== computed) set('extraKmCharge', computed);
    } else if (!isLimited && !inPackageMode && Number(data.extraKmCharge || 0) !== 0) {
      set('extraKmCharge', 0);
    }
  }, [data.extraKm, kmRate, isLimited, inPackageMode]);

  const linkedPayments = useMemo(() => data.id ? transactions.filter(t => t.type === 'income' && t.bookingId === data.id) : [], [transactions, data.id]);
  const linkedPayouts = useMemo(() => data.id ? transactions.filter(t => t.type === 'expense' && t.category === HOST_PAYOUT_CATEGORY && t.bookingId === data.id) : [], [transactions, data.id]);
  const linkedRefunds = useMemo(() => data.id ? transactions.filter(t => t.type === 'expense' && t.category === REFUND_CATEGORY && t.bookingId === data.id) : [], [transactions, data.id]);
  const paid = useMemo(() => {
    const online = linkedPayments.filter(t => t.mode === 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cash = linkedPayments.filter(t => t.mode !== 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { online, cash };
  }, [linkedPayments]);
  const payoutPaid = useMemo(() => linkedPayouts.reduce((s, t) => s + (Number(t.amount) || 0), 0), [linkedPayouts]);
  const refundPaid = useMemo(() => linkedRefunds.reduce((s, t) => s + (Number(t.amount) || 0), 0), [linkedRefunds]);
  const calc = useMemo(() => computeBooking(data, vehicles, hosts, paid, payoutPaid, refundPaid), [data, vehicles, hosts, paid, payoutPaid, refundPaid]);
  const closingFieldsComplete = useMemo(() => {
    return REQUIRED_ALWAYS.every(k => data[k] !== undefined && data[k] !== null && data[k] !== '');
  }, [data]);
  const timeAllowsCompletion = useMemo(() => {
    if (data.closingTime) return true;
    if (!data.end) return false;
    return new Date() >= new Date(data.end);
  }, [data.closingTime, data.end]);
  const canMarkCompleted = closingFieldsComplete && (canBypassTimeGuards || timeAllowsCompletion);
  const displayStatus = useMemo(() => {
    if (data.status === 'completed') return 'Completed';
    if (data.status === 'cancelled') return 'Cancelled';
    if (data.status === 'no-show') return 'No show';
    if (data.start && new Date() < new Date(data.start)) return 'Upcoming';
    return 'Ongoing';
  }, [data.status, data.start]);

  useEffect(() => {
    if (data.status === 'ongoing' && closingFieldsComplete && (canBypassTimeGuards || timeAllowsCompletion)) {
      set('status', 'completed');
    }
  }, [data.status, closingFieldsComplete, timeAllowsCompletion, canBypassTimeGuards]);

  useEffect(() => {
    if (data.status === 'cancelled' && !data.cancelledAt) set('cancelledAt', nowLocal());
  }, [data.status]);
  useEffect(() => {
    if (data.status === 'cancelled' && data.cancelledAt && data.start && (data.refundPercent === undefined || data.refundPercent === '')) {
      const hrs = (new Date(data.start) - new Date(data.cancelledAt)) / 3600000;
      set('refundPercent', refundTierFor(hrs).percent);
    }
  }, [data.status, data.cancelledAt, data.start]);
  const suggestedTier = useMemo(() => {
    if (!data.cancelledAt || !data.start) return REFUND_TIERS[REFUND_TIERS.length - 1];
    return refundTierFor((new Date(data.start) - new Date(data.cancelledAt)) / 3600000);
  }, [data.cancelledAt, data.start]);

  function submit(e) {
    e.preventDefault();
    if (readOnly) { onCancel(); return; }
    if (!data.vehicleId || !data.customerId || !data.start || !data.end || !data.rentalAmount || data.startKm === undefined || data.startKm === '') {
      setClosingError('Fill in vehicle, customer, dates, rental amount, and the start km reading before saving.');
      return;
    }
    if (!data.id && !canBypassTimeGuards) {
      if (new Date(data.start) < new Date()) { setClosingError('A new booking\u2019s start time can\u2019t be in the past \u2014 it can\u2019t be backdated.'); return; }
    }
    if (datesLocked && data.start !== form.start) {
      setClosingError('The booking\u2019s start time is locked once saved \u2014 ask an admin to change it.');
      return;
    }
    if (datesLocked && new Date(data.end) < new Date(form.end)) {
      setClosingError('The return time can only be extended later, not moved earlier \u2014 ask an admin for that change.');
      return;
    }
    const conflict = (bookings || []).find(b => b.id !== data.id && b.vehicleId === data.vehicleId && b.status !== 'cancelled' && b.status !== 'no-show' && new Date(data.start) < new Date(b.end) && new Date(b.start) < new Date(data.end));
    if (conflict) { setClosingError(`This vehicle is already booked as ${conflict.code} from ${(conflict.start || '').replace('T', ' ')} to ${(conflict.end || '').replace('T', ' ')}. Adjust the dates or pick another vehicle.`); return; }
    if (data.priceOverridden && !String(data.priceOverrideReason || '').trim()) {
      setClosingError('Enter a reason for overriding the rate-card price before saving.');
      return;
    }
    if (data.status === 'completed') {
      const missing = REQUIRED_ALWAYS.some(k => data[k] === undefined || data[k] === null || data[k] === '');
      if (missing) { setClosingError('Fill in every trip-closing field below (use 0 where there\u2019s nothing to charge) before marking this booking completed.'); return; }
      if (!canBypassTimeGuards && !timeAllowsCompletion) { setClosingError('Can\u2019t mark completed until the planned return time passes, or an actual closing time is entered (for an early return).'); return; }
    }
    setClosingError('');
    onSave(data);
  }

  return (
    <ModalShell title={readOnly ? `View booking ${data.code}` : (data.id ? `Edit booking ${data.code}` : 'New booking')} onCancel={onCancel} onSubmit={submit} wide>
      {readOnly && <p style={{ fontSize: '12px', color: 'var(--text-faint)', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', margin: 0 }}>View-only — this role can't edit bookings.</p>}
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
      <div className="mm-form-grid">
        <Field label="Vehicle">
          <select required className="mm-input" value={data.vehicleId || ''} onChange={e => set('vehicleId', e.target.value)}>
            <option value="">Select vehicle</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber} · {v.make} {v.model}</option>)}
          </select>
        </Field>
        <Field label="Customer">
          <div style={{ display: 'flex', gap: '6px' }}>
            <select required className="mm-input" value={data.customerId || ''} onChange={e => set('customerId', e.target.value)}>
              <option value="">Select customer</option>
              {allCustomers.map(c => <option key={c.id} value={c.id}>{c.name}{c.aadhar ? ` · ${c.aadhar}` : ''}</option>)}
            </select>
            <button type="button" className="mm-btn mm-btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowNewCustomer(s => !s)}><IconPlus size={13} /> New</button>
          </div>
        </Field>
      </div>
      {showNewCustomer && (
        <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Field label="Customer name *"><input required className="mm-input" value={newCustomer.name} onChange={e => setNC('name', e.target.value)} placeholder="Full name" /></Field>
          <div className="mm-form-grid" style={{ gap: '10px' }}>
            <Field label="Aadhar number *"><input required className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={newCustomer.aadhar} onChange={e => setNC('aadhar', e.target.value)} placeholder="XXXX XXXX XXXX" /></Field>
            <Field label="License number *"><input required className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={newCustomer.licenseNumber} onChange={e => setNC('licenseNumber', e.target.value)} placeholder="DL number" /></Field>
          </div>
          <div className="mm-form-grid" style={{ gap: '10px' }}>
            <Field label="Phone"><input className="mm-input" value={newCustomer.phone} onChange={e => setNC('phone', e.target.value)} /></Field>
            <Field label="Address *"><input required className="mm-input" value={newCustomer.address} onChange={e => setNC('address', e.target.value)} /></Field>
          </div>
          {newCustomerError && <p style={{ fontSize: '11px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{newCustomerError}</p>}
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>Photo capture for Aadhar, license, and the renter is available on the full customer profile — save this quickly, then add photos from the Customers tab.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setShowNewCustomer(false)}>Cancel</button>
            <button type="button" className="mm-btn mm-btn-gold" onClick={saveNewCustomer}>Save customer</button>
          </div>
        </div>
      )}
      <div className="mm-form-grid" style={{ '--cols': 'minmax(0, 1fr) minmax(0, 1fr) 60px' }}>
        <Field label="Start" hint={datesLocked ? 'locked after saving — ask admin to change' : (!data.id && !canBypassTimeGuards) ? 'can\u2019t be backdated' : null}>
          <input type="datetime-local" required readOnly={datesLocked} min={(!data.id && !canBypassTimeGuards) ? nowLocal() : undefined} className="mm-input" value={data.start || ''} onChange={e => set('start', e.target.value)} />
        </Field>
        <Field label="End" hint={datesLocked ? 'can be extended later, but not moved earlier' : null}>
          <input type="datetime-local" required min={datesLocked ? form.end : undefined} className="mm-input" value={data.end || ''} onChange={e => set('end', e.target.value)} />
        </Field>
        <Field label="Days"><input type="number" min="1" readOnly={datesLocked} className="mm-input" value={data.days || 1} onChange={e => set('days', e.target.value)} /></Field>
      </div>
      <div className="mm-form-grid">
        <Field label="Rental amount (₹)" hint={priceLocked ? pricingInfo.breakdown : (hasRateCard ? 'overridden' : 'no rate card set for this vehicle')}>
          <input type="number" min="0" required readOnly={priceLocked} className="mm-input" value={data.rentalAmount || ''} onChange={e => set('rentalAmount', e.target.value)} />
        </Field>
        <Field label="Start km reading" hint="required to start the trip"><input type="number" min="0" required placeholder="e.g. 12000" className="mm-input" value={data.startKm === undefined ? '' : data.startKm} onChange={e => set('startKm', e.target.value)} /></Field>
      </div>
      {hasRateCard && canOverridePrice && (
        <div>
          {!data.priceOverridden ? (
            <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => set('priceOverridden', true)}>Override price</button>
          ) : (
            <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#8A5E1E', margin: 0 }}>Price overridden from rate card</p>
                <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => { set('priceOverridden', false); set('priceOverrideReason', ''); }}>Use rate card price</button>
              </div>
              <Field label="Reason for override *"><input required className="mm-input" value={data.priceOverrideReason || ''} onChange={e => set('priceOverrideReason', e.target.value)} placeholder="e.g. Repeat customer discount approved by owner" /></Field>
            </div>
          )}
        </div>
      )}
      {hasRateCard && !canOverridePrice && data.priceOverridden && (
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>Price was overridden from the rate card: "{data.priceOverrideReason}"</p>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Trip closing details</p>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 10px' }}>
          {!vehicle ? 'Select a vehicle to see its km policy.' : isLimited ? `This vehicle has a ${vehicle.kmLimit || '—'} km/day limit (scales with trip length).` : inPackageMode ? `This booking fits the ${totalHoursForBooking <= 4 ? '4-hr' : totalHoursForBooking <= 10 ? '4-10hr' : '12-hr'} package — ${activePackageKmCap || '—'} km included.` : 'This vehicle is unlimited km for bookings over 12 hours — the reading is still recorded, but there\u2019s no km charge.'} Required before marking the booking completed — use 0 where nothing applies.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Field label="Closing time (actual return)" hint={canBypassTimeGuards ? 'required to complete' : "required to complete — can't be in the future"}>
            <input type="datetime-local" max={canBypassTimeGuards ? undefined : nowLocal()} min={data.start || undefined} className="mm-input" value={data.closingTime || ''} onChange={e => set('closingTime', e.target.value)} />
          </Field>
          <div className="mm-form-grid">
            <ChargeRow label="Extra hours" amountKey="extraHours" data={data} set={set} readOnly={!!(data.closingTime && data.end)} rateHint={data.closingTime && data.end ? 'auto from closing time vs. end' : null} />
            <ChargeRow label="Extra hour charge" amountKey="extraHourCharge" data={data} set={set} readOnly={hourRate > 0} rateHint={hourRate > 0 ? `auto @ ₹${hourRate}/hr` : null} />
          </div>
          <div className="mm-form-grid">
            <Field label="End km reading"><input type="number" min="0" placeholder="e.g. 12180" className="mm-input" value={data.endKm === undefined ? '' : data.endKm} onChange={e => set('endKm', e.target.value)} /></Field>
            <div />
          </div>
          {kmDriven != null && (
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '-2px 0 2px' }}>
              {money(kmDriven)} km driven{isLimited ? ` — ${money(Number(data.extraKm) || 0)} km over the ${money(tripDurationDays)}-day allowance of ${money(tripDurationDays * (Number(vehicle.kmLimit) || 0))} km, ₹${money(data.extraKmCharge || 0)} charge (auto @ ₹${kmRate}/km)` : inPackageMode ? ` — ${money(Number(data.extraKm) || 0)} km over the ${money(activePackageKmCap || 0)} km package allowance, ₹${money(data.extraKmCharge || 0)} charge (auto @ ₹${kmRate}/km)` : ' (unlimited km, no charge)'}
            </p>
          )}
          <ChargeRow label="Toll" amountKey="tollAmount" noteKey="tollNote" data={data} set={set} />
          <ChargeRow label="Fuel" amountKey="fuelAmount" noteKey="fuelNote" data={data} set={set} />
          <ChargeRow label="Damage" amountKey="damageAmount" noteKey="damageNote" data={data} set={set} />
          <ChargeRow label="Traffic fine" amountKey="fineAmount" noteKey="fineNote" data={data} set={set} />
        </div>
      </div>

      {vehicle && canFinance && <PayoutBreakdown calc={calc} />}

      <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Payments received</p>
        <div className="mm-kv-row" style={{ fontSize: '12px', fontFamily: '"IBM Plex Mono", monospace' }}>
          <span style={{ color: 'var(--text-muted)' }}>₹{money(calc.paidTotal)} of ₹{money(calc.totalDue)} (₹{money(calc.paidOnline)} online + ₹{money(calc.paidCash)} cash)</span>
          <span style={{ color: calc.balance > 0 ? '#A8452F' : '#3F6B4F' }}>{calc.balance > 0 ? `Balance ₹${money(calc.balance)}` : 'Fully paid'}</span>
        </div>
        <LinkedEntriesList entries={linkedPayments} emptyText={data.id ? 'No payments logged yet.' : null} />
        {canFinance && (
          <Fragment>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '10px 0 4px' }}>Host payout</p>
            <div className="mm-kv-row" style={{ fontSize: '12px', fontFamily: '"IBM Plex Mono", monospace' }}>
              <span style={{ color: 'var(--text-muted)' }}>₹{money(calc.payoutPaidAmount)} of ₹{money(calc.hostPayout)} paid out</span>
              <span style={{ color: calc.payoutBalance > 0 ? '#A8452F' : '#3F6B4F' }}>{calc.payoutBalance > 0 ? `Balance ₹${money(calc.payoutBalance)}` : 'Fully paid out'}</span>
            </div>
            <LinkedEntriesList entries={linkedPayouts} emptyText={data.id ? 'No payout logged yet.' : null} />
          </Fragment>
        )}
        {!data.id && <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '8px 0 0' }}>Save the booking first, then log its payment{canFinance ? ' and payout' : ''} from "Income, expenses & cash flow" linked to this booking's code.</p>}
      </div>

      <Field label="Booking status" hint={!canBypassTimeGuards ? 'system-determined — Cancel/No-show are the only manual actions' : null}>
        {canBypassTimeGuards ? (
          <select className="mm-input" value={data.status || 'ongoing'} onChange={e => { set('status', e.target.value); setClosingError(''); }}>
            <option value="ongoing">Ongoing</option><option value="completed" disabled={!canMarkCompleted}>Completed</option><option value="cancelled">Cancelled</option><option value="no-show">No show</option>
          </select>
        ) : (
          <Fragment>
            <div className="mm-input" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'default' }}>{displayStatus}</div>
            {data.status === 'ongoing' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => { set('status', 'cancelled'); setClosingError(''); }}>Cancel booking</button>
                <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => { set('status', 'no-show'); setClosingError(''); }}>Mark no-show</button>
              </div>
            )}
          </Fragment>
        )}
        {data.status === 'ongoing' && (
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '4px 0 0' }}>
            {!closingFieldsComplete ? 'Fill in every trip-closing field above, including the closing time (use 0 where nothing applies) \u2014 this booking will mark itself Completed automatically once it\u2019s all in.' : 'Ready to close \u2014 saving now will mark this Completed.'}
          </p>
        )}
      </Field>

      {(data.status === 'cancelled' || data.status === 'no-show') && (
        <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>Cancellation & refund</p>
          {data.status === 'no-show' ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>No-show — refund policy gives 0% (no refund due), regardless of what was already paid.</p>
          ) : (
            <Fragment>
              <div className="mm-form-grid" style={{ marginBottom: '10px' }}>
                <Field label="Cancelled at" hint={canBypassTimeGuards ? 'admin can adjust' : 'locked to system time'}>
                  {canBypassTimeGuards ? (
                    <input type="datetime-local" max={nowLocal()} className="mm-input" value={data.cancelledAt || ''} onChange={e => set('cancelledAt', e.target.value)} />
                  ) : (
                    <div className="mm-input" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'default' }}>{(data.cancelledAt || '').replace('T', ' ') || '—'}</div>
                  )}
                </Field>
                <Field label="Refund %" hint={`policy suggests ${suggestedTier.percent}% · ${suggestedTier.label}`}>
                  <input type="number" min="0" max="100" className="mm-input" value={data.refundPercent === undefined ? '' : data.refundPercent} onChange={e => set('refundPercent', e.target.value)} />
                </Field>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 10px' }}>{canBypassTimeGuards ? 'As admin, you can correct this if the cancellation was logged late — it still feeds the refund tier below.' : 'Cancellation time is captured automatically and can\u2019t be backdated, so the refund tier reflects real notice given.'} Policy: 90% if cancelled 24+ hrs before start, 50% if 4–24 hrs before, 0% under 4 hrs or no-show. Adjust the % above for documented exceptions.</p>
              <div className="mm-kv-row" style={{ fontSize: '12px', fontFamily: '"IBM Plex Mono", monospace' }}>
                <span style={{ color: 'var(--text-muted)' }}>Refund due: <b style={{ color: 'var(--text-heading)' }}>₹{money(calc.refundDue)}</b> ({data.refundPercent || 0}% of ₹{money(calc.paidTotal)} paid) · ₹{money(calc.refundPaidAmount)} refunded so far</span>
                <span style={{ color: calc.refundBalance > 0 ? '#A8452F' : '#3F6B4F' }}>{calc.refundBalance > 0 ? `Balance ₹${money(calc.refundBalance)}` : calc.refundDue > 0 ? 'Fully refunded' : '—'}</span>
              </div>
            </Fragment>
          )}
          <LinkedEntriesList entries={linkedRefunds} emptyText={data.id ? 'No refund logged yet.' : null} />
          {!data.id && <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '8px 0 0' }}>Save first, then log the refund from "Income, expenses & cash flow" → New expense → Customer refund, linked to this booking.</p>}
        </div>
      )}

      {closingError && <p style={{ fontSize: '12px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{closingError}</p>}
      <Field label="Notes"><textarea rows={2} className="mm-input" style={{ resize: 'vertical' }} value={data.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </fieldset>
      <div className="mm-modal-actions">
        {readOnly ? (
          <button type="button" className="mm-btn mm-btn-primary" onClick={onCancel}>Close</button>
        ) : (
          <Fragment>
            <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="mm-btn mm-btn-primary">Save booking</button>
          </Fragment>
        )}
      </div>
    </ModalShell>
  );
}
