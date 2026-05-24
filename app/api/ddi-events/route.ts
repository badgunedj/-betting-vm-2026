import { NextResponse } from "next/server";

/**
 * Server-side proxy for SportDigi/DDI Frame event IDs.
 *
 * Fra DevTools på BoaBet (24.05.2026):
 * - Riktig API: sp-spc-api.sportdigi.com (IKKE sport.ddiframe.com)
 * - Origin/Referer: https://sport.ddiframe.com
 * - Accept: application/x-msgpack (men JSON fungerer også)
 * - PartnerId: 188a1665-3c7b-48aa-a143-6764c719955f
 * - Event-ID format: 8-sifret tall (f.eks. 37593384)
 */

export const dynamic  = "force-dynamic";
export const revalidate = 0;

const PARTNER   = "188a1665-3c7b-48aa-a143-6764c719955f";
const API_BASE  = "https://sp-spc-api.sportdigi.com/api/v1/b2c/ScoutProvider";
const HEADERS   = {
  "Accept":          "application/json",
  "Accept-Language": "en",
  "Origin":          "https://sport.ddiframe.com",
  "Referer":         "https://sport.ddiframe.com/",
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// Eliteserien 2026: sportId=1, countryId=1388, champId=5106
const ELITESERIEN = { sportId: 1, countryId: 1388, champId: 5106 };

const ENDPOINTS = [
  // Forsøk list-endepunkter — ulike SportDigi API-versjoner
  `${API_BASE}/GetPreMatchData?partnerId=${PARTNER}&sportId=${ELITESERIEN.sportId}&countryId=${ELITESERIEN.countryId}&champId=${ELITESERIEN.champId}&langIsoCode=en`,
  `${API_BASE}/GetEvents?partnerId=${PARTNER}&sportId=${ELITESERIEN.sportId}&countryId=${ELITESERIEN.countryId}&champId=${ELITESERIEN.champId}&langIsoCode=en`,
  `${API_BASE}/GetSportTree?partnerId=${PARTNER}&sportId=${ELITESERIEN.sportId}&langIsoCode=en`,
  `${API_BASE}/GetPreMatchTree?partnerId=${PARTNER}&langIsoCode=en`,
  `${API_BASE}/GetChampionshipEvents?partnerId=${PARTNER}&champId=${ELITESERIEN.champId}&langIsoCode=en`,
];

/** Rekursiv søk etter event-objekter i ukjent JSON-struktur */
function extractEvents(data: unknown, depth = 0): Array<{ key: string; id: number }> {
  if (depth > 6 || !data || typeof data !== "object") return [];

  const result: Array<{ key: string; id: number }> = [];
  const obj = data as Record<string, unknown>;

  // Prøv dette objektet som et event
  const id = Number(obj.id ?? obj.eventId ?? obj.matchId ?? obj.EventId ?? obj.event_id ?? 0);
  const home = String(obj.homeTeam ?? obj.home ?? obj.HomeName ?? obj.homeTeamName ?? obj.team1 ?? obj.home_team ?? "").toLowerCase().trim();
  const away = String(obj.awayTeam ?? obj.away ?? obj.AwayName ?? obj.awayTeamName ?? obj.team2 ?? obj.away_team ?? "").toLowerCase().trim();

  if (id > 1_000_000 && home && away) {
    // ID > 1 million = sannsynligvis ekte DDI event-ID (8-sifret)
    result.push({ key: `${home}|${away}`, id });
  }

  // Rekurser inn i arrays og objekter
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) result.push(...extractEvents(item, depth + 1));
    } else if (val && typeof val === "object") {
      result.push(...extractEvents(val, depth + 1));
    }
  }

  return result;
}

export async function GET() {
  const errors: string[] = [];

  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal:  AbortSignal.timeout(6000),
        cache:   "no-store",
      });

      if (!res.ok) {
        errors.push(`${url.split("?")[0].split("/").pop()} → HTTP ${res.status}`);
        continue;
      }

      // SportDigi kan returnere msgpack — prøv JSON uansett
      let data: unknown;
      const ct = res.headers.get("content-type") ?? "";
      try {
        data = await res.json();
      } catch {
        errors.push(`${url.split("?")[0].split("/").pop()} → ikke JSON (${ct})`);
        continue;
      }

      const events = extractEvents(data);
      if (events.length > 0) {
        // Dedupliser (behold høyeste ID per lagpar)
        const dedup = new Map<string, number>();
        for (const { key, id } of events) {
          if (!dedup.has(key) || id > dedup.get(key)!) dedup.set(key, id);
        }
        return NextResponse.json({
          events:    [...dedup.entries()].map(([key, id]) => ({ key, id })),
          source:    url.split("?")[0].split("/").pop(),
          total:     dedup.size,
          fetchedAt: new Date().toISOString(),
        });
      }

      errors.push(`${url.split("?")[0].split("/").pop()} → 0 events`);
    } catch (e: unknown) {
      errors.push(`${String(e)}`);
    }
  }

  return NextResponse.json({
    events:    [],
    source:    null,
    fetchedAt: new Date().toISOString(),
    errors,
  });
}
