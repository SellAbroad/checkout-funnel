import { getStepOrder } from "./step-order.js";

export interface IncomingEvent {
  event: string;
  cart_id: string;
  merchant_id: string;
  clarity_session_id?: string;
  currency_code?: string;
  cart_amount_cents?: number;
  country_code?: string;
  shop_url?: string;
  payment_method?: string;
  device_type?: string;
  screen_width?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export function parseEventBody(raw: string | Record<string, unknown>): IncomingEvent | null {
  try {
    const data: Record<string, unknown> =
      typeof raw === "string" ? JSON.parse(raw) : raw;

    const event = data.event as string | undefined;
    const cartId = data.cart_id as string | undefined;
    const merchantId = data.merchant_id as string | undefined;

    if (!event || !cartId || !merchantId) return null;
    if (getStepOrder(event) === 0) return null;

    return data as unknown as IncomingEvent;
  } catch {
    return null;
  }
}
