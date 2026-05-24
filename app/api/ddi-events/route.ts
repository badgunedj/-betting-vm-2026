import { NextResponse } from "next/server";

/**
 * DDI Frame event-ID lookup for BoaBet deep-links.
 *
 * sport.ddiframe.com/prematch/geteventslist er XOR-encodet:
 *   byte[0] = XOR-nøkkel, resten er XOR'd JSON.  Nullbytes strippes.
 *
 * Cloudflare Bot Management blokkerer alle server-side requests (403).
 * Løsning: statisk fallback fra siste HAR-opptak, oppdateres manuelt
 * ved å kjøre scripts/update-ddi-cache.mjs (se nedenfor).
 *
 * Edge Runtime forsøker live-henting — om det feiler brukes STATIC_EVENTS.
 */

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Statisk fallback ────────────────────────────────────────────────────────
// Hentet fra HAR 24.05.2026 via scripts/decode-har10.mjs (XOR-dekoding).
// Dekker runde 14 (24-25 mai) + runde 15 (29-30 mai) Eliteserien 2026.
// Oppdater ved å ta ny HAR fra BoaBet og kjøre decode-har10.mjs.
const STATIC_EVENTS = [
  { id: 37589873, home: "Bodo Glimt",   away: "Brann",       date: "2026-05-24" },
  { id: 37589877, home: "Kristiansund", away: "Viking FC",    date: "2026-05-24" },
  { id: 37591131, home: "Start",        away: "Valerenga",    date: "2026-05-25" },
  { id: 37590651, home: "Ham Kam",      away: "Lillestrom",   date: "2026-05-25" },
  { id: 37590656, home: "KFUM",         away: "Rosenborg",    date: "2026-05-25" },
  { id: 37590661, home: "Tromse",       away: "Aalesunds",    date: "2026-05-25" },
  { id: 37591135, home: "Sarpsborg 08", away: "Molde",        date: "2026-05-25" },
  { id: 37591133, home: "Sandefjord",   away: "Fredrikstad",  date: "2026-05-25" },
  { id: 37744271, home: "Aalesunds",    away: "Ham Kam",      date: "2026-05-29" },
  { id: 37744274, home: "Fredrikstad",  away: "Start",        date: "2026-05-29" },
  { id: 37744277, home: "KFUM",         away: "Tromse",       date: "2026-05-29" },
  { id: 37744280, home: "Rosenborg",    away: "Bodo Glimt",   date: "2026-05-29" },
  { id: 37744283, home: "Valerenga",    away: "Kristiansund", date: "2026-05-29" },
  { id: 37768769, home: "Molde",        away: "Sandefjord",   date: "2026-05-30" },
];
// ─────────────────────────────────────────────────────────────────────────────

const PARTNER_UUID = "188a1665-3c7b-48aa-a143-6764c719955f";
const PARTNER_ID   = "750";
const STAKE_TYPES  = [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315];

function buildUrl(): string {
  const params = new URLSearchParams({
    champId:     "5106",
    timeFilter:  "0",
    langId:      "2",
    partnerId:   PARTNER_ID,
    countryCode: "NO",
  });
  for (const st of STAKE_TYPES) params.append("stakeTypes", String(st));
  return `https://sport.ddiframe.com/${PARTNER_UUID}/prematch/geteventslist?${params}`;
}

function xorDecode(bytes: Uint8Array): string {
  const key = bytes[0];
  const out: number[] = [];
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i] ^ key;
    if (b !== 0) out.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function toEventList(raw: Array<{ id: number; home: string; away: string; date?: string }>) {
  return raw.map(ev => ({
    id:   ev.id,
    home: ev.home,
    away: ev.away,
    date: ev.date ?? null,
    key:  `${normalizeTeam(ev.home)}|${normalizeTeam(ev.away)}`,
  }));
}

export async function GET() {
  // ── 1. Prøv live-henting fra sport.ddiframe.com ───────────────────────────
  try {
    const res = await fetch(buildUrl(), {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,nb;q=0.8",
        "Origin":          "https://sport.ddiframe.com",
        "Referer":         "https://sport.ddiframe.com/",
        "Sec-Fetch-Dest":  "empty",
        "Sec-Fetch-Mode":  "cors",
        "Sec-Fetch-Site":  "same-origin",
      },
      signal: AbortSignal.timeout(7000),
      cache:  "no-store",
    });

    if (res.ok) {
      const buf   = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const first = bytes[0];

      const text = (first === 0x5b || first === 0x7b)
        ? new TextDecoder().decode(bytes)
        : xorDecode(bytes);

      interface DdiRaw { Id: number; HT: string; AT: string; D?: string }
      const raw: DdiRaw[] = JSON.parse(text);

      if (Array.isArray(raw) && raw.length > 0) {
        const events = raw.map(ev => ({
          id:   ev.Id,
          home: ev.HT,
          away: ev.AT,
          date: ev.D ?? null,
          key:  `${normalizeTeam(ev.HT)}|${normalizeTeam(ev.AT)}`,
        }));
        return NextResponse.json({
          events,
          source:    "live/prematch/geteventslist",
          total:     events.length,
          fetchedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // fall through to static
  }

  // ── 2. Fallback: statisk liste fra siste HAR-opptak ───────────────────────
  const events = toEventList(STATIC_EVENTS);
  return NextResponse.json({
    events,
    source:    "static/har-24mai2026",
    total:     events.length,
    fetchedAt: new Date().toISOString(),
  });
}
