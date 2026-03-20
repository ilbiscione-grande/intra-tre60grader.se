# Projekthantering Roadmap

Denna roadmap beskriver hur vi tar appen från bra projektstöd till en mer komplett projekthanteringsplattform.

Grundprincip:
- Vi bygger vidare på nuvarande intranät, inte ett nytt system vid sidan av.
- Vi prioriterar funktioner som höjer det dagliga arbetet i projekt, inte bara översiktsvyer.
- Vi håller kundportal som ett separat framtida spår under `portal.tre60grader.se`, även om den senare ska använda samma databas och auth-grund.

Arbetssätt:
- Vi gör en punkt i taget.
- Vi markerar punkten som `[x]` när den är helt klar.
- Om en punkt är påbörjad men inte färdig markeras den som `[-]`.

Status:
- `[ ]` = Ej startad
- `[-]` = Pågår
- `[x]` = Klar

## Etapp A - Grund för planering och ansvar
- [x] A1. Lägg till projektmedlemmar som egen koppling (`project_members`)
- [x] A2. Visa tilldelade medlemmar på projektkort och projektdetalj
- [x] A3. Låt medlemmar tilldelas redan när projekt skapas
- [x] A4. Lägg till projektdatum: startdatum och slutdatum
- [x] A5. Lägg till delmål/milstolpar på projektet
- [x] A6. Visa nästa delmål och enkel planeringsstatus i projektdetalj och projektkort

## Etapp B - Uppgifter och arbetsfördelning
- [ ] B1. Inför riktiga uppgifter/tasks per projekt
- [ ] B2. Låt uppgift ha ansvarig medlem
- [ ] B3. Låt uppgift ha deadline och prioritet
- [ ] B4. Lägg till checklista/subtasks på uppgift
- [ ] B5. Knyt uppgifter till delmål när det är relevant
- [ ] B6. Visa uppgifter både som lista och i enkel board-vy
- [ ] B7. Visa “mina uppgifter” för inloggad användare

## Etapp C - Tidsrapportering
- [ ] C1. Lägg till tidsposter per projekt
- [ ] C2. Låt tidspost kunna kopplas till uppgift
- [ ] C3. Låt tidspost kunna kopplas till order eller fakturerbart arbete
- [ ] C4. Visa timmar per medlem och projekt
- [ ] C5. Visa fakturerbar tid kontra intern tid
- [ ] C6. Lägg till enkel veckovy eller dagsvy för tidrapportering

## Etapp D - Projektbudget och uppföljning
- [ ] D1. Definiera projektbudget för timmar, kostnad och intäkt
- [ ] D2. Visa utfall mot budget i projektdetalj
- [ ] D3. Visa prognos och marginal på projektnivå
- [ ] D4. Flagga projekt som riskerar att gå över budget
- [ ] D5. Visa projekt som saknar budget men har aktivitet
- [ ] D6. Visa KPI:er för projektledningsöversikt

## Etapp E - Filer och leveranser
- [ ] E1. Bygg en riktig projektfil-yta, separat från fakturabilagor och uppdateringsbilagor
- [ ] E2. Stöd mappar eller kategorier som t.ex. brief, avtal, leverans, underlag
- [ ] E3. Visa filhistorik och uppladdad av
- [ ] E4. Visa preview för bilder och dokument där det är rimligt
- [ ] E5. Lägg till versionshantering för utvalda filer

## Etapp F - Kommunikation och historik
- [x] F1. Projektuppdateringar som trådar
- [x] F2. Svar på uppdateringar
- [x] F3. Notiser för svar och omnämnanden
- [ ] F4. Lägg till riktiga @-omnämnanden med bättre förslag och markering
- [ ] F5. Lägg till aktivitetshistorik även för tasks, tidsrapportering och medlemsändringar
- [ ] F6. Visa “senast uppdaterat av” tydligare i centrala vyer

## Etapp G - Projektmallar och återanvändning
- [ ] G1. Skapa projektmallar
- [ ] G2. Låt mall innehålla kolumnstart, standarddelmål och standardmedlemmar
- [ ] G3. Låt mall innehålla standarduppgifter/checklistor
- [ ] G4. Låt mall innehålla standardorderrader där det passar
- [ ] G5. Låt admin hantera mallar centralt

## Etapp H - Automatisering och regler
- [ ] H1. Lägg till regler som triggar när projekt går till viss kolumn
- [ ] H2. Lägg till påminnelse när slutdatum närmar sig
- [ ] H3. Lägg till påminnelse när projekt saknar uppdatering senaste X dagar
- [ ] H4. Lägg till påminnelse när projekt är klart men ännu inte fakturerat
- [ ] H5. Lägg till enkel automation för standardflöden utan att göra systemet svåröverskådligt

## Etapp I - Dashboard och ledningsvy
- [ ] I1. Visa aktiva projekt, försenade projekt och projekt utan ansvarig
- [ ] I2. Visa projekt utan uppdatering senaste X dagar
- [ ] I3. Visa projekt som är klara men ej fakturerade
- [ ] I4. Visa budgetavvikelse och riskprojekt
- [ ] I5. Visa teambelastning per medlem

## Etapp J - Mobil arbetsyta
- [ ] J1. Gör tasks fullt användbara i mobil
- [ ] J2. Gör tidrapportering fullt användbar i mobil
- [ ] J3. Gör projektfiler och previews fullt användbara i mobil
- [ ] J4. Säkerställ att alla viktiga projektåtgärder går att göra utan desktop

## Etapp K - Kundportal (separat modul)
- [ ] K1. Definiera vilka projektdata som får exponeras externt via `portal.tre60grader.se`
- [ ] K2. Inför tydlig separering mellan intern uppdatering och kunddelbar uppdatering
- [ ] K3. Säkerställ att filer kan markeras som interna eller portal-delbara
- [ ] K4. Förbered projektmodellen för externa kontaktpersoner utan att bygga portalen här
- [ ] K5. Dokumentera gemensamma kontrakt mellan intra och portal:
  API-form, auth-kontext, datamodell, accessregler
- [ ] K6. Säkerställ att kundportal byggs som egen modul/app, inte som sammanblandad del av intranätets UI

## Rekommenderad byggordning
1. Etapp B - Uppgifter
2. Etapp D - Budget och uppföljning
3. Etapp C - Tidsrapportering
4. Etapp E - Projektfiler
5. Etapp G - Projektmallar
6. Etapp H - Automatisering
7. Etapp I - Dashboard
8. Etapp K - Förberedelser för kundportal

## Definition av “komplett” projekthantering i denna app
För att vi ska kunna kalla projektdelen “komplett” bör följande finnas:
- Planering: datum, delmål, ansvariga
- Arbete: uppgifter och tydlig arbetsfördelning
- Tid: tidrapportering och belastning
- Ekonomi: budget, utfall, prognos
- Kommunikation: uppdateringar, notiser, historik
- Dokument: projektfiler och leveranser
- Överblick: dashboard och risksignaler

## Noteringar
- Kundportal är ett separat framtida spår under `portal.tre60grader.se`.
- Portalen ska gärna använda samma Supabase-projekt och samma auth-grund, men egen appstruktur och eget UI.
- Interna funktioner ska inte designas så att de förutsätter kundåtkomst från början, men datamodellen bör förberedas för intern/external-delning där det är rimligt.
