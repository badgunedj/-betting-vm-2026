import { NextRequest, NextResponse } from "next/server";
import { getTeamForm, getH2H } from "@/lib/api-football";
import { MatchOdds } from "@/lib/odds-api";
import { analyzeMatch } from "@/lib/analyze";
import { findTeamInfo } from "@/lib/team-map";
import { getClubElos } from "@/lib/club-elo";
import { getMatchWeather } from "@/lib/weather";
import { expectedGoalsFromForm, poissonPredict } from "@/lib/poisson";

// Vercel Hobby plan: 10 sek maks — gi hvert kall 3 sek timeout
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const { homeTeam, awayTeam, bankroll, odds, commenceTime, sport } = await req.json();

    const matchOdds: MatchOdds = odds;
    if (!matchOdds || !matchOdds.bookmakers?.length) {
      return NextResponse.json(
        { error: "Ingen odds tilgjengelig for denne kampen ennå" },
        { status: 404 }
      );
    }

    const matchDate = commenceTime
      ? commenceTime.split("T")[0]
      : new Date().toISOString().split("T")[0];

    const isEliteserien = sport === "eliteserien" || sport?.includes("norway");

    const homeInfo = findTeamInfo(homeTeam);
    const awayInfo = findTeamInfo(awayTeam);

    const TIMEOUT = 3500; // 3.5 sek per kall

    // Hent datakilder parallelt med timeout — alle feiler gracefully
    const [homeForm, awayForm, h2h, elo, weather] = await Promise.all([
      homeInfo && isEliteserien
        ? withTimeout(getTeamForm(homeInfo.apiFootballId, homeInfo.leagueId), TIMEOUT, null)
        : Promise.resolve(null),

      awayInfo && isEliteserien
        ? withTimeout(getTeamForm(awayInfo.apiFootballId, awayInfo.leagueId), TIMEOUT, null)
        : Promise.resolve(null),

      homeInfo && awayInfo && isEliteserien
        ? withTimeout(
            getH2H(homeInfo.apiFootballId, awayInfo.apiFootballId),
            TIMEOUT,
            { homeWins: 0, awayWins: 0, draws: 0, matches: [] }
          )
        : Promise.resolve({ homeWins: 0, awayWins: 0, draws: 0, matches: [] }),

      homeInfo && awayInfo && isEliteserien
        ? withTimeout(
            getClubElos(homeInfo.clubEloName, awayInfo.clubEloName),
            TIMEOUT,
            { homeElo: null, awayElo: null, eloDiff: null, eloHomeWinProb: null }
          )
        : Promise.resolve({ homeElo: null, awayElo: null, eloDiff: null, eloHomeWinProb: null }),

      homeInfo && isEliteserien
        ? withTimeout(getMatchWeather(homeInfo.stadiumLat, homeInfo.stadiumLon, matchDate), TIMEOUT, null)
        : Promise.resolve(null),
    ]);

    // Poisson-modell fra sesongstatistikk
    let poissonPred = null;
    if (homeForm && awayForm) {
      const eg = expectedGoalsFromForm(
        homeForm.goalsFor, homeForm.goalsAgainst, homeForm.played,
        awayForm.goalsFor, awayForm.goalsAgainst, awayForm.played
      );
      if (eg) poissonPred = poissonPredict(eg.expectedHome, eg.expectedAway);
    }

    const analysis = await analyzeMatch(
      homeTeam, awayTeam,
      homeForm, awayForm,
      h2h ?? { homeWins: 0, awayWins: 0, draws: 0, matches: [] },
      matchOdds,
      bankroll ?? 5000,
      elo ?? null,
      weather ?? null,
      poissonPred,
      [], // injuries: utelates for å spare tid og API-kvote
      [],
    );

    return NextResponse.json({ analysis, odds: matchOdds });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze error:", msg);
    return NextResponse.json({ error: "Analyse feilet", detail: msg }, { status: 500 });
  }
}
