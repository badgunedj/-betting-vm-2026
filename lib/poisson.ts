// Poisson-modell for fotballprediksjoner
// Bruker lagenes angrepsstyrke/forsvarsstyrke relativt til ligasnitt
// Dixon-Coles-inspirert tilnærming i TypeScript

// Poisson sannsynlighetsmassefunksjon: P(X = k) = e^(-λ) * λ^k / k!
function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

export interface PoissonPrediction {
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  under25: number;
  over15: number;
  under15: number;
  over35: number;
  under35: number;
  bttsYes: number;  // P(hjemme ≥1) × P(borte ≥1) = (1−e^−λH)(1−e^−λA)
  bttsNo: number;
  // Double Chance
  dc1X: number;   // P(hjemme seier eller uavgjort)
  dcX2: number;   // P(uavgjort eller borte seier)
  dc12: number;   // P(hjemme seier eller borte seier) — ingen uavgjort
  // Draw No Bet — normaliser bort uavgjort
  dnbHome: number;
  dnbAway: number;
  // Correct Score — topp 10 scorelines sortert etter sannsynlighet
  topScores: Array<{ score: string; prob: number }>;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
}

// Beregn kamputfall fra forventede mål
export function poissonPredict(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  maxGoals = 8
): PoissonPrediction {
  let homeWin = 0, draw = 0, awayWin = 0;
  let over15 = 0, over25 = 0, over35 = 0;
  const rawScores: Record<string, number> = {};

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(expectedHomeGoals, h) * poissonPMF(expectedAwayGoals, a);
      if (h > a)      homeWin += p;
      else if (h < a) awayWin += p;
      else            draw    += p;
      if (h + a > 1.5) over15 += p;
      if (h + a > 2.5) over25 += p;
      if (h + a > 3.5) over35 += p;
      // Correct Score: samle scorelines opp til 5-5 (tilstrekkelig for topp-10)
      if (h <= 5 && a <= 5) {
        const key = `${h}-${a}`;
        rawScores[key] = (rawScores[key] ?? 0) + p;
      }
    }
  }

  // Normaliser slik at homeWin + draw + awayWin = 1 eksakt
  const total = homeWin + draw + awayWin;
  homeWin /= total;
  draw    /= total;
  awayWin /= total;

  // BTTS: P(hjemme score≥1) × P(borte score≥1) — én linje Poisson-matte
  const bttsYes = (1 - Math.exp(-expectedHomeGoals)) * (1 - Math.exp(-expectedAwayGoals));

  // Double Chance — summer direkte fra normaliserte sannsynligheter
  const dc1X = homeWin + draw;
  const dcX2 = draw + awayWin;
  const dc12 = homeWin + awayWin;

  // Draw No Bet — normaliser bort uavgjort
  const decideTotal = homeWin + awayWin;
  const dnbHome = decideTotal > 0 ? homeWin / decideTotal : 0.5;
  const dnbAway = decideTotal > 0 ? awayWin / decideTotal : 0.5;

  // Correct Score — topp 10 sortert etter sannsynlighet
  const topScores = Object.entries(rawScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([score, prob]) => ({ score, prob }));

  return {
    homeWin,
    draw,
    awayWin,
    over15,
    under15: 1 - over15,
    over25,
    under25: 1 - over25,
    over35,
    under35: 1 - over35,
    bttsYes,
    bttsNo: 1 - bttsYes,
    dc1X,
    dcX2,
    dc12,
    dnbHome,
    dnbAway,
    topScores,
    expectedHomeGoals,
    expectedAwayGoals,
  };
}

/**
 * Asian Handicap sannsynligheter fra Poisson-scorefordeling.
 * @param line - Handikap fra hjemmelagets perspektiv (f.eks. -0.5, 0, -1.0)
 * @returns { homeWin, awayWin, push } — summer til 1
 *
 * Bruk: effektiv sannsynlighet for Kelly/EV = pWin + 0.5 × push
 * (push = innsats returnert = halvt-tap for bettor)
 */
export function poissonAH(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  line: number,         // fra hjemmelag (negativ = hjemme favoritt, f.eks. -0.5)
  maxGoals = 8,
): { homeWin: number; awayWin: number; push: number } {
  let homeWin = 0, push = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(expectedHomeGoals, h) * poissonPMF(expectedAwayGoals, a);
      const diff = h + line - a; // positiv = hjemme AH vinner
      if (diff > 0.001)        homeWin += p;
      else if (diff > -0.001)  push    += p; // ≈ 0 = push (kun mulig ved heltallslinjer)
    }
  }
  return { homeWin, push, awayWin: 1 - homeWin - push };
}

// Eliteserien 2026: faktisk ~1.48 mål per lag per kamp (beregnet fra sesongdata 23. mai 2026)
// NB: var 1.38 (2024/2025) — 2026-sesongen har høyere scoring
const ELITESERIEN_AVG_GOALS = 1.48;

// xG-ligasnitt er lavere enn faktiske mål (~1.43) fordi xG filtrerer ut flaks
// Brukes som referanse når modellen baserer seg på xG fremfor faktiske mål
const XG_LEAGUE_AVG = 1.43;

// Form-multiplikator basert på de siste 5 resultatene
// W=full verdi, D=delvis, L=ingenting — vekter nylig form ±10%
export function formMultiplier(form: string): number {
  if (!form || form.length === 0) return 1.0;
  const recent = form.slice(-5);
  let points = 0;
  for (const c of recent) {
    if (c === "W") points += 3;
    else if (c === "D") points += 1;
    // L = 0 poeng
  }
  const maxPoints = recent.length * 3;
  // Skaler fra 0.88 (LLLLL) til 1.12 (WWWWW)
  return 0.88 + 0.24 * (points / maxPoints);
}

// Utled forventede mål fra sesongstatistikk
// Angreps-/forsvarsstyrke kalkuleres relativt til ligasnitt
// homeForm/awayForm brukes for å vekte siste 5 kamper ekstra
export function expectedGoalsFromForm(
  homeGoalsFor: number,
  homeGoalsAgainst: number,
  homePlayed: number,
  awayGoalsFor: number,
  awayGoalsAgainst: number,
  awayPlayed: number,
  leagueAvg: number = ELITESERIEN_AVG_GOALS,
  homeFormStr: string = "",
  awayFormStr: string = "",
  homeFatigue: number = 1.0,   // < 1.0 = slitent lag (fixture congestion)
  awayFatigue: number = 1.0,
  /** Optional: xG per kamp (fbref). Brukes fremfor faktiske mål når tilgjengelig —
   *  filtrerer ut flaks/uflaks og gir en mer stabil styrkeestimering. */
  homeXgFor?: number,
  homeXgAgainst?: number,
  awayXgFor?: number,
  awayXgAgainst?: number,
): { expectedHome: number; expectedAway: number; usedXG: boolean } | null {
  if (homePlayed < 3 || awayPlayed < 3) return null;

  // Foretrekk xG når tilgjengelig — mer stabil enn faktiske mål (fjerner flaks-støy)
  const usedXG = !!(homeXgFor || awayXgFor);
  const homeGF = homeXgFor     ?? (homeGoalsFor     / homePlayed);
  const homeGA = homeXgAgainst ?? (homeGoalsAgainst / homePlayed);
  const awayGF = awayXgFor     ?? (awayGoalsFor     / awayPlayed);
  const awayGA = awayXgAgainst ?? (awayGoalsAgainst / awayPlayed);

  // Bruk xG-ligasnitt (~1.43) når xG-data er tilgjengelig, faktisk snitt (1.48) ellers.
  // Uten dette brukes feil referanse og relativ styrke blir systematisk undervurdert.
  const effectiveAvg = usedXG ? XG_LEAGUE_AVG : leagueAvg;

  // Angrepsstyrke = mål/xG per kamp relativt til riktig ligasnitt
  const homeAttack  = homeGF / effectiveAvg;
  const homeDefense = homeGA / effectiveAvg;
  const awayAttack  = awayGF / effectiveAvg;
  const awayDefense = awayGA / effectiveAvg;

  // Form-vekting: nylige resultater justerer angrepsstyrken ±12%
  const homeFM = formMultiplier(homeFormStr);
  const awayFM = formMultiplier(awayFormStr);

  // Hjemmefordel: ~15 % boost basert på Eliteserien-historikk
  // fatigue: reduserer angrepsstyrken ved kamp-tetthet (0.90–0.95)
  const expectedHome = homeAttack * homeFM * homeFatigue * awayDefense * effectiveAvg * 1.15;
  const expectedAway = awayAttack * awayFM * awayFatigue * homeDefense * effectiveAvg;

  return {
    expectedHome: Math.max(0.3, Math.min(4.0, expectedHome)),
    expectedAway: Math.max(0.1, Math.min(3.0, expectedAway)),
    usedXG,
  };
}
