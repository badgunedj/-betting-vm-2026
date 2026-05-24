import { NextResponse } from "next/server";
import {
  getMatchOdds, SPORTS,
  impliedProbability, valueEdge, kellyStake, MAX_BOOKMAKER_MARGIN,
} from "@/lib/odds-api";
import { getTeamStats2026 } from "@/lib/eliteserien-stats";
import { expectedGoalsFromForm, poissonPredict, poissonAH } from "@/lib/poisson";

export const dynamic = "force-dynamic";

// ── Edge-terskler ────────────────────────────────────────────────────────────
const MIN_EDGE_REL      = 0.05;  // 5 % relativ edge (alle markeder)
const MIN_EDGE_ABS      = 0.03;  // 3 pp absolutt edge
const MIN_EDGE_REL_DRAW = 0.08;  // 8 % relativ (uavgjort — høyere støy)
const MIN_EDGE_ABS_DRAW = 0.05;  // 5 pp absolutt (uavgjort)

const BANKROLL = Number(process.env.BETTING_BANKROLL ?? "5000");

export interface DagensTipsBet {
  homeTeam:     string;
  awayTeam:     string;
  commenceTime: string;
  market:       string;
  odds:         number;
  bookmaker:    string;
  ourProb:      number;
  impliedProb:  number;
  edgePct:      number;
  stake:        number;
  evNOK:        number;
  /** true = Pinnacle-kalibrert (PL), false = Poisson-kalibrert (Eliteserien) */
  pinnacleRef?: boolean;
}

// PL ligasnitt for mål-markeder (Over/Under, BTTS) der Pinnacle ikke hjelper
const PL_AVG_HOME = 1.55; // ~2.7 mål/kamp totalt, hjemmefordel 1.15×
const PL_AVG_AWAY = 1.17;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport") ?? "eliteserien";
  const isPL  = sport === "premierleague";

  try {
    const matches = await getMatchOdds(
      isPL ? SPORTS.premierLeague : SPORTS.eliteserien
    ).catch(() => []);

    const now       = Date.now();
    const maxFuture = now + 7 * 24 * 60 * 60 * 1000;
    const results: DagensTipsBet[] = [];

    for (const match of matches) {
      const kickoff = new Date(match.commenceTime).getTime();
      if (kickoff < now || kickoff > maxFuture) continue;

      const bettable = match.bookmakers.filter(
        b => b.bookmaker !== "pinnacle" && b.margin <= MAX_BOOKMAKER_MARGIN
      );
      if (bettable.length === 0) continue;

      // ── Beregn sannsynligheter ──────────────────────────────────────────────
      let pred: ReturnType<typeof poissonPredict>;
      let usedPinnacle = false;

      if (isPL) {
        // ── Premier League: Pinnacle som referanse ─────────────────────────
        // Pinnacle er verdens skarpeste bookmaker (4-5% margin).
        // Margin-justerte sannsynligheter fra Pinnacle er bransjens beste
        // estimat på "sann" sannsynlighet — mye bedre enn ligasnitt.
        // For mål-markeder (over/under, BTTS) bruker vi fortsatt Poisson-ligasnitt
        // siden Pinnacle H2H ikke forteller oss mål-fordelingen.
        if (!match.pinnacleRef) continue; // ingen Pinnacle → hopp over

        const { homeProb, drawProb, awayProb } = match.pinnacleRef;
        const decide = homeProb + awayProb; // uten uavgjort

        // Base: Poisson med ligasnitt for mål-markeder
        const base = poissonPredict(PL_AVG_HOME, PL_AVG_AWAY);

        // Override H2H, DC, DNB med Pinnacle-kalibrerte verdier
        pred = {
          ...base,
          homeWin: homeProb,
          draw:    drawProb,
          awayWin: awayProb,
          dc1X:    homeProb + drawProb,
          dcX2:    drawProb + awayProb,
          dc12:    homeProb + awayProb,
          dnbHome: decide > 0 ? homeProb / decide : 0.5,
          dnbAway: decide > 0 ? awayProb / decide : 0.5,
        };
        usedPinnacle = true;

      } else {
        // ── Eliteserien: team-spesifikke stats + xG + form ─────────────────
        const [hStats, aStats] = await Promise.all([
          getTeamStats2026(match.homeTeam).catch(() => null),
          getTeamStats2026(match.awayTeam).catch(() => null),
        ]);
        if (!hStats || !aStats || hStats.played < 3 || aStats.played < 3) continue;

        const eg = expectedGoalsFromForm(
          hStats.goalsFor, hStats.goalsAgainst, hStats.played,
          aStats.goalsFor, aStats.goalsAgainst, aStats.played,
          1.48,
          hStats.form ?? "",
          aStats.form ?? "",
          1.0, 1.0,
          hStats.xgFor, hStats.xgAgainst,
          aStats.xgFor, aStats.xgAgainst,
        );
        if (!eg) continue;
        pred = poissonPredict(eg.expectedHome, eg.expectedAway);
      }

      // ── Kandidat-markeder (kun BoaBet-tilgjengelige) ──────────────────────
      const candidates: {
        market:   string;
        ourProb:  number;
        odds:     number;
        bookmaker: string;
        isDraw?:  boolean;
      }[] = [
        { market: "Hjemmeseier (1)",  ourProb: pred.homeWin, odds: match.bestHomeWin.odds, bookmaker: match.bestHomeWin.bookmaker },
        { market: "Uavgjort (X)",     ourProb: pred.draw,    odds: match.bestDraw.odds,    bookmaker: match.bestDraw.bookmaker,   isDraw: true },
        { market: "Borteseier (2)",   ourProb: pred.awayWin, odds: match.bestAwayWin.odds, bookmaker: match.bestAwayWin.bookmaker },
        // Over/Under 1.5 og 3.5 — finnes på BoaBet (ikke 2.5)
        ...(match.bestOver15  ? [{ market: "Over 1.5 mål",       ourProb: pred.over15,  odds: match.bestOver15.odds,  bookmaker: match.bestOver15.bookmaker  }] : []),
        ...(match.bestOver35  ? [{ market: "Over 3.5 mål",       ourProb: pred.over35,  odds: match.bestOver35.odds,  bookmaker: match.bestOver35.bookmaker  }] : []),
        // BTTS
        ...(match.bestBttsYes ? [{ market: "BTTS Ja",            ourProb: pred.bttsYes, odds: match.bestBttsYes.odds, bookmaker: match.bestBttsYes.bookmaker }] : []),
        ...(match.bestBttsNo  ? [{ market: "BTTS Nei",           ourProb: pred.bttsNo,  odds: match.bestBttsNo.odds,  bookmaker: match.bestBttsNo.bookmaker  }] : []),
        // Double Chance
        ...(match.bestDc1X    ? [{ market: "Double Chance 1X",   ourProb: pred.dc1X,    odds: match.bestDc1X.odds,    bookmaker: match.bestDc1X.bookmaker    }] : []),
        ...(match.bestDcX2    ? [{ market: "Double Chance X2",   ourProb: pred.dcX2,    odds: match.bestDcX2.odds,    bookmaker: match.bestDcX2.bookmaker    }] : []),
        ...(match.bestDc12    ? [{ market: "Double Chance 12",   ourProb: pred.dc12,    odds: match.bestDc12.odds,    bookmaker: match.bestDc12.bookmaker    }] : []),
        // Draw No Bet
        ...(match.bestDnbHome ? [{ market: "Draw No Bet Hjemme", ourProb: pred.dnbHome, odds: match.bestDnbHome.odds, bookmaker: match.bestDnbHome.bookmaker }] : []),
        ...(match.bestDnbAway ? [{ market: "Draw No Bet Borte",  ourProb: pred.dnbAway, odds: match.bestDnbAway.odds, bookmaker: match.bestDnbAway.bookmaker }] : []),
      ];

      // Asian Handicap
      const expHome = isPL ? PL_AVG_HOME : pred.expectedHomeGoals;
      const expAway = isPL ? PL_AVG_AWAY : pred.expectedAwayGoals;
      if (match.ahLine !== null) {
        const ah = poissonAH(expHome, expAway, match.ahLine);
        const ls = (l: number) => `${l > 0 ? "+" : ""}${l}`;
        if (match.bestAhHome)
          candidates.push({ market: `AH Hjemme (${ls(match.ahLine)})`,  ourProb: ah.homeWin + 0.5 * ah.push, odds: match.bestAhHome.odds, bookmaker: match.bestAhHome.bookmaker });
        if (match.bestAhAway)
          candidates.push({ market: `AH Borte (${ls(-match.ahLine)})`,  ourProb: ah.awayWin + 0.5 * ah.push, odds: match.bestAhAway.odds, bookmaker: match.bestAhAway.bookmaker });
      }

      // ── Filtrer og bygg resultater ────────────────────────────────────────
      for (const c of candidates) {
        if (!c.odds || c.odds <= 1 || !c.ourProb) continue;

        const relEdge  = valueEdge(c.ourProb, c.odds);
        const implProb = impliedProbability(c.odds);
        const absEdge  = c.ourProb - implProb;

        // Uavgjort har høyere terskler (mer støy i draw-prediksjon)
        const minRel = c.isDraw ? MIN_EDGE_REL_DRAW : MIN_EDGE_REL;
        const minAbs = c.isDraw ? MIN_EDGE_ABS_DRAW : MIN_EDGE_ABS;
        if (relEdge < minRel || absEdge < minAbs) continue;

        const stake = kellyStake(BANKROLL, c.ourProb, c.odds);
        if (stake === 0) continue;

        results.push({
          homeTeam:     match.homeTeam,
          awayTeam:     match.awayTeam,
          commenceTime: match.commenceTime,
          market:       c.market,
          odds:         c.odds,
          bookmaker:    c.bookmaker,
          ourProb:      c.ourProb,
          impliedProb:  implProb,
          edgePct:      Math.round(relEdge * 1000) / 10,
          stake,
          evNOK:        Math.round((c.ourProb * c.odds - 1) * stake),
          pinnacleRef:  usedPinnacle,
        });
      }
    }

    results.sort((a, b) => b.edgePct - a.edgePct);

    return NextResponse.json({
      bets:      results,
      total:     results.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Scan error:", e);
    return NextResponse.json({ bets: [], total: 0, scannedAt: new Date().toISOString() });
  }
}
