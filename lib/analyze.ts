import Anthropic from "@anthropic-ai/sdk";
import { TeamForm, H2HRecord, InjuryReport } from "./api-football";
import { MatchOdds, impliedProbability, kellyStake, valueEdge } from "./odds-api";
import { ClubEloResult } from "./club-elo";
import { MatchWeather } from "./weather";
import { PoissonPrediction } from "./poisson";

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
}

export interface BetSuggestion {
  market: string;
  description: string;
  odds: number;
  bookmaker: string;
  ourProbability: number;
  impliedProbability: number;
  valueEdgePct: number;
  recommendedStake: number;
  confidence: "HØY" | "MEDIUM" | "LAV";
}

export interface MatchAnalysis {
  summary: string;
  homeStrengths: string[];
  awayStrengths: string[];
  keyFactors: string[];
  bets: BetSuggestion[];
  generatedAt: string;
}

export async function analyzeMatch(
  homeTeam: string,
  awayTeam: string,
  homeForm: TeamForm | null,
  awayForm: TeamForm | null,
  h2h: H2HRecord,
  odds: MatchOdds,
  bankroll: number = 5000,
  elo: ClubEloResult | null = null,
  weather: MatchWeather | null = null,
  poisson: PoissonPrediction | null = null,
  homeInjuries: InjuryReport[] = [],
  awayInjuries: InjuryReport[] = [],
): Promise<MatchAnalysis> {

  // ── Bookmaker-konsensus (fjern margin) ──
  const bkProbs = odds.bookmakers.slice(0, 3).filter(b => b.homeWin > 1 && b.awayWin > 1);
  const avgHome = bkProbs.reduce((s, b) => s + 1 / b.homeWin, 0) / (bkProbs.length || 1);
  const avgDraw = bkProbs.reduce((s, b) => s + 1 / b.draw,    0) / (bkProbs.length || 1);
  const avgAway = bkProbs.reduce((s, b) => s + 1 / b.awayWin, 0) / (bkProbs.length || 1);
  const total = avgHome + avgDraw + avgAway;
  const mktHome = (avgHome / total);
  const mktDraw = (avgDraw / total);
  const mktAway = (avgAway / total);
  const mktOver = odds.bestOver25 ? (1 / odds.bestOver25.odds) : null;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  // ── Formstring ──
  const formStr = (f: TeamForm | null) =>
    f
      ? `${f.wins}V-${f.draws}U-${f.losses}T | Mål: ${f.goalsFor}-${f.goalsAgainst} (${f.played} kamper) | Form: ${f.form.slice(-5)}`
      : "Ikke tilgjengelig";

  const h2hStr = h2h.matches
    .slice(0, 4)
    .map(m => `${m.date}: ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam}`)
    .join("\n") || "Ingen H2H-data";

  const oddsStr = odds.bookmakers
    .map(bk => `${bk.bookmaker}: 1=${bk.homeWin} X=${bk.draw > 0 ? bk.draw : "-"} 2=${bk.awayWin}`)
    .join("\n");

  // ── Poisson-seksjon ──
  const poissonSection = poisson
    ? `\nPOISSON-MODELL (statistisk, basert på sesongform):
- Forventede mål: Hjemme ${poisson.expectedHomeGoals.toFixed(2)} | Borte ${poisson.expectedAwayGoals.toFixed(2)}
- Modell-sannsynligheter: Hjemme ${pct(poisson.homeWin)} | Uavgjort ${pct(poisson.draw)} | Borte ${pct(poisson.awayWin)} | Over 2.5: ${pct(poisson.over25)}`
    : "";

  // ── ELO-seksjon ──
  const eloSection = elo?.homeElo && elo?.awayElo
    ? `\nCLUB ELO (styrkerating):
- ${homeTeam}: ${elo.homeElo.toFixed(0)} ELO
- ${awayTeam}: ${elo.awayElo.toFixed(0)} ELO
- Differanse: ${(elo.eloDiff ?? 0) > 0 ? "+" : ""}${(elo.eloDiff ?? 0).toFixed(0)} (ELO-basert hjemmevinnsjanse: ${pct(elo.eloHomeWinProb ?? 0)})`
    : "";

  // ── Værseksjon ──
  const weatherSection = weather
    ? `\nVÆR PÅ KAMPDAG: ${weather.description}${weather.lowGoalRisk ? " ⚠️ Lav-mål-risiko" : ""}`
    : "";

  // ── Skader ──
  const injStr = (injuries: InjuryReport[], team: string) =>
    injuries.length > 0
      ? `${team} mangler: ${injuries.map(i => `${i.playerName} (${i.reason})`).join(", ")}`
      : `${team}: Ingen kjente skader`;

  const injurySection = (homeInjuries.length > 0 || awayInjuries.length > 0)
    ? `\nSKADELISTE:\n${injStr(homeInjuries, homeTeam)}\n${injStr(awayInjuries, awayTeam)}`
    : "";

  const hasGoodData = poisson !== null || elo?.homeElo !== null;

  const prompt = `Du er en profesjonell fotballanalytiker og value-better med fokus på norsk Eliteserien og VM 2026.

KAMP: ${homeTeam} vs ${awayTeam}

═══ STATISTISKE MODELLER ═══${poissonSection}${eloSection}

═══ MARKEDETS KONSENSUS (uten bookmaker-margin) ═══
- Hjemmeseier: ${pct(mktHome)} | Uavgjort: ${pct(mktDraw)} | Borteseier: ${pct(mktAway)}${mktOver ? ` | Over 2.5: ${pct(mktOver)}` : ""}

═══ LAGFORM (sesong 2025) ═══
- ${homeTeam}: ${formStr(homeForm)}
- ${awayTeam}: ${formStr(awayForm)}
${injurySection}
═══ H2H HISTORIKK ═══
${h2hStr}
${weatherSection}

═══ BESTE ODDS ═══
${oddsStr}

═══ INSTRUKSJONER ═══
${hasGoodData
  ? `1. Poisson-modellen og ELO gir et objektivt startpunkt — bruk disse som primærreferanse
2. Juster for skader, form-trend og H2H (maks ±8 prosentpoeng fra Poisson/ELO)
3. Marker høy konfidensHVIS Poisson/ELO og markedet er enige og du ser edge`
  : `1. Markedskonsensus er ankerpunktet — avvik krever sterk begrunnelse
2. Juster kun 2-5 prosentpoeng uten konkrete data
3. Uten god data: vær svært konservativ`}
4. Anbefal KUN bets der din sannsynlighet er minst 5% høyere enn markedets implisitte
5. Vær konservativ — ingen bet er bedre enn et dårlig bet

Trinn 1: Sammenlign Poisson/ELO med markedspriser — er det en divergens?
Trinn 2: Juster for skader og aktuelle form-trend (siste 3-4 kamper)
Trinn 3: Gi din endelige vurdering

Svar KUN i dette JSON-formatet:
{
  "summary": "2-3 setninger om kampen og datagrunnlaget",
  "homeStrengths": ["punkt1", "punkt2"],
  "awayStrengths": ["punkt1", "punkt2"],
  "keyFactors": ["faktor1", "faktor2", "faktor3"],
  "probabilities": {
    "homeWin": 0.XX,
    "draw": 0.XX,
    "awayWin": 0.XX,
    "over25": 0.XX
  }
}`;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  const defaultProbs = { homeWin: mktHome, draw: mktDraw, awayWin: mktAway, over25: mktOver ?? 0.5 };

  let parsed: {
    summary: string;
    homeStrengths: string[];
    awayStrengths: string[];
    keyFactors: string[];
    probabilities: { homeWin: number; draw: number; awayWin: number; over25: number };
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const raw = JSON.parse(jsonMatch?.[0] ?? "{}");
    parsed = {
      summary: raw.summary ?? text.slice(0, 300),
      homeStrengths: raw.homeStrengths ?? [],
      awayStrengths: raw.awayStrengths ?? [],
      keyFactors: raw.keyFactors ?? [],
      probabilities: raw.probabilities ?? defaultProbs,
    };
  } catch {
    parsed = {
      summary: text.slice(0, 300),
      homeStrengths: [],
      awayStrengths: [],
      keyFactors: [],
      probabilities: defaultProbs,
    };
  }

  const prob = parsed.probabilities;

  // ── Bygg betsforslag ──
  const candidates = [
    { market: "Hjemmeseier (1)",  ourProb: prob.homeWin, odds: odds.bestHomeWin.odds, bookmaker: odds.bestHomeWin.bookmaker },
    { market: "Uavgjort (X)",     ourProb: prob.draw,    odds: odds.bestDraw.odds,    bookmaker: odds.bestDraw.bookmaker },
    { market: "Borteseier (2)",   ourProb: prob.awayWin, odds: odds.bestAwayWin.odds, bookmaker: odds.bestAwayWin.bookmaker },
    ...(odds.bestOver25
      ? [{ market: "Over 2.5 mål", ourProb: prob.over25, odds: odds.bestOver25.odds, bookmaker: odds.bestOver25.bookmaker }]
      : []),
  ];

  const bets: BetSuggestion[] = [];
  for (const c of candidates) {
    const ourProb  = Number(c.ourProb);
    const bookOdds = Number(c.odds);
    if (!bookOdds || bookOdds <= 1 || !ourProb || ourProb <= 0 || ourProb >= 1) continue;

    const edge = valueEdge(ourProb, bookOdds);
    if (!isFinite(edge) || isNaN(edge) || edge < 0.03) continue;

    const confidence: BetSuggestion["confidence"] =
      edge > 0.12 ? "HØY" : edge > 0.06 ? "MEDIUM" : "LAV";

    bets.push({
      market: c.market,
      description: `${homeTeam} vs ${awayTeam} — ${c.market}`,
      odds: bookOdds,
      bookmaker: c.bookmaker,
      ourProbability: ourProb,
      impliedProbability: impliedProbability(bookOdds),
      valueEdgePct: Math.round(edge * 1000) / 10,
      recommendedStake: kellyStake(bankroll, ourProb, bookOdds),
      confidence,
    });
  }

  bets.sort((a, b) => b.valueEdgePct - a.valueEdgePct);

  return {
    summary: parsed.summary,
    homeStrengths: parsed.homeStrengths ?? [],
    awayStrengths: parsed.awayStrengths ?? [],
    keyFactors: parsed.keyFactors ?? [],
    bets: bets.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}
