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
  bttsYes: number;  // P(hjemme ≥1) × P(borte ≥1) = (1−e^−λH)(1−e^−λA)
  bttsNo: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
}

// Beregn kamputfall fra forventede mål
export function poissonPredict(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  maxGoals = 8
): PoissonPrediction {
  let homeWin = 0, draw = 0, awayWin = 0, over25 = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPMF(expectedHomeGoals, h) * poissonPMF(expectedAwayGoals, a);
      if (h > a)      homeWin += p;
      else if (h < a) awayWin += p;
      else            draw    += p;
      if (h + a > 2.5) over25 += p;
    }
  }

  // Normaliser slik at homeWin + draw + awayWin = 1 eksakt
  const total = homeWin + draw + awayWin;
  homeWin /= total;
  draw    /= total;
  awayWin /= total;

  // BTTS: P(hjemme score≥1) × P(borte score≥1) — én linje Poisson-matte
  const bttsYes = (1 - Math.exp(-expectedHomeGoals)) * (1 - Math.exp(-expectedAwayGoals));

  return {
    homeWin,
    draw,
    awayWin,
    over25,
    under25: 1 - over25,
    bttsYes,
    bttsNo: 1 - bttsYes,
    expectedHomeGoals,
    expectedAwayGoals,
  };
}

// Eliteserien 2026: faktisk ~1.48 mål per lag per kamp (beregnet fra sesongdata 23. mai 2026)
// NB: var 1.38 (2024/2025) — 2026-sesongen har høyere scoring
const ELITESERIEN_AVG_GOALS = 1.48;

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
): { expectedHome: number; expectedAway: number } | null {
  if (homePlayed < 3 || awayPlayed < 3) return null;

  // Angrepsstyrke = mål scoret per kamp / ligasnitt
  const homeAttack  = (homeGoalsFor     / homePlayed) / leagueAvg;
  const homeDefense = (homeGoalsAgainst / homePlayed) / leagueAvg;
  const awayAttack  = (awayGoalsFor     / awayPlayed) / leagueAvg;
  const awayDefense = (awayGoalsAgainst / awayPlayed) / leagueAvg;

  // Form-vekting: nylige resultater justerer angrepsstyrken ±12%
  const homeFM = formMultiplier(homeFormStr);
  const awayFM = formMultiplier(awayFormStr);

  // Hjemmefordel: ~15 % boost basert på Eliteserien-historikk
  // fatigue: reduserer angrepsstyrken ved kamp-tetthet (0.90–0.95)
  const expectedHome = homeAttack * homeFM * homeFatigue * awayDefense * leagueAvg * 1.15;
  const expectedAway = awayAttack * awayFM * awayFatigue * homeDefense * leagueAvg;

  return {
    expectedHome: Math.max(0.3, Math.min(4.0, expectedHome)),
    expectedAway: Math.max(0.1, Math.min(3.0, expectedAway)),
  };
}
