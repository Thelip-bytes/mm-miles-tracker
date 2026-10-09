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
  refundTierFor, multiDayDiscountFor, uid, todayStr, nowLocal, nowLocalMinus, money, monthKey,
  monthLabel, nextBookingCode, safeGet, safeSet, getCol, pad2, toLocalInputStr,
  toDateInputStr, parseFlexibleDateTime, parseFlexibleDate, numOrBlank,
  compressImageFile, migrateTransactions, bookingTimeStatus
} from '@/lib/helpers';
import { computeBooking } from '@/lib/computeBooking';

// How far back a new booking's start time may sit before we insist it is
// re-picked. Long enough to fill the form in, short enough that a genuinely
// backdated entry is still refused.
const START_GRACE_MS = 30 * 60 * 1000;

function wasRateCardDiscounted(form, vehicles) {
  if (!form?.id || form.priceOverridden || !form.start || !form.end) return false;
  const vehicle = vehicles.find(v => v.id === form.vehicleId);
  if (!vehicle) return false;

  const totalMinutes = Math.max(0, Math.round((new Date(form.end) - new Date(form.start)) / 60000));
  const totalHours = totalMinutes / 60;
  const fullDays = Math.floor(totalMinutes / 1440);
  const leftoverHours = Math.ceil((totalMinutes - fullDays * 1440) / 60);
  if (vehicle.kmPolicy !== 'limited') {
    if (Number(vehicle.pkg4hrRate) > 0 && totalHours <= 12) return false;
  }

  const discount = multiDayDiscountFor(fullDays);
  if (!discount) return false;
  const base = fullDays * (Number(vehicle.dailyRate) || 0) + leftoverHours * (Number(vehicle.hourlyRate) || 0);
  const withDiscount = Math.round(base * (1 - discount / 100));
  return withDiscount !== Math.round(base) && Number(form.rentalAmount) === withDiscount;
}

export function BookingModal({ form, vehicles, hosts, customers, transactions, bookings, onCancel, onSave, onQuickAddCustomer, readOnly, canFinance, canOverridePrice, canBypassTimeGuards, canQuickAddCustomer, saving, syncing, saveError, onDismissError }) {
  const [data, setData] = useState(form);
  // New bookings start with no discount. Existing rate-card bookings recover
  // the choice from their saved rental amount, so no database migration is
  // needed just to remember the selected price.
  const [discountEnabled, setDiscountEnabled] = useState(() => wasRateCardDiscounted(form, vehicles));
  const [discountTouched, setDiscountTouched] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', aadhar: '', licenseNumber: '', phone: '', address: '' });
  const [newCustomerError, setNewCustomerError] = useState('');
  const [closingError, setClosingError] = useState('');
  const errorRef = useRef(null);
  const startRef = useRef(null);
  const endRef = useRef(null);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const setNC = (k, v) => setNewCustomer(d => ({ ...d, [k]: v }));
  const setBookingDate = (key, value) => setData(d => {
    const next = { ...d, [key]: value };
    // Closing readings and charges describe the actual return. Changing the
    // schedule clears those values so status and duration follow the new dates.
    if (d[key] !== value && (d.closingTime || d.status === 'completed')) {
      next.closingTime = '';
      if (d.status === 'completed') next.status = 'ongoing';
      next.endKm = '';
      next.extraHours = 0;
      next.extraHourCharge = 0;
      next.extraKm = 0;
      next.extraKmCharge = 0;
    }
    const duration = new Date(next.end) - new Date(next.start);
    if (duration > 0) next.days = Math.max(1, Math.ceil(duration / (24 * 60 * 60 * 1000)));
    return next;
  });
  const clearClosingTime = () => {
    setData(d => ({ ...d, closingTime: '', endKm: '', extraHours: 0, extraHourCharge: 0, extraKm: 0, extraKmCharge: 0, status: d.status === 'completed' ? 'ongoing' : d.status }));
    setClosingError('');
  };

  // The parent owns the customer list and appends the saved row to it, so there
  // is nothing to merge here. (This used to keep a client-side copy keyed by a
  // temporary `uid()`, which left the dropdown showing the new customer twice
  // and left `customerId` pointing at an id that does not exist in Postgres.)
  const allCustomers = customers;

  async function saveNewCustomer() {
    if (!newCustomer.name.trim() || !newCustomer.aadhar.trim() || !newCustomer.licenseNumber.trim() || !newCustomer.address.trim()) {
      setNewCustomerError('Name, Aadhar number, license number, and address are all required.');
      return;
    }
    setAddingCustomer(true);
    setNewCustomerError('');
    try {
      // Wait for the real database id before selecting it — a booking saved
      // against the old temporary id was rejected by Postgres, and the failure
      // was never shown, so the whole form had to be filled in again.
      const realId = await onQuickAddCustomer(newCustomer);
      set('customerId', realId);
      setNewCustomer({ name: '', aadhar: '', licenseNumber: '', phone: '', address: '' });
      setShowNewCustomer(false);
    } catch (err) {
      setNewCustomerError(err.message || 'That customer could not be saved.');
    } finally {
      setAddingCustomer(false);
    }
  }

  useEffect(() => {
    if (data.start && data.end) {
      const s = new Date(data.start), e = new Date(data.end);
      const diffMs = e - s;
      if (diffMs > 0) { const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))); if (days !== Number(data.days)) set('days', days); }
    }
  }, [data.start, data.end]);

  // Earliest start time we will accept for a brand-new booking. The form
  // pre-fills `start` with the instant the modal opened, so a hard "not in the
  // past" rule was guaranteed to fail — and because this is also the input's
  // native `min`, the browser blocked the submit with its own wording before
  // our message could ever appear. The grace window covers the time it takes to
  // fill the form in; anything older is genuinely a backdated entry.
  // Recomputed per render (as `nowLocal()` already was) so the floor never
  // goes stale while a slow form is being filled in.
  const startMin = nowLocalMinus(START_GRACE_MS);

  const vehicle = vehicles.find(v => v.id === data.vehicleId);
  const isLimited = vehicle && vehicle.kmPolicy === 'limited';
  const hourRate = vehicle ? Number(vehicle.extraHourRate) || 0 : 0;
  const kmRate = vehicle ? Number(vehicle.extraKmRate) || 0 : 0;
  const dailyRate = vehicle ? Number(vehicle.dailyRate) || 0 : 0;
  const baseHourlyRate = vehicle ? Number(vehicle.hourlyRate) || 0 : 0;
  const hasRateCard = dailyRate > 0;
  const priceLocked = hasRateCard && data.priceOverridden !== true;

  const pricingInfo = useMemo(() => {
    if (!data.start || !data.end || !vehicle) return { amount: 0, breakdown: '', discountPercent: 0 };
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
      if (totalHours <= 4) return { amount: p4, breakdown: `4-hr package (${vehicle.pkg4hrKm || '—'} km incl.)`, discountPercent: 0 };
      if (totalHours <= 10) {
        const extraHrs = Math.ceil(totalHours - 4);
        return { amount: p4 + extraHrs * p410, breakdown: `4-hr base ₹${money(p4)} + ${extraHrs}hr @ ₹${money(p410)} (${vehicle.pkg4to10Km || '—'} km incl.)`, discountPercent: 0 };
      }
      return { amount: p12, breakdown: `12-hr package (${vehicle.pkg12hrKm || '—'} km incl.)`, discountPercent: 0 };
    }

    const base = fullDays * dailyRate + leftoverHours * baseHourlyRate;
    const discountPct = multiDayDiscountFor(fullDays);
    const appliedDiscount = discountEnabled ? discountPct : 0;
    const amount = Math.round(base * (1 - appliedDiscount / 100));
    const breakdown = `${fullDays}d @ ₹${money(dailyRate)}${leftoverHours > 0 ? ` + ${leftoverHours}hr @ ₹${money(baseHourlyRate)}` : ''}${appliedDiscount > 0 ? ` − ${appliedDiscount}% (${fullDays}-day discount)` : ''}`;
    return { amount, breakdown, discountPercent: discountPct };
  }, [data.start, data.end, vehicle, isLimited, dailyRate, baseHourlyRate, discountEnabled]);

  useEffect(() => {
    if (!hasRateCard || data.priceOverridden === true) return;
    // Auto-fill for a brand-new booking, right after an explicit "use rate
    // card price" reset, or when the dates have actually been changed this
    // session (e.g. extending an overdue trip) — but never just because an
    // existing booking was opened for an unrelated edit, so untouched
    // historical/imported prices are never silently overwritten.
    const datesChanged = data.start !== form.start || data.end !== form.end;
    const shouldAutoFill = !data.id || data.priceOverridden === false || datesChanged || discountTouched;
    if (!shouldAutoFill) return;
    if (Number(data.rentalAmount || 0) !== pricingInfo.amount) set('rentalAmount', pricingInfo.amount);
  }, [pricingInfo, hasRateCard, data.priceOverridden, data.id, data.start, data.end, form.start, form.end, discountTouched]);

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
  const displayStatus = bookingTimeStatus(data.start, data.end, data.status, new Date(), data.closingTime);

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
    if (saving || addingCustomer) return;
    if (readOnly) { onCancel(); return; }
    if (!data.start || !data.end) {
      setClosingError('Choose both a booking start and return date and time.');
      return;
    }
    if (new Date(data.end) <= new Date(data.start)) {
      setClosingError('The return date and time must be later than the start date and time. Update the dates; the booking duration and price will recalculate automatically.');
      if (endRef.current) { endRef.current.focus(); endRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    if (!data.vehicleId || !data.customerId || data.rentalAmount === undefined || data.rentalAmount === '' || data.startKm === undefined || data.startKm === '') {
      setClosingError('Fill in vehicle, customer, dates, rental amount, and the start km reading before saving.');
      return;
    }
    if (!data.id && !canBypassTimeGuards) {
      // The form pre-fills `start` with the time the modal was OPENED, so by the
      // time a real booking has been typed in (vehicle, customer, km reading…)
      // that timestamp is always in the past — and the save was rejected with no
      // visible explanation. Allow a grace window for form-filling time, and
      // when it really is stale, focus the field instead of failing silently.
      if (new Date(data.start) < new Date() - START_GRACE_MS) {
        setClosingError('The start time has gone stale while the form was being filled in \u2014 set it to now (or the actual handover time) and save again.');
        if (startRef.current) { startRef.current.focus(); startRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }
    }
    const conflict = (bookings || []).find(b => b.id !== data.id && b.vehicleId === data.vehicleId && b.status !== 'cancelled' && b.status !== 'no-show' && new Date(data.start) < new Date(b.end) && new Date(b.start) < new Date(data.end));
    if (conflict) { setClosingError(`This vehicle is already booked as ${conflict.code} from ${(conflict.start || '').replace('T', ' ')} to ${(conflict.end || '').replace('T', ' ')}. Adjust the dates or pick another vehicle.`); return; }
    if (data.priceOverridden && !String(data.priceOverrideReason || '').trim()) {
      setClosingError('Enter a reason for overriding the rate-card price before saving.');
      return;
    }
    setClosingError('');
    const status = data.status === 'cancelled' || data.status === 'no-show'
      ? data.status
      : (displayStatus === 'completed' && closingFieldsComplete ? 'completed' : 'ongoing');
    onSave({ ...data, status });
  }

  // Both the field-level and the server-level error render at the TOP of the
  // modal now, but the form is long and the Save button sits in a sticky
  // footer — so scroll the message into view whenever one appears.
  useEffect(() => {
    if ((closingError || saveError) && errorRef.current) {
      errorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [closingError, saveError]);

  return (
    <ModalShell title={readOnly ? `View booking ${data.code}` : (data.id ? `Edit booking ${data.code}` : 'New booking')} onCancel={onCancel} onSubmit={submit} wide>
      {(closingError || saveError) && (
        <div ref={errorRef} role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '10px 12px', margin: '0 0 12px' }}>
          <span style={{ color: '#A8452F', flexShrink: 0, marginTop: '1px' }}><IconAlert /></span>
          <p style={{ fontSize: '12px', color: '#8A3B2A', margin: 0, flex: 1 }}>{closingError || saveError}</p>
          {saveError && onDismissError && (
            <button type="button" onClick={onDismissError} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', color: '#8A3B2A', fontSize: '16px', lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
          )}
        </div>
      )}
      {readOnly && <p style={{ fontSize: '12px', color: 'var(--text-faint)', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', margin: 0 }}>View-only — this role can't edit bookings.</p>}
      <fieldset disabled={readOnly || saving || syncing} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
      <div className="mm-form-grid">
        <Field label="Vehicle">
          <select required className="mm-input" value={data.vehicleId || ''} onChange={e => set('vehicleId', e.target.value)}>
            <option value="">Select vehicle</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.regNumber} · {v.make} {v.model}</option>)}
          </select>
        </Field>
        <Field label="Customer">
          <div style={{ display: 'flex', gap: '6px' }}>
            <select required className="mm-input" style={{ flex: 1, minWidth: 0 }} value={data.customerId || ''} onChange={e => set('customerId', e.target.value)}>
              <option value="">Select customer</option>
              {allCustomers.map(c => {
                const phoneDigits = String(c.phone || '').replace(/\D/g, '');
                const shortPhone = phoneDigits ? ` · •••• ${phoneDigits.slice(-4)}` : '';
                return <option key={c.id} value={c.id}>{c.name}{shortPhone}</option>;
              })}
            </select>
            {canQuickAddCustomer && <button type="button" className="mm-btn mm-btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowNewCustomer(s => !s)}><IconPlus size={13} /> New</button>}
          </div>
        </Field>
      </div>
      {canQuickAddCustomer && showNewCustomer && (
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
            <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setShowNewCustomer(false)} disabled={addingCustomer}>Cancel</button>
            <button type="button" className="mm-btn mm-btn-gold" onClick={saveNewCustomer} disabled={addingCustomer || saving || syncing}
              style={{ opacity: (addingCustomer || saving || syncing) ? 0.6 : 1 }}>
              {addingCustomer ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        </div>
      )}
      <div className="mm-form-grid" style={{ '--cols': 'minmax(0, 1fr) minmax(0, 1fr) 60px' }}>
        <Field label="Start" hint={!data.id && !canBypassTimeGuards ? 'can\u2019t be backdated' : null}>
          <input ref={startRef} type="datetime-local" required min={(!data.id && !canBypassTimeGuards) ? startMin : undefined} className="mm-input" value={data.start || ''} onChange={e => setBookingDate('start', e.target.value)} />
        </Field>
        <Field label="End" hint="must be after start">
          <input ref={endRef} type="datetime-local" required min={data.start || undefined} className="mm-input" aria-invalid={!!(data.start && data.end && new Date(data.end) <= new Date(data.start))} value={data.end || ''} onInvalid={e => { if (data.start && data.end && new Date(data.end) <= new Date(data.start)) e.currentTarget.setCustomValidity('Return time must be later than start time.'); }} onChange={e => { e.currentTarget.setCustomValidity(''); setBookingDate('end', e.target.value); }} />
        </Field>
        <Field label="Days" hint="calculated from dates"><input type="number" min="1" readOnly className="mm-input" value={data.days || 1} /></Field>
      </div>
      <div className="mm-form-grid">
        <Field label="Rental amount (₹)" hint={priceLocked ? pricingInfo.breakdown : (hasRateCard ? 'overridden' : 'no rate card set for this vehicle')}>
          <input type="number" min="0" required readOnly={priceLocked} className="mm-input" value={data.rentalAmount || ''} onChange={e => set('rentalAmount', e.target.value)} />
        </Field>
        <Field label="Start km reading" hint="required to start the trip"><input type="number" min="0" required placeholder="e.g. 12000" className="mm-input" value={data.startKm === undefined ? '' : data.startKm} onChange={e => set('startKm', e.target.value)} /></Field>
      </div>
      {hasRateCard && !data.priceOverridden && pricingInfo.discountPercent > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>Multi-day discount ({pricingInfo.discountPercent}%)</p>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '3px 0 0' }}>{discountEnabled ? 'Discount applied to the rate-card price.' : 'No discount will be applied.'}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={discountEnabled}
            aria-label="Apply multi-day discount"
            disabled={saving}
            onClick={() => {
              setDiscountTouched(true);
              setDiscountEnabled(enabled => !enabled);
            }}
            style={{ width: '46px', height: '26px', border: 0, borderRadius: '999px', padding: '3px', background: discountEnabled ? '#3F6B4F' : '#9B9A92', cursor: 'pointer', flexShrink: 0, transition: 'background 120ms ease' }}
          >
            <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transform: discountEnabled ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 120ms ease' }} />
          </button>
        </div>
      )}
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
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
              <input type="datetime-local" max={canBypassTimeGuards ? undefined : nowLocal()} min={data.start || undefined} className="mm-input" style={{ flex: 1, minWidth: 0 }} value={data.closingTime || ''} onChange={e => set('closingTime', e.target.value)} />
              {data.closingTime && <button type="button" className="mm-icon-btn" aria-label="Clear closing time" title="Clear closing time" onClick={clearClosingTime} style={{ flexShrink: 0, width: '42px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--input-bg)', color: 'var(--text-muted)' }}><IconClose /></button>}
            </div>
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

      <Field label="Booking status" hint="updates from the current time and these dates">
        <div className="mm-input" aria-live="polite" style={{ background: 'var(--card-bg)', color: 'var(--text-heading)', textTransform: 'capitalize' }}>{displayStatus === 'no-show' ? 'No show' : displayStatus}</div>
        {(displayStatus === 'upcoming' || displayStatus === 'ongoing') && data.status !== 'cancelled' && data.status !== 'no-show' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => { set('status', 'cancelled'); setClosingError(''); }}>Cancel booking</button>
            {displayStatus === 'ongoing' && <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => { set('status', 'no-show'); setClosingError(''); }}>Mark no-show</button>}
          </div>
        )}
        {displayStatus === 'completed' && !closingFieldsComplete && (
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '4px 0 0' }}>The return time has passed. Fill in the trip-closing details to finalize this booking.</p>
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

      <Field label="Notes"><textarea rows={2} className="mm-input" style={{ resize: 'vertical' }} value={data.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </fieldset>
      <div className="mm-modal-actions">
        {readOnly ? (
          <button type="button" className="mm-btn mm-btn-primary" onClick={onCancel}>Close</button>
        ) : (
          <Fragment>
            <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
            {/* Disabled while in flight: the save is a server round trip, and an
                enabled button meant a second click posted a second booking. */}
            <button type="submit" className="mm-btn mm-btn-primary" disabled={saving || syncing || addingCustomer}
              style={{ opacity: (saving || syncing || addingCustomer) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : syncing ? 'Updating totals…' : 'Save booking'}
            </button>
          </Fragment>
        )}
      </div>
    </ModalShell>
  );
}
