import { resolveMx } from "node:dns/promises";

import type { MxProvider } from "@/lib/types";

const GOOGLE_MX_MARKERS = ["google.com", "googlemail.com", "aspmx.l.google.com"];
const MICROSOFT_MX_MARKERS = ["outlook.com", "protection.outlook.com"];

export async function getMxProfile(domain: string) {
  if (!domain.trim()) {
    return {
      hasMx: false,
      mxProvider: null,
    } as const;
  }

  try {
    const records = await resolveMx(domain);
    const exchanges = records.map((record) => record.exchange.toLowerCase());

    const mxProvider: MxProvider =
      exchanges.some((exchange) => GOOGLE_MX_MARKERS.some((marker) => exchange.includes(marker)))
        ? "google"
        : exchanges.some((exchange) => MICROSOFT_MX_MARKERS.some((marker) => exchange.includes(marker)))
          ? "microsoft"
          : "custom";

    return {
      hasMx: records.length > 0,
      mxProvider,
    } as const;
  } catch {
    return {
      hasMx: false,
      mxProvider: null,
    } as const;
  }
}
