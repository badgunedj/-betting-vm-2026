import { NextResponse } from "next/server";

/**
 * Server-side proxy for DDI Frame event IDs.
 * Fetches from sport.ddiframe.com without CORS restrictions.
 * Returns Map-serialised as array: [{ key: "homeTeam|awayTeam", id: number }]
 *
 * BoaBet / DDI Frame partner: 188a1665-3c7b-48aa-a143-6764c719955f
 * Eliteserien: sportId=1, countryId=1388, champId=5106
 */

export const dynamic = "force-dynamic"; // aldri cache — vil alltid ha ferske IDer
export const revalidate = 0;

const DDI_PARTNER = "188a1665-3c7b-48aa-a143-6764c719955f";
const DDI_BASE    = `https://sport.ddiframe.com/${DDI_PARTNER}`;

const ENDPOINTS = [
  `/api/events?sportId=1&countryId=1388&champId=5106&live=0`,
  `/api/v2/events?sportId=1&countryId=1388&champId=5106`,
  `/api/match/list?sport=1&country=1388&champ=5106`,
  `/api/prematch?sportId=1&countryId=1388&champId=5106`,
  `/api/sports/1/events?country=1388&championship=5106`,
];

function extractEvents(data: unknown): Array<{ key: string; id: number }> {
  const list: unknown[] =
    Array.isArray(data)            ? data :
    Array.isArray((data as any)?.data)    ? (data as any).data :
    Array.isArray((data as any)?.events)  ? (data as any).events :
    Array.isArray((data as any)?.matches) ? (data as any).matches :
    Array.isArray((data as any)?.items)   ? (data as any).items :
    [];

  const result: Array<{ key: string; id: number }> = [];
  for (const ev of list) {
    if (typeof ev !== "object" || ev === null) continue;
    const e = ev as Record<string, unknown>;

    // Forsøk alle kjente ID-felter
    const id = Number(
      e.id ?? e.eventId ?? e.matchId ?? e.event_id ?? e.EventId ?? 0
    );
    if (!id) continue;

    // Forsøk alle kjente lagnavn-felter
    const home = String(
      e.homeTeam ?? e.home ?? e.team1 ?? e.HomeName ?? e.home_team ?? ""
    ).toLowerCase().trim();
    const away = String(
      e.awayTeam ?? e.away ?? e.team2 ?? e.AwayName ?? e.away_team ?? ""
    ).toLowerCase().trim();

    if (home && away) {
      result.push({ key: `${home}|${away}`, id });
    }
  }
  return result;
}

export async function GET() {
  const errors: string[] = [];

  for (const ep of ENDPOINTS) {
    try {
      const url = `${DDI_BASE}${ep}`;
      const res = await fetch(url, {
        headers: {
          "Accept":     "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; BettingBot/1.0)",
          "Origin":     "https://play.1-boabet-eu.com",
          "Referer":    "https://play.1-boabet-eu.com/",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });

      if (!res.ok) {
        errors.push(`${ep} → HTTP ${res.status}`);
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        errors.push(`${ep} → non-JSON (${contentType})`);
        continue;
      }

      const data = await res.json();
      const events = extractEvents(data);

      if (events.length > 0) {
        return NextResponse.json({
          events,
          source:    ep,
          fetchedAt: new Date().toISOString(),
        });
      }

      errors.push(`${ep} → 0 events parsed`);
    } catch (e: unknown) {
      errors.push(`${ep} → ${(e as Error).message}`);
    }
  }

  // Alle endpoints feilet — returner tom liste + feilinfo for debugging
  return NextResponse.json(
    {
      events:    [],
      source:    null,
      fetchedAt: new Date().toISOString(),
      errors,
    },
    { status: 200 } // 200 selv ved tom — klienten håndterer fallback
  );
}
