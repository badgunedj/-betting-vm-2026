@AGENTS.md

# BettingVM2026 — Prosjektoversikt for Claude

## Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS
- Vercel Hobby (deploy) + GitHub Actions (cron hvert 30. min)
- localStorage for klient-cache (analyser, CLV, peak bankroll)

## Kritiske env-variabler
- `ANTHROPIC_KEY` — Claude Haiku (IKKE ANTHROPIC_API_KEY — Turbopack filtrerer det)
- `ODDS_API_KEY` — The Odds API v4 (alle markeder)
- `API_FOOTBALL_KEY` — H2H-data
- `TELEGRAM_BOT_TOKEN` — @BettingVM2026Bot
- `TELEGRAM_CHAT_ID` — 8994379610
- `CRON_SECRET` — BVM2026-xK9mP3qR7zLs
- `BETTING_BANKROLL` — 5000
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV (valgfri, for CLV-dedup)

## Arkitektur

### Dataflyt
```
Odds API → getMatchOdds() → DagensTips (auto-scan) + MatchCard → POST /api/analyze → analyzeMatch() → Claude Haiku
                                      ↓
                            Poisson + ELO + injuries + news + CLV
```

### Nøkkelfiler
| Fil | Ansvar |
|-----|--------|
| `lib/odds-api.ts` | Henter odds — 8 parallelle API-kall: h2h, totals, btts, asian_handicap, double_chance, draw_no_bet, alternate_totals, correct_score |
| `lib/analyze.ts` | Bygger prompt, kaller Claude Haiku, returnerer BetSuggestion[] — inkl. alle 9 markeder |
| `lib/poisson.ts` | Dixon-Coles Poisson: homeWin/draw/awayWin, over15/25/35, btts, dc1X/X2/12, dnbHome/Away, topScores (korrekt resultat) |
| `lib/eliteserien-stats.ts` | 2026-sesongdata (hardkodet + live football-data.co.uk CSV) |
| `lib/national-elo.ts` | VM 2026 ELO for alle 48 lag (alle grupper A-L) |
| `lib/injuries.ts` | Skadeliste alle 16 Eliteserien-lag (oppdatert 23. mai 2026) |
| `lib/fixture-congestion.ts` | Fatigue-koeffisient fra TheSportsDB-data (0.90–1.00) |
| `lib/drawdown.ts` | Kelly-fraksjon (25%→15%→10%) basert på peak bankroll i localStorage |
| `lib/clv-store.ts` | CLV-logging: odds ved analyse vs. refresh, beregner CLV% |
| `lib/analysis-store.ts` | localStorage cache (max 150 analyser) |
| `lib/telegram.ts` | sendTelegramMessage + buildAlertMessage (HTML) |
| `app/api/analyze/route.ts` | POST-handler: samler alle datakilder, kaller analyzeMatch |
| `app/api/scan/route.ts` | GET-handler: Poisson-only scan av alle Eliteserien-kamper, returnerer value bets som JSON (brukes av DagensTips-komponenten) |
| `app/api/cron/scan/route.ts` | GET-handler: bakgrunnsscanner for Telegram-varsler (Poisson + ELO, ingen Claude) |
| `components/MatchCard.tsx` | Hoved-UI: odds-tabell, AI-analyse, bets, CLV, drawdown, BoaBet-sammenligning |
| `components/DagensTips.tsx` | "Dagens tips"-panel øverst: auto-henter /api/scan, prøver DDI Frame API for event-IDer |
| `components/AnalysisHistory.tsx` | Historikk-tab: CLV-statistikk + BankrollChart SVG |
| `.github/workflows/scan.yml` | GitHub Actions cron hvert 30. min |

## Modell-detaljer

### Poisson-modell (`lib/poisson.ts`)
- Ligasnitt Eliteserien 2026: **1.48 mål/lag/kamp** (faktisk) · **1.43** (xG-basert)
- `usedXG = !!(homeXgFor || awayXgFor)` — xG foretrekkes fremfor faktiske mål
- `effectiveAvg = usedXG ? 1.43 : 1.48` — korrekt referansebase
- Hjemmefordel: **1.15×**
- Form-multiplier: `0.88 + 0.24 × (points/maxPoints)` over siste 5 kamper
- Fatigue: 0 kamper=1.00, 1 kamp=0.95, 2+=0.90 (siste 7 dager)
- Claude klampes til **±6pp** fra Poisson — kode-håndhevelse, ikke bare prompt

### PoissonPrediction — alle felter
```typescript
homeWin, draw, awayWin           // normalisert 1X2
over15, under15                  // Poisson P(mål > 1.5)
over25, under25                  // Poisson P(mål > 2.5)
over35, under35                  // Poisson P(mål > 3.5)
bttsYes, bttsNo                  // (1-e^-λH)(1-e^-λA)
dc1X, dcX2, dc12                 // Double Chance
dnbHome, dnbAway                 // Draw No Bet (normalisert bort uavgjort)
topScores                        // topp 10 scorelines fra Poisson-matrise
expectedHomeGoals, expectedAwayGoals
```

### Odds API — alle markeder som hentes
```
h2h              → bestHomeWin/bestDraw/bestAwayWin
totals           → bestOver25/bestUnder25
btts             → bestBttsYes/bestBttsNo  (market key: "btts" ikke "bts"!)
asian_handicap   → ahLine/bestAhHome/bestAhAway
double_chance    → bestDc1X/bestDcX2/bestDc12   (outcome names: "1X","12","X2")
draw_no_bet      → bestDnbHome/bestDnbAway
alternate_totals → bestOver15/bestUnder15/bestOver35/bestUnder35
correct_score    → bestCorrectScore[]  (score format: "1-0", "2-1" osv.)
```

### Kelly-kriterium
- Standard: **25% fractional Kelly**
- Minimum innsats: **100 kr** (returnerer 0, ikke 100, ved for lav stake)
- Runding: **nærmeste 50 kr**
- Drawdown 10-20%: **15% Kelly**
- Drawdown ≥20%: **10% Kelly**

### Edge-terskel (UI + scanner)
- Relativ: **≥5%** (uavgjort: ≥8%)
- Absolutt: **≥3pp** (uavgjort: ≥5pp)
- Bookmaker margin maks: **8%** (Pinnacle ekskluderes alltid som bet-mål)

### ELO
- Eliteserien: clubelo.com (live)
- VM 2026: hardkodet nasjonal-ELO (alle 48 lag, gruppe A-L)

## BoaBet-integrasjon

BoaBet kjører på DDI Frame-plattformen (SportDigi). URL-struktur:
```
Kamp-side: /event-details?champ=5106&country=1388&event=EVENT_ID&live=0&sport=1&supertip=0
Liga-side:  /pre-match?champ=5106&country=1388&sport=1&live=0
```
- `champ=5106` = Eliteserien 2026-sesongen
- `country=1388` = Norge
- `sport=1` = fotball
- `event=EVENT_ID` = kamp-spesifikk ID fra DDI Frame API

**DagensTips** prøver å hente event-IDer fra DDI Frame API client-side:
```
https://sport.ddiframe.com/188a1665-3c7b-48aa-a143-6764c719955f/api/...
```
Prøver tre endpoint-mønstre — fallback til liga-siden hvis CORS blokkerer.

**Alle bet-knapper** peker nå til BoaBet (ikke NordicBet som er blokkert i Norge):
- "Bet direkte →" når event-ID er funnet
- "BoaBet →" til liga-siden som fallback

**BoaBet manuell odds-sjekk** i hvert bet-kort (MatchCard):
- Bruker `calcBoaBetEdge(ourProbability, oddsStr)` for å beregne edge mot manuelt tastede odds
- Lagres i `localStorage: bettingbot_boabet_${matchKey}`

## Bookmakers (norske spillere, mai 2026)
- **BoaBet** — primær for å plassere bet (norsk markedet, tilgjengelig)
- **nordicbet, betsson, betway** — ref-odds fra The Odds API (margin <8%)
- **NordicBet** — blokkert i Norge (country-blocked)
- **Pinnacle** — referanse-only (skarpeste odds, blokkert i Norge)

## Telegram-scanner
- Kjøres hvert 30. min via GitHub Actions (gratis, fungerer på Vercel Hobby)
- Endpoint: `GET /api/cron/scan` med `Authorization: Bearer <CRON_SECRET>`
- Poisson (Eliteserien) eller nasjonal-ELO (VM) — ingen Claude-kall
- Alle 9 markeder evalueres (inkl. DC, DNB, Over15/35, CS)
- KV deduplicering med 12t TTL (graceful fallback uten KV)
- Gjenbruker `poissonPred`-objektet (ikke dobbel matrise-beregning)

## Viktige bugs som er fikset (mai 2026)
- BTTS market key var `"bts"` — rettet til `"btts"`
- Over/Under 2.5 tok første bookmaker, ikke beste odds — rettet
- Kelly returnerte 100 ved stake<100kr — rettet til 0 (+ `if (stake===0) continue`)
- Claude probabilities ikke klampt i kode — rettet med clamp()-funksjon
- flagDraw brukte flagAway-variabelen i prompt — rettet
- Dobbel poissonPredict()-kall i cron scanner — rettet (gjenbruker pred)
- `prob`-skyggevariabel i Correct Score-løkken — rettet til `scoreProb`
- xG-ligasnitt brukte 1.48 istedet for 1.43 som referanse — rettet
