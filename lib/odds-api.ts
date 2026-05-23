const BASE_URL = "https://api.the-odds-api.com/v4";
const KEY = process.env.ODDS_API_KEY!;

// Bookmakers med margin > dette ignoreres som bet-mål (for grisk)
export const MAX_BOOKMAKER_MARGIN = 0.08; // 8 %

export interface BookmakerOdds {
  bookmaker: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number | null;
  under25: number | null;
  bttsYes: number | null;
  bttsNo:  number | null;
  margin: number;   // overround: 1/H + 1/X + 1/A − 1
}

// Pinnacle har verdens laveste margin (~4-5%) og regnes som "sann pris" av profesjonelle
// Brukes som referanse for å vurdere edge — ikke for å plassere bet (blokkert i Norge)
export interface PinnacleRef {
  homeWin: number;   // råodds
  draw: number;
  awayWin: number;
  homeProb: number;  // normalisert implisitt sannsynlighet (margin fjernet)
  drawProb: number;
  awayProb: number;
  margin: number;    // bookmaker-margin, f.eks. 0.045 = 4.5%
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
  bestOver25:   { odds: number; bookmaker: string } | null;
  bestUnder25:  { odds: number; bookmaker: string } | null;
  bestBttsYes:  { odds: number; bookmaker: string } | null;
  bestBttsNo:   { odds: number; bookmaker: string } | null;
  pinnacleRef: PinnacleRef | null;   // null hvis Pinnacle ikke har odds for kampen
  /** Asian Handicap — beste linje fra bettable bookmakers.
   *  ahLine er fra hjemmelagets perspektiv (f.eks. -0.5 = hjemme gir 0.5 mål) */
  ahLine:      number | null;
  bestAhHome:  { odds: number; bookmaker: string } | null;
  bestAhAway:  { odds: number; bookmaker: string } | null;
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

  // Beregnet stake under 100kr → edge er for marginal til å rettferdiggjøre bet
  // Returnerer 0 fremfor å overbet (4× Kelly ved minimum)
  if (stake < 100) return 0;

  // Rund til nærmeste 50 kr for enklere betting
  return Math.round(stake / 50) * 50;
}

// Hent odds fra The Odds API
export async function getMatchOdds(sport: string): Promise<MatchOdds[]> {
  const bookmakerList = BOOKMAKERS.join(",");

  // Hent 1X2 + totals + BTTS + Asian Handicap parallelt
  const [h2hRes, totalsRes, bttsRes, ahRes] = await Promise.all([
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=h2h&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } } // cache 15 min
    ),
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=totals&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } }
    ),
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=btts&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } }
    ),
    fetch(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${KEY}&regions=eu&markets=asian_handicap&bookmakers=${bookmakerList}&oddsFormat=decimal`,
      { next: { revalidate: 900 } }
    ).catch(() => null), // AH er ikke tilgjengelig for alle sports/bookmakers
  ]);

  const [h2hData, totalsData, bttsData, ahData] = await Promise.all([
    h2hRes.json(),
    totalsRes.json(),
    bttsRes.json(),
    ahRes ? ahRes.json().catch(() => null) : Promise.resolve(null),
  ]);

  // Rå AH-data: event.id → liste over {line, homeOdds, awayOdds, bookmaker}
  // Linje-valget gjøres per-event etter at vi kjenner bettable bookmakers
  type AHEntry = { line: number; homeOdds: number; awayOdds: number; bookmaker: string };
  const ahRaw = new Map<string, AHEntry[]>();
  if (Array.isArray(ahData)) {
    for (const event of ahData) {
      const entries: AHEntry[] = [];
      for (const bk of event.bookmakers ?? []) {
        if (bk.key === "pinnacle") continue; // alltid ekskluder Pinnacle fra AH bet-mål
        const mkt = bk.markets?.find((m: { key: string }) => m.key === "asian_handicap");
        if (!mkt) continue;
        const homeOut = mkt.outcomes?.find((o: { name: string; point?: number; price?: number }) => o.name === event.home_team);
        const awayOut = mkt.outcomes?.find((o: { name: string; point?: number; price?: number }) => o.name === event.away_team);
        if (!homeOut || !awayOut || homeOut.point === undefined) continue;
        entries.push({
          line: homeOut.point,          // hjemmelagets handicap (negativ = favoritt)
          homeOdds: homeOut.price,
          awayOdds: awayOut.price,
          bookmaker: bk.key,
        });
      }
      if (entries.length > 0) ahRaw.set(event.id, entries);
    }
  }

  if (!Array.isArray(h2hData)) return [];

  // Bygg separate beste-over / beste-under maps — beste odds per marked på tvers av bookmakers
  // (tidl. feil: tok første bookmaker, ikke beste odds)
  const bestOverMap  = new Map<string, { odds: number; bookmaker: string }>();
  const bestUnderMap = new Map<string, { odds: number; bookmaker: string }>();
  if (Array.isArray(totalsData)) {
    for (const event of totalsData) {
      for (const bk of event.bookmakers ?? []) {
        if (bk.key === "pinnacle") continue; // referanse-only
        const market = bk.markets?.find((m: { key: string }) => m.key === "totals");
        if (!market) continue;
        const over  = market.outcomes?.find((o: { name: string }) => o.name === "Over")?.price;
        const under = market.outcomes?.find((o: { name: string }) => o.name === "Under")?.price;
        if (over) {
          const cur = bestOverMap.get(event.id);
          if (!cur || over > cur.odds) bestOverMap.set(event.id, { odds: over, bookmaker: bk.key });
        }
        if (under) {
          const cur = bestUnderMap.get(event.id);
          if (!cur || under > cur.odds) bestUnderMap.set(event.id, { odds: under, bookmaker: bk.key });
        }
      }
    }
  }

  // Bygg BTTS-map: beste "Ja"- og "Nei"-odds per kamp på tvers av bookmakers
  const bttsYesMap = new Map<string, { odds: number; bookmaker: string }>();
  const bttsNoMap  = new Map<string, { odds: number; bookmaker: string }>();
  if (Array.isArray(bttsData)) {
    for (const event of bttsData) {
      for (const bk of event.bookmakers ?? []) {
        const market = bk.markets?.find((m: { key: string }) => m.key === "btts");
        if (!market) continue;
        const yes = market.outcomes?.find((o: { name: string }) => o.name === "Yes")?.price;
        const no  = market.outcomes?.find((o: { name: string }) => o.name === "No")?.price;
        if (yes) {
          const cur = bttsYesMap.get(event.id);
          if (!cur || yes > cur.odds) bttsYesMap.set(event.id, { odds: yes, bookmaker: bk.key });
        }
        if (no) {
          const cur = bttsNoMap.get(event.id);
          if (!cur || no > cur.odds) bttsNoMap.set(event.id, { odds: no, bookmaker: bk.key });
        }
      }
    }
  }

  return h2hData.map((event) => {
    const bookmakers: BookmakerOdds[] = [];
    // Hent beste over/under for dette eventet (nå korrekt: beste odds, ikke første bookmaker)
    const eventBestOver  = bestOverMap.get(event.id)?.odds  ?? null;
    const eventBestUnder = bestUnderMap.get(event.id)?.odds ?? null;

    for (const bk of event.bookmakers ?? []) {
      const market = bk.markets?.find((m: { key: string }) => m.key === "h2h");
      if (!market) continue;
      const outcomes = market.outcomes ?? [];
      const home = outcomes.find((o: { name: string }) => o.name === event.home_team)?.price;
      const away = outcomes.find((o: { name: string }) => o.name === event.away_team)?.price;
      const draw = outcomes.find((o: { name: string }) => o.name === "Draw")?.price;
      if (!home || !away) continue;

      // BTTS-odds er event-nivå (beste på tvers av bookmakers) — vises i alle rader
      const bestYes = bttsYesMap.get(event.id);
      const bestNo  = bttsNoMap.get(event.id);
      // Margin = sum av implisitte sannsynligheter − 1 (én beregning per bookmaker)
      const margin = 1 / home + (draw ? 1 / draw : 0) + 1 / away - 1;
      bookmakers.push({
        bookmaker: bk.key,
        homeWin: home,
        draw: draw ?? 0,
        awayWin: away,
        over25:  eventBestOver,
        under25: eventBestUnder,
        bttsYes: bestYes ? bestYes.odds : null,
        bttsNo:  bestNo  ? bestNo.odds  : null,
        margin,
      });
    }

    // Bare bookmakers som er tilgjengelig i Norge OG har akseptabel margin
    // Pinnacle ekskluderes alltid fra bet-mål (blokkert + referanse-only)
    const bettable = bookmakers.filter(
      b => b.bookmaker !== "pinnacle" && b.margin <= MAX_BOOKMAKER_MARGIN
    );
    // Fallback: bruk alle ikke-Pinnacle hvis alle har for høy margin
    const betSource = bettable.length > 0
      ? bettable
      : bookmakers.filter(b => b.bookmaker !== "pinnacle");

    const best = (key: keyof BookmakerOdds) =>
      betSource.reduce(
        (acc, bk) => {
          const val = bk[key] as number;
          return val > acc.odds ? { odds: val, bookmaker: bk.bookmaker } : acc;
        },
        { odds: 0, bookmaker: "" }
      );

    // ── Asian Handicap: beste linje blant bettable bookmakers ──
    const bettableKeys = new Set(bettable.map(b => b.bookmaker));
    const eventAH = (ahRaw.get(event.id) ?? []).filter(d => bettableKeys.has(d.bookmaker));
    let ahLine: number | null = null;
    let bestAhHome: { odds: number; bookmaker: string } | null = null;
    let bestAhAway: { odds: number; bookmaker: string } | null = null;

    if (eventAH.length > 0) {
      // Finn vanligste linje (mest likvid)
      const lineFreq = new Map<number, number>();
      for (const d of eventAH) lineFreq.set(d.line, (lineFreq.get(d.line) ?? 0) + 1);
      ahLine = [...lineFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];

      // Beste home- og away-odds ved den valgte linjen
      for (const d of eventAH.filter(d => d.line === ahLine)) {
        if (!bestAhHome || d.homeOdds > bestAhHome.odds)
          bestAhHome = { odds: d.homeOdds, bookmaker: d.bookmaker };
        if (!bestAhAway || d.awayOdds > bestAhAway.odds)
          bestAhAway = { odds: d.awayOdds, bookmaker: d.bookmaker };
      }
    }

    // Trekk ut Pinnacle separat som referanselinje (skarpeste odds i verden)
    // Normaliser probabilitetene slik at margin fjernes → "sann" markedspris
    let pinnacleRef: PinnacleRef | null = null;
    const pinBk = event.bookmakers?.find((b: { key: string }) => b.key === "pinnacle");
    if (pinBk) {
      const pinMkt = pinBk.markets?.find((m: { key: string }) => m.key === "h2h");
      if (pinMkt) {
        const pinOutcomes = pinMkt.outcomes ?? [];
        const pH = pinOutcomes.find((o: { name: string }) => o.name === event.home_team)?.price;
        const pA = pinOutcomes.find((o: { name: string }) => o.name === event.away_team)?.price;
        const pD = pinOutcomes.find((o: { name: string }) => o.name === "Draw")?.price;
        if (pH && pA) {
          const rawH = 1 / pH;
          const rawD = pD ? 1 / pD : 0;
          const rawA = 1 / pA;
          const total = rawH + rawD + rawA;
          const margin = total - 1;
          pinnacleRef = {
            homeWin: pH,
            draw:    pD ?? 0,
            awayWin: pA,
            homeProb: rawH / total,
            drawProb: rawD / total,
            awayProb: rawA / total,
            margin,
          };
        }
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
      bestOver25:   bestOverMap.get(event.id)  ?? null,
      bestUnder25:  bestUnderMap.get(event.id) ?? null,
      bestBttsYes:  bttsYesMap.get(event.id) ?? null,
      bestBttsNo:   bttsNoMap.get(event.id)  ?? null,
      pinnacleRef,
      ahLine,
      bestAhHome,
      bestAhAway,
    };
  });
}

// Sport-keys for The Odds API
export const SPORTS = {
  eliteserien: "soccer_norway_eliteserien",
  premierLeague: "soccer_epl",
  worldCup: "soccer_fifa_world_cup",
};
