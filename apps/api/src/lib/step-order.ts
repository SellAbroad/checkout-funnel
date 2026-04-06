// Maps incoming event names to a numeric step value stored in checkout_sessions.max_step_reached.
// Used only for validation (events with step 0 are rejected) and for the session table display.
export const STEP_ORDER: Record<string, number> = {
  sa_checkout_loaded: 1,
  sa_checkout_prices_ready: 2,
  sa_checkout_shipping_shown: 3,
  sa_checkout_shipping_empty: 3,
  sa_checkout_shipping_selected: 4,
  sa_checkout_tax_shown: 4,
  sa_checkout_address_selected: 5,
  sa_checkout_discount_applied: 6,
  sa_checkout_discount_failed: 6,
  sa_checkout_payment_shown: 7,
  sa_checkout_pay_clicked: 8,
  sa_checkout_payment_error: 8,
  sa_checkout_completed: 9,
};

// Labels for the session table display (max_step_reached column).
export const STEP_LABELS: Record<number, string> = {
  1: "Checkout Loaded",
  2: "Prices Ready",
  3: "Shipping Step",
  4: "Tax / Shipping Selected",
  5: "Address Selected",
  6: "Discount",
  7: "Payment Shown",
  8: "Pay Clicked",
  9: "Completed",
};

// Defines the bars shown in the funnel chart.
// Each entry maps a unique key to the exact event name that must be present
// in checkout_events for a session to be counted at that step.
// Discounts, tax, payment_shown, and shipping_empty are intentionally excluded
// from the funnel bars — they are tracked as side metrics only.
export interface FunnelStepDef {
  key: string;
  eventName: string;
  label: string;
}

export const FUNNEL_DEFINITION: FunnelStepDef[] = [
  { key: "loaded",           eventName: "sa_checkout_loaded",           label: "Checkout Loaded" },
  { key: "prices_ready",     eventName: "sa_checkout_prices_ready",     label: "Prices Ready" },
  { key: "shipping_shown",   eventName: "sa_checkout_shipping_shown",   label: "Shipping Available" },
  { key: "address_selected", eventName: "sa_checkout_address_selected", label: "Address Selected" },
  { key: "pay_clicked",      eventName: "sa_checkout_pay_clicked",      label: "Pay Clicked" },
  { key: "completed",        eventName: "sa_checkout_completed",        label: "Completed" },
];

// Side-metric event names tracked but not shown as funnel bars.
export const SIDE_METRIC_EVENTS = {
  shippingEmpty: "sa_checkout_shipping_empty",
  paymentError:  "sa_checkout_payment_error",
} as const;

export function getStepOrder(eventName: string): number {
  return STEP_ORDER[eventName] ?? 0;
}
