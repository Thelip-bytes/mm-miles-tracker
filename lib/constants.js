// Shared app-wide constants: categories, refund/discount policy tiers,
// and the role permission matrix. Pure data, no side effects.

export const HOST_PAYOUT_CATEGORY = 'Host payout';
export const REFUND_CATEGORY = 'Customer refund';
export const EXPENSE_CATEGORIES = [HOST_PAYOUT_CATEGORY, REFUND_CATEGORY, 'Vehicle maintenance', 'Fuel reimbursement', 'Insurance', 'Cleaning & detailing', 'Parking & permits', 'Marketing', 'Platform & software', 'Referral bonus', 'Salary / staff', 'Legal & compliance', 'Office / admin', 'Other'];
export const INCOME_CATEGORIES = ['Booking payment', 'Security deposit', 'Extra charges settlement', 'Late fee', 'Damage recovery', 'Referral income', 'Other income'];
export const PIE_COLORS = ['#B8863C', '#3F6B4F', '#7A5C8E', '#A8452F', '#3B6B8C'];
export const DAMAGE_KM_RATE = 10;
export const REFUND_TIERS = [
  { minHours: 24, percent: 90, label: '24+ hrs notice' },
  { minHours: 4, percent: 50, label: '4–24 hrs notice' },
  { minHours: -Infinity, percent: 0, label: 'Under 4 hrs / no-show' }
];
export const REQUIRED_ALWAYS = ['closingTime', 'endKm', 'extraHours', 'extraHourCharge', 'tollAmount', 'fuelAmount', 'damageAmount', 'fineAmount'];

// Multi-day rental discount policy — applies to the day-rate portion of a
// booking's auto-calculated price, based on total billing days.
export const MULTIDAY_DISCOUNT_TIERS = [
  { min: 20, max: 30, percent: 20 },
  { min: 14, max: 19, percent: 15 },
  { min: 7, max: 13, percent: 10 },
  { min: 3, max: 6, percent: 5 }
];
export const ROLE_PERMS = {
  admin: { tabs: ['overview', 'bookings', 'payouts', 'vehicles', 'hosts', 'customers', 'cashflow'], canAddBooking: true, canEditBooking: () => true, canDeleteBooking: true, canFinance: true, canFleet: true, canCustomers: true, canExport: true, canImport: true, canClear: true, canDelete: true, canOverridePrice: true, canBypassTimeGuards: true, label: 'Admin' },
  manager: { tabs: ['bookings', 'vehicles', 'hosts', 'customers'], canAddBooking: true, canEditBooking: (b) => !b.id || b.status === 'ongoing', canDeleteBooking: false, canFinance: false, canFleet: false, canCustomers: false, canExport: false, canImport: false, canClear: false, canDelete: false, canOverridePrice: false, canBypassTimeGuards: false, label: 'Manager' },
  finance: { tabs: ['overview', 'bookings', 'payouts', 'vehicles', 'hosts', 'customers', 'cashflow'], canAddBooking: false, canEditBooking: () => false, canDeleteBooking: false, canFinance: true, canFleet: false, canCustomers: false, canExport: true, canImport: false, canClear: false, canDelete: false, canOverridePrice: false, canBypassTimeGuards: false, label: 'Finance', viewBookingsReadOnly: true }
};
