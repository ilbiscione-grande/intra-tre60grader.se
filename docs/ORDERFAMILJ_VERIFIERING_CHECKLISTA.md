# Orderfamilj: verifieringschecklista

Syfte: verifiera att huvudorder, andringsorder, tillaggsorder, fakturering och kredit ger samma utfall i projektvy, ordervy, orderlista, fakturavy och reskontra.

## Forberedelser

- Skapa en testkund, till exempel `Testkund Orderfamilj AB`.
- Skapa ett nytt projekt, till exempel `Verifiering Orderfamilj 2026-04`.
- Kontrollera att du kan oppna:
  - projektets `Ekonomi`
  - orderdetaljen
  - `Fakturering`
  - fakturadetalj
  - kundreskontra

## Fall 1: endast huvudorder

### Testdata

- Skapa en huvudorder i projektet.
- Lagg till tva orderrader i orderdetaljen:
  - `Grundarbete` - antal `10` - a-pris `1000` - moms `25`
  - `Projektledning` - antal `2` - a-pris `1500` - moms `25`

Forvantat ordervarde:
- netto `13 000`
- brutto `16 250`

### Steg

1. Oppna projektet och skapa huvudordern.
2. Oppna [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/orders/[id]/page.tsx)-flodet via orderdetaljen och lagg till raderna ovan.
3. Faststall ordern for fakturering.
4. Skapa en vanlig faktura for hela ordern.

### Kontrollpunkter

- I orderlistan visas ordern som `Huvudorder`.
- I projektvyn visas `1 order` och `0 underordnade`.
- I orderdetaljen visas samma totalsumma som pa projektet.
- Efter fakturering visar projekt/order:
  - bruttofakturerat `16 250`
  - krediterat `0`
  - nettofakturerat `16 250`
  - kvar `0`

## Fall 2: huvudorder + andringsorder

### Testdata

- Skapa en `Andringsorder` under samma projekt.
- Lagg till en orderrad:
  - `Andring enligt ny bestallning` - antal `3` - a-pris `2000` - moms `25`

Forvantat andringsordervarde:
- netto `6 000`
- brutto `7 500`

Forvantad familjesumma efter fakturering av huvudorder + andringsorder:
- netto `19 000`
- brutto `23 750`

### Steg

1. Skapa andringsordern fran projektets ekonomidel.
2. Kontrollera att den kopplas till huvudordern.
3. Oppna andringsordern och lagg till raden ovan.
4. Faststall andringsordern.
5. Skapa faktura for andringsordern.

### Kontrollpunkter

- Datamodell:
  - `parent_order_id = huvudorder.id`
  - `root_order_id = huvudorder.id`
- I orderlistan:
  - huvudordern visas som huvudorder
  - andringsordern visas som underordnad
- I projektvyn:
  - familjen visar `2 ordrar`
  - `1 underordnad`
- I orderdetaljen for bade huvudorder och andringsorder visas samma familjesummering:
  - totalt ordervarde `23 750`
  - nettofakturerat `23 750` efter att bada ar fakturerade
  - kvar `0`
 
## Fall 3: huvudorder + tillaggsorder + kredit

### Testdata

- Skapa en `Tillaggsorder`.
- Lagg till en orderrad:
  - `Extra tillagg` - antal `4` - a-pris `500` - moms `25`

Forvantat tillaggsordervarde:
- netto `2 000`
- brutto `2 500`

Kreditdata:
- kreditera endast raden `Extra tillagg`

Forvantad familjesumma efter kredit:
- totalt bruttofakturerat `26 250`
- krediterat `2 500`
- nettofakturerat `23 750`

### Steg

1. Skapa tillaggsordern.
2. Laggt till raden ovan och faststall ordern.
3. Skapa faktura for tillaggsordern.
4. Oppna fakturan.
5. Anvand `Kreditera valda rader` och valj raden som kommer fran tillaggsordern.

### Kontrollpunkter

- I fakturadetaljen ska raden visa orderkoppling till tillaggsordern.
- Kreditfakturan ska visa tillbaka till originalfakturan.
- I projektvyn och orderdetaljen ska familjesummeringen visa:
  - bruttofakturerat `26 250`
  - krediterat `2 500`
  - netto `23 750`
  - kvar `0`
- I kundreskontran ska kreditfakturan vara tydligt markerad.

## Negativtester

### Databasregler

Forsok dessa med SQL eller via devverktyg om ni vill verifiera backendskyddet:

- skapa `change` utan `parent_order_id`
- skapa `supplement` utan `parent_order_id`
- satta `parent_order_id` till en order i annat projekt
- satta `parent_order_id` till en order i annat bolag
- satta `parent_order_id` till en annan underordnad order

Forvantat resultat:
- databasen nekar alla ovanstaende forsok

## Vyjämförelse

For varje fall ovan, jamfor samma struktur i:

- [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/projects/[id]/page.tsx)
- [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/orders/[id]/page.tsx)
- [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/orders/page.tsx)
- [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/invoices/[id]/page.tsx)
- [page.tsx](c:/Dev/projects/Company%20Manager%20Application/app/(app)/receivables/page.tsx)

Allt ovan bor ge samma slutsats om:

- vilken order som ar huvudorder
- vilka ordrar som ar underordnade
- familjens totala ordervarde
- bruttofakturerat
- krediterat
- nettofakturerat
- kvar att fakturera

## Klartecken efter verifiering

Nasta steg ar godkant nar:

- alla tre fallen ovan gar igenom utan manuell datakorrektion
- familjesummeringarna matchar i alla centrala vyer
- kredit minskar netto utan att skapa olika siffror i olika vyer
- inga backendregler kan kringgas med felaktig parent/root-koppling
