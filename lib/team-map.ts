// Mapping: The Odds API team names → API-Football IDs + stadium coords + Club ELO name
// Dekker alle 16 Eliteserien 2026-lag
// Sist oppdatert: 23. mai 2026

export interface TeamInfo {
  apiFootballId: number;
  leagueId: number;
  stadiumLat: number;
  stadiumLon: number;
  clubEloName: string; // name used on clubelo.com (tom streng = ikke i databasen)
}

const TEAM_MAP: Record<string, TeamInfo> = {
  // ── Eliteserien 2026 — alle 16 lag ──────────────────────────────────────────

  "Bodø/Glimt":    { apiFootballId: 673,   leagueId: 103, stadiumLat: 67.2804, stadiumLon: 14.3921, clubEloName: "Bodo/Glimt" },
  "Rosenborg":     { apiFootballId: 1273,  leagueId: 103, stadiumLat: 63.4225, stadiumLon: 10.3947, clubEloName: "Rosenborg" },
  "Molde":         { apiFootballId: 3019,  leagueId: 103, stadiumLat: 62.7373, stadiumLon:  7.1598, clubEloName: "Molde" },
  "SK Brann":      { apiFootballId: 7523,  leagueId: 103, stadiumLat: 60.3627, stadiumLon:  5.3449, clubEloName: "Brann" },
  "Brann":         { apiFootballId: 7523,  leagueId: 103, stadiumLat: 60.3627, stadiumLon:  5.3449, clubEloName: "Brann" },
  "Viking":        { apiFootballId: 343,   leagueId: 103, stadiumLat: 58.9694, stadiumLon:  5.7507, clubEloName: "Viking" },
  "Vålerenga":     { apiFootballId: 372,   leagueId: 103, stadiumLat: 59.9333, stadiumLon: 10.7815, clubEloName: "Vaalerenga" },
  "Tromsø":        { apiFootballId: 365,   leagueId: 103, stadiumLat: 69.6289, stadiumLon: 18.9625, clubEloName: "Tromso" },
  "Fredrikstad":   { apiFootballId: 8024,  leagueId: 103, stadiumLat: 59.2181, stadiumLon: 10.9298, clubEloName: "Fredrikstad" },
  "Lillestrøm":    { apiFootballId: 8026,  leagueId: 103, stadiumLat: 59.9593, stadiumLon: 11.0533, clubEloName: "Lillestrom" },
  "HamKam":        { apiFootballId: 10227, leagueId: 103, stadiumLat: 60.7957, stadiumLon: 11.0620, clubEloName: "HamKam" },
  "Sandefjord":    { apiFootballId: 8025,  leagueId: 103, stadiumLat: 59.1355, stadiumLon: 10.2165, clubEloName: "Sandefjord" },
  "Kristiansund":  { apiFootballId: 7515,  leagueId: 103, stadiumLat: 63.1106, stadiumLon:  7.7271, clubEloName: "Kristiansund" },
  "Sarpsborg 08":  { apiFootballId: 8027,  leagueId: 103, stadiumLat: 59.2834, stadiumLon: 11.1076, clubEloName: "Sarpsborg" },

  // ── Nye lag i Eliteserien 2026 (opprykk) ─────────────────────────────────────

  // Aalesund — Color Line Stadion, Ålesund
  "Aalesund":      { apiFootballId: 1375,  leagueId: 103, stadiumLat: 62.4727, stadiumLon:  6.2317, clubEloName: "Aalesund" },

  // KFUM Oslo — Jordal Idrettspark, Oslo
  "KFUM Oslo":     { apiFootballId: 10474, leagueId: 103, stadiumLat: 59.9093, stadiumLon: 10.7885, clubEloName: "" },
  "KFUM":          { apiFootballId: 10474, leagueId: 103, stadiumLat: 59.9093, stadiumLon: 10.7885, clubEloName: "" },

  // IK Start — Sparebanken Sør Arena, Kristiansand
  "IK Start":      { apiFootballId: 7518,  leagueId: 103, stadiumLat: 58.1618, stadiumLon:  7.9976, clubEloName: "Start" },
  "Start":         { apiFootballId: 7518,  leagueId: 103, stadiumLat: 58.1618, stadiumLon:  7.9976, clubEloName: "Start" },
};

export function findTeamInfo(teamName: string): TeamInfo | null {
  // Exact match
  if (TEAM_MAP[teamName]) return TEAM_MAP[teamName];

  // Case-insensitive exact
  const lower = teamName.toLowerCase();
  for (const [key, info] of Object.entries(TEAM_MAP)) {
    if (key.toLowerCase() === lower) return info;
  }

  // Partial / substring match
  for (const [key, info] of Object.entries(TEAM_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return info;
    }
  }

  return null;
}
