import { NextRequest, NextResponse } from "next/server";
import { getH2H } from "@/lib/api-football";
import { MatchOdds } from "@/lib/odds-api";
import { analyzeMatch } from "@/lib/analyze";
import { findTeamInfo } from "@/lib/team-map";
import { getClubElos } from "@/lib/club-elo";
import { getMatchWeather } from "@/lib/weather";
import { expectedGoalsFromForm, poissonPredict } from "@/lib/poisson";
import { getNationalEloResult } from "@/lib/national-elo";
import { getTeamStats2026 } from "@/lib/eliteserien-stats";
import { getTeamInjuryReport, injuryReportToString } from "@/lib/injuries";
import { getLatestFootballNews, getRecentResults, getTeamRecentForm } from "@/lib/news-feed";

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

    // For VM: bruk nasjonal-ELO direkte (ingen API-kall, ingen timeout-risiko)
    const nationalElo = !isEliteserien
      ? getNationalEloResult(homeTeam, awayTeam)
      : null;

    // Hent Eliteserien 2026-statistikk direkte (hardkodet + live CSV)
    const [homeStats2026, awayStats2026] = isEliteserien
      ? await Promise.all([
          getTeamStats2026(homeTeam).catch(() => null),
          getTeamStats2026(awayTeam).catch(() => null),
        ])
      : [null, null];

    // Konverter til TeamForm-format for kompatibilitet
    const toTeamForm = (s: typeof homeStats2026, id: number) =>
      s ? { teamId: id, teamName: s.teamName, played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, form: s.form } : null;

    const homeFormFromStats = toTeamForm(homeStats2026, homeInfo?.apiFootballId ?? 0);
    const awayFormFromStats = toTeamForm(awayStats2026, awayInfo?.apiFootballId ?? 0);

    // Skader: hardkodet (ingen nettverkskall), synkront
    const homeInjuryReport = isEliteserien ? getTeamInjuryReport(homeTeam) : null;
    const awayInjuryReport = isEliteserien ? getTeamInjuryReport(awayTeam) : null;
    const homeInjuryStr = homeInjuryReport ? injuryReportToString(homeInjuryReport) : "";
    const awayInjuryStr = awayInjuryReport ? injuryReportToString(awayInjuryReport) : "";

    // Hent datakilder parallelt med timeout — alle feiler gracefully
    const [, , h2h, clubElo, weather, homeNews, awayNews, recentResults] = await Promise.all([
      Promise.resolve(null), // form: bruker 2026-stats istedet
      Promise.resolve(null),

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

      // VG-nyheter for hjemme- og bortelag (gratis RSS)
      isEliteserien
        ? withTimeout(getLatestFootballNews(homeTeam), TIMEOUT, [])
        : Promise.resolve([]),

      isEliteserien
        ? withTimeout(getLatestFootballNews(awayTeam), TIMEOUT, [])
        : Promise.resolve([]),

      // TheSportsDB siste resultater (for form-tekst)
      isEliteserien
        ? withTimeout(getRecentResults(4358), TIMEOUT, [])
        : Promise.resolve([]),
    ]);

    // Kombiner ELO-kilder: nasjonal-ELO for VM, club ELO for Eliteserien
    const elo = nationalElo ?? clubElo;

    // Bygg nyhetskontekst fra VG RSS + TheSportsDB form
    const newsLines: string[] = [];
    if (homeNews.length > 0) {
      newsLines.push(`${homeTeam}:`);
      homeNews.forEach(n => newsLines.push(`  • ${n.title}`));
    }
    if (awayNews.length > 0) {
      newsLines.push(`${awayTeam}:`);
      awayNews.forEach(n => newsLines.push(`  • ${n.title}`));
    }
    if (recentResults.length > 0) {
      const homeFormStr = getTeamRecentForm(recentResults, homeTeam);
      const awayFormStr = getTeamRecentForm(recentResults, awayTeam);
      if (homeFormStr !== "Ingen resultater funnet") newsLines.push(`${homeTeam} siste kamper: ${homeFormStr}`);
      if (awayFormStr !== "Ingen resultater funnet") newsLines.push(`${awayTeam} siste kamper: ${awayFormStr}`);
    }
    const newsStr = newsLines.join("\n");

    // Bruk 2026-stats som primær form-kilde for Eliteserien
    const homeForm = homeFormFromStats;
    const awayForm = awayFormFromStats;

    // Poisson-modell fra 2026-sesongstatistikk (med form-vekting)
    let poissonPred = null;
    if (homeForm && awayForm && homeForm.played >= 3 && awayForm.played >= 3) {
      const eg = expectedGoalsFromForm(
        homeForm.goalsFor, homeForm.goalsAgainst, homeForm.played,
        awayForm.goalsFor, awayForm.goalsAgainst, awayForm.played,
        1.48,                        // 2026-sesongens faktiske ligasnitt
        homeForm.form ?? "",         // form-streng for vekting
        awayForm.form ?? "",
      );
      if (eg) poissonPred = poissonPredict(eg.expectedHome, eg.expectedAway);
    }

    const analysis = await analyzeMatch(
      homeTeam, awayTeam,
      homeForm, awayForm,
      h2h ?? { homeWins: 0, awayWins: 0, draws: 0, matches: [] },
      matchOdds,
      bankroll ?? 5000,
      elo,
      weather ?? null,
      poissonPred,
      homeInjuryStr,
      awayInjuryStr,
      newsStr,
    );

    return NextResponse.json({ analysis, odds: matchOdds });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze error:", msg);
    return NextResponse.json({ error: "Analyse feilet", detail: msg }, { status: 500 });
  }
}
