import { NextResponse } from "next/server";

/**
 * Server-side proxy for DDI Frame / SportDigi pre-match event IDs.
 *
 * Endpoint funnet via HAR-analyse (24.05.2026):
 *   sport.ddiframe.com/{UUID}/prematch/geteventslist?champId=5106&...&partnerId=750
 *
 * Respons er XOR-encodet: første byte = XOR-nøkkel, resten er XOR'd JSON.
 * Nullbytes (der raw-byte = XOR-nøkkel) fjernes etter dekoding.
 *
 * Kjøres som Edge Runtime slik at Cloudflare-beskyttelse forhåpentligvis bypass'es
 * (Vercel Edge = Cloudflare Workers = same-network request).
 */

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PARTNER_UUID = "188a1665-3c7b-48aa-a143-6764c719955f";
const PARTNER_ID   = "750";          // numerisk partnerId i query string

// stakeTypes fra HAR (alle som BoaBet-appen bruker for Eliteserien)
const STAKE_TYPES = [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315];

function buildUrl(): string {
  const params = new URLSearchParams({
    champId:     "5106",
    timeFilter:  "0",
    langId:      "2",
    partnerId:   PARTNER_ID,
    countryCode: "NO",
  });
  for (const st of STAKE_TYPES) {
    params.append("stakeTypes", String(st));
  }
  return `https://sport.ddiframe.com/${PARTNER_UUID}/prematch/geteventslist?${params}`;
}

/** XOR-dekod DDI Frame respons:
 *  - byte 0 = XOR-nøkkel
 *  - byte 1.. = XOR'd JSON-tekst
 *  - nullbytes (råbyte === nøkkel) strippes
 */
function xorDecode(bytes: Uint8Array): string {
  const key = bytes[0];
  const decoded: number[] = [];
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i] ^ key;
    if (b !== 0) decoded.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(decoded));
}

interface DdiEvent {
  Id:   number;
  N:    string;   // "Bodo Glimt - Brann"
  HT:   string;   // Home team
  AT:   string;   // Away team
  D?:   string;   // ISO date
  CId?: number;   // Championship ID
}

export async function GET() {
  const url = buildUrl();

  try {
    const res = await fetch(url, {
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
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({
        events: [],
        source: null,
        error:  `HTTP ${res.status} from sport.ddiframe.com`,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Read raw bytes (response may be XOR-encoded or plain JSON)
    const buf    = await res.arrayBuffer();
    const bytes  = new Uint8Array(buf);
    const first  = bytes[0];

    let text: string;
    // If first byte is a printable ASCII char that could start JSON, try plain first
    if (first === 0x5b /* [ */ || first === 0x7b /* { */) {
      text = new TextDecoder().decode(bytes);
    } else {
      // XOR decode: first byte = key
      text = xorDecode(bytes);
    }

    let events: DdiEvent[];
    try {
      events = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({
        events: [],
        source: null,
        error:  `JSON parse failed: ${String(e)}. First bytes: ${Array.from(bytes.slice(0, 8)).map(b => b.toString(16)).join(" ")}`,
        fetchedAt: new Date().toISOString(),
      });
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({
        events: [],
        source: "prematch/geteventslist",
        error:  "Empty event array returned",
        fetchedAt: new Date().toISOString(),
      });
    }

    // Map to a minimal shape — key by normalized team names (lowercase, no accents stripped)
    const result = events.map(ev => ({
      id:   ev.Id,
      name: ev.N,
      home: ev.HT,
      away: ev.AT,
      date: ev.D ?? null,
      // Normalized key for fuzzy matching in frontend
      key:  `${normalizeTeam(ev.HT)}|${normalizeTeam(ev.AT)}`,
    }));

    return NextResponse.json({
      events:    result,
      source:    "prematch/geteventslist",
      total:     result.length,
      fetchedAt: new Date().toISOString(),
    });

  } catch (e: unknown) {
    return NextResponse.json({
      events: [],
      source: null,
      error:  String(e),
      fetchedAt: new Date().toISOString(),
    });
  }
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}
