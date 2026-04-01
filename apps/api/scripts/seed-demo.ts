/**
 * Sends many checkout events to the API to populate the dashboard (local or Railway).
 * Run: npm run seed:demo
 * Requires: API running (npm run dev) and DATABASE_URL pointing to the same DB the API uses.
 */
import "dotenv/config";

const BASE_URL = process.env.SEED_API_URL ?? "http://localhost:3100";

const MERCHANTS = [
  "01KHE4FRNNDDY6YBRZE28Q361S",
  "01KBHVBD4HJJBYSAZ411MEHPVW",
  "01TESTMERCHANTDEMO01",
];

const COUNTRIES = ["AE", "SA", "US", "GB", "IN"];
const PAYMENTS = ["stripe", "tabby", "tamara", "apple_pay"];
const DEVICES = ["mobile", "tablet", "desktop"];

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomCartId(): string {
  const hex = Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `01${hex}`;
}

function randomAmountCents(): number {
  return Math.floor(5000 + Math.random() * 250000);
}

async function postEvent(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /events failed ${res.status}: ${text}`);
  }
}

/** Ordered steps (no discount). Index 0..6 = loaded .. pay_clicked; completed is separate. */
const CORE_BEFORE_PAY = [
  "sa_checkout_loaded",
  "sa_checkout_prices_ready",
  "sa_checkout_shipping_shown",
  "sa_checkout_shipping_selected",
] as const;

const AFTER_SHIPPING = [
  "sa_checkout_payment_shown",
  "sa_checkout_pay_clicked",
  "sa_checkout_completed",
] as const;

interface SessionPlan {
  /** How many steps from CORE_BEFORE_PAY to include (1-4) */
  coreSteps: number;
  /** Include discount between shipping and payment */
  discount: boolean;
  /** How many steps after shipping block: 0 = abandon before payment UI, 1 = payment_shown only, 2 = pay_clicked, 3 = completed */
  afterShipping: 0 | 1 | 2 | 3;
  /** If afterShipping >= 2 and this is true, fire payment_error instead of completing */
  paymentError: boolean;
}

function buildSessionEvents(plan: SessionPlan): string[] {
  const events: string[] = [];
  for (let i = 0; i < plan.coreSteps; i++) {
    events.push(CORE_BEFORE_PAY[i]!);
  }
  if (plan.coreSteps < 4) return events;

  if (plan.discount) {
    events.push("sa_checkout_discount_applied");
  }

  if (plan.afterShipping === 0) return events;

  events.push(AFTER_SHIPPING[0]!);
  if (plan.afterShipping === 1) return events;

  events.push(AFTER_SHIPPING[1]!);
  if (plan.afterShipping === 2) {
    if (plan.paymentError) {
      events.push("sa_checkout_payment_error");
    }
    return events;
  }

  if (plan.paymentError) {
    events.push("sa_checkout_payment_error");
    return events;
  }
  events.push(AFTER_SHIPPING[2]!);
  return events;
}

/** ~52 events across 12 sessions */
const PLANS: SessionPlan[] = [
  { coreSteps: 4, discount: false, afterShipping: 3, paymentError: false },
  { coreSteps: 4, discount: true, afterShipping: 3, paymentError: false },
  { coreSteps: 4, discount: false, afterShipping: 3, paymentError: false },
  { coreSteps: 4, discount: true, afterShipping: 3, paymentError: false },
  { coreSteps: 4, discount: false, afterShipping: 3, paymentError: false },
  { coreSteps: 4, discount: false, afterShipping: 2, paymentError: true },
  { coreSteps: 4, discount: false, afterShipping: 2, paymentError: false },
  { coreSteps: 4, discount: true, afterShipping: 1, paymentError: false },
  { coreSteps: 4, discount: false, afterShipping: 1, paymentError: false },
  { coreSteps: 3, discount: false, afterShipping: 0, paymentError: false },
  { coreSteps: 2, discount: false, afterShipping: 0, paymentError: false },
  { coreSteps: 1, discount: false, afterShipping: 0, paymentError: false },
];

async function main() {
  console.log(`Seeding via ${BASE_URL}/events\n`);

  let totalEvents = 0;

  for (let s = 0; s < PLANS.length; s++) {
    const plan = PLANS[s]!;
    const cartId = randomCartId();
    const merchantId = randomPick(MERCHANTS);
    const country = randomPick(COUNTRIES);
    const paymentMethod = randomPick(PAYMENTS);
    const deviceType = randomPick(DEVICES);
    const amount = randomAmountCents();
    const currency =
      country === "AE" || country === "SA"
        ? "AED"
        : country === "US"
          ? "USD"
          : country === "IN"
            ? "INR"
            : "GBP";

    const eventNames = buildSessionEvents(plan);
    const claritySession = `demo-${cartId.slice(0, 12)}`;

    console.log(
      `Session ${s + 1}: ${eventNames.length} events, cart=${cartId.slice(0, 14)}..., merchant=${merchantId.slice(0, 8)}...`,
    );

    let t = Date.now() - eventNames.length * 4000 - Math.floor(Math.random() * 60000);

    for (const event of eventNames) {
      t += 2000 + Math.floor(Math.random() * 8000);
      const body: Record<string, unknown> = {
        event,
        cart_id: cartId,
        merchant_id: merchantId,
        clarity_session_id: claritySession,
        country_code: country,
        currency_code: currency,
        cart_amount_cents: amount,
        device_type: deviceType,
        shop_url: `https://demo-store-${(s % 3) + 1}.myshopify.com`,
        timestamp: new Date(t).toISOString(),
      };

      if (event === "sa_checkout_pay_clicked") {
        body.payment_method = paymentMethod;
      }

      await postEvent(body);
      totalEvents++;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  console.log(`\nDone. ${totalEvents} events posted across ${PLANS.length} sessions.`);
  console.log("Open the dashboard and hit Refresh.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
