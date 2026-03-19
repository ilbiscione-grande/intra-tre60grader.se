# Samlingsfaktura Plan

Denna plan beskriver hur vi inför stöd för samlingsfaktura utan att bryta standardflödet i appen.

Grundprincip:
- Standard ska fortsatt vara `1 projekt -> 1 order -> 1 faktura`.
- Samlingsfaktura ska vara ett extra, aktivt valt flöde.
- Första versionen ska bygga på flera `ordrar`, inte fria orderrader.

Arbetssätt:
- Vi gör en punkt i taget.
- Vi markerar punkten som `[x]` när den är helt klar.
- Om en punkt är påbörjad men inte färdig markeras den som `[-]`.

Status:
- `[ ]` = Ej startad
- `[-]` = Pågår
- `[x]` = Klar

## Etapp A - Datamodell
- [x] A1. Lägg till tabellen `invoice_sources`
- [x] A2. Lägg till index för `invoice_id`, `order_id` och `company_id`
- [x] A3. Lägg till unik constraint för `(invoice_id, order_id)`
- [x] A4. Lägg till foreign keys mot `invoices`, `orders`, `projects`, `companies`
- [x] A5. Uppdatera `database.types.ts`

## Etapp B - Kompatibilitet och migrering
- [x] B1. Backfilla befintliga fakturor till `invoice_sources`
- [x] B2. Behåll `invoices.project_id` och `invoices.order_id` som kompatibilitetsfält i V1
- [ ] B3. Verifiera att gamla fakturor fortfarande öppnas korrekt efter migrering

## Etapp C - Backend och RPC
- [x] C1. Lägg till RPC `create_invoice_from_orders(order_ids uuid[])`
- [x] C2. Validera att alla orders tillhör samma bolag
- [x] C3. Validera att alla orders tillhör samma kund
- [x] C4. Blockera tomma orders eller orders utan orderrader
- [x] C5. Blockera otillåtna redan fakturerade orders
- [x] C6. Skapa faktura + tillhörande `invoice_sources`
- [x] C7. Returnera tydlig payload med `invoice_id`, `invoice_no`, `order_count`, `project_count`

## Etapp D - Läsmodell
- [x] D1. Lägg till backend-helper eller RPC för att läsa fakturans källor
- [x] D2. Säkerställ att fakturadetalj kan visa flera projekt/orders
- [x] D3. Säkerställ att export/JSON kan visa alla källor

## Etapp E - UI för skapeflöde
- [x] E1. Lägg till knapp `Skapa samlingsfaktura` på kunddetaljen
- [x] E2. Bygg dialog eller sheet för att välja flera orders
- [x] E3. Gruppera valbara orders per projekt
- [x] E4. Visa sammanställning med antal projekt, antal orders och total
- [x] E5. Koppla `Skapa faktura` till nya RPC:n
- [x] E6. Redirecta till skapad faktura efter lyckat skapande

## Etapp F - Fakturadetalj och visning
- [x] F1. Visa att fakturan är en samlingsfaktura när flera källor finns
- [x] F2. Visa vilka projekt som ingår
- [x] F3. Visa vilka orders som ingår
- [x] F4. Gruppera innehållet per projekt om det förbättrar läsbarheten

## Etapp G - Projekt och order
- [x] G1. Visa i projektdetalj att projektet ingår i en samlingsfaktura
- [x] G2. Visa i orderdetalj att ordern ingår i en samlingsfaktura
- [x] G3. Justera ekonomi-flikarna så de inte antar att en faktura alltid hör till exakt ett projekt

## Etapp H - Regler och integritet
- [x] H1. Säkerställ att samma order inte dubbelkopplas till flera aktiva fakturor i V1
- [x] H2. Säkerställ att periodlås fortfarande gäller
- [x] H3. Säkerställ att fakturaintegritet och statusregler fortfarande gäller
- [x] H4. Dokumentera hur kredit/void ska hanteras i nästa fas

## Etapp I - Testning
- [ ] I1. Testa att vanlig faktura från en order fungerar oförändrat
- [ ] I2. Testa att samlingsfaktura från flera orders med samma kund fungerar
- [ ] I3. Testa att olika kunder blockeras
- [ ] I4. Testa att olika bolag blockeras
- [ ] I5. Testa att export visar alla källor
- [ ] I6. Testa att projekt- och orderdetalj visar korrekt fakturakoppling

## Etapp J - Dokumentation
- [x] J1. Uppdatera README med stöd för samlingsfaktura
- [x] J2. Dokumentera att standardflödet fortsatt är `1 projekt -> 1 faktura`
- [x] J3. Dokumentera begränsningar i V1
- [x] J4. Lägg till intern hjälpartikel om när samlingsfaktura ska användas

## V1-avgränsning
- Endast från kunddetaljen
- Endast hela orders
- Endast samma kund
- Ingen efterredigering av urval på redan skapad faktura

## Noteringar
- Den här funktionen ska införas som ett tillägg, inte som ersättning för dagens standardflöde.
- Vi ska undvika att göra `invoices.project_id` flervärd. Källkoppling ska ligga i separat tabell.
- Första versionen ska hållas liten och robust. Finare kontroll på orderradnivå får komma senare.
