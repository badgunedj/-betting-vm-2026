import Anthropic from "@anthropic-ai/sdk";
import { TeamForm, H2HRecord } from "./api-football";
import { MatchOdds, impliedProbability, kellyStake, valueEdge } from "./odds-api";

// Klient lages ved kall-tidspunkt slik at env-variabelen er tilgjengelig
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
  bankroll: number = 5000
): Promise<MatchAnalysis> {
  const formStr = (f: TeamForm | null) =>
    f
      ? `${f.wins}V-${f.draws}U-${f.losses}T | Mål: ${f.goalsFor}-${f.goalsAgainst} | Form: ${f.form.slice(-5)}`
      : "Ikke tilgjengelig";

  const oddsStr = odds.bookmakers
    .map(
      (bk) =>
        `${bk.bookmaker}: Hjemme ${bk.homeWin} | Uavgjort ${bk.draw} | Borte ${bk.awayWin}`
    )
    .join("\n");

  const h2hStr = h2h.matches
    .slice(0, 4)
    .map((m) => `${m.date}: ${m.homeTeam} ${m.homeGoals}-${m.awayGoals} ${m.awayTeam}`)
    .join("\n");

  // Beregn bookmaker-konsensus (fjern margin ~5%) som ankerpunkt
  const bkProbs = odds.bookmakers.slice(0, 3);
  const avgHome = bkProbs.reduce((s,b) => s + 1/b.homeWin, 0) / bkProbs.length;
  const avgDraw = bkProbs.reduce((s,b) => s + 1/b.draw, 0) / bkProbs.length;
  const avgAway = bkProbs.reduce((s,b) => s + 1/b.awayWin, 0) / bkProbs.length;
  const total = avgHome + avgDraw + avgAway;
  const mktHome = (avgHome/total).toFixed(3);
  const mktDraw = (avgDraw/total).toFixed(3);
  const mktAway = (avgAway/total).toFixed(3);
  const mktOver = odds.bestOver25 ? (1/odds.bestOver25.odds).toFixed(3) : "ukjent";

  const hasForm = homeForm !== null || awayForm !== null;

  const prompt = `Du er en profesjonell fotballanalytiker og value-better med fokus på norsk Eliteserien og VM.

KAMP: ${homeTeam} vs ${awayTeam}

MARKEDETS KONSENSUS (bookmaker-odds uten margin):
- Hjemmeseier (${homeTeam}): ${mktHome} (${(parseFloat(mktHome)*100).toFixed(1)}%)
- Uavgjort: ${mktDraw} (${(parseFloat(mktDraw)*100).toFixed(1)}%)
- Borteseier (${awayTeam}): ${mktAway} (${(parseFloat(mktAway)*100).toFixed(1)}%)
- Over 2.5 mål: ${mktOver}

${hasForm ? `LAGFORM (sesong 2025):
- ${homeTeam}: ${formStr(homeForm)}
- ${awayTeam}: ${formStr(awayForm)}` : `MERK: Ingen form-data tilgjengelig. Bruk markedsprisene som primærkilde.`}

H2H HISTORIKK:
${h2hStr || "Ikke tilgjengelig"}

ODDS TILGJENGELIG:
${oddsStr}

INSTRUKSJONER:
1. Bruk markedskonsensus som ANKERPUNKT — avvik krever sterk begrunnelse
2. Juster kun 2-8 prosentpoeng fra markedet hvis du har konkret informasjon
3. Uten form/H2H-data: hold deg svært nær markedsprisene
4. Anbefal KUN bets der din sannsynlighet er minst 5% høyere enn markedets
5. Vær konservativ — det er bedre å ikke bette enn å bette uten edge

Svar KUN i dette JSON-formatet (ingen tekst utenfor JSON):
{
  "summary": "2-3 setninger om kampen og datagrunnlaget",
  "homeStrengths": ["punkt1", "punkt2"],
  "awayStrengths": ["punkt1", "punkt2"],
  "keyFactors": ["faktor1", "faktor2"],
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

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  let parsed: {
    summary: string;
    homeStrengths: string[];
    awayStrengths: string[];
    keyFactors: string[];
    probabilities: {
      homeWin: number;
      draw: number;
      awayWin: number;
      over25: number;
    };
  };

  const defaultParsed = {
    summary: "Analyse fullført.",
    homeStrengths: [] as string[],
    awayStrengths: [] as string[],
    keyFactors: [] as string[],
    probabilities: { homeWin: 0.4, draw: 0.28, awayWin: 0.32, over25: 0.5 },
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const raw = JSON.parse(jsonMatch?.[0] ?? "{}");
    parsed = {
      summary: raw.summary ?? text.slice(0, 300),
      homeStrengths: raw.homeStrengths ?? [],
      awayStrengths: raw.awayStrengths ?? [],
      keyFactors: raw.keyFactors ?? [],
      probabilities: raw.probabilities ?? defaultParsed.probabilities,
    };
  } catch {
    parsed = { ...defaultParsed, summary: text.slice(0, 300) };
  }

  // Bygg betsforslag basert på value
  const bets: BetSuggestion[] = [];
  const prob = parsed.probabilities ?? defaultParsed.probabilities;

  const candidates = [
    {
      market: "Hjemmeseier (1)",
      ourProb: prob.homeWin,
      odds: odds.bestHomeWin.odds,
      bookmaker: odds.bestHomeWin.bookmaker,
    },
    {
      market: "Uavgjort (X)",
      ourProb: prob.draw,
      odds: odds.bestDraw.odds,
      bookmaker: odds.bestDraw.bookmaker,
    },
    {
      market: "Borteseier (2)",
      ourProb: prob.awayWin,
      odds: odds.bestAwayWin.odds,
      bookmaker: odds.bestAwayWin.bookmaker,
    },
    ...(odds.bestOver25
      ? [
          {
            market: "Over 2.5 mål",
            ourProb: prob.over25,
            odds: odds.bestOver25.odds,
            bookmaker: odds.bestOver25.bookmaker,
          },
        ]
      : []),
  ];

  for (const c of candidates) {
    const ourProb = Number(c.ourProb);
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
    bets: bets.slice(0, 3), // maks 3 bets per kamp
    generatedAt: new Date().toISOString(),
  };
}
