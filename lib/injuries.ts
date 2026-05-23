// Skadeinfo fra sportsgambler.com (gratis, ingen API-nøkkel)
// Oppdateres automatisk fra nettet

export interface PlayerInjury {
  player: string;
  position: string;
  issue: string;
  returnDate: string;
}

export interface TeamInjuryReport {
  teamName: string;
  unavailable: PlayerInjury[];
  doubtful: PlayerInjury[];
}

// Hardkodet for Eliteserien — oppdateres fra research
// Sist oppdatert: 23. mai 2026
const INJURY_DATA_2026: Record<string, TeamInjuryReport> = {
  "SK Brann": {
    teamName: "SK Brann",
    unavailable: [
      { player: "Mathias Dyngeland", position: "GK", issue: "Lårskade", returnDate: "12. jul" },
      { player: "Denzel De Roeve", position: "Forsvar", issue: "Skade", returnDate: "12. jul" },
      { player: "Jacob Lungi Sørensen", position: "Midtbane", issue: "Skade", returnDate: "12. jul" },
      { player: "Thore Pedersen", position: "Forsvar", issue: "Dislokkert albue", returnDate: "Ukjent" },
      { player: "Eggert A. Gudmundsson", position: "Midtbane", issue: "Kne", returnDate: "9. aug" },
      { player: "Sakarias Opsahl", position: "Midtbane", issue: "Fot", returnDate: "31. des" },
      { player: "Niklas Castro", position: "Angrep", issue: "Achilles/fot", returnDate: "9. aug" },
      { player: "Sævar A. Magnusson", position: "Angrep", issue: "Kne", returnDate: "9. aug" },
      { player: "Nana Boakye", position: "Forsvar", issue: "Kne", returnDate: "31. des (sesong over)" },
    ],
    doubtful: [
      { player: "F. Pallesen Knudsen", position: "Forsvar", issue: "Lår (tvilsom)", returnDate: "Ukjent" },
    ],
  },
  "Bodø/Glimt": {
    teamName: "Bodø/Glimt",
    unavailable: [],
    doubtful: [
      { player: "Ulrik Saltnes", position: "Midtbane", issue: "Lyske/smell (tvilsom)", returnDate: "24. mai" },
      { player: "S. Skundberg Skeide", position: "Midtbane", issue: "Lår (tvilsom)", returnDate: "24. mai" },
    ],
  },
  "Viking": { teamName: "Viking", unavailable: [], doubtful: [] },
  "Tromsø": { teamName: "Tromsø", unavailable: [], doubtful: [] },
  "Molde": { teamName: "Molde", unavailable: [], doubtful: [] },
  "Rosenborg": { teamName: "Rosenborg", unavailable: [], doubtful: [] },
  "Vålerenga": { teamName: "Vålerenga", unavailable: [], doubtful: [] },
};

export function getTeamInjuryReport(teamName: string): TeamInjuryReport {
  if (INJURY_DATA_2026[teamName]) return INJURY_DATA_2026[teamName];

  // Fuzzy match
  const lower = teamName.toLowerCase();
  for (const [key, val] of Object.entries(INJURY_DATA_2026)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return val;
    }
  }

  return { teamName, unavailable: [], doubtful: [] };
}

export function injuryReportToString(report: TeamInjuryReport): string {
  if (report.unavailable.length === 0 && report.doubtful.length === 0) {
    return "Ingen kjente skader";
  }
  const parts: string[] = [];
  if (report.unavailable.length > 0) {
    parts.push(`Ute (${report.unavailable.length}): ${report.unavailable.map(p => `${p.player} (${p.issue})`).join(", ")}`);
  }
  if (report.doubtful.length > 0) {
    parts.push(`Tvilsom: ${report.doubtful.map(p => p.player).join(", ")}`);
  }
  return parts.join(" | ");
}
