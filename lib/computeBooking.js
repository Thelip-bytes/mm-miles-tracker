import { DAMAGE_KM_RATE } from './constants';

// The single source of truth for a booking's money math: commission,
// host payout, payment/payout/refund status. Called fresh on every render.

export function computeBooking(b, vehicles, hosts, paid, payoutPaid, refundPaid) {
  paid = paid || { online: 0, cash: 0 };
  const vehicle = vehicles.find(v => v.id === b.vehicleId);
  const host = vehicle ? hosts.find(h => h.id === vehicle.hostId) : null;
  const vRate = vehicle && vehicle.commissionRate !== '' && vehicle.commissionRate != null ? Number(vehicle.commissionRate) : NaN;
  const hRate = host && host.commissionRate !== '' && host.commissionRate != null ? Number(host.commissionRate) : NaN;
  const rate = !isNaN(vRate) ? vRate : (!isNaN(hRate) ? hRate : 30);
  const rental = Number(b.rentalAmount) || 0;
  const extraHourCharge = Number(b.extraHourCharge) || 0;
  const extraKmCharge = Number(b.extraKmCharge) || 0;
  const damageAmount = Number(b.damageAmount) || 0;
  const fuelAmount = Number(b.fuelAmount) || 0;
  const fineAmount = Number(b.fineAmount) || 0;
  const tollAmount = Number(b.tollAmount) || 0;

  const rentalCommission = Math.round(rental * rate / 100);
  const extraHourCommission = Math.round(extraHourCharge * rate / 100);
  const kmDamageBase = extraKmCharge + damageAmount;
  const kmDamageCommission = Math.round(kmDamageBase * DAMAGE_KM_RATE / 100);
  const passThroughBase = fuelAmount + tollAmount + fineAmount;

  const totalCommission = rentalCommission + extraHourCommission + kmDamageCommission;
  const grossRevenue = rental + extraHourCharge + extraKmCharge + damageAmount + fuelAmount + fineAmount + tollAmount;
  const hostPayout = grossRevenue - totalCommission;
  const totalDue = grossRevenue;
  const paidOnline = Number(paid.online) || 0;
  const paidCash = Number(paid.cash) || 0;
  const paidTotal = paidOnline + paidCash;
  const paymentStatus = paidTotal >= totalDue && totalDue > 0 ? 'Paid' : paidTotal > 0 ? 'Partial' : 'Pending';

  const payoutPaidAmount = Number(payoutPaid) || 0;
  const payoutBalance = Math.max(0, hostPayout - payoutPaidAmount);
  const payoutStatus = payoutPaidAmount >= hostPayout && hostPayout > 0 ? 'paid' : payoutPaidAmount > 0 ? 'partial' : 'pending';

  const isCancelled = b.status === 'cancelled';
  const isNoShow = b.status === 'no-show';
  const refundPercent = isNoShow ? 0 : (isCancelled ? (b.refundPercent === '' || b.refundPercent == null ? null : Number(b.refundPercent)) : null);
  const refundDue = (isCancelled || isNoShow) && refundPercent != null ? Math.round(paidTotal * refundPercent / 100) : 0;
  const refundPaidAmount = Number(refundPaid) || 0;
  const refundBalance = Math.max(0, refundDue - refundPaidAmount);
  const refundStatus = refundDue === 0 ? 'n/a' : (refundPaidAmount >= refundDue ? 'paid' : refundPaidAmount > 0 ? 'partial' : 'pending');
  const isOverdue = b.status === 'ongoing' && !!b.end && new Date() > new Date(b.end);
  const isUpcoming = b.status === 'ongoing' && !!b.start && new Date() < new Date(b.start);

  return {
    vehicle, host, rate, rental, extraHourCharge, extraKmCharge, damageAmount, fuelAmount, fineAmount, tollAmount,
    rentalCommission, extraHourCommission, kmDamageBase, kmDamageCommission, passThroughBase, totalCommission,
    extras: grossRevenue - rental, grossRevenue, hostPayout, totalDue, paidOnline, paidCash, paidTotal, paymentStatus, balance: totalDue - paidTotal,
    payoutPaidAmount, payoutBalance, payoutStatus,
    refundPercent, refundDue, refundPaidAmount, refundBalance, refundStatus, isOverdue, isUpcoming
  };
}
