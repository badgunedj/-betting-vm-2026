// Skadeinfo for Eliteserien 2026
// Kilde: sportsgambler.com/injuries/football/norway-eliteserien/
// Sist oppdatert: 23. mai 2026

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

// Komplett skade- og suspensjonsdata for alle 16 Eliteserien-lag
// Kilde: sportsgambler.com — oppdatert 23. mai 2026
const INJURY_DATA_2026: Record<string, TeamInjuryReport> = {

  "Aalesund": {
    teamName: "Aalesund",
    unavailable: [
      { player: "Paul Ngongo Iversen",  position: "Angrep",  issue: "Lår",    returnDate: "12. jul" },
      { player: "U. V. Syversen",       position: "Forsvar", issue: "Skade",  returnDate: "Ukjent" },
      { player: "P. Sandvik Aukland",   position: "Forsvar", issue: "Skade",  returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Mathias Kristensen",   position: "Midtbane", issue: "Smell",  returnDate: "29. mai" },
      { player: "Janus Seehusen",       position: "Midtbane", issue: "Smell",  returnDate: "Ukjent" },
    ],
  },

  "Bodø/Glimt": {
    teamName: "Bodø/Glimt",
    unavailable: [],
    doubtful: [
      { player: "Ulrik Saltnes",           position: "Midtbane", issue: "Smell (lyske)", returnDate: "24. mai" },
      { player: "S. Skundberg Skeide",     position: "Midtbane", issue: "Lår",           returnDate: "24. mai" },
    ],
  },

  "SK Brann": {
    teamName: "SK Brann",
    unavailable: [
      { player: "Mathias Dyngeland",       position: "Keeper",   issue: "Lårskade",        returnDate: "12. jul" },
      { player: "Denzel De Roeve",         position: "Forsvar",  issue: "Skade",           returnDate: "12. jul" },
      { player: "Jacob Lungi Sørensen",    position: "Midtbane", issue: "Skade",           returnDate: "12. jul" },
      { player: "Thore Pedersen",          position: "Forsvar",  issue: "Dislokkert albue", returnDate: "Ukjent" },
      { player: "Sakarias Opsahl",         position: "Midtbane", issue: "Fot",             returnDate: "31. des" },
      { player: "Niklas Castro",           position: "Angrep",   issue: "Fot/Achilles",    returnDate: "9. aug" },
      { player: "Eggert A. Gudmundsson",   position: "Midtbane", issue: "Kne",             returnDate: "9. aug" },
      { player: "Sævar A. Magnusson",      position: "Angrep",   issue: "Kne",             returnDate: "9. aug" },
      { player: "Nana Boakye",             position: "Forsvar",  issue: "Kne (sesong over)", returnDate: "31. des" },
    ],
    doubtful: [
      { player: "F. Pallesen Knudsen",     position: "Forsvar",  issue: "Lår",             returnDate: "Ukjent" },
    ],
  },

  "Brann": {
    teamName: "SK Brann",
    unavailable: [
      { player: "Mathias Dyngeland",       position: "Keeper",   issue: "Lårskade",        returnDate: "12. jul" },
      { player: "Denzel De Roeve",         position: "Forsvar",  issue: "Skade",           returnDate: "12. jul" },
      { player: "Jacob Lungi Sørensen",    position: "Midtbane", issue: "Skade",           returnDate: "12. jul" },
      { player: "Thore Pedersen",          position: "Forsvar",  issue: "Dislokkert albue", returnDate: "Ukjent" },
      { player: "Sakarias Opsahl",         position: "Midtbane", issue: "Fot",             returnDate: "31. des" },
      { player: "Niklas Castro",           position: "Angrep",   issue: "Fot/Achilles",    returnDate: "9. aug" },
      { player: "Eggert A. Gudmundsson",   position: "Midtbane", issue: "Kne",             returnDate: "9. aug" },
      { player: "Sævar A. Magnusson",      position: "Angrep",   issue: "Kne",             returnDate: "9. aug" },
      { player: "Nana Boakye",             position: "Forsvar",  issue: "Kne (sesong over)", returnDate: "31. des" },
    ],
    doubtful: [
      { player: "F. Pallesen Knudsen",     position: "Forsvar",  issue: "Lår",             returnDate: "Ukjent" },
    ],
  },

  "Fredrikstad": {
    teamName: "Fredrikstad",
    unavailable: [
      { player: "Solomon Owusu",           position: "Forsvar",  issue: "Lår",    returnDate: "12. jul" },
      { player: "Sigurd Kvile",            position: "Forsvar",  issue: "Skade",  returnDate: "31. des" },
    ],
    doubtful: [
      { player: "J. Hummelvoll-Nunez",     position: "Angrep",  issue: "Legg",   returnDate: "25. mai" },
      { player: "Rocco Shein",             position: "Midtbane", issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
    ],
  },

  "HamKam": {
    teamName: "HamKam",
    unavailable: [
      { player: "Luc Mares",               position: "Forsvar",  issue: "Lyske",  returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Noah Alexandersson",      position: "Midtbane", issue: "Smell",  returnDate: "25. mai" },
      { player: "Ola Nikolai Rye",         position: "Ukjent",   issue: "Smell",  returnDate: "25. mai" },
      { player: "Anton Ekeroth",           position: "Forsvar",  issue: "Smell",  returnDate: "29. mai" },
    ],
  },

  "KFUM Oslo": {
    teamName: "KFUM Oslo",
    unavailable: [
      { player: "Mansour Sinyan",          position: "Midtbane", issue: "Smell",  returnDate: "12. jul" },
      { player: "Ayoub Aleesami",          position: "Forsvar",  issue: "Lyske",  returnDate: "12. jul" },
      { player: "Jonas Lange Hjorth",      position: "Ukjent",   issue: "Fot",    returnDate: "12. jul" },
      { player: "Moussa Njie",             position: "Angrep",   issue: "Ankel",  returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "F. Tobias Berglie",       position: "Ukjent",   issue: "Suspensjon (rødt kort)", returnDate: "29. mai" },
      { player: "Momodou Lion Njie",       position: "Forsvar",  issue: "Suspensjon (rødt kort)", returnDate: "25. mai" },
      { player: "Haavar Jenssen",          position: "Keeper",   issue: "Smell",  returnDate: "Ukjent" },
      { player: "Amin Nouri",              position: "Forsvar",  issue: "Smell",  returnDate: "Ukjent" },
    ],
  },

  "Kristiansund": {
    teamName: "Kristiansund",
    unavailable: [],
    doubtful: [
      { player: "H. Gikling Bruseth",      position: "Midtbane", issue: "Skade",  returnDate: "Ukjent" },
    ],
  },

  "Lillestrøm": {
    teamName: "Lillestrøm",
    unavailable: [
      { player: "Eric Kitolano",           position: "Midtbane", issue: "Legg",   returnDate: "12. jul" },
      { player: "Thomas Lehne Olsen",      position: "Angrep",   issue: "Legg",   returnDate: "Ukjent" },
      { player: "Espen Garnaas",           position: "Forsvar",  issue: "Suspensjon (rødt kort)", returnDate: "18. jul" },
    ],
    doubtful: [],
  },

  "Molde": {
    teamName: "Molde",
    unavailable: [
      { player: "Mads Kikkenborg",         position: "Keeper",   issue: "Fot",    returnDate: "31. des" },
      { player: "Daniel Daga",             position: "Midtbane", issue: "Ankel",  returnDate: "Ukjent" },
      { player: "F. Kristensen Dahl",      position: "Ukjent",   issue: "Kne",    returnDate: "2. aug" },
      { player: "Birk Risa",              position: "Forsvar",  issue: "Hode",   returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Jalal Abdullai",          position: "Angrep",   issue: "Smell",  returnDate: "30. mai" },
      { player: "Casper Oeyvann",          position: "Forsvar",  issue: "Smell",  returnDate: "Ukjent" },
      { player: "O. Spiten-Nysaether",     position: "Angrep",   issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
      { player: "Valdemar Lund",           position: "Forsvar",  issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
    ],
  },

  "Rosenborg": {
    teamName: "Rosenborg",
    unavailable: [
      { player: "Jonas Svensson",          position: "Forsvar",  issue: "Lår",    returnDate: "12. jul" },
      { player: "Ole Kristian Selnaes",    position: "Midtbane", issue: "Legg",   returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Adrian Pereira",          position: "Forsvar",  issue: "Smell",  returnDate: "Ukjent" },
      { player: "Aslak Fonn Witry",        position: "Forsvar",  issue: "Suspensjon (gult kort)", returnDate: "25. mai" },
      { player: "U. Y. Jenssen",           position: "Forsvar",  issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
    ],
  },

  "Sandefjord": {
    teamName: "Sandefjord",
    unavailable: [
      { player: "F. Loftesnes-Bjune",      position: "Forsvar",  issue: "Lår",    returnDate: "6. sep" },
      { player: "Haakon Krogelien",        position: "Forsvar",  issue: "Rygg",   returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Zinedin Smajlovic",       position: "Forsvar",  issue: "Suspensjon (rødt kort)", returnDate: "30. mai" },
      { player: "Jakob Masloe Dunsby",     position: "Midtbane", issue: "Smell",  returnDate: "30. mai" },
    ],
  },

  "Sarpsborg 08": {
    teamName: "Sarpsborg 08",
    unavailable: [
      { player: "Jo Inge Berget",          position: "Angrep",   issue: "Lår",    returnDate: "12. jul" },
      { player: "Sigurd Rosted",           position: "Forsvar",  issue: "Ankel",  returnDate: "Ukjent" },
      { player: "Michael Opoku",           position: "Angrep",   issue: "Ankel",  returnDate: "26. jul" },
    ],
    doubtful: [
      { player: "Camil Mmaee",             position: "Angrep",   issue: "Smell",  returnDate: "Ukjent" },
      { player: "Frederik Carstensen",     position: "Angrep",   issue: "Smell",  returnDate: "Ukjent" },
    ],
  },

  "IK Start": {
    teamName: "IK Start",
    unavailable: [
      { player: "Johan Meyer",             position: "Forsvar",  issue: "Lyske",  returnDate: "12. jul" },
      { player: "K. Toennessen",           position: "Forsvar",  issue: "Legg",   returnDate: "12. jul" },
      { player: "Eirik Schulze",           position: "Midtbane", issue: "Skade",  returnDate: "Ukjent" },
      { player: "J. Silva Torkildsen",     position: "Keeper",   issue: "Smell",  returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Ousmane Toure",           position: "Forsvar",  issue: "Suspensjon (rødt kort)", returnDate: "29. mai" },
    ],
  },

  "Tromsø": {
    teamName: "Tromsø",
    unavailable: [
      { player: "Jesper Grundt",           position: "Midtbane", issue: "Fot",    returnDate: "12. jul" },
      { player: "Alexander Warneryd",      position: "Forsvar",  issue: "Suspensjon (rødt kort)", returnDate: "18. jul" },
    ],
    doubtful: [
      { player: "Lars Olden Larsen",       position: "Angrep",   issue: "Smell",  returnDate: "Ukjent" },
      { player: "Viktor Ekblom",           position: "Angrep",   issue: "Lyske",  returnDate: "Ukjent" },
      { player: "Vetle Skjaervik",         position: "Forsvar",  issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
    ],
  },

  "Vålerenga": {
    teamName: "Vålerenga",
    unavailable: [
      { player: "Mohamed Ofkir",           position: "Midtbane", issue: "Korsbånd", returnDate: "29. mai" },
      { player: "H. Roervik Bjoerdal",     position: "Midtbane", issue: "Suspensjon (rødt kort)", returnDate: "Ukjent" },
    ],
    doubtful: [
      { player: "Ole Christian Saeter",    position: "Angrep",   issue: "Smell",  returnDate: "Ukjent" },
      { player: "Aaron Kiil Olsen",        position: "Ukjent",   issue: "Suspensjon (gult kort)", returnDate: "29. mai" },
    ],
  },

  "Viking": {
    teamName: "Viking",
    unavailable: [
      { player: "Martin Roseth",           position: "Forsvar",  issue: "Kne",    returnDate: "12. jul" },
    ],
    doubtful: [
      { player: "Viljar Vevatne",          position: "Forsvar",  issue: "Smell",  returnDate: "Ukjent" },
      { player: "Joe Bell",                position: "Midtbane", issue: "Smell",  returnDate: "Ukjent" },
      { player: "Kristoffer Askildsen",    position: "Midtbane", issue: "Suspensjon (gult kort)", returnDate: "12. jul" },
      { player: "Henrik Falchener",        position: "Forsvar",  issue: "Suspensjon (gult kort)", returnDate: "Neste kamp" },
    ],
  },
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
    parts.push(
      `Ute (${report.unavailable.length}): ${report.unavailable
        .map(p => `${p.player} (${p.issue})`)
        .join(", ")}`
    );
  }
  if (report.doubtful.length > 0) {
    parts.push(
      `Tvilsom/suspendert: ${report.doubtful
        .map(p => `${p.player} (${p.issue})`)
        .join(", ")}`
    );
  }
  return parts.join(" | ");
}
