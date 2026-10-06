"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { api, toBookingView, fromBookingView } from '@/lib/api';
import { HOST_PAYOUT_CATEGORY, INCOME_CATEGORIES, ROLE_PERMS } from '@/lib/constants';
import {
  todayStr, nowLocal, monthKey, monthLabel,
  safeGet, safeSet, getCol, parseFlexibleDateTime, parseFlexibleDate, numOrBlank
} from '@/lib/helpers';
import {
  IconGrid, IconCar, IconKey, IconUsers, IconWallet, IconReceipt,
  IconSun, IconMoon, IconDownload, IconUpload, IconMenu, IconClose, IconAlert
} from './icons';
import { Overview } from './Overview';
import { Bookings } from './Bookings';
import { PayoutsView } from './PayoutsView';
import { HostsView } from './HostsView';
import { VehiclesView } from './VehiclesView';
import { CustomersView } from './CustomersView';
import { CashFlowView } from './CashFlowView';
import { BookingModal } from './BookingModal';
import { VehicleModal } from './VehicleModal';
import { HostModal } from './HostModal';
import { CustomerModal } from './CustomerModal';
import { TransactionModal } from './TransactionModal';
import { ImportSummaryModal } from './ImportSummaryModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ChangePasswordsModal } from './ChangePasswordsModal';
import { ResetConfirmModal } from './ResetConfirmModal';

// The database stores snake_case; the components have always spoken camelCase
// (that was the localStorage shape). These two mappers are the only place the
// two vocabularies meet.
const num = (v) => (v === null || v === undefined || v === '' ? '' : v);

const toVehicle = (v) => ({
  id: v.id, hostId: v.host_id, regNumber: v.reg_number, make: v.make, model: v.model,
  year: num(v.year), fuel: v.fuel, transmission: v.transmission,
  dailyRate: num(v.daily_rate), hourlyRate: num(v.hourly_rate),
  pkg4hrRate: num(v.pkg4hr_rate), pkg4hrKm: num(v.pkg4hr_km),
  pkg4to10Rate: num(v.pkg4to10_rate), pkg4to10Km: num(v.pkg4to10_km),
  pkg12hrRate: num(v.pkg12hr_rate), pkg12hrKm: num(v.pkg12hr_km),
  kmPolicy: v.km_policy, kmLimit: num(v.km_limit),
  extraKmRate: num(v.extra_km_rate), extraHourRate: num(v.extra_hour_rate),
  // blank in the UI means "inherit from host" — a NULL column
  commissionRate: v.commission_rate === null ? '' : v.commission_rate,
  notes: v.notes || '',
});

const toHost = (h) => ({
  id: h.id, name: h.name, phone: h.phone || '', commissionRate: h.commission_rate,
  bank: h.bank_details || '', notes: h.notes || '',
});

const toCustomer = (c) => ({
  id: c.id, name: c.name, aadhar: c.aadhar || '', licenseNumber: c.license_number || '',
  phone: c.phone || '', address: c.address || '',
  // /api/data deliberately returns `has_*_photo` flags instead of the base64
  // blobs (see app/api/data/route.js). The real images are merged in from
  // `customerPhotos` only where they are actually rendered. The `photo: c.photo`
  // fallbacks keep this working if the payload ever does include them.
  hasPhoto: !!c.has_photo || !!c.photo,
  hasAadharPhoto: !!c.has_aadhar_photo || !!c.aadhar_photo,
  hasLicensePhoto: !!c.has_license_photo || !!c.license_photo,
  photo: c.photo || '', aadharPhoto: c.aadhar_photo || '', licensePhoto: c.license_photo || '',
  notes: c.notes || '',
});

const toTransaction = (t) => ({
  id: t.id, date: t.booked_on, type: t.type, category: t.category,
  amount: t.amount, mode: t.mode, bookingId: t.booking_id || '', note: t.note || '',
});

// SheetJS is ~410 KB of JavaScript that only the admin Export/Import buttons
// ever touch. Importing it at the top of this file put it in the initial page
// load for every user on every device; loading it on click keeps it out of the
// critical path entirely.
const loadXLSX = async () => {
  const module = await import('xlsx');
  return module.default?.utils ? module.default : module;
};

export function App({ role, initialData, onLogout }) {
  const perms = ROLE_PERMS[role] || ROLE_PERMS.finance;

  const [tab, setTab] = useState(() => (perms.tabs.length ? perms.tabs[0] : 'overview'));
  const [bookings, setBookings] = useState(() => (initialData?.bookings || []).map(toBookingView));
  const [vehicles, setVehicles] = useState(() => (initialData?.vehicles || []).map(toVehicle));
  const [hosts, setHosts] = useState(() => (initialData?.hosts || []).map(toHost));
  const [customers, setCustomers] = useState(() => (initialData?.customers || []).map(toCustomer));
  const [transactions, setTransactions] = useState(() => (initialData?.transactions || []).map(toTransaction));

  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  // Kept separate from `loadError` so a failed SAVE can be shown inside the
  // modal that caused it. Previously both went to `loadError`, which was only
  // rendered (a) as a full-page error when the ledger was empty and (b) as a
  // red-tinted "● Synced" dot in the sidebar — invisible on a phone, where the
  // sidebar is a closed drawer. A rejected save therefore looked exactly like a
  // successful one, which is why bookings had to be typed in twice.
  const [saveError, setSaveError] = useState('');

  const [bookingForm, setBookingForm] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(null);
  const [hostForm, setHostForm] = useState(null);
  const [customerForm, setCustomerForm] = useState(null);
  const [transactionForm, setTransactionForm] = useState(null);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [theme, setTheme] = useState(() => safeGet('mm-theme') || 'light');
  const [importSummary, setImportSummary] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPasswordsModal, setShowPasswordsModal] = useState(false);
  // the sidebar is a slide-in drawer on tablets and phones (see .mm-sidebar)
  const [navOpen, setNavOpen] = useState(false);
  const fileInputRef = useRef(null);
  const hasInitialData = useRef(!!initialData);
  const dataVersion = useRef(0);
  const refreshSequence = useRef(0);

  useEffect(() => { document.body.setAttribute('data-theme', theme); safeSet('mm-theme', theme); }, [theme]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function selectTab(id) {
    setTab(id);
    setNavOpen(false);
    window.scrollTo(0, 0);
  }

  // Load the ledger once. Saves apply their confirmed database row directly;
  // operations that can affect several records still reload the ledger.
  const reload = useMemo(() => async (background = false) => {
    const version = dataVersion.current;
    const sequence = ++refreshSequence.current;
    if (background) setRefreshing(true);
    try {
      const d = await api.load();
      // A newer write started while this refresh was in flight. Ignore its
      // older snapshot so it cannot overwrite the newer local/server state.
      if (version !== dataVersion.current) return;
      setBookings(d.bookings.map(toBookingView));
      setVehicles(d.vehicles.map(toVehicle));
      setHosts(d.hosts.map(toHost));
      setCustomers(d.customers.map(toCustomer));
      setTransactions(d.transactions.map(toTransaction));
      setLoadError('');
    } catch (e) {
      if (version === dataVersion.current) setLoadError(e.message || 'Could not reach the server');
    } finally {
      setLoading(false);
      if (sequence === refreshSequence.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (!hasInitialData.current) reload(); }, [reload]);

  // bookings already carry a `calc` object computed by public.booking_financials
  const enriched = bookings;

  // ---------------------------------------------------------------- photos
  // Customer photos are heavy (base64 JPEGs) and only ever displayed on the
  // Customers tab or inside the customer form, so they are fetched on demand
  // and cached here instead of riding along with every ledger load.
  const [customerPhotos, setCustomerPhotos] = useState({});
  // Ids we have already asked for. Guarding on this rather than on the response
  // contents is what stops a customer with no photos stored from re-triggering
  // the fetch effect forever.
  const photosRequested = useRef(new Set());

  const fetchPhotos = useCallback(async (customerId) => {
    const key = customerId || '*';
    if (photosRequested.current.has(key)) return;
    photosRequested.current.add(key);
    try {
      const { photos } = await api.customerPhotos(customerId);
      setCustomerPhotos(p => ({ ...p, ...photos }));
    } catch (e) {
      photosRequested.current.delete(key);   // allow a retry
      console.error('could not load customer photos', e);
    }
  }, []);

  // All of them, once, the first time the Customers tab is opened.
  useEffect(() => {
    if (tab === 'customers') fetchPhotos();
  }, [tab, fetchPhotos]);

  // Editing a customer needs that record's photos even from another tab.
  useEffect(() => {
    if (customerForm && customerForm.id) fetchPhotos(customerForm.id);
  }, [customerForm, fetchPhotos]);

  /** Customers with their photos merged in — only these two views need them. */
  const customersWithPhotos = useMemo(() => customers.map(c => {
    const p = customerPhotos[c.id];
    return p ? { ...c, photo: p.photo, aadharPhoto: p.aadharPhoto, licensePhoto: p.licensePhoto } : c;
  }), [customers, customerPhotos]);

  async function mutate(fn, close) {
    dataVersion.current++;
    setSaving(true);
    setSaveError('');
    try {
      await fn();
      if (close) close();
      // Keep the refreshed ledger out of the save interaction. The UI stays
      // usable while derived totals and related rows catch up in the background.
      void reload(true);
    } catch (e) {
      const message = e.message || 'That change could not be saved';
      setSaveError(message);
      setLoadError(message);
    } finally {
      setSaving(false);
    }
  }

  // CRUD save endpoints return the saved row, so apply that row directly
  // instead of waiting for a second, full-ledger request after every save.
  async function saveRow(fn, setRows, mapRow, close, refreshAfter = true) {
    dataVersion.current++;
    setSaving(true);
    setSaveError('');
    try {
      const { row } = await fn();
      const saved = mapRow(row);
      setRows(current => {
        const exists = current.some(item => item.id === saved.id);
        return exists
          ? current.map(item => item.id === saved.id ? saved : item)
          : [...current, saved];
      });
      setLoadError('');
      close();
      if (refreshAfter) void reload(true);
    } catch (e) {
      const message = e.message || 'That change could not be saved';
      setSaveError(message);
      setLoadError(message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBooking(data) {
    if (saving) return;
    dataVersion.current++;
    setSaving(true);
    setSaveError('');
    try {
      const { row } = await api.saveBooking(fromBookingView(data));
      const saved = toBookingView(row);
      setBookings(current => {
        const exists = current.some(b => b.id === saved.id);
        return exists
          ? current.map(b => b.id === saved.id ? saved : b)
          : [saved, ...current];
      });
      setLoadError('');
      setBookingForm(null);
    } catch (e) {
      const message = e.message || 'That booking could not be saved';
      setSaveError(message);
      setLoadError(message);
    } finally {
      setSaving(false);
    }
  }
  const saveVehicle = (data) => saveRow(() => api.saveVehicle({
    id: data.id, host_id: data.hostId, reg_number: data.regNumber, make: data.make,
    model: data.model, year: data.year, fuel: data.fuel, transmission: data.transmission,
    daily_rate: data.dailyRate, hourly_rate: data.hourlyRate,
    pkg4hr_rate: data.pkg4hrRate, pkg4hr_km: data.pkg4hrKm,
    pkg4to10_rate: data.pkg4to10Rate, pkg4to10_km: data.pkg4to10Km,
    pkg12hr_rate: data.pkg12hrRate, pkg12hr_km: data.pkg12hrKm,
    km_policy: data.kmPolicy, km_limit: data.kmLimit,
    extra_km_rate: data.extraKmRate, extra_hour_rate: data.extraHourRate,
    commission_rate: data.commissionRate,
  }), setVehicles, toVehicle, () => setVehicleForm(null));
  const saveHost = (data) => saveRow(() => api.saveHost({
    id: data.id, name: data.name, phone: data.phone,
    commission_rate: data.commissionRate, bank_details: data.bank,
  }), setHosts, toHost, () => setHostForm(null));
  const saveCustomer = (data) => saveRow(async () => {
    const { row } = await api.saveCustomer({
      id: data.id, name: data.name, aadhar: data.aadhar, license_number: data.licenseNumber,
      phone: data.phone, address: data.address, photo: data.photo,
      aadhar_photo: data.aadharPhoto, license_photo: data.licensePhoto,
    });
    // /api/data no longer carries photos, so keep the local cache authoritative
    // for the record we just wrote.
    if (row) setCustomerPhotos(p => ({ ...p, [row.id]: { photo: row.photo || '', aadharPhoto: row.aadhar_photo || '', licensePhoto: row.license_photo || '' } }));
    return { row };
  }, setCustomers, toCustomer, () => setCustomerForm(null), false);

  // Called from the booking form's inline "New customer" panel. It must return
  // the real database id: the temporary `uid()` the modal generated is not a
  // valid uuid, so pointing `customerId` at it made the subsequent booking
  // INSERT fail — silently, because the failure was never shown. That is the
  // other half of "I had to enter the booking twice".
  //
  // It also no longer runs a full ledger reload mid-form (that was ~2.5 s of
  // dead time with the modal open); appending the returned row is enough.
  const quickAddCustomer = async (c) => {
    dataVersion.current++;
    setSaving(true);
    setSaveError('');
    try {
      const { row } = await api.saveCustomer({
        name: c.name, aadhar: c.aadhar, license_number: c.licenseNumber,
        phone: c.phone, address: c.address,
      });
      const saved = toCustomer(row);
      setCustomers(list => (list.some(x => x.id === saved.id) ? list : [...list, saved]));
      return saved.id;
    } catch (e) {
      const message = e.message || 'That customer could not be saved';
      setSaveError(message);
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const saveTransaction = (data) => saveRow(() => api.saveTransaction({
    id: data.id, booked_on: data.date, type: data.type, category: data.category,
    amount: data.amount, mode: data.mode, booking_id: data.bookingId, note: data.note,
  }), setTransactions, toTransaction, () => setTransactionForm(null));

  const deleteBooking = (id) => mutate(() => api.deleteBooking(id));
  const deleteVehicle = (id) => mutate(() => api.deleteVehicle(id));
  const deleteHost = (id) => mutate(() => api.deleteHost(id));
  const deleteCustomer = (id) => mutate(() => api.deleteCustomer(id));
  const deleteTransaction = (id) => mutate(() => api.deleteTransaction(id));

  // Imported rows are posted without a full-ledger refresh after each row.
  const postTransaction = (t) => api.saveTransaction({
    booked_on: t.date, type: t.type, category: t.category, amount: t.amount,
    mode: t.mode, booking_id: t.bookingId, note: t.note,
  });

  function openPayoutEntry(booking) {
    setTransactionForm({
      type: 'expense', date: todayStr(), category: HOST_PAYOUT_CATEGORY, mode: 'online',
      bookingId: booking.id, amount: booking.calc.payoutBalance, note: `Payout for ${booking.code}`
    });
  }

  const transactionsByDateDesc = useMemo(
    () => [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [transactions]
  );

  // Bookings grouped by customer, for the Customers tab and the Excel export.
  const bookingsByCustomer = useMemo(() => {
    const m = new Map();
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'no-show') continue;
      const list = m.get(b.customerId);
      if (list) list.push(b); else m.set(b.customerId, [b]);
    }
    return m;
  }, [bookings]);

  // ------------------------------------------------------- lookup tables
  // `customerName` and `bookingLabel` are called once per rendered row by the
  // Bookings, Payouts, Overview and Cash-flow views. Each one used to scan the
  // full array with `.find()`, making every list render O(rows × records) — and
  // App re-renders on every keystroke in any search box. Maps make them O(1)
  // and `useCallback` keeps the identities stable so memoised children can
  // actually skip work.
  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const bookingById = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings]);
  const hostById = useMemo(() => new Map(hosts.map(h => [h.id, h])), [hosts]);
  const transactionById = useMemo(() => new Map(transactions.map(t => [t.id, t])), [transactions]);
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const vehicleLabel = useCallback((v) => (v ? `${v.regNumber} · ${v.make} ${v.model}` : '—'), []);
  const customerName = useCallback((id) => customerById.get(id)?.name || '—', [customerById]);
  const bookingLabel = useCallback(
    (b) => (b ? `${b.code} · ${vehicleLabel(vehicleById.get(b.vehicleId))} · ${customerName(b.customerId)}` : ''),
    [vehicleById, customerName, vehicleLabel]
  );

  const stats = useMemo(() => {
    const active = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show');
    return {
      pendingPayouts: active.reduce((s, b) => s + b.calc.payoutBalance, 0),
      pendingFromCustomers: active.reduce((s, b) => s + Math.max(0, b.calc.balance), 0),
    };
  }, [enriched]);

  const chartData = useMemo(() => {
    const months = []; const d = new Date();
    for (let i = 5; i >= 0; i--) { const dt = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); }
    return months.map(key => {
      const active = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show' && monthKey(b.start) === key);
      return { month: monthLabel(key), sales: active.reduce((s, b) => s + b.calc.rental, 0), commission: active.reduce((s, b) => s + b.calc.totalCommission, 0) };
    });
  }, [enriched]);

  const cashFlow = useMemo(() => {
    const inc = transactions.filter(t => t.type === 'income');
    const exp = transactions.filter(t => t.type === 'expense');
    const sum = (list) => list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const onlineIncome = sum(inc.filter(t => t.mode === 'online'));
    const cashIncome = sum(inc.filter(t => t.mode !== 'online'));
    const onlineOutgo = sum(exp.filter(t => t.mode === 'online'));
    const cashOutgo = sum(exp.filter(t => t.mode !== 'online'));
    return { onlineIncome, cashIncome, onlineOutgo, cashOutgo, onlineNet: onlineIncome - onlineOutgo, cashNet: cashIncome - cashOutgo };
  }, [transactions]);

  const paymentModeData = useMemo(
    () => [{ name: 'Online', value: cashFlow.onlineIncome }, { name: 'Cash', value: cashFlow.cashIncome }].filter(d => d.value > 0),
    [cashFlow]
  );

  // ------------------------------------------------------------ excel export
  async function exportExcel() {
    setSaveError('');
    try {
    const XLSX = await loadXLSX();
    const bookingRows = enriched.map(b => ({
      'Booking ID': b.code, 'Vehicle': vehicleLabel(b.calc.vehicle),
      'Vehicle Reg Number': b.calc.vehicle?.regNumber || '',
      'Host': b.calc.host ? b.calc.host.name : '—', 'Customer': customerName(b.customerId),
      'Customer Name': customerName(b.customerId),
      'Aadhar': customerById.get(b.customerId)?.aadhar || '',
      'Customer Aadhar': customerById.get(b.customerId)?.aadhar || '',
      'Customer License': customerById.get(b.customerId)?.licenseNumber || '',
      'Customer Phone': customerById.get(b.customerId)?.phone || '',
      'Customer Address': customerById.get(b.customerId)?.address || '',
      'Start': b.start, 'End': b.end, 'Closing time': b.closingTime || '', 'Days': b.days,
      'Rental amount': b.calc.rental, 'Start KM': b.startKm, 'End KM': b.endKm,
      'Extra Hours': b.extraHours, 'Extra KM': b.extraKm,
      'Extra km charge': b.calc.extraKmCharge, 'Extra hour charge': b.calc.extraHourCharge,
      'Toll': b.calc.tollAmount, 'Fuel': b.calc.fuelAmount, 'Damage': b.calc.damageAmount, 'Traffic fine': b.calc.fineAmount,
      'Total due': b.calc.totalDue, 'Online paid': b.calc.paidOnline, 'Cash paid': b.calc.paidCash,
      'Payment status': b.calc.paymentStatus, 'Commission %': b.calc.rate, 'Total commission': b.calc.totalCommission,
      'Host payout': b.calc.hostPayout, 'Payout paid': b.calc.payoutPaidAmount, 'Payout status': b.calc.payoutStatus,
      'Refund due': b.calc.refundDue, 'Refund paid': b.calc.refundPaidAmount, 'Refund status': b.calc.refundStatus,
      'Booking status': b.status, 'Notes': b.notes || ''
    }));
    const vehicleRows = vehicles.map(v => {
      const host = hostById.get(v.hostId);
      return {
        'Reg Number': v.regNumber, 'Make': v.make, 'Model': v.model, 'Year': v.year,
        'Fuel': v.fuel, 'Transmission': v.transmission, 'Daily Rate': v.dailyRate,
        'Hourly Rate': v.hourlyRate, '4hr Rate': v.pkg4hrRate, '4hr KM': v.pkg4hrKm,
        '4-10hr Rate': v.pkg4to10Rate, '4-10hr KM': v.pkg4to10Km,
        '12hr Rate': v.pkg12hrRate, '12hr KM': v.pkg12hrKm,
        'Host Name': host?.name || '', 'Host Phone': host?.phone || '',
        'Host Commission %': host?.commissionRate ?? 30, 'KM Policy': v.kmPolicy,
        'KM Limit': v.kmLimit, 'Extra KM Rate': v.extraKmRate, 'Extra Hour Rate': v.extraHourRate,
        'Vehicle Commission %': v.commissionRate,
      };
    });
    const hostRows = hosts.map(h => {
      const hb = enriched.filter(b => b.calc.host && b.calc.host.id === h.id && b.status !== 'cancelled' && b.status !== 'no-show');
      return {
        'Host': h.name, 'Phone': h.phone || '', 'Bank details': h.bank || '', 'Default commission %': h.commissionRate,
        'Vehicles': vehicles.filter(v => v.hostId === h.id).length, 'Total bookings': hb.length,
        'Total rental collected': hb.reduce((s, b) => s + b.calc.rental, 0),
        'Total commission (platform)': hb.reduce((s, b) => s + b.calc.totalCommission, 0),
        'Total payout due': hb.reduce((s, b) => s + b.calc.hostPayout, 0),
        'Payout paid': hb.reduce((s, b) => s + b.calc.payoutPaidAmount, 0),
        'Payout pending': hb.reduce((s, b) => s + b.calc.payoutBalance, 0),
      };
    });
    const customerRows = customers.map(c => {
      const cb = bookings.filter(b => b.customerId === c.id && b.status !== 'cancelled' && b.status !== 'no-show');
      return { 'Name': c.name, 'Aadhar number': c.aadhar || '', 'License number': c.licenseNumber || '', 'Phone': c.phone || '', 'Address': c.address || '', 'Total bookings': cb.length, 'Total spent': cb.reduce((s, b) => s + (Number(b.rentalAmount) || 0), 0), 'Status': cb.length >= 2 ? 'Repeat customer' : 'New' };
    });
    const transactionRows = transactions.map(t => ({
      'Date': t.date, 'Type': t.type === 'income' ? 'Income' : 'Expense', 'Category': t.category,
      'Linked booking': (bookings.find(b => b.id === t.bookingId) || {}).code || '',
      'Mode': t.mode === 'online' ? 'Online' : 'Cash', 'Amount': t.amount, 'Note': t.note || ''
    }));
    const cashFlowRows = [
      { 'Item': 'Online credit', 'Amount': cashFlow.onlineIncome }, { 'Item': 'Online debit', 'Amount': cashFlow.onlineOutgo },
      { 'Item': 'Online net', 'Amount': cashFlow.onlineNet }, { 'Item': 'Cash credit', 'Amount': cashFlow.cashIncome },
      { 'Item': 'Cash debit', 'Amount': cashFlow.cashOutgo }, { 'Item': 'Cash net', 'Amount': cashFlow.cashNet },
    ];

    const wb = XLSX.utils.book_new();
    const sheetFromRows = (rows, headers) => (rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([headers]));
    XLSX.utils.book_append_sheet(wb, sheetFromRows(vehicleRows, ['Reg Number', 'Make', 'Model', 'Year', 'Fuel', 'Transmission', 'Daily Rate', 'Hourly Rate', '4hr Rate', '4hr KM', '4-10hr Rate', '4-10hr KM', '12hr Rate', '12hr KM', 'Host Name', 'Host Phone', 'Host Commission %', 'KM Policy', 'KM Limit', 'Extra KM Rate', 'Extra Hour Rate', 'Vehicle Commission %']), 'Vehicles');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(bookingRows, ['Booking ID', 'Vehicle', 'Vehicle Reg Number', 'Host', 'Customer', 'Customer Name', 'Aadhar', 'Customer Aadhar', 'Customer License', 'Customer Phone', 'Customer Address', 'Start', 'End', 'Closing time', 'Days', 'Rental amount', 'Start KM', 'End KM', 'Extra Hours', 'Extra KM', 'Extra km charge', 'Extra hour charge', 'Toll', 'Fuel', 'Damage', 'Traffic fine', 'Total due', 'Online paid', 'Cash paid', 'Payment status', 'Commission %', 'Total commission', 'Host payout', 'Payout paid', 'Payout status', 'Refund due', 'Refund paid', 'Refund status', 'Booking status', 'Notes']), 'Bookings');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(hostRows, ['Host', 'Phone', 'Bank details', 'Default commission %', 'Vehicles', 'Total bookings', 'Total rental collected', 'Total commission (platform)', 'Total payout due', 'Payout paid', 'Payout pending']), 'Host payouts');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(customerRows, ['Name', 'Aadhar number', 'License number', 'Phone', 'Address', 'Total bookings', 'Total spent', 'Status']), 'Customers');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(transactionRows, ['Date', 'Type', 'Category', 'Linked booking', 'Mode', 'Amount', 'Note']), 'Income & expenses');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(cashFlowRows, ['Item', 'Amount']), 'Cash flow');
    XLSX.writeFile(wb, `MM_Miles_Export_${todayStr()}.xlsx`);
    } catch (e) {
      setSaveError(e.message || 'Excel export failed. Please try again.');
    }
  }

  async function downloadImportTemplate() {
    setSaveError('');
    try {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Reg Number': 'TN01BR9111', 'Make': 'Maruti Suzuki', 'Model': 'Fronx', 'Year': 2023, 'Fuel': 'petrol', 'Transmission': 'automatic', 'Daily Rate': 2700, 'Hourly Rate': 150, '4hr Rate': 800, '4hr KM': 100, '4-10hr Rate': 180, '4-10hr KM': 200, '12hr Rate': 1800, '12hr KM': 300, 'Host Name': 'Mohamed Faiyaz', 'Host Phone': '9876543210', 'Host Commission %': 30, 'KM Policy': 'unlimited', 'KM Limit': '', 'Extra KM Rate': '', 'Extra Hour Rate': 150 }]), 'Vehicles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Booking ID': '', 'Vehicle Reg Number': 'TN01BR9111', 'Customer Name': 'Ravi Kumar', 'Customer Aadhar': '', 'Customer License': '', 'Customer Phone': '', 'Customer Address': '', 'Start': '01-04-2026 08:00', 'End': '02-04-2026 08:00', 'Rental Amount': 2700, 'Extra Hours': 0, 'Extra Hour Charge': 0, 'Start KM': 12000, 'End KM': 12180, 'Toll': 0, 'Fuel': 0, 'Damage': 0, 'Traffic Fine': 0, 'Booking Status': 'completed', 'Online Paid': 2700, 'Cash Paid': 0, 'Payout Paid': 1890, 'Payout Mode': 'online', 'Notes': '' }]), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Date': '05-04-2026', 'Type': 'Expense', 'Category': 'Vehicle maintenance', 'Amount': 500, 'Mode': 'Cash', 'Linked Booking ID': '', 'Note': 'Example — delete this row' }]), 'Other Transactions');
    XLSX.writeFile(wb, 'MM_Miles_Import_Template.xlsx');
    } catch (e) {
      setSaveError(e.message || 'Could not download the Excel template. Please try again.');
    }
  }

  // ------------------------------------------------------------ excel import
  // Rows are written one API call at a time so each one gets its own
  // validation, booking-code assignment and audit entry.
  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        dataVersion.current++;
        setSaving(true);
        setSaveError('');
        setImportSummary(null);
        const XLSX = await loadXLSX();
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
        const warnings = [];
        const rows = (sheetName) => wb.Sheets[sheetName] ? XLSX.utils.sheet_to_json(wb.Sheets[sheetName]) : [];
        const hostRows = rows('Host payouts');
        const vehicleRows = rows('Vehicles');
        const customerRows = rows('Customers');
        const bookingRows = rows('Bookings');
        const hasExportTransactions = !!wb.Sheets['Income & expenses'];
        const transactionRows = hasExportTransactions ? rows('Income & expenses') : (rows('Other Transactions').length ? rows('Other Transactions') : (rows('Transactions').length ? rows('Transactions') : rows('Expenses')));
        const hostByName = new Map(hosts.map(h => [h.name.trim().toLowerCase(), h]));
        const vehicleByReg = new Map(vehicles.map(v => [v.regNumber.trim().toUpperCase(), v]));
        const customerByName = new Map(customers.map(c => [c.name.trim().toLowerCase(), c]));
        const customerByAadhar = new Map(customers.filter(c => c.aadhar).map(c => [String(c.aadhar).trim().toLowerCase(), c]));
        const existingBookingCodes = new Set(bookings.map(b => String(b.code || '').trim().toLowerCase()).filter(Boolean));
        const bookingIdByCode = new Map(bookings.map(b => [String(b.code || '').trim().toLowerCase(), b.id]).filter(([code]) => code));
        const bookingSignature = (vehicleId, customerId, start, end, amount) =>
          [vehicleId, customerId, start, end, Number(amount) || 0].join('|');
        const bookingSignatures = new Set(bookings.map(b => bookingSignature(
          b.vehicleId, b.customerId, b.start, b.end, b.rentalAmount
        )));
        const transactionSignature = t => [
          t.date, t.type, t.category, Number(t.amount) || 0, t.mode, t.bookingId || '', t.note || '',
        ].join('|');
        const transactionSignatures = new Set(transactions.map(transactionSignature));
        let addedVehicles = 0, addedHosts = 0, addedCustomers = 0, addedBookings = 0, addedTxns = 0;

        async function ensureHost(name, phone, rate, bankDetails = '') {
          const cleanName = String(name || '').trim();
          if (!cleanName) return null;
          const key = cleanName.toLowerCase();
          if (hostByName.has(key)) return hostByName.get(key);
          const { row } = await api.saveHost({
            name: cleanName, phone: phone || '',
            commission_rate: numOrBlank(rate) === '' ? 30 : numOrBlank(rate), bank_details: bankDetails || '',
          });
          const saved = toHost(row);
          hostByName.set(key, saved);
          addedHosts++;
          return saved;
        }

        async function ensureCustomer(name, aadhar, license, phone, address, rowNumber) {
          const cleanName = String(name || '').trim();
          if (!cleanName) return null;
          const aadharKey = String(aadhar || '').trim().toLowerCase();
          const nameKey = cleanName.toLowerCase();
          const existing = (aadharKey && customerByAadhar.get(aadharKey)) || customerByName.get(nameKey);
          if (existing) return existing.id;

          if (!aadharKey || !String(license || '').trim() || !String(address || '').trim()) {
            warnings.push(`Customer ${rowNumber}: ${cleanName} is not on file and the Aadhar, license, or address is missing — related booking skipped.`);
            return null;
          }
          const { row } = await api.saveCustomer({
            name: cleanName, aadhar: String(aadhar).trim(), license_number: String(license).trim(),
            phone: phone || '', address: String(address).trim(),
          });
          const saved = toCustomer(row);
          customerByName.set(nameKey, saved);
          customerByAadhar.set(aadharKey, saved);
          addedCustomers++;
          return saved.id;
        }

        // Save hosts before vehicles so every foreign key is a real database
        // UUID. Host payouts is part of the export workbook; Vehicles carries
        // host details for the import template.
        for (const row of hostRows) {
          await ensureHost(
            getCol(row, 'Host'), getCol(row, 'Phone'), getCol(row, 'Default commission %'), getCol(row, 'Bank details')
          );
        }
        // Keep existing registrations as-is rather than creating duplicates.
        for (const row of vehicleRows) {
          const regNumber = String(getCol(row, 'Reg Number', 'Registration Number', 'Vehicle Reg Number') || '').trim().toUpperCase();
          if (!regNumber || vehicleByReg.has(regNumber)) continue;
          const host = await ensureHost(
            getCol(row, 'Host Name'), getCol(row, 'Host Phone'), getCol(row, 'Host Commission %', 'Host Commission')
          );
          const payload = {
            host_id: host?.id || null, reg_number: regNumber,
            make: getCol(row, 'Make') || 'Unknown', model: getCol(row, 'Model') || '',
            year: numOrBlank(getCol(row, 'Year')), fuel: (getCol(row, 'Fuel') || 'petrol').toLowerCase(),
            transmission: (getCol(row, 'Transmission') || 'automatic').toLowerCase(),
            daily_rate: numOrBlank(getCol(row, 'Daily Rate')), hourly_rate: numOrBlank(getCol(row, 'Hourly Rate')),
            pkg4hr_rate: numOrBlank(getCol(row, '4hr Rate')), pkg4hr_km: numOrBlank(getCol(row, '4hr KM')),
            pkg4to10_rate: numOrBlank(getCol(row, '4-10hr Rate')), pkg4to10_km: numOrBlank(getCol(row, '4-10hr KM')),
            pkg12hr_rate: numOrBlank(getCol(row, '12hr Rate')), pkg12hr_km: numOrBlank(getCol(row, '12hr KM')),
            km_policy: /limit/i.test(getCol(row, 'KM Policy')) ? 'limited' : 'unlimited',
            km_limit: numOrBlank(getCol(row, 'KM Limit')), extra_km_rate: numOrBlank(getCol(row, 'Extra KM Rate')),
            extra_hour_rate: numOrBlank(getCol(row, 'Extra Hour Rate')),
            commission_rate: numOrBlank(getCol(row, 'Vehicle Commission %', 'Commission % override')),
          };
          const { row: savedRow } = await api.saveVehicle(payload);
          const saved = toVehicle(savedRow);
          vehicleByReg.set(regNumber, saved);
          addedVehicles++;
        }

        // The export's Customers sheet is optional; the import template keeps
        // identity fields on each booking row. In either case customers are
        // persisted before booking inserts.
        for (let i = 0; i < customerRows.length; i++) {
          const row = customerRows[i];
          await ensureCustomer(
            getCol(row, 'Name', 'Customer Name'), getCol(row, 'Aadhar number', 'Customer Aadhar', 'Aadhar'),
            getCol(row, 'License number', 'Customer License', 'License'), getCol(row, 'Phone'),
            getCol(row, 'Address'), `Customers row ${i + 2}`
          );
        }

        const importedBookings = [];
        for (let i = 0; i < bookingRows.length; i++) {
          const row = bookingRows[i];
          const sourceCode = String(getCol(row, 'Booking ID', 'Booking Id', 'Code') || '').trim();
          const sourceCodeKey = sourceCode.toLowerCase();
          if (sourceCodeKey && (existingBookingCodes.has(sourceCodeKey) || importedBookings.some(b => b.sourceCodeKey === sourceCodeKey))) {
            warnings.push(`Bookings row ${i + 2}: booking ${sourceCode} already exists — skipped to avoid a duplicate.`);
            continue;
          }
          const reg = String(getCol(row, 'Vehicle Reg Number', 'Reg Number', 'Vehicle') || '').trim().toUpperCase();
          const vehicle = vehicleByReg.get(reg);
          const start = parseFlexibleDateTime(getCol(row, 'Start', 'Start Date'));
          const end = parseFlexibleDateTime(getCol(row, 'End', 'End Date'));
          const rental = numOrBlank(getCol(row, 'Rental Amount', 'Rental'));
          const custName = getCol(row, 'Customer Name', 'Customer');
          if (!vehicle || !start || !end || rental === '' || !custName) {
            warnings.push(`Bookings row ${i + 2}: missing or unknown vehicle, customer, dates, or rental amount — skipped.`);
            continue;
          }
          const customerId = await ensureCustomer(
            custName, getCol(row, 'Customer Aadhar', 'Aadhar'), getCol(row, 'Customer License', 'License'),
            getCol(row, 'Customer Phone', 'Phone'), getCol(row, 'Customer Address', 'Address'), `Bookings row ${i + 2}`
          );
          if (!customerId) continue;

          const statusText = String(getCol(row, 'Booking Status', 'Status') || '').toLowerCase();
          const status = statusText.match(/ongoing|completed|cancelled|no-show/)?.[0] || 'completed';
          const startKm = numOrBlank(getCol(row, 'Start KM', 'Start Km', 'Odometer Start'));
          const endKm = numOrBlank(getCol(row, 'End KM', 'End Km', 'Odometer End'));
          if (startKm === '' || (status === 'completed' && endKm === '')) {
            warnings.push(`Bookings row ${i + 2}: a start odometer and completed-trip end odometer are required — skipped.`);
            continue;
          }
          const startDate = new Date(start), endDate = new Date(end);
          const days = endDate > startDate ? Math.max(1, Math.ceil((endDate - startDate) / 86400000)) : 1;
          const booking = {
            vehicleId: vehicle.id, customerId, start, end, days, status,
            closingTime: getCol(row, 'Closing time') || (status === 'completed' ? end : ''),
            rentalAmount: rental, extraHours: numOrBlank(getCol(row, 'Extra Hours')) || 0,
            extraHourCharge: numOrBlank(getCol(row, 'Extra Hour Charge')) || 0,
            startKm, endKm: endKm === '' ? '' : endKm,
            extraKm: numOrBlank(getCol(row, 'Extra KM')) || 0,
            extraKmCharge: numOrBlank(getCol(row, 'Extra km charge')) || 0,
            tollAmount: numOrBlank(getCol(row, 'Toll')) || 0, fuelAmount: numOrBlank(getCol(row, 'Fuel')) || 0,
            damageAmount: numOrBlank(getCol(row, 'Damage')) || 0,
            fineAmount: numOrBlank(getCol(row, 'Traffic Fine', 'Fine')) || 0,
            notes: getCol(row, 'Notes') || '',
          };
          const signature = bookingSignature(vehicle.id, customerId, start, end, rental);
          if (!sourceCodeKey && bookingSignatures.has(signature)) {
            warnings.push(`Bookings row ${i + 2}: matching booking already exists — skipped to avoid a duplicate.`);
            continue;
          }
          bookingSignatures.add(signature);
          const { row: savedRow } = await api.saveBooking(fromBookingView(booking));
          const savedBooking = { ...booking, id: savedRow.id, code: savedRow.code, sourceCode, sourceCodeKey, sourceRow: row };
          importedBookings.push(savedBooking);
          if (sourceCodeKey) bookingIdByCode.set(sourceCodeKey, savedBooking.id);
          if (savedBooking.code) bookingIdByCode.set(String(savedBooking.code).trim().toLowerCase(), savedBooking.id);
          addedBookings++;
        }

        const importedTransactions = [];
        for (let i = 0; i < transactionRows.length; i++) {
          const row = transactionRows[i];
          const date = parseFlexibleDate(getCol(row, 'Date'));
          const amount = numOrBlank(getCol(row, 'Amount'));
          if (!date || amount === '') {
            warnings.push(`Transactions row ${i + 2}: missing date or amount — skipped.`);
            continue;
          }
          const code = String(getCol(row, 'Linked booking', 'Linked Booking ID', 'Booking ID') || '').trim().toLowerCase();
          importedTransactions.push({
            date, type: /income/i.test(getCol(row, 'Type')) ? 'income' : 'expense',
            category: getCol(row, 'Category') || 'Other', amount,
            mode: /cash/i.test(getCol(row, 'Mode')) ? 'cash' : 'online',
            bookingId: bookingIdByCode.get(code) || '', note: getCol(row, 'Note') || 'Imported',
          });
        }

        // Booking payments in the template are converted to linked transactions
        // only for newly imported bookings, so retrying an import cannot double
        // the old payments.
        for (const booking of hasExportTransactions ? [] : importedBookings) {
          const row = booking.sourceRow;
          const online = numOrBlank(getCol(row, 'Online Paid'));
          const cash = numOrBlank(getCol(row, 'Cash Paid'));
          const payout = numOrBlank(getCol(row, 'Payout Paid'));
          if (online) importedTransactions.push({ date: booking.start.slice(0, 10), type: 'income', category: 'Booking payment', amount: online, mode: 'online', bookingId: booking.id, note: 'Imported' });
          if (cash) importedTransactions.push({ date: booking.start.slice(0, 10), type: 'income', category: 'Booking payment', amount: cash, mode: 'cash', bookingId: booking.id, note: 'Imported' });
          if (payout) importedTransactions.push({ date: booking.end.slice(0, 10), type: 'expense', category: HOST_PAYOUT_CATEGORY, amount: payout, mode: /cash/i.test(getCol(row, 'Payout Mode')) ? 'cash' : 'online', bookingId: booking.id, note: 'Imported' });
        }
        for (const t of importedTransactions) {
          const signature = transactionSignature(t);
          if (transactionSignatures.has(signature)) {
            warnings.push(`Transaction ${t.date} / ${t.category}: matching entry already exists — skipped to avoid a duplicate.`);
            continue;
          }
          await postTransaction(t);
          transactionSignatures.add(signature);
          addedTxns++;
        }

        await reload();
        setImportSummary({ hosts: addedHosts, vehicles: addedVehicles, customers: addedCustomers, bookings: addedBookings, transactions: addedTxns, warnings });
      } catch (err) {
        console.error('Import failed', err);
        setSaveError(err.message || 'Import failed');
        await reload();
        setImportSummary({ error: err.message || 'Could not read that file. Make sure it’s a .xlsx file matching the template.' });
      } finally {
        setSaving(false);
      }
    };
    reader.onerror = () => {
      setImportSummary({ error: 'The selected Excel file could not be read.' });
    };
    reader.readAsArrayBuffer(file);
  }

  async function clearAllData() {
    dataVersion.current++;
    setSaving(true);
    try {
      for (const t of transactions) await api.deleteTransaction(t.id);
      for (const b of bookings) await api.deleteBooking(b.id);
      for (const v of vehicles) await api.deleteVehicle(v.id);
      for (const c of customers) await api.deleteCustomer(c.id);
      for (const h of hosts) await api.deleteHost(h.id);
      await reload();
    } catch (e) { setLoadError(e.message); }
    finally { setSaving(false); setShowResetConfirm(false); }
  }

  // ---------------------------------------------------------------- filters
  const filteredBookings = useMemo(() => {
    let list = [...enriched].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    if (bookingFilter === 'payment-pending') list = list.filter(b => b.status !== 'cancelled' && b.status !== 'no-show' && b.calc.paymentStatus !== 'Paid');
    else if (bookingFilter === 'overdue') list = list.filter(b => b.calc.isOverdue);
    else if (bookingFilter === 'upcoming') list = list.filter(b => b.calc.isUpcoming);
    else if (bookingFilter !== 'all') list = list.filter(b => b.status === bookingFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => (b.code || '').toLowerCase().includes(q) || vehicleLabel(b.calc.vehicle).toLowerCase().includes(q) || customerName(b.customerId).toLowerCase().includes(q));
    }
    return list;
  }, [enriched, bookingFilter, search, customerById, vehicleLabel, customerName]);

  const filteredPayouts = useMemo(() => {
    let list = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show').sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    if (payoutFilter !== 'all') list = list.filter(b => b.calc.payoutStatus === payoutFilter);
    if (payoutSearch.trim()) {
      const q = payoutSearch.toLowerCase();
      list = list.filter(b => (b.code || '').toLowerCase().includes(q) || vehicleLabel(b.calc.vehicle).toLowerCase().includes(q) || (b.calc.host && b.calc.host.name.toLowerCase().includes(q)));
    }
    return list;
  }, [enriched, payoutFilter, payoutSearch, vehicleLabel]);

  const allNavItems = [
    { id: 'overview', label: 'Overview', Icon: IconGrid },
    { id: 'bookings', label: 'Bookings', Icon: IconCar },
    { id: 'payouts', label: 'Payouts', Icon: IconWallet },
    { id: 'vehicles', label: 'Vehicles', Icon: IconKey },
    { id: 'hosts', label: 'Hosts', Icon: IconUsers },
    { id: 'customers', label: 'Customers', Icon: IconUsers },
    { id: 'cashflow', label: 'Income, expenses & cash flow', Icon: IconReceipt },
  ];
  const navItems = allNavItems.filter(item => perms.tabs.includes(item.id));

  if (loading) {
    return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading your ledger…</div>;
  }
  if (loadError && bookings.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', maxWidth: '460px', margin: '0 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#A8452F', margin: '0 0 8px' }}>Couldn't load the ledger</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{loadError}</p>
          <button type="button" className="mm-btn mm-btn-primary" onClick={() => { setLoading(true); reload(); }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-shell">
      <header className="mm-topbar">
        <img src="/logo.png" alt="MM Miles" style={{ height: '26px', width: 'auto', display: 'block' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(saving || refreshing) && <span role="status" aria-live="polite" style={{ fontSize: '11px', color: '#8892B0' }}>Syncing…</span>}
          <button type="button" className="mm-topbar-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}><IconMenu size={20} /></button>
        </div>
      </header>
      {navOpen && <div className="mm-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`mm-sidebar${navOpen ? ' open' : ''}`}>
        <div style={{ padding: '4px 8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <img src="/logo.png" alt="MM Miles" style={{ height: '40px', width: 'auto', display: 'block' }} />
            <p style={{ fontSize: '11px', color: '#8892B0', margin: '2px 0 0' }}>Self-drive rental ledger</p>
          </div>
          <button type="button" className="mm-icon-btn mm-sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}><IconClose /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => (
            <div key={item.id} className={`mm-nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => selectTab(item.id)}>
              <item.Icon size={16} />{item.label}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light') )}>
            {theme === 'light' ? <IconMoon /> : <IconSun />} {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {perms.canExport && <button type="button" className="mm-btn mm-btn-gold" style={{ justifyContent: 'center' }} onClick={exportExcel} disabled={saving || refreshing}><IconDownload /> Export Excel</button>}
          {perms.canImport && (
            <Fragment>
              <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportFile} disabled={saving || refreshing} />
              <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={saving || refreshing}><IconUpload /> Import Excel</button>
              <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={downloadImportTemplate}><IconDownload size={13} /> Import template</button>
            </Fragment>
          )}
          <p role="status" aria-live="polite" style={{ fontSize: '11px', margin: '4px 8px 0', color: saving || refreshing ? '#E4C278' : loadError ? '#E08A8A' : '#8FD19E' }} title={loadError || ''}>
            {saving || refreshing ? '● Syncing changes…' : loadError ? '● Sync problem' : '● Synced'}
          </p>
          <p style={{ fontSize: '11px', color: '#6B7396', margin: '0 8px' }}>{bookings.length} bookings logged</p>
          <div style={{ borderTop: '1px solid #2E3A5C', marginTop: '6px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px 0' }}>
            <p style={{ fontSize: '11px', color: '#C9CCDA', margin: 0 }}>Signed in as <b>{perms.label}</b></p>
            <button type="button" onClick={onLogout} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}>Switch user</button>
          </div>
          {perms.canClear && <button type="button" onClick={() => setShowResetConfirm(true)} style={{ background: 'none', border: 'none', color: '#8A5461', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Clear all data</button>}
          {role === 'admin' && <button type="button" onClick={() => setShowPasswordsModal(true)} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Change passwords</button>}
        </div>
      </aside>

      <main className="mm-main">
        {refreshing && (
          <div role="status" aria-live="polite" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '9px 12px', marginBottom: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
            Change saved. Updating related totals and lists in the background. You can keep browsing; new saves unlock when the update finishes.
          </div>
        )}
        {(loadError || saveError) && (
          <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
            <span style={{ color: '#A8452F', flexShrink: 0, marginTop: '1px' }}><IconAlert size={14} /></span>
            <p style={{ fontSize: '12px', color: '#8A3B2A', margin: 0, flex: 1 }}>{saveError || loadError}</p>
            <button type="button" onClick={() => { setSaveError(''); setLoadError(''); }}
              style={{ background: 'none', border: 'none', color: '#8A3B2A', fontSize: '16px', lineHeight: 1, cursor: 'pointer', padding: 0 }}
              aria-label="Dismiss">×</button>
          </div>
        )}
        {tab === 'overview' && perms.tabs.includes('overview') && <Overview stats={stats} chartData={chartData} paymentModeData={paymentModeData} bookings={enriched} vehicleLabel={vehicleLabel} customerName={customerName} theme={theme} />}
        {tab === 'bookings' && perms.tabs.includes('bookings') && (
          <Bookings bookings={filteredBookings} vehicles={vehicles} filter={bookingFilter} setFilter={setBookingFilter} search={search} setSearch={setSearch}
            onAdd={() => setBookingForm({ start: nowLocal(), end: nowLocal(), days: 1, status: 'ongoing' })}
            onEdit={(b) => setBookingForm(b)} onView={(b) => setBookingForm(b)}
            onDelete={(id) => setDeleteConfirm({ type: 'booking', id, label: `booking ${bookingById.get(id)?.code || ''}` })}
            vehicleLabel={vehicleLabel} customerName={customerName} perms={perms} />
        )}
        {tab === 'payouts' && perms.tabs.includes('payouts') && (
          <PayoutsView bookings={filteredPayouts} allEnriched={enriched} transactions={transactions} vehicleLabel={vehicleLabel} filter={payoutFilter} setFilter={setPayoutFilter} search={payoutSearch} setSearch={setPayoutSearch} onRecordPayout={openPayoutEntry} />
        )}
        {tab === 'vehicles' && perms.tabs.includes('vehicles') && (
          <VehiclesView vehicles={vehicles} hosts={hosts} bookings={enriched}
            onAdd={() => setVehicleForm({ commissionRate: '', kmPolicy: 'unlimited' })} onEdit={(v) => setVehicleForm(v)}
            onDelete={(id) => setDeleteConfirm({ type: 'vehicle', id, label: `vehicle ${vehicleById.get(id)?.regNumber || ''}` })}
            canEdit={perms.canFleet} canFinance={perms.canFinance} />
        )}
        {tab === 'hosts' && perms.tabs.includes('hosts') && (
          <HostsView hosts={hosts} vehicles={vehicles} bookings={enriched}
            onAdd={() => setHostForm({ commissionRate: 30 })} onEdit={(h) => setHostForm(h)}
            onDelete={(id) => setDeleteConfirm({ type: 'host', id, label: `host ${hostById.get(id)?.name || ''}` })}
            canEdit={perms.canFleet} canFinance={perms.canFinance} />
        )}
        {tab === 'customers' && perms.tabs.includes('customers') && (
          <CustomersView customers={customersWithPhotos} bookingsByCustomer={bookingsByCustomer} onAdd={() => setCustomerForm({})} onEdit={(c) => setCustomerForm(c)}
            onDelete={(id) => setDeleteConfirm({ type: 'customer', id, label: `customer ${customerById.get(id)?.name || ''}` })}
            canEdit={perms.canCustomers} />
        )}
        {tab === 'cashflow' && perms.tabs.includes('cashflow') && (
          <CashFlowView cashFlow={cashFlow} transactions={transactionsByDateDesc} bookings={bookings}
            bookingLabel={bookingLabel}
            onAddIncome={() => setTransactionForm({ type: 'income', date: todayStr(), category: INCOME_CATEGORIES[0], mode: 'online' })}
            onAddExpense={() => setTransactionForm({ type: 'expense', date: todayStr(), category: 'Vehicle maintenance', mode: 'cash' })}
            onEdit={(t) => setTransactionForm(t)}
            onDelete={(id) => setDeleteConfirm({ type: 'transaction', id, label: `${transactionById.get(id)?.category || 'entry'}` })} />
        )}
      </main>

      {bookingForm && <BookingModal form={bookingForm} vehicles={vehicles} hosts={hosts} customers={customers} transactions={transactions} bookings={bookings} onCancel={() => setBookingForm(null)} onSave={saveBooking} onQuickAddCustomer={quickAddCustomer} readOnly={!perms.canEditBooking(bookingForm)} canFinance={perms.canFinance} canOverridePrice={perms.canOverridePrice} canBypassTimeGuards={perms.canBypassTimeGuards} saving={saving} syncing={refreshing} saveError={saveError} onDismissError={() => setSaveError('')} />}
      {vehicleForm && <VehicleModal form={vehicleForm} hosts={hosts} onCancel={() => setVehicleForm(null)} onSave={saveVehicle} saving={saving} syncing={refreshing} saveError={saveError} />}
      {hostForm && <HostModal form={hostForm} onCancel={() => setHostForm(null)} onSave={saveHost} saving={saving} syncing={refreshing} saveError={saveError} />}
      {customerForm && <CustomerModal form={customerForm} photos={customerPhotos[customerForm.id]} onCancel={() => setCustomerForm(null)} onSave={saveCustomer} saving={saving} syncing={refreshing} saveError={saveError} />}
      {transactionForm && <TransactionModal form={transactionForm} bookings={enriched} bookingLabel={bookingLabel} onCancel={() => setTransactionForm(null)} onSave={saveTransaction} saving={saving} syncing={refreshing} saveError={saveError} />}
      {importSummary && <ImportSummaryModal summary={importSummary} onClose={() => setImportSummary(null)} />}
      {showResetConfirm && <ResetConfirmModal counts={{ bookings: bookings.length, vehicles: vehicles.length, hosts: hosts.length, customers: customers.length, transactions: transactions.length }} onCancel={() => setShowResetConfirm(false)} onConfirm={clearAllData} />}
      {showPasswordsModal && <ChangePasswordsModal onCancel={() => setShowPasswordsModal(false)} />}
      {deleteConfirm && (
        <DeleteConfirmModal
          label={deleteConfirm.label}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            const fns = { booking: deleteBooking, vehicle: deleteVehicle, host: deleteHost, customer: deleteCustomer, transaction: deleteTransaction };
            fns[deleteConfirm.type](deleteConfirm.id);
            setDeleteConfirm(null);
          }}
        />
      )}
    </div>
  );
}
