© 2026 Solange Lecluse
RekenRace is ontwikkeld als educatief project voor kinderen.

# RekenRace v3

Webgame voor kinderen (8-10 jaar) om tafeltjes en optellen/aftrekken te oefenen. Twee modi: **Keersommen** en **Plus-Min**. Met stages, levels, coins, badges, shop en leaderboard.

## Starten

```bash
cd "<jouw-map>\rekenRace"
python -m http.server 8000
```

Open daarna: http://localhost:8000

> Het spel werkt ook direct via `file://` zonder server.

## Spelmodi

### Keersommen (standaard)
Tafelsvragen (1–12, niet 11), verdeeld over 5 stages. Per stage: losse tafels, een Mix-level en een Bonus-level (40 vragen).

### Plus-Min
Optellen en aftrekken, ook 5 stages:
| Stage | Inhoud |
|---|---|
| 1 – Begin | Tot 5, Tot 10 |
| 2 – Over de 10 🐸 | Springen over 10, tientallen optellen tot 100|
| 3 – Minnen tot 10 | Aftrekken tot 10, Van 10 |
| 4 – Plus tot 20| Optellen tot 20, Springen tot 20 |
| 5 – Minnen tot 20 | Aftrekken tot 20, Met lenen |

Elke stage heeft ook een Mix-level (combo) en een Bonus-level (40 vragen).

## Progressie

- Nieuwe stage unlockt na mastery (0 fouten + binnen tijd) van alle losse levels + combo in de vorige stage
- Bonus-level unlockt pas na mastery van de hele stage
- **Challenge mode**: timer actief, coins + badges te verdienen, leaderboard-run telt
- **Oefenmodus**: geen timer, geen beloningen, geen druk
- **Pauze** downgradet de run naar oefenmodus (geen coins/badges)

## Beloningen

- **Coins**: 10 (tafellevel) / 25 (combo) / 60 (bonus) — eenmalig per level bij mastery
- **Badge-coins**: +10 per nieuw verdiende badge
- **Badges per level**: 🏅 Eerste perfecte run, 🥇 3× perfect, ⚡ Snelste kampioen
- **Badges per stage**: ✅ Stage voltooid, 🌟 Bonus meester
- Kleurenthema wisselt automatisch met bereikte stage

## Shop

- Achtergrondafbeeldingen, karakters en muziek kopen met coins
- Geen preview-afbeeldingen (verrassing)
- Admin uploadt assets; kind koopt en kiest

## Uitdagingen

Aparte tab met recente foutieve sommen. Bij ≥10 fouten: knop om een oefenlevel te starten (20 vragen, elke fout 2×).

## Admin

Standaard wachtwoord: `1234`

- Wachtwoord wijzigen
- Per kind: spelmodus instellen (Keersommen ↔ Plus-Min)
- Tijdslimieten per level instellen — tab-switcher ✖️ Keersommen / ➕➖ Plus-Min (toont alleen relevante levels)
- Statistieken per speler bekijken — tab-switcher ✖️ Keersommen / ➕➖ Plus-Min (per stage en level)
- Achtergronden uploaden/verwijderen (naam + coinprijs)
- Karakters uploaden/verwijderen (naam + coinprijs)
- Muziek uploaden/verwijderen (naam + coinprijs)
- Profielen verwijderen
- Leaderboard resetten
- Dev-unlock: shop gratis voor testen

## Opslag

- Voortgang in `localStorage` (sleutel: `rekenrace_v3`)
- Afbeeldingen en audio in `IndexedDB` (database: `rekenrace_v3_blobs`)
- Geen server nodig; alles lokaal in de browser
