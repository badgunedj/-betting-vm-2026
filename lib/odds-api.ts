const BASE_URL = "https://api.the-odds-api.com/v4";
const KEY = process.env.ODDS_API_KEY!;

export interface BookmakerOdds {
  bookmaker: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number | null;
  under25: number | null;
}

export interface MatchOdds {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmakers: BookmakerOdds[];
  bestHomeWin: { odds: number; bookmaker: string };
  bestDraw: { odds: number; bookmaker: string };
  bestAwayWin: { odds: number; bookmaker: string };
  bestOver25:  { odds: number; bookmaker: string } | null;
  bestUnder25: { odds: number; bookmaker: string } | null;
}

// Bookmakers tilgjengelig for norske spillere (oppdatert mai 2026)
// Unibet: forlot Norge nov. 2024 | Pinnacle: blokkert i Norge
// NordicBet + Betsson (Betsson Group) er fortsatt tilgjengelig
// Betway: internasjonalt, godtar norske spillere
const BOOKMAKERS = ["nordicbet", "betsson", "betway", "pinnacle"];

// Beregn implisitt sannsynlighet (fjern margin)
export function impliedProbability(odds: number): number {
  return 1 / odds;
}

// Finn value edge: vår estimat vs bookmaker odds
export function valueEdge(ourProb: number, bookmakerOdds: number): number {
  const impliedProb = impliedProbability(bookmakerOdds);
  return (ourProb - impliedProb) / impliedProb;
}

// Kelly criterion for optimal innsatsstørrelse
// VIKTIG: returnerer 0 hvis Kelly er negativ (ingen edge) — aldri bet på negativ EV!
export function kellyStake(
  bankroll: number,
  ourProb: number,
  odds: number,
  fraction: number = 0.25 // bruk 25% Kelly for sikkerhet
): number {
  const b = odds - 1;
  const q = 1 - ourProb;
  const kelly = (b * ourProb - q) / b;

  // Negativ Kelly = ingen edge = IKKE BET
  if (kelly <= 0) return 0;

  const stake = kelly * fraction * bankroll;

  // Minimum 100kr (ikke 50 — for lavt til å ha verdi etter margin)
  if (stake < 100) return 100;

  // Rund til nærmeste 50 kr for enklere betting
  return Math.round(stake / 50) * 50;
}

// Hent odds fra The Odds API
export async function getMatchOdds(sport: string): Promise<MatchOdds[]> {
  const bookmakerList = BOOKMAKERS.join(",");

  // Hent 1X2 odds
  const [h2hRes, totalsRes] = await Promise.all([
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=h2h&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } } // cache 15 min
    ),
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=totals&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } }
    ),
  ]);

  const [h2hData, totalsData] = await Promise.all([
    h2hRes.json(),
    totalsRes.json(),
  ]);

  if (!Array.isArray(h2hData)) return [];

  // Bygg totals-map for rask oppslag (best over OG best under per kamp)
  const totalsMap = new Map<string, { over: number; under: number; bk: string }>();
  if (Array.isArray(totalsData)) {
    for (const event of totalsData) {
      for (const bk of event.bookmakers ?? []) {
        const market = bk.markets?.find((m: { key: string }) => m.key === "totals");
        if (!market) continue;
        const over = market.outcomes?.find((o: { name: string }) => o.name === "Over")?.price;
        const under = market.outcomes?.find((o: { name: string }) => o.name === "Under")?.price;
        if (over && under && !totalsMap.has(event.id)) {
          totalsMap.set(event.id, { over, under, bk: bk.key });
        }
      }
    }
  }

  return h2hData.map((event) => {
    const bookmakers: BookmakerOdds[] = [];
    const totals = totalsMap.get(event.id);

    for (const bk of event.bookmakers ?? []) {
      const market = bk.markets?.find((m: { key: string }) => m.key === "h2h");
      if (!market) continue;
      const outcomes = market.outcomes ?? [];
      const home = outcomes.find((o: { name: string }) => o.name === event.home_team)?.price;
      const away = outcomes.find((o: { name: string }) => o.name === event.away_team)?.price;
      const draw = outcomes.find((o: { name: string }) => o.name === "Draw")?.price;
      if (!home || !away) continue;

      bookmakers.push({
        bookmaker: bk.key,
        homeWin: home,
        draw: draw ?? 0,
        awayWin: away,
        over25: totals?.over ?? null,
        under25: totals?.under ?? null,
      });
    }

    const best = (key: keyof BookmakerOdds) =>
      bookmakers.reduce(
        (best, bk) => {
          const val = bk[key] as number;
          return val > best.odds ? { odds: val, bookmaker: bk.bookmaker } : best;
        },
        { odds: 0, bookmaker: "" }
      );

    // Finn beste under25-odds på tvers av bookmakers
    let bestUnder: { odds: number; bookmaker: string } | null = null;
    for (const bk of bookmakers) {
      if (bk.under25 && bk.under25 > 1 && (!bestUnder || bk.under25 > bestUnder.odds)) {
        bestUnder = { odds: bk.under25, bookmaker: bk.bookmaker };
      }
    }

    return {
      matchId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bookmakers,
      bestHomeWin: best("homeWin"),
      bestDraw: best("draw"),
      bestAwayWin: best("awayWin"),
      bestOver25:  totals ? { odds: totals.over,  bookmaker: totals.bk } : null,
      bestUnder25: bestUnder,
    };
  });
}

// Sport-keys for The Odds API
export const SPORTS = {
  eliteserien: "soccer_norway_eliteserien",
  premierLeague: "soccer_epl",
  worldCup: "soccer_fifa_world_cup",
};
