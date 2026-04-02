# Mobil UI Omtag Plan

Detta dokument beskriver hur vi gör ett omtag på mobil-lägets UI så att mobilen blir en snabb arbetsyta i stället för en nedskalad desktop.

Grundprincip:
- Mobil ska i första hand stödja snabba vardagsflöden.
- Desktop behåller de tunga detaljvyerna och avancerade ekonomiska arbetsytorna.
- Mobil ska fortfarande kunna nå alla sidor, men inte visa allt som primärt arbetsläge.

Status:
- `[ ]` = Ej startad
- `[-]` = Pågår
- `[x]` = Klar

## Målbild
På mobil ska det vara lätt att:
- se vad som behöver göras nu
- se status i projekt
- lägga till projektuppdateringar
- arbeta med egna uppgifter
- starta, pausa och stoppa tidrapportering
- lägga till verifikation eller fota underlag

På mobil ska det fortfarande gå att:
- nå ekonomi, kunder, ordrar, team och inställningar
- öppna mer avancerade vyer vid behov
- navigera till alla sidor i appen även om dessa inte är primära i mobilflödet

## Etapp M1 - Definiera mobilens struktur
- [x] M1.1 Bestäm mobilens primära arbetsflöden: hem, projekt, att göra, tid, snabbregistrering
- [x] M1.2 Bestäm vilka delar som ska vara primära på mobil och vilka som ska ligga bakom meny eller "mer"
- [x] M1.3 Definiera princip för mobil kontra desktop:
  mobil = jobba snabbt
  desktop = administrera och analysera
- [x] M1.4 Dokumentera vilka sidor som ska få särskild mobilvy i stället för bara responsiv layout

## Etapp M2 - Ny mobil navigation
- [x] M2.1 Gör om mobilens bottennavigation till en tydlig arbetsnavigation
- [ ] M2.2 Föreslagen bottennavigation:
  `Hem`, `Projekt`, `Tid`, `Att göra`, `Meny`
- [x] M2.3 Flytta avancerade eller sekundära sidor till `Meny`
- [x] M2.4 Säkerställ att `Meny` ger åtkomst till hela appen:
  kunder, ordrar, ekonomi, team, inställningar, admin
- [x] M2.5 Säkerställ att nuvarande djupa länkar och routing fortfarande fungerar på mobil

## Etapp M3 - Mobil startsida
- [x] M3.1 Skapa en mobil-först startsida som arbetsyta
- [x] M3.2 Lägg till blocket `Mitt nu`
- [x] M3.3 Lägg till blocket `Mina uppgifter`
- [x] M3.4 Lägg till blocket `Mina projekt`
- [x] M3.5 Lägg till blocket `Snabbåtgärder`
- [x] M3.6 Lägg till blocket `Att göra`
- [x] M3.7 Prioritera personlig information först, global information senare eller inte alls

## Etapp M4 - Snabbåtgärder
- [x] M4.1 Definiera vilka snabbåtgärder som alltid ska finnas på mobil
- [x] M4.2 Föreslagna snabbåtgärder:
  `Ny uppdatering`, `Starta tid`, `Ny verifikation`, `Fota underlag`, `Ny uppgift`
- [x] M4.3 Säkerställ att snabbåtgärderna kan öppnas från både startsidan och plusmenyn
- [x] M4.4 Gör snabbåtgärderna till dialog/sheet-flöden i stället för hela formulärsidor där det går

## Etapp M5 - Projekt på mobil
- [x] M5.1 Dela upp mobilens projektdetalj i enklare lägen
- [x] M5.2 Inför mobilens primära projekttabs:
  `Översikt`, `Arbete`, `Mer`
- [x] M5.3 `Översikt` ska visa:
  status, nästa delmål, senaste aktivitet, ansvarig, medlemmar
- [x] M5.4 `Arbete` ska visa:
  uppdateringar, uppgifter, tid
- [x] M5.5 `Mer` ska visa:
  bilagor, ekonomi, loggar, avancerade inställningar
- [-] M5.6 Flytta tunga redigeringsformulär till sheets/dialoger där det passar
- [x] M5.7 Säkerställ att det är mycket lätt att skapa ny uppdatering från projektsidan

## Etapp M6 - Uppgifter på mobil
- [x] M6.1 Gör `Mina uppgifter` till en central mobilvy
- [x] M6.2 Prioritera visning av:
  försenade, idag, nästa, blockerade
- [x] M6.3 Gör det lätt att markera uppgift klar eller öppna uppgift
- [x] M6.4 Gör uppgiftens detaljvy enklare på mobil än på desktop
- [x] M6.5 Säkerställ att ansvarig, deadline, prioritet och projekt syns tydligt utan att vyn blir tung

## Etapp M7 - Tidrapportering på mobil
- [x] M7.1 Gör tidrapportering till en av mobilens viktigaste ytor
- [x] M7.2 Låt aktiv timer vara synlig och lätt att styra från hela mobilappen
- [-] M7.3 Gör det lätt att starta tid från:
  hem, projekt, uppgift, plusmeny
- [x] M7.4 Gör det lätt att pausa, fortsätta och stoppa utan att lämna nuvarande vy
- [x] M7.5 Visa senaste tidsposter i en kompakt mobilvy

## Etapp M8 - Verifikationer och snabbregistrering på mobil
- [x] M8.1 Bygg en enkel mobilvy för verifikationer med fokus på registrering
- [-] M8.2 Prioritera:
  ny verifikation, fota kvitto, ladda upp underlag, se sådant som kräver åtgärd
- [x] M8.3 Låt avancerade ekonomi- och avstämningsvyer finnas bakom `Meny`
- [x] M8.4 Säkerställ att ekonomi på mobil inte blir tabelltung som desktop

## Etapp M9 - Meny för full åtkomst
- [x] M9.1 Skapa en tydlig mobil `Meny`-yta för full appåtkomst
- [x] M9.2 Gruppera innehåll efter avdelning:
  arbete, relationer, ekonomi, administration
- [x] M9.3 Visa mindre vanliga sidor här i stället för i bottennavigationen
- [x] M9.4 Säkerställ att ingen sida "försvinner" från mobil bara för att UI:t förenklas

## Etapp M10 - Gemensamma mobilprinciper
- [x] M10.1 Minska mängden alltid synliga filter, tabeller och metadata på mobil
- [x] M10.2 Prioritera kort, listor, sheets och actions framför stora formulärblock
- [x] M10.3 Sätt tydliga regler för när mobil ska ha egen layout och när responsiv desktop räcker
- [x] M10.4 Säkerställ att sticky header, bottennavigation och flytande actions inte krockar
- [x] M10.5 Säkerställ att dropdowns, menyer och sheets fungerar stabilt på mobil

## Etapp M11 - Utrullningsordning
Bygg i denna ordning:

1. [x] M11.1 Ny mobil navigation
2. [x] M11.2 Ny mobil startsida
3. [x] M11.3 Ny mobil projektyta
4. [x] M11.4 Ny mobil uppgiftsyta
5. [x] M11.5 Ny mobil tidrapportering
6. [x] M11.6 Ny mobil verifikations-/snabbregistreringsyta
7. [x] M11.7 Meny för full åtkomst
8. [x] M11.8 Finjustering av gemensamma mobilprinciper

## Definition av klart
Mobil-omtagen kan anses klara när:
- en användare kan utföra sina vanligaste dagliga uppgifter utan att känna att mobilen är en sämre desktop
- de avancerade delarna fortfarande går att nå från mobil
- projektuppdatering, uppgifter, tid och verifikationer är märkbart snabbare att använda än idag
- navigeringen känns konsekvent, enkel och avsiktlig
