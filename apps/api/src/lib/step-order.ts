export const STEP_ORDER: Record<string, number> = {
  sa_checkout_loaded: 1,
  sa_checkout_prices_ready: 2,
  sa_checkout_shipping_shown: 3,
  sa_checkout_shipping_empty: 3,
  sa_checkout_shipping_selected: 4,
  sa_checkout_discount_applied: 5,
  sa_checkout_discount_failed: 5,
  sa_checkout_payment_shown: 6,
  sa_checkout_pay_clicked: 7,
  sa_checkout_payment_error: 7,
  sa_checkout_completed: 8,
};

export const STEP_LABELS: Record<number, string> = {
  1: "Checkout Loaded",
  2: "Prices Ready",
  3: "Shipping Shown",
  4: "Shipping Selected",
  5: "Discount",
  6: "Payment Shown",
  7: "Pay Clicked",
  8: "Completed",
};

export const FUNNEL_STEPS = [1, 2, 3, 4, 6, 7, 8] as const;

export function getStepOrder(eventName: string): number {
  return STEP_ORDER[eventName] ?? 0;
}
