import Anthropic from "@anthropic-ai/sdk";
import { TeamForm, H2HRecord } from "./api-football";
import { MatchOdds, impliedProbability, kellyStake, valueEdge } from "./odds-api";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const prompt = `Du er en ekspert fotballanalytiker og value-better. Analyser denne kampen og finn bets med positiv expected value (EV).

KAMP: ${homeTeam} vs ${awayTeam}

FORM:
- ${homeTeam}: ${formStr(homeForm)}
- ${awayTeam}: ${formStr(awayForm)}

H2H HISTORIKK (siste møter):
${h2hStr || "Ingen historikk tilgjengelig"}

ODDS FRA BOOKMAKERS:
${oddsStr}
Beste odds Over 2.5: ${odds.bestOver25?.odds ?? "N/A"} (${odds.bestOver25?.bookmaker ?? "-"})

OPPGAVE:
1. Analyser kampens dynamikk basert på form, H2H og lagenes styrker
2. Estimer din egen sannsynlighet for: Hjemmeseier, Uavgjort, Borteseier, Over 2.5 mål
3. Sammenlikn med bookmakers implisitte sannsynlighet
4. Anbefal KUN bets med positiv value (din prob > bookmaker impl. prob)

Svar i dette JSON-formatet:
{
  "summary": "2-3 setninger om kampens dynamikk",
  "homeStrengths": ["styrke1", "styrke2"],
  "awayStrengths": ["styrke1", "styrke2"],
  "keyFactors": ["faktor1", "faktor2", "faktor3"],
  "probabilities": {
    "homeWin": 0.XX,
    "draw": 0.XX,
    "awayWin": 0.XX,
    "over25": 0.XX
  }
}`;

  const response = await client.messages.create({
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

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
  } catch {
    parsed = {
      summary: text.slice(0, 200),
      homeStrengths: [],
      awayStrengths: [],
      keyFactors: [],
      probabilities: { homeWin: 0.4, draw: 0.28, awayWin: 0.32, over25: 0.5 },
    };
  }

  // Bygg betsforslag basert på value
  const bets: BetSuggestion[] = [];
  const prob = parsed.probabilities;

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
    if (!c.odds || c.odds <= 1) continue;
    const edge = valueEdge(c.ourProb, c.odds);
    if (edge < 0.03) continue; // Kun bets med >3% edge

    const confidence: BetSuggestion["confidence"] =
      edge > 0.12 ? "HØY" : edge > 0.06 ? "MEDIUM" : "LAV";

    bets.push({
      market: c.market,
      description: `${homeTeam} vs ${awayTeam} — ${c.market}`,
      odds: c.odds,
      bookmaker: c.bookmaker,
      ourProbability: c.ourProb,
      impliedProbability: impliedProbability(c.odds),
      valueEdgePct: Math.round(edge * 1000) / 10,
      recommendedStake: kellyStake(bankroll, c.ourProb, c.odds),
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
