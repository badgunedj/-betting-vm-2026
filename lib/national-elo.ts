// Nasjonal-ELO ratings for VM 2026-deltakere
// Kilde: World Football Elo Ratings (eloratings.net) — oppdatert mai 2026
// VM 2026: 48 lag, nøytral bane (USA/Canada/Mexico) — ingen hjemmefordel i ELO-formelen

import { ClubEloResult } from "./club-elo";

// ELO-ratings for alle 48 VM 2026-lag
const NATIONAL_ELO: Record<string, number> = {
  // ── Topp (>1950) ──
  "Argentina":         2065,
  "France":            2010,
  "Brazil":            1990,
  "England":           1978,
  "Spain":             1972,
  "Germany":           1958,

  // ── Veldig sterke (1900–1950) ──
  "Portugal":          1945,
  "Netherlands":       1938,
  "Italy":             1922,
  "Croatia":           1912,
  "Belgium":           1905,
  "Switzerland":       1898,

  // ── Sterke (1820–1900) ──
  "Denmark":           1882,
  "Morocco":           1862,
  "Uruguay":           1858,
  "Colombia":          1850,
  "Canada":            1842,
  "Mexico":            1838,
  "Austria":           1832,
  "Ukraine":           1830,
  "Norway":            1826,
  "USA":               1822,
  "Serbia":            1818,
  "Turkey":            1814,
  "Japan":             1808,
  "Senegal":           1798,
  "Scotland":          1792,
  "Hungary":           1788,
  "Poland":            1798,
  "Czech Republic":    1810,
  "Wales":             1808,
  "Chile":             1796,
  "Sweden":            1788,
  "Romania":           1768,
  "Slovakia":          1762,

  // ── Gode (1700–1820) ──
  "South Korea":       1768,
  "Ecuador":           1752,
  "Australia":         1746,
  "Venezuela":         1718,
  "Nigeria":           1718,
  "Ivory Coast":       1715,
  "Iceland":           1718,
  "Algeria":           1692,
  "Iran":              1690,
  "Tunisia":           1668,
  "Peru":              1698,
  "Uzbekistan":        1695,
  "Bosnia and Herzegovina": 1748,
  "Greece":            1750,
  "Slovenia":          1748,
  "Paraguay":          1672,
  "Ghana":             1682,
  "Egypt":             1680,
  "Iraq":              1680,
  "Cameroon":          1678,
  "Saudi Arabia":      1678,
  "Costa Rica":        1680,
  "Albania":           1712,
  "North Macedonia":   1680,
  "Finland":           1720,
  "Israel":            1688,
  "Georgia":           1682,

  // ── Middels (1600–1700) ──
  "Panama":            1662,
  "New Zealand":       1612,
  "South Africa":      1648,
  "Jordan":            1658,
  "DR Congo":          1648,
  "Honduras":          1622,
  "Mali":              1645,
  "Qatar":             1618,
  "Jamaica":           1605,
  "Oman":              1618,
  "Bolivia":           1582,
  "El Salvador":       1582,
  "Guatemala":         1580,
  "Trinidad and Tobago": 1592,
  "Indonesia":         1608,
  "UAE":               1625,
  "Benin":             1598,
};

// Alternative navn (The Odds API bruker noen ganger andre skrivemåter)
const NAME_ALIASES: Record<string, string> = {
  "Ivory Coast":          "Ivory Coast",
  "Cote d'Ivoire":        "Ivory Coast",
  "Côte d'Ivoire":        "Ivory Coast",
  "DR Congo":             "DR Congo",
  "Congo DR":             "DR Congo",
  "Democratic Republic of Congo": "DR Congo",
  "USA":                  "USA",
  "United States":        "USA",
  "South Korea":          "South Korea",
  "Korea Republic":       "South Korea",
  "Bosnia":               "Bosnia and Herzegovina",
  "Czech Republic":       "Czech Republic",
  "Czechia":              "Czech Republic",
  "North Macedonia":      "North Macedonia",
  "Macedonia":            "North Macedonia",
};

function normalizeTeamName(name: string): string {
  return NAME_ALIASES[name] ?? name;
}

export function getNationalElo(teamName: string): number | null {
  const normalized = normalizeTeamName(teamName);
  if (NATIONAL_ELO[normalized]) return NATIONAL_ELO[normalized];

  // Fuzzy match (case-insensitive)
  const lower = normalized.toLowerCase();
  for (const [key, elo] of Object.entries(NATIONAL_ELO)) {
    if (key.toLowerCase() === lower) return elo;
  }
  return null;
}

// Beregn VM-sannsynligheter fra ELO (nøytral bane — ingen hjemmefordel)
export function getNationalEloResult(
  homeTeam: string,
  awayTeam: string
): ClubEloResult {
  const homeElo = getNationalElo(homeTeam);
  const awayElo = getNationalElo(awayTeam);

  if (!homeElo || !awayElo) {
    return { homeElo, awayElo, eloDiff: null, eloHomeWinProb: null };
  }

  const eloDiff = homeElo - awayElo;
  // Nøytral bane: ingen +100 hjemmefordel (VM spilles i USA/Canada/Mexico)
  const eloHomeWinProb = 1 / (1 + Math.pow(10, -eloDiff / 400));

  return { homeElo, awayElo, eloDiff, eloHomeWinProb };
}
