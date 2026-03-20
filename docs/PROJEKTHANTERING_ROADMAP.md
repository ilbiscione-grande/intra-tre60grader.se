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
- [x] B1. Inför riktiga uppgifter/tasks per projekt
- [x] B2. Låt uppgift ha ansvarig medlem
- [x] B3. Låt uppgift ha deadline och prioritet
- [x] B4. Lägg till checklista/subtasks på uppgift
- [x] B5. Knyt uppgifter till delmål när det är relevant
- [x] B6. Visa uppgifter både som lista och i enkel board-vy
- [x] B7. Visa “mina uppgifter” för inloggad användare

## Etapp C - Tidsrapportering
- [x] C1. Lägg till tidsposter per projekt
- [x] C2. Låt tidspost kunna kopplas till uppgift
- [x] C3. Låt tidspost kunna kopplas till order eller fakturerbart arbete
- [x] C4. Visa timmar per medlem och projekt
- [x] C5. Visa fakturerbar tid kontra intern tid
- [x] C6. Lägg till enkel veckovy eller dagsvy för tidrapportering

## Etapp D - Projektbudget och uppföljning
- [x] D1. Definiera projektbudget för timmar, kostnad och intäkt
- [x] D2. Visa utfall mot budget i projektdetalj
- [x] D3. Visa prognos och marginal på projektnivå
- [x] D4. Flagga projekt som riskerar att gå över budget
- [x] D5. Visa projekt som saknar budget men har aktivitet
- [x] D6. Visa KPI:er för projektledningsöversikt

## Etapp E - Filer och leveranser
- [x] E1. Bygg en riktig projektfil-yta, separat från fakturabilagor och uppdateringsbilagor
- [x] E2. Stöd mappar eller kategorier som t.ex. brief, avtal, leverans, underlag
- [x] E3. Visa filhistorik och uppladdad av
- [x] E4. Visa preview för bilder och dokument där det är rimligt
- [x] E5. Lägg till versionshantering för utvalda filer

## Etapp F - Kommunikation och historik
- [x] F1. Projektuppdateringar som trådar
- [x] F2. Svar på uppdateringar
- [x] F3. Notiser för svar och omnämnanden
- [x] F4. Lägg till riktiga @-omnämnanden med bättre förslag och markering
- [x] F5. Lägg till aktivitetshistorik även för tasks, tidsrapportering och medlemsändringar
- [x] F6. Visa “senast uppdaterat av” tydligare i centrala vyer

## Etapp G - Projektmallar och återanvändning
- [x] G1. Skapa projektmallar
- [x] G2. Låt mall innehålla kolumnstart, standarddelmål och standardmedlemmar
- [x] G3. Låt mall innehålla standarduppgifter/checklistor
- [x] G4. Låt mall innehålla standardorderrader där det passar
- [x] G5. Låt admin hantera mallar centralt

## Etapp H - Automatisering och regler
- [x] H1. Lägg till regler som triggar när projekt går till viss kolumn
- [x] H2. Lägg till påminnelse när slutdatum närmar sig 
- [x] H3. Lägg till påminnelse när projekt saknar uppdatering senaste X dagar
- [x] H4. Lägg till påminnelse när projekt är klart men ännu inte fakturerat
- [x] H5. Lägg till enkel automation för standardflöden utan att göra systemet svåröverskådligt

## Etapp I - Dashboard och ledningsvy
- [x] I1. Visa aktiva projekt, försenade projekt och projekt utan ansvarig
- [x] I2. Visa projekt utan uppdatering senaste X dagar
- [x] I3. Visa projekt som är klara men ej fakturerade
- [x] I4. Visa budgetavvikelse och riskprojekt
- [x] I5. Visa teambelastning per medlem

## Etapp J - Mobil arbetsyta
- [x] J1. Gör tasks fullt användbara i mobil
- [x] J2. Gör tidrapportering fullt användbar i mobil
- [x] J3. Gör projektfiler och previews fullt användbara i mobil
- [x] J4. Säkerställ att alla viktiga projektåtgärder går att göra utan desktop

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
