# Appens Storhetsguide

Denna guide är vår styrande checklista för att göra appen till en riktigt bra och juridiskt robust projekt-, bokförings- och ekonomiapp.

Arbetssätt:
- Vi gör alltid en punkt i taget.
- Vi börjar inte nästa punkt förrän aktuell punkt är helt klar.
- När en punkt är klar markerar vi den som `[x]` och dokumenterar kort vad som blev gjort.

Status:
- `[ ]` = Ej startad
- `[-]` = Pågår
- `[x]` = Klar

## Etapp A - Måste (blockers före skarp drift)
- [x] A1. Komplettera lagkrav på fakturainnehåll
- [x] A2. Bygg momslogik fullt ut (inte MVP)
- [x] A3. Säkerställ periodlås + bokföringsintegritet i alla write-flöden
- [x] A4. Uppgradera SIE-export från light till validerad produktionsnivå
- [x] A5. Implementera arkivering/retention (7 år), backup/restore och återläsningstest

## Etapp B - Hög prioritet
- [x] B1. Fixa tenant/roll-kontroll i middleware (aktivt bolag, inte första medlemskap)
- [x] B2. Ta bort debug-JSON i produktions-UI
- [x] B3. Inför automatiserad bankavstämning (import + matchning)
- [x] B4. Bygg leverantörsreskontra (AP)
- [x] B5. Härda revisionsspår (append-only + exportbar händelsekedja)
- [x] B6. Bygg testpaket för ekonomi (golden tests + CI-smoke)
- [-] B7. Förfina behörigheter per åtgärd
- [x] B8. Automatisera behörighetsverifiering (permissions smoke i SQL/CI)

## Etapp C - Medel prioritet
- [-] C1. Slutför fakturaflöde end-to-end (utskick, leveransstatus, versionshantering)
- [x] C2. Fördjupa projekt-ekonomi-koppling (budget, utfall, marginal, kostnadsställe)
- [x] C3. Utöka offline/sync för fler ekonomi-flöden
- [-] C4. Säkerhetsdrift (2FA/step-up, rate limit, monitorering/alarmering)

## Källor (regelriktning)
- Skatteverket: bokföring och räkenskapsinformation
- Skatteverket: krav på faktura
- Bokföringslagen (1999:1078)
- DIGG: e-faktura till offentlig sektor

## Avklarade punkter (logg)
- C3 klar: offline/sync utökat till ekonomi via köade fakturaåtgärder (bokför faktura + registrera betalning), synkbar i Synkcenter med statushantering/felhantering och automatisk replay online.
- B8 klar: permissions smoke-test (SQL + CI) implementerat och verifierat med green körning i SQL Editor.
- B7 notering: Implementation klar i kod (action-baserad behörighetsmodell) men användarverifiering ej genomförd ännu.
- C1 notering: SQL/migration körd men inte manuellt testad i UI ännu.
- C4 notering: implementation klar i kod för serverstyrd rate limiting, säkerhetshändelser, säkerhetslarm i admin-UI, TOTP-MFA i settings, step-up för känsliga admin-API:er (AAL2 om tillgängligt, annars färsk inloggning) samt webhook-larm för kritiska säkerhetshändelser. Manuell runtime-verifiering återstår innan punkten kan markeras klar.
- Auth notering: magic-link-test via app är för närvarande opålitligt p.g.a. Supabase email rate-limit/throttling i testmiljön. Lösenordsinloggning är tillagd som alternativ utvecklingsväg tills mailflödet kan verifieras igen.
- B6 klar: ekonomi-testpaket med SQL smoke + golden tests, npm testkommandon, CI-workflow samt verifierad körning (green) i SQL Editor.
- B5 klar: append-only revisionsspår med hashkedja (event_no/prev_hash/event_hash), verifierings-RPC och export av händelsekedja (JSON) från Rapporter.
- B4 klar: leverantörsreskontra (AP) med leverantörer, leverantörsfakturor, betalningsregistrering, öppna skulder-rapport, RLS/policies och ny sida `/payables` med rollskyddad åtkomst.
- B3 klar: bankavstämning med CSV-import, normalisering av svenska format, auto-match mot fakturor, bekräfta/avvisa-flöde och bokning av betalning/verifikation.
- B2 klar: rå JSON/debug-block är borttagna i produktion (settings-checklista, sync-konflikt, projektfakturasvar, faktura-metadata) och ersatta med läsbar UI-text.
- B1 klar: middleware använder aktivt bolag (active_company_id) för rollkontroll, reparerar ogiltig cookie till giltigt medlemskap och skyddar admin-sidor separat.
- A5 klar: retention-policy (minst 7 år), backup-snapshots med checksumma, nedladdning samt icke-destruktivt återläsningstest via admin-UI/API.
- A4 klar: SIE4-export uppgraderad med strikt validering (balans, dubbletter, kontonr, verifikationsnummer), validate_only-läge och förbättrad exportstruktur (CRLF + robust escaping).
- A3 klar: DB-hardening för periodlås och bokföringsintegritet (triggers + datumvalidering + immutabilitet i betalningsflöden).
- A2 klar: momslogik v2 med 25/12/6 i bokning och momsrapport, samt utökade momsrutor i rapport-UI.
- A1 klar: nya compliance-fält för faktura/företag/kund, uppdaterad fakturagenerering (villkor/leveransdatum/momsnr), samt förbättrad utskrift/export.

## Manuell verifieringschecklista

### C1 - Fakturaflöde end-to-end
1. Öppna en vanlig kundfaktura i `/invoices/[id]`.
2. Testa `Skicka nu`.
3. Verifiera att fakturastatus blir `sent`.
4. Verifiera att en rad skapas i leveransloggen.
5. Verifiera att en ny rad skapas i versionshistoriken.
6. Testa `Markera levererad`.
7. Verifiera att leveransstatus blir `delivered` och att tid sätts.
8. Testa betalningsregistrering.
9. Verifiera att betalning syns i betalningstabellen och att öppet belopp minskar eller blir 0.
10. Verifiera att faktura blir `paid` när fullt betald.
11. Verifiera att export/print fortfarande fungerar.
12. Om allt stämmer: markera `C1` som `[x]`.

### C4 - Säkerhetsdrift
1. Gå till `/settings` som admin.
2. Aktivera TOTP-MFA.
3. Verifiera att QR-kod visas och att faktor kan verifieras.
4. Verifiera att MFA-status visar verifierad faktor.
5. Verifiera session till `aal2`.
6. Testa känsliga adminflöden: spara företagsinställningar, lås/lås upp period, skapa backup, kör restore-test.
7. Verifiera att flödena fungerar med upphöjd session.
8. Testa samma åtgärder utan upphöjd eller för gammal session.
9. Verifiera att de blockeras med tydligt fel och att security event loggas.
10. Spamtesta login tills rate limit ger `429`.
11. Verifiera att `auth.magic_link.rate_limited` syns i säkerhetshändelser.
12. Trigga ett kritiskt event och verifiera att webhook-mottagaren får payload.
13. Om allt stämmer: markera `C4` som `[x]`.


















