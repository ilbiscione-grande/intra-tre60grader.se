# Behörighetsmodell Testmatris

Den här matrisen används för Etapp I i capability-modellen.

Syfte:
- verifiera att nya capabilities fungerar
- verifiera att gamla roller fortfarande fungerar via kompatibilitetslagret
- undvika att användare tappar åtkomst under migreringen

## Förberedelse
- använd minst ett testbolag
- ha minst sex testanvändare eller kör om samma användare mellan olika kombinationer
- kontrollera i teamvyn att basroll, capabilities och effektiv åtkomst visas korrekt

## Scenario I1 - Employee utan capability
Mål:
- användaren ska bara ha grundåtkomst

Sätt upp:
- basroll: `member`
- capabilities: inga

Förväntat:
- ser `Projekt`
- ser inte ekonomi, fakturor, reskontra eller rapporter
- ser inte projektsammanfattning/ledningsvy
- ser inte medlemshantering

## Scenario I2 - Employee + finance
Mål:
- användaren ska få ekonomiåtkomst utan att vara admin

Sätt upp:
- basroll: `member`
- capabilities:
  - `finance`

Förväntat:
- ser ekonomi, ordrar, fakturor, kundreskontra och leverantörsreskontra
- ser `Ny verifikation` i `Lägg till`
- ser projektsammanfattning via finance-capability
- ser inte medlemshantering om `team_admin` saknas

## Scenario I3 - Employee + project_lead
Mål:
- användaren ska få projektöversikt men inte ekonomi

Sätt upp:
- basroll: `member`
- capabilities:
  - `project_lead`

Förväntat:
- ser projektsammanfattning/ledningsvy
- ser projektrelaterad navigation
- ser inte ekonomi, fakturor eller reskontra
- ser inte rapporter om `reporting` saknas

## Scenario I4 - Employee + reporting
Mål:
- användaren ska få rapporter men inte ekonomiåtgärder

Sätt upp:
- basroll: `member`
- capabilities:
  - `reporting`

Förväntat:
- ser `Rapporter`
- ser inte ekonomi, fakturor, reskontra eller verifikationsskapande
- ser inte medlemshantering

## Scenario I5 - Employee + team_admin
Mål:
- användaren ska kunna hantera team utan att vara admin

Sätt upp:
- basroll: `member`
- capabilities:
  - `team_admin`

Förväntat:
- ser `Medlemmar`
- kan lägga till och ta bort capabilities
- kan hantera medlemmar via teamvyn
- ser inte ekonomi om `finance` saknas

## Scenario I6 - Admin
Mål:
- admin ska fortsätta fungera fullt ut utan explicit capabilitydata

Sätt upp:
- basroll: `admin`
- capabilities: valfritt eller inga

Förväntat:
- full åtkomst i navigation och vyer
- ekonomi fungerar
- rapporter fungerar
- teamhantering fungerar
- `Lägg till` visar relevanta adminvägar

## Legacy-scenario L1 - Basroll finance utan explicit capability
Mål:
- säkerställa kompatibilitetslagret

Sätt upp:
- basroll: `finance`
- capabilities: inga

Förväntat:
- användaren fungerar som finance i dagens flöde
- får effektiv capability för:
  - `finance`
  - `reporting`
- tappar inte åtkomst bara för att capability-tabellen ännu är tom

## Legacy-scenario L2 - Basroll admin utan explicit capability
Mål:
- säkerställa att admin inte kräver manuell capability-migrering

Sätt upp:
- basroll: `admin`
- capabilities: inga

Förväntat:
- full access kvarstår

## Checklista per scenario
- kontrollera synliga poster i desktop sidebar
- kontrollera synliga poster i mobile bottom nav
- kontrollera poster i `Lägg till`
- kontrollera teamvyns `Effektiv åtkomst`
- öppna respektive sida och verifiera att den verkligen laddar
- verifiera att otillåtna sidor visar korrekt spärr/fallback

## Notering
Etapp I räknas som klar först när scenarierna ovan faktiskt är körda i UI:t.
