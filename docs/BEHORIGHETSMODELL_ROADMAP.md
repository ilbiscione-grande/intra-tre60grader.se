# Behörighetsmodell Roadmap

Denna roadmap beskriver hur vi går från dagens enkla en-rollsmodell till en mer flexibel behörighetsmodell med:
- basroll per bolag
- flera samtidiga funktionsroller/capabilities per användare
- tydliga helpers i appen i stället för hårdkodad rollogik

Grundprincip:
- Vi behåller enkelheten i auth-lagret.
- Vi skiljer på identitet, medlemskap och funktion.
- Vi bygger vidare på nuvarande intranät, inte ett separat behörighetssystem vid sidan av.
- Vi undviker att “admin” blir en slaskroll för allt.

Målbild:
- en användare kan vara `member` som basroll
- samma användare kan samtidigt ha t.ex.:
  - `finance`
  - `project_lead`
  - `reporting`
  - `team_admin`
- UI och funktioner styrs av capabilities, inte av en enda rollsträng

Exempel:
- employee + finance:
  - ser ekonomi, ordrar, fakturor och reskontra
- employee + project_lead:
  - ser projektsammanfattning, ledningskort, planeringsflik, risker och arbetsyta
- employee utan extra capability:
  - ser grundprojekt och de delar som vanlig medlem ska ha

Arbetssätt:
- Vi gör en punkt i taget.
- Vi markerar punkten som `[x]` när den är helt klar.
- Om en punkt är påbörjad men inte färdig markeras den som `[-]`.

Status:
- `[ ]` = Ej startad
- `[-]` = Pågår
- `[x]` = Klar

## Etapp A - Kartläggning av nuvarande modell
- [x] A1. Bekräfta nuvarande basroll i appen: `member`, `finance`, `admin`, `auditor`
- [x] A2. Bekräfta att auth-lagret har separat intern authroll: `admin` eller `employee`
- [x] A3. Bekräfta att dagens UI huvudsakligen styrs av en enda `role` i `AppContext`
- [x] A4. Dokumentera att sammanfattningsvyn på projektsidan i nuläget bara visas för `admin` och `finance`

## Etapp B - Ny datamodell för capabilities
- [x] B1. Lägg till ny tabell `company_member_capabilities`
- [x] B2. Låt tabellen innehålla:
  - `company_id`
  - `user_id`
  - `capability`
  - `created_at`
  - `created_by`
- [x] B3. Lägg till unik constraint per `(company_id, user_id, capability)`
- [x] B4. Lägg till RLS och samma säkerhetsnivå som övriga medlemskopplingar
- [x] B5. Definiera första capability-listan:
  - `finance`
  - `project_lead`
  - `reporting`
  - `team_admin`

## Etapp C - Appkontext och helpers
- [x] C1. Utöka `AppContext` så den innehåller både `role` och `capabilities`
- [x] C2. Skapa centrala helperfunktioner, t.ex.:
  - `hasCapability()`
  - `hasAnyCapability()`
  - `canViewFinance()`
  - `canViewProjectSummary()`
  - `canManageTeam()`
- [x] C3. Behåll stöd för nuvarande rollflöde under övergången
- [x] C4. Se till att basrollen fortsatt styr grundåtkomst till bolaget

## Etapp D - Läsning från backend
- [x] D1. Utöka `getActiveCompany()` eller motsvarande så capabilities hämtas per aktivt bolag
- [x] D2. Se till att capabilities följer med till appens providers/layout
- [x] D3. Dokumentera tydligt skillnaden mellan:
  - authroll
  - basroll i bolaget
  - capability/funktionsroll

## Etapp E - Första migrering av UI-behörigheter
- [x] E1. Projektsammanfattning/ledningsvy styrs av `project_lead` eller `admin`
- [x] E2. Ekonominavigering styrs av `finance` eller `admin`
- [x] E3. Fakturor och reskontra styrs av `finance` eller `admin`
- [x] E4. Medlemshantering styrs av `team_admin` eller `admin`
- [x] E5. Rapporter styrs av `reporting`, `finance` eller `admin`

## Etapp F - Navigation
- [x] F1. DesktopSidebar ska visa poster utifrån capabilities, inte bara `role`
- [x] F2. MobileBottomNav ska visa poster utifrån capabilities, inte bara `role`
- [x] F3. `Lägg till`-menyn ska använda capabilities
- [x] F4. Dagens förenklade `member`-nav ska översättas till capability-baserat nav

## Etapp G - Inställningar och administration
- [x] G1. Lägg till adminvy för att tilldela capabilities per medlem
- [x] G2. Visa basroll och capabilities tydligt i medlemshanteringen
- [x] G3. Tillåt flera capabilities per medlem samtidigt
- [x] G4. Visa enkel sammanfattning i teamvyn:
  - basroll
  - capabilities
  - aktivt projektansvar vid behov

## Etapp H - Kompatibilitet och migration
- [x] H1. Definiera hur nuvarande `finance`-roll migreras:
  - behålls som basroll tillfälligt
  - eller mappas till `member + finance`
- [x] H2. Definiera hur nuvarande `admin`-roll ska fungera:
  - full access oavsett capabilities
- [x] H3. Behåll kompatibilitetslager tills UI:t helt slutat anta en enda roll
- [ ] H4. Testa att gamla användare inte tappar åtkomst vid migrering

## Etapp I - Testfall
- [ ] I1. Employee utan capability ser bara grundfunktioner
- [ ] I2. Employee + finance ser ekonomi, ordrar, fakturor
- [ ] I3. Employee + project_lead ser projektsammanfattning och planering
- [ ] I4. Employee + reporting ser rapporter men inte ekonomiåtgärder
- [ ] I5. Employee + team_admin kan hantera medlemmar utan att vara admin
- [ ] I6. Admin har fortsatt full åtkomst

## Etapp J - Dokumentation
- [ ] J1. Uppdatera README med nya behörighetsprinciper
- [ ] J2. Dokumentera capability-modellen i hjälpen för interna admins
- [ ] J3. Dokumentera hur framtida kundportal ska läsa samma modell utan att ta över intranätets UI-logik

## Rekommenderad byggordning
1. Etapp B - Datamodell
2. Etapp C - Helpers och appkontext
3. Etapp D - Backendläsning
4. Etapp E - Första UI-migrering
5. Etapp F - Navigation
6. Etapp G - Adminhantering
7. Etapp H - Kompatibilitet
8. Etapp I - Testning
9. Etapp J - Dokumentation

## Definition av målbild
För att kalla den nya behörighetsmodellen klar bör följande gälla:
- en användare har en tydlig basroll i bolaget
- samma användare kan ha flera capabilities samtidigt
- navigation och vyer styrs av capabilities
- ekonomi och projektsammanfattning kan ges till olika användare utan att allt kräver admin
- nuvarande data och användare kan migreras utan att access bryts

## Noteringar
- Detta gäller intranätet `intra.tre60grader.se`.
- Kundportalen under `portal.tre60grader.se` ska senare kunna läsa samma grunddata, men med separat app och separat UI.
- Auth-beslut i intranätet ska fortsatt bygga på central auth-kontext; capabilities är ett bolags-/app-lager ovanpå det.
- Under övergången gäller:
  - basrollen `finance` ger effektivt capability `finance` och `reporting`
  - basrollen `admin` ger fortsatt full access oavsett explicit capabilitydata
  - explicit capabilitydata används redan nu parallellt med äldre roller
