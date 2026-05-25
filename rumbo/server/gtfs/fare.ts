import type Database from "better-sqlite3";
import type { TransitFare } from "../transit/provider";

/**
 * Hardcoded bip! adult fare in CLP (effective late 2025 / 2026 rates as
 * published at https://www.dtpm.cl/index.php/tarifas-y-medios-de-pago).
 *
 * Used only when the GTFS feed doesn't carry a fare_attributes row, or when
 * we can't match it to the chosen route. The value is biased toward the
 * higher of bus / metro fares so users aren't undercharged in the UI.
 */
const BIP_ADULT_FALLBACK_CLP = 870;

export function lookupBusFare(
  db: Database.Database,
  routeId: string,
): TransitFare {
  // Prefer fare_rules → fare_attributes for this route.
  const matched = db
    .prepare<
      [string],
      { price: number | null; currency_type: string | null }
    >(
      `SELECT fa.price, fa.currency_type
       FROM fare_rules fr
       JOIN fare_attributes fa ON fa.fare_id = fr.fare_id
       WHERE fr.route_id = ?
       ORDER BY fa.price DESC
       LIMIT 1`,
    )
    .get(routeId);

  if (matched && matched.price != null) {
    return formatFare(matched.price, matched.currency_type || "CLP");
  }

  // Fall back to any fare in the feed.
  const any = db
    .prepare<
      [],
      { price: number | null; currency_type: string | null }
    >(
      `SELECT price, currency_type FROM fare_attributes
       WHERE price IS NOT NULL
       ORDER BY price DESC LIMIT 1`,
    )
    .get();
  if (any && any.price != null) {
    return formatFare(any.price, any.currency_type || "CLP");
  }

  return formatFare(BIP_ADULT_FALLBACK_CLP, "CLP");
}

function formatFare(price: number, currency: string): TransitFare {
  const rounded = Math.round(price);
  let text: string;
  if (currency === "CLP") {
    text = `$${rounded.toLocaleString("es-CL")} CLP`;
  } else {
    text = `${rounded} ${currency}`;
  }
  return { value: rounded, currency, text };
}
