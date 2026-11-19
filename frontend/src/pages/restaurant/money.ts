// Deposit words and amounts, as plain functions so the diner's pages, the staff floor and the
// tests all say the same thing. Amounts are whole cents; the euro sign comes first, like the
// sentences the server writes ("€20 per person").
import type { PaymentSummary } from "../../api/restaurant";
import { activeLocale, activeTag, tr } from "../../i18n/locale";

/** 1250 -> "€12.50", 2000 -> "€20", 1 -> "€0.01". */
export function formatEuros(cents: number): string {
  if (activeLocale() !== "en") {
    // 12,50 € in Portuguese, Spanish and French: the language's own way of writing money.
    return new Intl.NumberFormat(activeTag(), { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
  }
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? "-" : "";
  return rest === 0 ? `${sign}€${euros}` : `${sign}€${euros}.${String(rest).padStart(2, "0")}`;
}

/** One line about a deposit, for the staff card and the manage page. */
export function depositStatus(payment: PaymentSummary): string {
  switch (payment.status) {
    case "pending":
      return tr("Waiting for the {amount} deposit", { amount: formatEuros(payment.amount_cents) });
    case "paid":
      return tr("Deposit paid: {amount}", { amount: formatEuros(payment.amount_cents) });
    case "refunded":
      return tr("Deposit refunded: {amount}", { amount: formatEuros(payment.refunded_cents) });
    case "refund_due":
      return tr("Refund of {amount} on its way", { amount: formatEuros(payment.amount_cents - payment.refunded_cents) });
    case "kept":
      return tr("Deposit kept by the restaurant: {amount}", { amount: formatEuros(payment.amount_cents) });
    case "expired":
      return tr("Deposit not paid");
  }
}

/** What cancelling does to a paid deposit, in the diner's words. Null when there is nothing to say. */
export function cancelNote(payment: PaymentSummary | null | undefined): string | null {
  if (!payment || payment.status !== "paid") return null;
  const amount = formatEuros(payment.amount_cents);
  return payment.cancel_outcome === "refund"
    ? tr("You will get your {amount} deposit back.", { amount })
    : tr("The free cancellation period has ended, so the restaurant keeps your {amount} deposit.", { amount });
}

/** A short label for the staff list: nothing when the booking never had a deposit. */
export function staffDepositLabel(payment: PaymentSummary | null | undefined): string | null {
  if (!payment) return null;
  switch (payment.status) {
    case "pending":
      return tr("Waiting for deposit");
    case "paid":
      return tr("Deposit paid {amount}", { amount: formatEuros(payment.amount_cents) });
    case "refunded":
      return tr("Deposit refunded {amount}", { amount: formatEuros(payment.refunded_cents) });
    case "kept":
      return tr("Deposit kept {amount}", { amount: formatEuros(payment.amount_cents) });
    default:
      return null;
  }
}
