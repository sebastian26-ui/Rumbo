/**
 * Uber Riders API — client credentials + GET /v1.2/estimates/price|time
 * Scope: ride_request.estimate (see Uber migration docs)
 */

const TOKEN_URL = "https://auth.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com/v1.2";

export type UberTokenState = {
  accessToken: string;
  expiresAtMs: number;
};

let cached: UberTokenState | null = null;

function getEnv() {
  const clientId = process.env.UBER_CLIENT_ID;
  const clientSecret = process.env.UBER_CLIENT_SECRET;
  const scope = process.env.UBER_SCOPE ?? "ride_request.estimate";
  return { clientId, clientSecret, scope };
}

export async function getUberAccessToken(): Promise<string> {
  const { clientId, clientSecret, scope } = getEnv();
  if (!clientId || !clientSecret) {
    throw new Error("Missing UBER_CLIENT_ID or UBER_CLIENT_SECRET");
  }

  const now = Date.now();
  if (cached && cached.expiresAtMs > now + 60_000) {
    return cached.accessToken;
  }

  const form = new FormData();
  form.append("client_id", clientId);
  form.append("client_secret", clientSecret);
  form.append("grant_type", "client_credentials");
  form.append("scope", scope);

  const res = await fetch(TOKEN_URL, { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Uber token failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    accessToken: data.access_token,
    expiresAtMs: now + (data.expires_in ?? 2592000) * 1000,
  };
  return cached.accessToken;
}

type PriceRow = {
  product_id: string;
  display_name: string;
  currency_code?: string;
  low_estimate?: number;
  high_estimate?: number;
  duration?: number;
  estimate?: string;
};

type TimeRow = {
  product_id: string;
  estimate?: number;
};

export async function fetchUberEstimates(params: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}): Promise<{ prices: PriceRow[]; times: TimeRow[] }> {
  const token = await getUberAccessToken();
  const auth = { Authorization: `Bearer ${token}`, "Accept-Language": "en_US" } as const;

  const q = (path: string) =>
    `${API_BASE}${path}?start_latitude=${params.startLat}&start_longitude=${params.startLng}&end_latitude=${params.endLat}&end_longitude=${params.endLng}`;

  const [priceRes, timeRes] = await Promise.all([
    fetch(q("/estimates/price"), { headers: auth }),
    fetch(
      `${API_BASE}/estimates/time?start_latitude=${params.startLat}&start_longitude=${params.startLng}`,
      { headers: auth },
    ),
  ]);

  const priceText = await priceRes.text();
  const timeText = await timeRes.text();

  if (!priceRes.ok) {
    throw new Error(`Uber estimates/price (${priceRes.status}): ${priceText.slice(0, 500)}`);
  }
  if (!timeRes.ok) {
    throw new Error(`Uber estimates/time (${timeRes.status}): ${timeText.slice(0, 500)}`);
  }

  const priceJson = JSON.parse(priceText) as { prices?: PriceRow[] };
  const timeJson = JSON.parse(timeText) as { times?: TimeRow[] };

  return {
    prices: priceJson.prices ?? [],
    times: timeJson.times ?? [],
  };
}

export function mergeEstimatesForUi(
  prices: PriceRow[],
  times: TimeRow[],
): Array<{
  provider: string;
  type: string;
  price: number;
  currency: string;
  eta: number;
  color: string;
}> {
  const timeByProduct = new Map<string, number>();
  for (const t of times) {
    if (t.product_id != null && t.estimate != null) {
      timeByProduct.set(t.product_id, Math.ceil(t.estimate / 60));
    }
  }

  const rows: Array<{
    provider: string;
    type: string;
    price: number;
    currency: string;
    eta: number;
    color: string;
  }> = [];

  for (const p of prices) {
    const low = p.low_estimate ?? p.high_estimate ?? 0;
    const high = p.high_estimate ?? low;
    const mid = Math.round((low + high) / 2);
    rows.push({
      provider: "Uber",
      type: p.display_name || "Ride",
      price: mid,
      currency: p.currency_code ?? "USD",
      eta: timeByProduct.get(p.product_id) ?? 0,
      color: "#000000",
    });
  }

  rows.sort((a, b) => a.price - b.price);
  return rows;
}
