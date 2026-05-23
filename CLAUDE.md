@AGENTS.md

# BettingVM2026 — Prosjektoversikt for Claude

## Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS
- Vercel Hobby (deploy) + GitHub Actions (cron hvert 30. min)
- localStorage for klient-cache (analyser, CLV, peak bankroll)

## Kritiske env-variabler
- `ANTHROPIC_KEY` — Claude Haiku (IKKE ANTHROPIC_API_KEY — Turbopack filtrerer det)
- `ODDS_API_KEY` — The Odds API (odds + BTTS + totals)
- `API_FOOTBALL_KEY` — H2H-data
- `TELEGRAM_BOT_TOKEN` — @BettingVM2026Bot
- `TELEGRAM_CHAT_ID` — 8994379610
- `CRON_SECRET` — BVM2026-xK9mP3qR7zLs
- `BETTING_BANKROLL` — 5000
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Vercel KV (valgfri, for CLV-dedup)

## Arkitektur

### Dataflyt
```
Odds API → getMatchOdds() → MatchCard → POST /api/analyze → analyzeMatch() → Claude Haiku
                                      ↓
                            Poisson + ELO + injuries + news + CLV
```

### Nøkkelfiler
| Fil | Ansvar |
|-----|--------|
| `lib/odds-api.ts` | Henter odds (h2h + totals + btts), beregner margin, PinnacleRef |
| `lib/analyze.ts` | Bygger prompt, kaller Claude Haiku, returnerer BetSuggestion[] |
| `lib/poisson.ts` | Dixon-Coles Poisson: expectedGoals, homeWin/draw/awayWin/over25/btts |
| `lib/eliteserien-stats.ts` | 2026-sesongdata (hardkodet + live CSV fallback) |
| `lib/national-elo.ts` | VM 2026 ELO for alle 48 lag (alle grupper A-L) |
| `lib/injuries.ts` | Skadeliste alle 16 Eliteserien-lag (oppdatert 23. mai 2026) |
| `lib/fixture-congestion.ts` | Fatigue-koeffisient fra TheSportsDB-data (0.90–1.00) |
| `lib/drawdown.ts` | Kelly-fraksjon (25%→15%→10%) basert på peak bankroll i localStorage |
| `lib/clv-store.ts` | CLV-logging: odds ved analyse vs. refresh, beregner CLV% |
| `lib/clv-store.ts` | CLV-logging: odds ved analyse vs. refresh, beregner CLV% |
| `lib/analysis-store.ts` | localStorage cache (max 150 analyser) |
| `lib/telegram.ts` | sendTelegramMessage + buildAlertMessage (HTML) |
| `app/api/analyze/route.ts` | POST-handler: samler alle datakilder, kaller analyzeMatch |
| `app/api/cron/scan/route.ts` | GET-handler: bakgrunnsscanner (Poisson-only, ingen Claude) |
| `components/MatchCard.tsx` | Hoved-UI: odds-tabell, AI-analyse, bets, CLV, drawdown |
| `components/AnalysisHistory.tsx` | Historikk-tab med CLV-statistikk |
| `.github/workflows/scan.yml` | GitHub Actions cron hvert 30. min |

## Modell-detaljer

### Poisson-modell
- Ligasnitt Eliteserien 2026: **1.48 mål/lag/kamp**
- Hjemmefordel: **1.15×**
- Form-multiplier: `0.88 + 0.24 × (points/maxPoints)` over siste 5 kamper
- Fatigue: 0 kamper=1.00, 1 kamp=0.95, 2+=0.90 (siste 7 dager)
- BTTS: `(1 - e^-λH) × (1 - e^-λA)` — én linje

### Kelly-kriterium
- Standard: **25% fractional Kelly**
- Minimum innsats: **100 kr**
- Runding: **nærmeste 50 kr**
- Drawdown 10-20%: **15% Kelly**
- Drawdown ≥20%: **10% Kelly**

### Edge-terskel (UI + scanner)
- Relativ: **≥5%** (uavgjort: ≥8%)
- Absolutt: **≥3pp** (uavgjort: ≥5pp)
- Bookmaker margin maks: **8%** (Pinnacle ekskluderes som bet-mål)

### ELO
- Eliteserien: clubelo.com (live)
- VM 2026: hardkodet nasjonal-ELO (alle 48 lag, gruppe A-L)

## Bookmakers (norske spillere)
- **nordicbet, betsson, betway** — bet-mål
- **pinnacle** — referanse-only (blokkert i Norge, men skarpeste odds)

## Telegram-scanner
- Kjøres hvert 30. min via GitHub Actions (gratis, fungerer på Vercel Hobby)
- Endpoint: `GET /api/cron/scan` med `Authorization: Bearer <CRON_SECRET>`
- Bruker Poisson (Eliteserien) eller nasjonal-ELO (VM) — ingen Claude-kall
- KV deduplicering med 12t TTL (graceful fallback uten KV)

## Gjenstående forbedringer
- [ ] Odds movement signal (shortening = sharps inne)
- [ ] Asian Handicap marked
- [ ] Kalibreringssporing (spådd prob vs faktisk utfall)
- [ ] xG-data (erstatter mål/kamp i Poisson)
- [ ] Resultat-logging (vant/tapte bets manuelt)
