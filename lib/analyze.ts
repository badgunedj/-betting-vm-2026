import Anthropic from "@anthropic-ai/sdk";
import { TeamForm, H2HRecord } from "./api-football";
import { MatchOdds, impliedProbability, kellyStake, valueEdge, MAX_BOOKMAKER_MARGIN } from "./odds-api";
import { ClubEloResult } from "./club-elo";
import { MatchWeather } from "./weather";
import { PoissonPrediction, poissonAH } from "./poisson";

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
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
  evNOK: number;            // forventet gevinst i kr: (prob × odds − 1) × stake
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
  homeInjuryStr: string = "",
  awayInjuryStr: string = "",
  newsStr: string = "",
  kellyFraction: number = 0.25,   // justeres automatisk av drawdown-beskyttelse
): Promise<MatchAnalysis> {
  const pin = odds.pinnacleRef;

  // ── Bookmaker-konsensus (fjern margin) ──
  // KRITISK: filtrer bort bookmakers med draw=0 (unngå 1/0=Infinity som ødelegger alt)
  const bkProbs = odds.bookmakers
    .slice(0, 5)
    .filter(b => b.homeWin > 1 && b.awayWin > 1 && b.draw > 0);

  const safeLen = bkProbs.length || 1;
  const avgHome = bkProbs.reduce((s, b) => s + 1 / b.homeWin, 0) / safeLen;
  const avgDraw = bkProbs.reduce((s, b) => s + 1 / b.draw,    0) / safeLen;
  const avgAway = bkProbs.reduce((s, b) => s + 1 / b.awayWin, 0) / safeLen;
  const total   = avgHome + avgDraw + avgAway || 1; // guard mot 0
  const mktHome = avgHome / total;
  const mktDraw = avgDraw / total;
  const mktAway = avgAway / total;
  const mktOver    = odds.bestOver25   ? (1 / odds.bestOver25.odds)   : null;
  const mktUnder   = odds.bestUnder25  ? (1 / odds.bestUnder25.odds)  : null;
  const mktBttsYes = odds.bestBttsYes  ? (1 / odds.bestBttsYes.odds)  : null;
  const mktBttsNo  = odds.bestBttsNo   ? (1 / odds.bestBttsNo.odds)   : null;

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
    .map(bk => {
      const marginPct = (bk.margin * 100).toFixed(1);
      const flag = bk.bookmaker === "pinnacle"
        ? " [REFERANSE]"
        : bk.margin > MAX_BOOKMAKER_MARGIN
          ? ` [margin ${marginPct}% — IGNORERT]`
          : ` [margin ${marginPct}%]`;
      return `${bk.bookmaker}: 1=${bk.homeWin} X=${bk.draw > 0 ? bk.draw : "-"} 2=${bk.awayWin}${flag}`;
    })
    .join("\n");

  // ── Poisson-seksjon + eksplisitt avvik fra marked ──
  const poissonSection = poisson ? (() => {
    const homeEdge = ((poisson.homeWin - mktHome) * 100).toFixed(1);
    const drawEdge = ((poisson.draw    - mktDraw) * 100).toFixed(1);
    const awayEdge = ((poisson.awayWin - mktAway) * 100).toFixed(1);
    const overEdge = mktOver ? ((poisson.over25  - mktOver)  * 100).toFixed(1) : null;
    const flagHome = Math.abs(poisson.homeWin - mktHome) >= 0.05 ? (poisson.homeWin > mktHome ? " ⬆️ MODELL OVER MARKED" : " ⬇️ MODELL UNDER MARKED") : "";
    const flagDraw = Math.abs(poisson.draw    - mktDraw) >= 0.05 ? (poisson.draw    > mktDraw ? " ⬆️ MODELL OVER MARKED" : " ⬇️ MODELL UNDER MARKED") : "";
    const flagAway = Math.abs(poisson.awayWin - mktAway) >= 0.05 ? (poisson.awayWin > mktAway ? " ⬆️ MODELL OVER MARKED" : " ⬇️ MODELL UNDER MARKED") : "";
    const flagOver = overEdge && Math.abs(poisson.over25 - (mktOver ?? 0)) >= 0.05 ? (poisson.over25 > (mktOver ?? 0) ? " ⬆️ MODELL OVER" : " ⬇️ MODELL UNDER") : "";
    return `\nPOISSON-MODELL (form-vektet, ligasnitt 1.48 mål/lag):
- Forventede mål: Hjemme ${poisson.expectedHomeGoals.toFixed(2)} | Borte ${poisson.expectedAwayGoals.toFixed(2)}
- Modell vs Marked:
  Hjemme: ${pct(poisson.homeWin)} vs ${pct(mktHome)} (avvik: ${Number(homeEdge) > 0 ? "+" : ""}${homeEdge}pp)${flagHome}
  Uavgjort: ${pct(poisson.draw)} vs ${pct(mktDraw)} (avvik: ${Number(drawEdge) > 0 ? "+" : ""}${drawEdge}pp)${flagDraw}
  Borte: ${pct(poisson.awayWin)} vs ${pct(mktAway)} (avvik: ${Number(awayEdge) > 0 ? "+" : ""}${awayEdge}pp)${flagAway}
  Over 2.5: ${pct(poisson.over25)} vs ${mktOver ? pct(mktOver) : "N/A"} (avvik: ${overEdge ? (Number(overEdge) > 0 ? "+" : "") + overEdge + "pp" : "N/A"})${flagOver}`;
  })() : "";

  // ── ELO-seksjon ──
  const hasNationalElo = elo?.homeElo && elo?.awayElo && !poisson; // VM = ingen Poisson
  const eloLabel = hasNationalElo ? "NASJONAL ELO (nøytral bane)" : "CLUB ELO (styrkerating)";
  const eloSection = elo?.homeElo && elo?.awayElo
    ? `\n${eloLabel}:
- ${homeTeam}: ${elo.homeElo.toFixed(0)} ELO
- ${awayTeam}: ${elo.awayElo.toFixed(0)} ELO
- Differanse: ${(elo.eloDiff ?? 0) > 0 ? "+" : ""}${(elo.eloDiff ?? 0).toFixed(0)} → ELO-vinnsjanse: ${pct(elo.eloHomeWinProb ?? 0)}`
    : "";

  // ── Pinnacle-referanselinje ──
  // Pinnacle = verdens skarpeste bookmaker (~4-5% margin). Deres normaliserte
  // sannsynligheter er den beste frie proxy for "sann" markedspris.
  const pinnacleSection = pin
    ? (() => {
        const pct2 = (n: number) => `${(n * 100).toFixed(1)}%`;
        // Sammenlign Pinnacle-probs mot vår Poisson-modell
        const pSignals: string[] = [];
        if (poisson) {
          const hDiff = poisson.homeWin - pin.homeProb;
          const dDiff = poisson.draw    - pin.drawProb;
          const aDiff = poisson.awayWin - pin.awayProb;
          if (Math.abs(hDiff) >= 0.04)
            pSignals.push(`Hjemme: Poisson ${hDiff > 0 ? "+" : ""}${(hDiff*100).toFixed(1)}pp vs Pinnacle`);
          if (Math.abs(dDiff) >= 0.04)
            pSignals.push(`Uavgjort: Poisson ${dDiff > 0 ? "+" : ""}${(dDiff*100).toFixed(1)}pp vs Pinnacle`);
          if (Math.abs(aDiff) >= 0.04)
            pSignals.push(`Borte: Poisson ${aDiff > 0 ? "+" : ""}${(aDiff*100).toFixed(1)}pp vs Pinnacle`);
        }
        return `\n📌 PINNACLE REFERANSE (skarpest i verden, margin ${(pin.margin*100).toFixed(1)}%):
- Odds:  1=${pin.homeWin.toFixed(2)}  X=${pin.draw > 0 ? pin.draw.toFixed(2) : "-"}  2=${pin.awayWin.toFixed(2)}
- Sann prob (margin fjernet): Hjemme ${pct2(pin.homeProb)} | Uavgjort ${pct2(pin.drawProb)} | Borte ${pct2(pin.awayProb)}${
          pSignals.length > 0
            ? `\n- Modell vs Pinnacle: ${pSignals.join(" | ")}`
            : "\n- Modell og Pinnacle er på linje (ingen stor divergens)"
        }`;
      })()
    : "";

  // ── Værseksjon ──
  const weatherSection = weather
    ? `\nVÆR PÅ KAMPDAG: ${weather.description}${weather.lowGoalRisk ? " ⚠️ Lav-mål-risiko" : ""}`
    : "";

  // ── Skader ──
  const injurySection = (homeInjuryStr || awayInjuryStr)
    ? `\nSKADELISTE:\n- ${homeTeam}: ${homeInjuryStr || "Ingen kjente skader"}\n- ${awayTeam}: ${awayInjuryStr || "Ingen kjente skader"}`
    : "";

  // ── Nyheter / kontekst ──
  const newsSection = newsStr
    ? `\n═══ SISTE NYHETER OG KONTEKST ═══\n${newsStr}`
    : "";

  const hasGoodData = poisson !== null || (elo?.homeElo != null);

  // Pre-compute sterkeste signal — dobbelt konfirmert hvis Pinnacle er enig
  const topSignal = (() => {
    if (!poisson) return "";
    const signals: { label: string; diff: number; pinDiff?: number }[] = [
      { label: `Hjemmeseier (${pct(poisson.homeWin)} vs ${pct(mktHome)})`, diff: poisson.homeWin - mktHome, pinDiff: pin ? poisson.homeWin - pin.homeProb : undefined },
      { label: `Uavgjort (${pct(poisson.draw)} vs ${pct(mktDraw)})`,       diff: poisson.draw    - mktDraw, pinDiff: pin ? poisson.draw    - pin.drawProb : undefined },
      { label: `Borteseier (${pct(poisson.awayWin)} vs ${pct(mktAway)})`,  diff: poisson.awayWin - mktAway, pinDiff: pin ? poisson.awayWin - pin.awayProb : undefined },
    ];
    const best = signals.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
    if (Math.abs(best.diff) < 0.04) return "";
    // Dobbelt-konfirmert: Poisson OG Pinnacle peker samme retning
    const pinConfirmed = best.pinDiff !== undefined && Math.sign(best.pinDiff) === Math.sign(best.diff) && Math.abs(best.pinDiff) >= 0.03;
    const badge = pinConfirmed ? "🔥 DOBBELT BEKREFTET (Poisson + Pinnacle)" : "⚡ MODELL-SIGNAL";
    return `\n${badge}: ${best.label} — modell ${best.diff > 0 ? "HØYERE" : "LAVERE"} enn marked med ${Math.abs(best.diff * 100).toFixed(1)}pp${pinConfirmed ? ` | Pinnacle enig (+${Math.abs((best.pinDiff ?? 0) * 100).toFixed(1)}pp)` : ""}`;
  })();

  const prompt = `Du er en kvantitativ fotballanalytiker. Du estimerer RIKTIGE sannsynligheter og identifiserer value.

KAMP: ${homeTeam} vs ${awayTeam}
${topSignal}

═══ STATISTISKE MODELLER ═══${poissonSection}${eloSection}${pinnacleSection}

═══ MARKEDETS KONSENSUS (uten bookmaker-margin) ═══
- Hjemmeseier: ${pct(mktHome)} | Uavgjort: ${pct(mktDraw)} | Borteseier: ${pct(mktAway)}${mktOver ? ` | Over 2.5: ${pct(mktOver)}` : ""}${mktUnder ? ` | Under 2.5: ${pct(mktUnder)}` : ""}${mktBttsYes ? ` | BTTS Ja: ${pct(mktBttsYes)}` : ""}${mktBttsNo ? ` | BTTS Nei: ${pct(mktBttsNo)}` : ""}
- Poisson BTTS: ${poisson ? `Ja=${pct(poisson.bttsYes)} / Nei=${pct(poisson.bttsNo)}` : "N/A"}

═══ LAGFORM (sesong 2026) ═══
- ${homeTeam}: ${formStr(homeForm)}
- ${awayTeam}: ${formStr(awayForm)}
${injurySection}
═══ H2H HISTORIKK ═══
${h2hStr}
${weatherSection}${newsSection}

═══ BESTE ODDS ═══
${oddsStr}

═══ INSTRUKSJONER ═══
${hasGoodData
  ? `POISSON-MODELLEN er ditt primære anker — den er basert på faktiske 2026-sesongdata.
1. Aksepter Poisson-tallene med mindre du har en KONKRET grunn til å avvike (skader, suspensjon av nøkkelspiller, ekstremt H2H).
2. Maksimal justering fra Poisson: ±6 prosentpoeng per utfall — ikke mer.
3. Skader teller: Keeper ute = -3pp hjemme-sannsynlighet. 5+ spillere ute = -5pp.
4. HØY konfidensHVIS: Poisson + ELO peker samme retning OG avviket vs markedet er ≥5pp.`
  : `Markedskonsensus er ankerpunkt — avvik krever konkret begrunnelse. Maks ±4pp justering.`}
5. For Over/Under 2.5: bruk Poisson direkte (expected goals er vist ovenfor).
6. IKKE anbefal bet bare fordi modellen sier det — sjekk om skader/vær overrider.
7. Svar STRIKT i JSON-formatet under — ingen ekstra tekst.

Svar KUN i dette JSON-formatet (ingen tekst utenfor JSON):
{
  "summary": "2-3 setninger om kampen, hva modellen finner og viktigste driver",
  "homeStrengths": ["konkret punkt1", "konkret punkt2"],
  "awayStrengths": ["konkret punkt1", "konkret punkt2"],
  "keyFactors": ["faktor1 med tall", "faktor2 med tall", "faktor3 med tall"],
  "probabilities": {
    "homeWin": 0.XX,
    "draw": 0.XX,
    "awayWin": 0.XX,
    "over25": 0.XX,
    "under25": 0.XX
  }
}`;

  // 7s timeout — Vercel Hobby har 10s totalt; Claude Haiku er vanligvis <3s
  const response = await withTimeout(
    getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1536,  // 1024 kunne bli kappet på lange JSON-svar
      temperature: 0.2,  // lavere variasjon → mer konsistent sannsynlighetsestimering
      messages: [{ role: "user", content: prompt }],
    }),
    7000
  );

  const text = response
    ? (response.content[0].type === "text" ? response.content[0].text : "")
    : "";

  const defaultProbs = {
    homeWin: mktHome,
    draw:    mktDraw,
    awayWin: mktAway,
    over25:  mktOver  ?? (poisson?.over25  ?? 0.5),
    under25: mktUnder ?? (poisson?.under25 ?? 0.5),
  };

  let parsed: {
    summary: string;
    homeStrengths: string[];
    awayStrengths: string[];
    keyFactors: string[];
    probabilities: { homeWin: number; draw: number; awayWin: number; over25: number; under25?: number };
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

  const prob = {
    ...parsed.probabilities,
    under25: parsed.probabilities.under25 ?? (1 - (parsed.probabilities.over25 ?? 0.5)),
  };

  // ── Klampe Claude til Poisson ±6pp (kode-håndhevelse, ikke bare prompt-instruksjon) ──
  if (poisson) {
    const clamp = (v: number, center: number, max = 0.06) =>
      Math.max(center - max, Math.min(center + max, v));
    prob.homeWin = clamp(prob.homeWin, poisson.homeWin);
    prob.draw    = clamp(prob.draw,    poisson.draw);
    prob.awayWin = clamp(prob.awayWin, poisson.awayWin);
    // Over/Under: Poisson score-matrise er mer presis enn AI-estimat — bruk direkte
    prob.over25  = poisson.over25;
    prob.under25 = poisson.under25;
  }

  // ── Bygg betsforslag ──
  const candidates = [
    { market: "Hjemmeseier (1)",  ourProb: prob.homeWin,        odds: odds.bestHomeWin.odds,        bookmaker: odds.bestHomeWin.bookmaker,        isDraw: false },
    { market: "Uavgjort (X)",     ourProb: prob.draw,            odds: odds.bestDraw.odds,            bookmaker: odds.bestDraw.bookmaker,            isDraw: true  },
    { market: "Borteseier (2)",   ourProb: prob.awayWin,         odds: odds.bestAwayWin.odds,         bookmaker: odds.bestAwayWin.bookmaker,         isDraw: false },
    ...(odds.bestOver25
      ? [{ market: "Over 2.5 mål",  ourProb: prob.over25,        odds: odds.bestOver25.odds,          bookmaker: odds.bestOver25.bookmaker,          isDraw: false }]
      : []),
    ...(odds.bestUnder25
      ? [{ market: "Under 2.5 mål", ourProb: prob.under25 ?? (1 - prob.over25), odds: odds.bestUnder25.odds, bookmaker: odds.bestUnder25.bookmaker, isDraw: false }]
      : []),
    // BTTS: Poisson-sannsynlighet er ren matematikk — brukes direkte uten AI-justering
    ...(odds.bestBttsYes && poisson
      ? [{ market: "BTTS Ja",  ourProb: poisson.bttsYes, odds: odds.bestBttsYes.odds, bookmaker: odds.bestBttsYes.bookmaker, isDraw: false }]
      : []),
    ...(odds.bestBttsNo && poisson
      ? [{ market: "BTTS Nei", ourProb: poisson.bttsNo,  odds: odds.bestBttsNo.odds,  bookmaker: odds.bestBttsNo.bookmaker,  isDraw: false }]
      : []),
  ];

  // Asian Handicap — ren Poisson, ingen AI-justering (samme som BTTS)
  // Effektiv sannsynlighet: pWin + 0.5 × push (push = stake returnert)
  if (poisson && odds.ahLine !== null) {
    const ahResult = poissonAH(poisson.expectedHomeGoals, poisson.expectedAwayGoals, odds.ahLine);
    const lineStr = (l: number) => `${l > 0 ? "+" : ""}${l}`;
    if (odds.bestAhHome && ahResult.homeWin + 0.5 * ahResult.push > 0) {
      candidates.push({
        market: `AH Hjemme (${lineStr(odds.ahLine)})`,
        ourProb: ahResult.homeWin + 0.5 * ahResult.push,
        odds: odds.bestAhHome.odds,
        bookmaker: odds.bestAhHome.bookmaker,
        isDraw: false,
      });
    }
    if (odds.bestAhAway && ahResult.awayWin + 0.5 * ahResult.push > 0) {
      candidates.push({
        market: `AH Borte (${lineStr(-odds.ahLine)})`,
        ourProb: ahResult.awayWin + 0.5 * ahResult.push,
        odds: odds.bestAhAway.odds,
        bookmaker: odds.bestAhAway.bookmaker,
        isDraw: false,
      });
    }
  }

  const bets: BetSuggestion[] = [];
  for (const c of candidates) {
    const ourProb  = Number(c.ourProb);
    const bookOdds = Number(c.odds);
    if (!bookOdds || bookOdds <= 1 || !ourProb || ourProb <= 0 || ourProb >= 1) continue;

    const edge = valueEdge(ourProb, bookOdds);
    const impliedProb = impliedProbability(bookOdds);
    const absoluteEdge = ourProb - impliedProb;

    // Draw-bets er notorisk vanskelig å predikere — krev høyere terskel
    const relThreshold = c.isDraw ? 0.08 : 0.05;
    const absThreshold = c.isDraw ? 0.05 : 0.03;

    if (!isFinite(edge) || isNaN(edge) || edge < relThreshold) continue;
    if (absoluteEdge < absThreshold) continue;

    // Pinnacle-konfirmasjon: sjekk om Pinnacle er enig med vår modell
    const pinProb = (() => {
      if (!pin) return null;
      if (c.market.includes("Hjemme")) return pin.homeProb;
      if (c.market.includes("Uavgjort")) return pin.drawProb;
      if (c.market.includes("Borte")) return pin.awayProb;
      return null;
    })();
    // Dobbelt bekreftet: vår prob > Pinnacle prob > implied prob (alle peker samme vei)
    const pinnacleConfirmed = pinProb !== null && pinProb > impliedProb && ourProb > pinProb;

    const confidence: BetSuggestion["confidence"] =
      pinnacleConfirmed && absoluteEdge > 0.05 ? "HØY"   // Poisson + Pinnacle begge over bookmaker
      : edge > 0.15 && absoluteEdge > 0.07 ? "HØY"
      : edge > 0.09 && absoluteEdge > 0.05 ? "MEDIUM"
      : "LAV";

    const stake = kellyStake(bankroll, ourProb, bookOdds, kellyFraction);
    // Kelly returnerer 0 hvis beregnet stake er under 100kr (edge for marginal)
    if (stake === 0) continue;
    // EV i NOK: forventet netto gevinst per bet = (prob × odds − 1) × innsats
    const evNOK = Math.round((ourProb * bookOdds - 1) * stake);

    bets.push({
      market: c.market,
      description: `${homeTeam} vs ${awayTeam} — ${c.market}`,
      odds: bookOdds,
      bookmaker: c.bookmaker,
      ourProbability: ourProb,
      impliedProbability: impliedProbability(bookOdds),
      valueEdgePct: Math.round(edge * 1000) / 10,
      recommendedStake: stake,
      evNOK,
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
