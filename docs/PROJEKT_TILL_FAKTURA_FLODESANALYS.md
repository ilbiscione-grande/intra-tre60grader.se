# Flödesanalys: Projekt till order, faktura och uppföljning

## Syfte

Det här dokumentet beskriver hur flödet fungerar i appen idag, från nytt projekt till order, faktura och uppföljning. Fokus ligger på:

- hur flödet faktiskt fungerar i nuvarande kodbas
- vad som är bra
- vad som är mindre bra
- vad som är direkt dåligt eller riskabelt
- hur flödet bör ändras för att bli bättre för två olika typer av bolag

Analysen bygger på nuvarande implementation i bland annat:

- `features/projects/CreateProjectEntry.tsx`
- `features/projects/projectQueries.ts`
- `app/(app)/projects/[id]/page.tsx`
- `app/(app)/orders/page.tsx`
- `app/(app)/orders/[id]/page.tsx`
- `app/(app)/customers/[id]/page.tsx`
- `app/(app)/invoices/page.tsx`
- `app/(app)/invoices/[id]/page.tsx`
- `app/(app)/receivables/page.tsx`
- `app/(app)/finance/page.tsx`
- `app/(app)/todo/page.tsx`
- `lib/rpc/index.ts`
- relevanta SQL-funktioner i `supabase/migrations`

---

## Kort sammanfattning

Appen har idag ett fungerande grundflöde för att gå från projekt till order och sedan vidare till faktura och uppföljning. Det finns också redan mycket bra stöd för aktivitet, tidrapportering, verifikationer, kundreskontra och arbetsuppföljning.

Det stora problemet är inte att flödet saknas. Problemet är att flödet är utspritt över flera olika ytor och att vissa affärssteg inte är tydligt modellerade som egna steg i processen. Det gör att appen fungerar bättre som ett internt arbetsverktyg än som ett riktigt sammanhållet "projekt till cash"-flöde.

Den viktigaste strukturella svagheten idag är att:

- varje projekt får en order direkt vid projektstart
- ordern är i praktiken 1:1 mot projekt
- orderstatus och fakturastatus finns, men det saknas ett tydligt godkännande-/överlämningssteg mellan drift och ekonomi
- uppföljningen finns, men är splittrad mellan projekt, kund, faktura, att-göra och ekonomi

För en ensam admin fungerar detta ganska bra. För ett mindre företag med flera roller fungerar det, men det blir lätt otydligt vem som gör vad och när ett jobb faktiskt är redo att faktureras.

---

## Hur flödet fungerar idag

## 1. Start av nytt projekt

När ett projekt skapas via projektflödet skapas det inte bara ett projekt. Samtidigt skapas också en order i bakgrunden via RPC-funktionen `create_project_with_order(...)`.

Det innebär att projektstart idag i praktiken betyder:

1. projekt skapas
2. kund kan kopplas eller skapas
3. startkolumn sätts
4. ansvarig användare kan sättas
5. medlemmar kan tilldelas
6. start/slutdatum och delmål kan sättas
7. en order skapas direkt för projektet
8. malluppgifter och mallorderrader kan skapas samtidigt

Det är alltså inte "skapa projekt först, skapa order senare", utan "skapa projekt och order som ett gemensamt startpaket".

### Vad som är bra

- snabbt att komma igång
- passar bra när projekt nästan alltid ska faktureras
- minskar risken att glömma orderkopplingen
- projektet blir direkt redo för orderrader och ekonomi

### Mindre bra

- projekt och order är hårt ihopkopplade från start, även om jobbet ännu är oklart
- användaren tvingas i praktiken in i ett kommersiellt flöde direkt
- det finns inget tydligt alternativ för "internt projekt", "förstudie", "prospect", "jobb utan beslutad order"

### Dåligt

- relationen är i praktiken 1 projekt = 1 order
- det blir svårare att hantera ändringsorder, etapper eller flera kommersiella steg inom samma projekt
- man blandar planering och affärslåsning tidigt i flödet

Det här är dock inte ett lika stort problem i alla lägen. För enkla jobb, särskilt när samma person säljer, utför och fakturerar, fungerar `1 projekt = 1 order` ofta helt okej. Problemen uppstår framför allt när:

- projektet lever längre än den ursprungliga kommersiella överenskommelsen
- arbetet förändras under resans gång
- delar ska godkännas eller faktureras separat
- flera personer är inblandade i överlämningen mellan drift och ekonomi

---

## 2. Arbete i projektet

När projektet väl finns används projektsidan som huvudyta för arbetet. Där finns idag stöd för:

- översikt
- tidsplan och delmål
- uppgifter
- tidrapportering
- uppdateringar
- ekonomi
- bilagor
- medlemmar
- loggar

Det här är i grunden starkt. Projektet fungerar som nav för utförandet.

### Det som händer under genomförandet

- uppgifter skapas och ansvariga kan sättas
- uppgiftsansvarig blir automatiskt uppgiftsmedlem
- projektansvarig blir automatiskt projektmedlem
- tid kan rapporteras på projekt och uppgift
- projektuppdateringar kan skapas och kommenteras
- projektets senaste aktivitet byggs från uppdateringar, uppgifter, tid, medlemmar och filer

### Vad som är bra

- tydligt arbetsnav
- bra stöd för vardagsarbete
- bra aktivitetshistorik
- projektet blir levande genom uppgifter, tid och uppdateringar

### Mindre bra

- det saknas ett tydligt steg "redo för fakturering"
- ekonomi ligger som en flik i projektet, men affärsflödet är ändå utspritt
- det är inte helt tydligt för en användare när arbetet går från "pågår" till "kan skickas till ekonomi"

### Dåligt

- det finns ingen tydlig överlämningsmodell mellan drift och ekonomi
- projektstatus, orderstatus och fakturastatus kan leva parallellt utan stark styrning mellan dem
- det går att arbeta länge i projektet utan att det finns en tydlig "kommersiell checkpoint"

---

## 3. Orderhantering idag

Ordern är idag mer en ekonomisk följesedel än en egen stark processyta.

Det går att:

- se orderlista
- öppna en order
- se orderrader
- se kopplade fakturor
- ändra orderstatus
- skapa faktura från order

I projektsidans ekonomiflik går det dessutom att:

- lägga till orderrad
- ändra orderrad
- ta bort orderrad
- ändra orderstatus
- skapa faktura

### Viktig faktisk egenskap i dagens lösning

Orderrader kan idag i praktiken hanteras av vanliga bolagsmedlemmar, medan orderstatus/fakturering är mer låst till `admin`/`finance`.

Det betyder att appen redan delvis stödjer ett samarbete där flera personer kan bygga upp underlaget, medan ekonomi fastställer och fakturerar.

### Vad som är bra

- ordern är lätt att komma åt
- orderrader är nära projektets verkliga arbete
- order och faktura går att följa från projekt, kund och faktura

### Mindre bra

- ordern känns inte som ett tydligt affärssteg med egen livscykel
- statusarna är ganska grova: `draft`, `sent`, `paid`, `cancelled`, `invoiced`
- det saknas ett tydligt steg som motsvarar "klar att fastställa", "fastställd", "redo att fakturera"

### Dåligt

- ordern är för undanskymd i förhållande till dess affärsvikt
- det finns inget tydligt godkännandeflöde
- om flera personer samarbetar blir det oklart när orderunderlaget faktiskt är färdigt

---

## 4. Fakturering idag

Faktura skapas idag från order genom `create_invoice_from_order(...)`.

Det som sker då är i korthet:

- systemet hämtar ordern
- kontrollerar rätt behörighet
- säkerställer att kund finns
- räknar ihop orderraderna
- skapar faktura
- kopplar faktura till order/projekt via `invoice_sources`
- uppdaterar orderstatus till `invoiced`

Det finns också stöd för samlingsfaktura via kundsidan genom `create_invoice_from_orders(...)`, om flera ordrar hör till samma kund.

### Vad som är bra

- bra servervalidering
- fakturan byggs från snapshots, vilket är starkt revisionsmässigt
- samlingsfaktura finns redan
- fakturan kopplas tillbaka till projekt och order

### Mindre bra

- fakturaskapandet är ganska tekniskt och "bakom kulisserna"
- användaren ser inte ett tydligt fakturaunderlag som måste granskas innan fastställande
- en order blir snabbt "fakturerad" utan att det finns ett tydligt mellanläge för intern godkännande

### Dåligt

- användarflödet saknar tydlig "förhandsgranska och fastställ"
- för små team blir detta lätt ett klickbaserat systembeteende snarare än ett kontrollerat affärssteg
- fakturaskapandet känns mer som en funktion än som en process

---

## 5. Faktura, utskick, betalning och uppföljning idag

När fakturan finns går det i detaljvyn att:

- bokföra fakturautställandet
- skicka faktura
- registrera betalning
- registrera återbetalning
- korrigera betalning
- markera påminnelse-/inkassosteg
- ladda upp bilagor
- skapa kreditfaktura

Det här är i grunden ganska starkt.

Det finns också bredare uppföljning via:

- fakturalista
- kundreskontra
- ekonomiöversikt
- att-göra-sidan
- kunddetaljer

### Vad som är bra

- bra stöd för ekonomisk uppföljning
- tydliga kontroller kring periodlås och immutability
- kundreskontran ger faktisk uppföljningsnytta
- att-göra-sidan fångar förfallna fakturor och verifikationsproblem

### Mindre bra

- uppföljningen ligger i många olika vyer
- olika delar svarar på olika frågor, men utan ett tydligt sammanhållet huvudflöde
- fakturalistan är fortfarande mer lista än arbetsyta

### Dåligt

- `send_invoice(...)` är idag i praktiken ett internt mockflöde, inte en riktig extern leveransintegration
- användaren kan få en känsla av "faktura skickad" även om flödet ännu inte motsvarar full produktionsmässig leverans
- uppföljningsansvaret är inte tydligt kopplat till roller eller ägarskap per steg

---

## 6. Uppföljning idag

Uppföljning finns, men den är fördelad på flera ställen:

- `Att göra`
  - stilla projekt
  - projekt utan ansvarig
  - försenade uppgifter
  - långa timers
  - förfallna kundfakturor
  - förfallna leverantörsfakturor
  - verifikationer utan bilaga eller med obalans
- projektets egen aktivitet
- kundreskontra
- ekonomisidan
- kunddetaljer

### Vad som är bra

- systemet har redan mycket av den data som krävs för bra uppföljning
- att-göra-sidan är ett starkt steg i rätt riktning

### Mindre bra

- uppföljningen är mer "många bra signaler" än "en tydlig process"
- det saknas ett tydligt huvudspår för vad som händer när ett projekt är klart men inte fakturerat

### Dåligt

- användaren måste fortfarande förstå systemet snarare än att systemet leder användaren genom kedjan

---

## Scenario 1: Egenföretagare, admin, gör allt själv

## Hur flödet fungerar idag

Det här scenariot fungerar relativt bra i dagens modell.

Typisk kedja:

1. användaren skapar projekt
2. order skapas automatiskt
3. användaren planerar jobbet i projektet
4. användaren lägger till uppgifter, tid och uppdateringar
5. användaren lägger orderrader i projektets ekonomiflik
6. användaren skapar faktura
7. användaren bokför/skickar/registrerar betalning
8. användaren följer upp via faktura, reskontra eller att-göra

## Vad som fungerar bra för scenario 1

- snabbt
- få steg
- inget beroende av överlämning mellan roller
- projektet fungerar som ett vettigt nav
- automatisk order vid projektstart är ofta bekvämt

## Vad som skaver för scenario 1

- projektstarten är lite för tung om jobbet är litet
- det saknas ett ännu enklare "ta in jobb -> börja jobba -> fakturera" flöde
- order och faktura känns fortfarande lite administrativa jämfört med hur en ensam användare tänker

## Rekommendation för scenario 1

För ensamföretagaren bör appen erbjuda ett förenklat snabbflöde:

1. `Nytt jobb`
2. välj/skapa kund
3. skriv vad jobbet gäller
4. börja direkt
5. lägg tid / orderrader löpande
6. `Skapa fakturaunderlag`
7. `Fastställ och skicka`

Det bör fortfarande bygga på samma datamodell, men UI:t ska kännas mer som ett sammanhängande "jobbflöde" än tre separata delar.

---

## Scenario 2: Litet bolag med 8 anställda och delat ansvar

## Hur flödet fungerar idag

Det här scenariot stöds delvis, men inte rent.

Det som fungerar:

- flera personer kan vara inne i samma projekt
- medlemmar kan tilldelas
- ansvarig kan sättas
- uppgifter och tid kan fördelas
- orderrader kan byggas upp i projektet
- admin/finance kan fastställa mer ekonomiska delar
- kunddetaljen kan skapa samlingsfaktura från flera ordrar

Det som inte är tydligt modellerat:

- vem som äger "intag"
- vem som äger "planering"
- när jobbet anses redo att lämnas över till ekonomi
- när ordern går från arbetsutkast till fastställd kommersiell överenskommelse

## Vad som fungerar bra för scenario 2

- projektet är ett gemensamt arbetsnav
- aktivitet, tid och uppgifter gör samarbete möjligt
- ekonomiska låsningar finns
- fakturering är redan mer styrd till `admin`/`finance`

## Vad som skaver för scenario 2

- rollfördelningen finns, men processfördelningen är svag
- ordern är inte ett tydligt godkännandesteg
- "klar att fakturera" är ingen riktig systemstatus
- ekonomi behöver ofta läsa projektets verkliga arbete mellan raderna

## Vad som är dåligt för scenario 2

- 1 projekt = 1 order blir snabbt begränsande
- det saknas tydlig intern överlämning mellan mottagare, planerare, utförare och ekonomi
- kunden, projektet, ordern och fakturan känns kopplade i datan men inte tillräckligt styrda i processen

## Rekommendation för scenario 2

Det lilla bolaget behöver ett tydligare arbetsflöde med ansvarspunkter:

1. `Intag`
   - kundkontakt
   - behov
   - preliminär uppskattning
2. `Planering`
   - ansvarig planerare
   - tilldelade resurser
   - delmål och uppgifter
3. `Utförande`
   - uppdateringar
   - tid
   - underlag
4. `Faktureringsunderlag`
   - orderrader färdigställda
   - timmar/linjer kontrollerade
   - projekt markeras som redo för ekonomi
5. `Ekonomisk fastställelse`
   - endast vd/finance
   - order fastställs
   - faktura skapas/skickas
6. `Uppföljning`
   - betalning
   - påminnelse
   - inkasso vid behov

Det här bör vara ett verkligt systemflöde, inte bara ett arbetssätt man måste förstå själv.

---

## Bedömning: vad är bra, mindre bra och dåligt

## Bra

- stark projektkärna
- projekt, order, faktura och ekonomi hänger ihop datamässigt
- samlingsfaktura finns
- uppföljning via att-göra och reskontra finns
- ekonomisidan har redan bra kontrollfunktioner
- snapshots, låsningar och immutability i fakturaflödet är starka

## Mindre bra

- många steg finns, men de är inte samlade som en enda affärsprocess
- ordern känns underutvecklad som processbärare
- faktureringen saknar ett tydligt fastställandesteg i UI:t
- uppföljningen är bra men spridd

## Dåligt

- projektstart skapar alltid order, även när det inte alltid är rätt steg
- 1:1 mellan projekt och order är för snävt
- det saknas ett formellt "redo för fakturering"-steg
- systemet särskiljer inte tydligt mellan arbetsflöde och kommersiellt flöde
- leverans av faktura är ännu inte ett fullt verkligt utskicksflöde

---

## Förslag: hur flödet bör förbättras

## Målbild

Appen bör gå från:

- projekt med inbyggd order och separat faktura

till:

- ett sammanhållet `projekt till cash`-flöde

där varje steg har tydligt syfte, tydlig ägare och tydlig nästa handling.

## Definierat målflöde

Det här är den målflödeskedja som ska användas som riktning för vidare utveckling:

1. `Intag`
   - syfte: fånga kundbehov och starta arbetet
   - huvudansvar: den som tar emot jobbet
   - resultat: kund vald eller skapad, projekt skapat, huvudorder finns

2. `Planering`
   - syfte: göra jobbet genomförbart
   - huvudansvar: projektansvarig eller planerare
   - resultat: ansvarig satt, medlemmar tilldelade, uppgifter och delmål finns vid behov

3. `Utförande`
   - syfte: genomföra jobbet och samla underlag
   - huvudansvar: utförare och projektansvarig
   - resultat: tid rapporterad, uppdateringar gjorda, bilagor/underlag tillagda, orderrader byggs upp

4. `Faktureringsunderlag`
   - syfte: göra arbetet kommersiellt redo
   - huvudansvar: projektansvarig eller den som lämnar över till ekonomi
   - resultat: projekt/order markerat som redo för fakturering, underlag granskat

5. `Fastställelse`
   - syfte: ekonomiskt godkännande före faktura
   - huvudansvar: `admin` eller `finance`
   - resultat: order/fakturaunderlag fastställt för fakturering

6. `Fakturering`
   - syfte: skapa och skicka faktura
   - huvudansvar: `admin` eller `finance`
   - resultat: faktura skapad, skickad och spårbar

7. `Uppföljning`
   - syfte: säkerställa att affären avslutas ekonomiskt
   - huvudansvar: `admin` eller `finance`
   - resultat: betalning registrerad, påminnelse/inkasso hanterad vid behov, avvikelse fångad i uppföljning

## Principer för målflödet

- Projektet är arbetsnavet.
- Ordern är det kommersiella underlaget.
- Fakturan är den ekonomiska utgående handlingen.
- Uppföljning ska kunna ske utan att användaren måste hoppa mellan många olika sidor för att förstå nästa steg.
- Scenario 1 ska kunna hoppa snabbt genom kedjan.
- Scenario 2 ska kunna använda samma kedja med tydligare kontrollpunkter och överlämningar.

## Definierat steg: `Redo för fakturering`

Det här steget ska fungera som den tydliga överlämningen mellan utfört arbete och ekonomisk hantering.

### Föreslagen statuskedja för faktureringsberedskap

- `Inte redo`
  arbete pågår fortfarande eller underlaget är inte klart
- `Under kontroll`
  någon håller på att gå igenom timmar, orderrader eller underlag
- `Redo för fakturering`
  arbetet är klart nog att lämnas över till ekonomi
- `Fastställd för fakturering`
  `admin` eller `finance` har godkänt underlaget för faktura

### Vad `Redo för fakturering` betyder

När ett projekt eller dess order markeras som `Redo för fakturering` betyder det:

- arbetet är utfört helt eller tillräckligt långt för att kunna faktureras
- relevanta orderrader och/eller timmar finns med
- den som äger projektet anser att underlaget kan lämnas vidare
- nästa steg hör hemma hos ekonomi eller den som fastställer affären

Det betyder däremot inte automatiskt att:

- fakturan redan är godkänd
- fakturan redan ska skickas
- underlaget är bokföringsmässigt färdigt

Det är just därför `Fastställd för fakturering` behövs som separat steg.

### Vem ska kunna sätta steget

Föreslagen ansvarsfördelning:

- projektansvarig kan sätta `Under kontroll`
- projektansvarig eller annan utsedd ansvarig kan sätta `Redo för fakturering`
- `admin` och `finance` kan sätta `Fastställd för fakturering`

På så sätt blir steget både användbart för team och tillräckligt kontrollerat.

### Vad som minst bör vara uppfyllt för `Redo för fakturering`

Miniminivå:

- kund finns
- huvudorder finns
- underlaget har ett positivt fakturerbart värde

Önskvärd kontroll:

- orderrader finns eller det finns tydligt fakturerbar tid
- projektet har inte tydliga blockerande avvikelser
- ansvarig vet att jobbet kan lämnas över

Det här bör initialt vara en enkel och praktisk nivå, inte en för tung checklista.

### Hur det ska fungera i scenario 1

För ensamföretagaren ska detta steg inte bli ett tvång om det bara gör flödet långsammare.

Därför bör scenario 1 kunna:

- hoppa direkt från projekt/order till `Skapa faktura`
- eller frivilligt använda `Redo för fakturering` om man vill arbeta mer strukturerat

### Hur det ska fungera i scenario 2

För teamflödet bör `Redo för fakturering` vara den naturliga arbetsöverlämningen:

- drift gör klart jobbet
- ansvarig markerar redo
- ekonomi fastställer
- faktura skapas/skickas

Det är här steget gör som mest nytta.

## Definierat steg: Order som eget affärssteg

Ordern ska inte bara vara en teknisk koppling mellan projekt och faktura. Den ska vara den tydliga bäraren av det kommersiella underlaget.

### Vad ordern ska representera

Ordern ska beskriva:

- vad kunden faktiskt ska debiteras för
- vilket underlag som är kommersiellt överenskommet
- vad som är färdigt att fastställa
- vad som senare ligger till grund för faktura

Projektet ska fortfarande vara platsen där arbetet utförs.
Ordern ska vara platsen där det fakturerbara underlaget formas och godkänns.

### Föreslagen livscykel för ordern

- `Utkast`
  ordern finns, men underlaget är fortfarande tidigt eller ofullständigt
- `Under arbete`
  orderrader och underlag byggs upp löpande
- `Klar för godkännande`
  projektansvarig eller motsvarande anser att ordern är redo att granskas
- `Fastställd`
  `admin` eller `finance` har godkänt den kommersiella grunden
- `Fakturerad`
  faktura är skapad från ordern
- `Avslutad`
  ordern är färdigbehandlad och kräver ingen vidare kommersiell hantering

### Vad som ska hända mellan statusarna

- `Utkast -> Under arbete`
  när verkligt arbete eller prissättning börjar byggas upp
- `Under arbete -> Klar för godkännande`
  när ordern är genomarbetad nog att lämnas över
- `Klar för godkännande -> Fastställd`
  när ekonomi eller behörig beslutsfattare godkänner underlaget
- `Fastställd -> Fakturerad`
  när faktura skapas
- `Fakturerad -> Avslutad`
  när ordern inte längre behöver följas upp som separat affärsobjekt

### Vem ska äga vilka steg

- utförare och projektansvarig kan arbeta i `Utkast` och `Under arbete`
- projektansvarig kan markera `Klar för godkännande`
- `admin` och `finance` ska kunna sätta `Fastställd`
- fakturering från order bör i normalfallet ske från `Fastställd`

För scenario 1 kan systemet fortfarande tillåta snabbare genväg direkt till faktura, men den här livscykeln bör vara den strukturella modellen.

### Vad som blir bättre om ordern får den här rollen

- tydligare skillnad mellan arbete och kommersiellt underlag
- bättre överlämning mellan drift och ekonomi
- enklare att förstå vad som faktiskt är godkänt
- bättre grund för framtida stöd för tilläggsordrar och delfakturering

### Risk att tänka på

Det här får inte bli så tungt att användaren måste klicka sig genom onödiga steg i enkla flöden.

Därför bör modellen byggas så att:

- scenario 1 kan vara snabbt
- scenario 2 kan vara kontrollerat

Det är alltså modellen som ska bli tydligare, inte nödvändigtvis varje användares vardag mer administrativ.

## Definierad princip: Arbetsprojekt vs kommersiellt underlag

Det här är en central princip för fortsatt utveckling:

- projektet är arbetsytan
- ordern är det kommersiella underlaget

De hör ihop, men de ska inte försöka lösa samma sak.

### Projektet ska bära

- planering
- ansvar och bemanning
- uppgifter
- delmål
- tidrapportering
- uppdateringar
- bilagor och praktiskt arbetsunderlag
- operativ status i arbetet

Projektet svarar alltså främst på frågan:

`Hur går jobbet?`

### Ordern ska bära

- det fakturerbara underlaget
- orderrader
- vad som är kommersiellt överenskommet
- vad som är granskat eller fastställt
- vad som ska lämnas över till ekonomi
- vilket underlag som ligger till grund för faktura

Ordern svarar alltså främst på frågan:

`Vad ska kunden faktiskt debiteras för?`

### Fakturan ska bära

- det ekonomiska utgående dokumentet
- utskick
- bokföringskoppling
- betalningsuppföljning
- påminnelse och inkasso

Fakturan svarar främst på frågan:

`Vad har vi faktiskt debiterat och vad återstår att få betalt?`

### Vad detta innebär i praktiken

Det betyder att appen bör utformas så att:

- arbete kan pågå i projektet utan att varje liten förändring direkt blir ett ekonomiskt beslut
- ordern används när arbetet behöver paketeras till något fakturerbart
- fakturan skapas först när det kommersiella underlaget är tillräckligt fastställt

### Vad som inte bör blandas ihop

Det som bör undvikas är att:

- använda projektstatus för att uttrycka ekonomiska beslut
- använda orderstatus för att beskriva operativt arbetsläge
- låta fakturan bli platsen där man först upptäcker att underlaget inte är färdigt

Om dessa tre nivåer blandas ihop blir processen svårare att förstå, särskilt i scenario 2.

### Hur detta ska tolkas i scenario 1

För ensamföretagaren får den här principen gärna vara nästan osynlig i vardagen.

Det är helt okej om användaren upplever det som ett enda flöde:

- skapa projekt
- jobba
- bygg orderrad
- skapa faktura

Så länge systemet internt fortfarande håller isär vad som är arbete, kommersiellt underlag och faktura.

### Hur detta ska tolkas i scenario 2

För teamflödet måste denna uppdelning vara tydligare i UI:t.

Där behöver användarna kunna förstå:

- vad som fortfarande är arbete i projektet
- vad som nu blivit faktureringsunderlag
- vad ekonomi faktiskt ska ta över

## Definierad arbetsyta: Faktureringskö

Faktureringskön ska vara en separat arbetsyta för `admin` och `finance` där de ser vad som behöver tas vidare från drift till faktisk faktura och uppföljning.

Det här är inte tänkt som ersättning för snabb `Skapa faktura` i enkla flöden, utan som ett kompletterande arbetsläge för scenario 2 och andra mer samarbetsintensiva upplägg.

### Syfte

Faktureringskön ska svara på frågan:

`Vad behöver ekonomi agera på just nu?`

### Vad som ska kunna hamna i kön

- projekt eller order som markerats `Redo för fakturering`
- projekt eller order som väntar på fastställelse
- fakturor som är fastställda men ännu inte skickade
- skickade fakturor som ännu inte är betalda
- förfallna fakturor som kräver uppföljning

### Föreslagen struktur i kön

- `Redo att granska`
  projekt/order som lämnats över från drift
- `Väntar på fastställelse`
  underlag där ekonomi eller beslutsfattare ännu inte godkänt
- `Fastställd idag`
  sådant som är klart att fakturera
- `Skickad`
  fakturor som är skickade men inte slutbetalda
- `Väntar på betalning`
  öppna fakturor som inte är förfallna
- `Förfallen`
  fakturor som kräver uppföljning, påminnelse eller inkasso

### Vad varje rad i kön bör visa

Miniminivå:

- kund
- projekt
- order eller underlag
- belopp
- ansvarig projektperson
- aktuell köstatus
- senaste relevanta aktivitet

Det ska gå att förstå ärendet utan att först öppna fem andra sidor.

### Vad man ska kunna göra direkt från kön

- öppna projekt
- öppna order
- öppna kund
- öppna eller skapa faktura
- fastställa underlag
- markera skickad
- hoppa till betalningsuppföljning

Det här ska alltså vara en riktig arbetsyta, inte bara en lista.

### Hur detta ska fungera för scenario 1

För ensamföretagaren ska faktureringskön vara valfri.

Det ska fortfarande gå att:

- skapa projekt
- lägga orderrader
- skapa faktura direkt

Kön får gärna finnas som översikt, men ska inte bli ett obligatoriskt stopp i processen.

### Hur detta ska fungera för scenario 2

För teamflödet ska faktureringskön vara den naturliga platsen där ekonomi jobbar.

Det betyder att:

- projektteamet lämnar över
- ekonomi ser samlat vad som väntar
- fastställande och fakturering sker därifrån
- uppföljning kan fortsätta i samma arbetsyta

### Viktig avgränsning

Faktureringskön ska inte försöka ersätta:

- projektytan som arbetsnav
- orderdetaljen som underlagsyta
- fakturadetaljen som ekonomisk detaljvy

Den ska i stället vara den samlande översikten och handlingsytan mellan dessa delar.

## Definierad princip: Rollspecifik överlämning

Det här steget behövs främst för scenario 2, där flera personer deltar i samma affär men på olika sätt.

Poängen är inte bara att styra behörighet, utan att göra det tydligt:

- vem som äger nuvarande steg
- vad som måste vara klart innan överlämning
- vem som äger nästa steg
- vad nästa person behöver se direkt i UI:t

### Föreslagen ansvarskedja

1. `Mottagare`
   - ansvarar för första kundkontakt och grundläggande intag
   - fångar kund, behov, preliminär omfattning och eventuell önskad tidplan
   - lämnar över när det finns tillräcklig grund för planering

2. `Planerare` eller `projektansvarig`
   - ansvarar för att göra jobbet genomförbart
   - sätter ansvarig, medlemmar, uppgifter, delmål och preliminärt kommersiellt upplägg
   - lämnar över när arbetet faktiskt kan påbörjas

3. `Utförare`
   - ansvarar för att genomföra jobbet
   - rapporterar tid, gör uppdateringar, laddar upp praktiskt underlag och signalerar avvikelser
   - lämnar över när arbetet eller etappen är utförd

4. `Projektansvarig`
   - ansvarar för att granska att utfört arbete och kommersiellt underlag hänger ihop
   - kontrollerar att timmar, orderrader, bilagor och eventuella avvikelser är rimliga
   - markerar `Redo för fakturering`

5. `Finance` eller `vd/admin`
   - ansvarar för ekonomisk fastställelse
   - granskar underlag, fastställer order, skapar/skickar faktura och följer upp betalning
   - lämnar över till uppföljning när fakturan är skickad

### Vad varje överlämning minst ska innehålla

#### `Mottagare -> Planerare`

Miniminivå:

- kund vald eller skapad
- tydlig beskrivning av vad jobbet gäller
- ansvarig kontakt eller tydlig mottagarnotering

Planeraren ska slippa börja från ett tomt projekt.

#### `Planerare -> Utförare`

Miniminivå:

- ansvarig användare satt
- tilldelade medlemmar satta vid behov
- uppgifter, delmål eller tidsram finns på rimlig nivå
- det går att förstå vad som faktiskt ska göras

Utföraren ska slippa tolka uppdraget mellan raderna.

#### `Utförare -> Projektansvarig`

Miniminivå:

- tid rapporterad där det behövs
- uppdateringar och arbetsnoteringar finns
- bilagor eller underlag finns om jobbet kräver det
- viktiga avvikelser är dokumenterade

Projektansvarig ska kunna avgöra om jobbet är redo att lämnas vidare utan att jaga information i flera system.

#### `Projektansvarig -> Finance`

Miniminivå:

- orderrader och/eller fakturerbar tid finns
- kund finns och är korrekt kopplad
- underlaget har ett rimligt belopp
- projekt eller order är markerat `Redo för fakturering`

Finance ska kunna börja ekonomiskt arbete direkt, inte först upptäcka att underlag saknas.

### Vad UI:t ska visa i varje steg

För att överlämningen ska fungera måste systemet visa mer än bara data. Det måste visa ansvar och nästa handling.

Varje steg bör därför ha:

- `Ägare nu`
- `Nästa ägare`
- `Senast klart`
- `Det här saknas innan nästa steg`

Exempel:

- projektet visar att det saknas ansvarig eller att inga uppgifter finns ännu
- ordern visar att underlaget inte är redo för fakturering
- faktureringskön visar att ekonomi väntar på fastställelse eller utskick

### Hur detta ska fungera i scenario 1

För ensamföretagaren ska denna modell mest vara intern struktur.

Samma person kan i praktiken vara:

- mottagare
- planerare
- utförare
- projektansvarig
- finance

Därför ska överlämningen inte tvinga fram extra steg, men modellen är fortfarande nyttig som grund för tydligare genvägar och checkpunkter.

### Hur detta ska fungera i scenario 2

För teamflödet ska detta vara tydligt i vardagen.

Målet är att ingen ska behöva fråga:

- `Är detta klart för mig nu?`
- `Vem väntar på vad?`
- `Varför har inte fakturan skapats ännu?`

Systemet ska göra överlämningen självklar genom att visa:

- vem som äger nästa steg
- om något blockerar
- vad som faktiskt är klart
- var ekonomi tar över

## Definierad princip: Smartare genvägar för scenario 1

Scenario 1 behöver inte ett nytt grundflöde. Det behöver snabbare genvägar ovanpå det flöde som redan fungerar.

Målet är att ensamföretagaren ska kunna arbeta ungefär så här:

1. skapa projekt
2. börja jobba direkt
3. rapportera tid och lägga underlag löpande
4. omvandla arbetet till fakturerbart underlag med så få klick som möjligt
5. skapa och skicka faktura

### Vad som ska vara snabbt i scenario 1

Det som särskilt bör gå snabbt är:

- skapa nytt jobb eller projekt
- starta tidrapportering
- stoppa tidrapportering
- få tid att bli orderunderlag
- skapa faktura från färdigt underlag

Det är inte där ensamföretagaren vill lägga administrativ energi.

### Föreslagna genvägar

#### 1. `Skapa orderrad från tid`

Från projektets ekonomidel bör det finnas en tydlig knapp:

- `Skapa orderrad från tid`

Den ska kunna ta vald eller all ofakturerad tid och skapa orderrad direkt utan manuell dubbelinmatning.

#### 2. `Omvandla all ofakturerad tid`

Användaren bör kunna välja:

- all ofakturerad tid i en samlad orderrad
- en orderrad per person
- en orderrad per uppgift

Det gör att samma motor fungerar både för väldigt enkel fakturering och för lite mer detaljerad redovisning.

#### 3. Prislogik utan extra manuellt arbete

Det bör gå att använda:

- förinställt timpris
- projektspecifikt pris
- manuellt pris vid omvandling

Så att användaren inte först måste bygga tiden och sedan skriva om allt till pris manuellt.

#### 4. Tydlig knapp för `Skapa fakturaunderlag från tid`

Projektets ekonomidel bör ha en tydlig huvudåtgärd som säger exakt vad som händer.

Inte bara generella orderfunktioner, utan något i stil med:

- `Skapa fakturaunderlag från tid`

Det gör systemet lättare att förstå för den som arbetar ensam.

#### 5. Snabb väg vidare till faktura

När underlaget väl finns ska nästa steg vara synligt direkt:

- `Granska order`
- `Skapa faktura`

Det ska kännas som en naturlig fortsättning, inte som att man måste börja leta i en ny del av systemet.

### Vad som inte ska hända i scenario 1

Förbättringarna för scenario 1 ska inte innebära att användaren tvingas genom:

- extra godkännandesteg
- tung faktureringskö
- rollöverlämningar som samma person ändå gör själv

Det är bättre att modellen finns i botten, men att UI:t erbjuder genvägar när samma person äger hela kedjan.

### Hur detta ska fungera tillsammans med scenario 2

Samma datamodell ska fortfarande gälla.

Skillnaden ska vara att:

- scenario 1 ser snabbknappar och genvägar
- scenario 2 ser fler kontrollpunkter och överlämningssteg

Det är alltså inte två olika system, utan två olika sätt att röra sig genom samma underliggande flöde.

## Definierad arbetsyta: Gemensam uppföljningspipeline

Uppföljningen bör inte bara vara många bra listor. Den bör fungera som en sammanhängande pipeline som visar vad som kräver handling i rätt ordning.

Målet är att användaren ska kunna svara på frågan:

`Vad behöver tas vidare nu, från arbete till betalning?`

### Vad pipelinen ska samla

Den gemensamma uppföljningen bör samla sådant som idag ligger utspritt över:

- `Att göra`
- projektlistor och projektaktivitet
- faktureringskö
- fakturalista
- kundreskontra
- ekonomins kontrollvyer

Det betyder inte att alla dessa sidor ska bort. Det betyder att det ska finnas en tydlig sammanhållen huvudvy för nästa åtgärd.

### Föreslagen pipeline

- `Kräver arbetsåtgärd`
  - projekt utan uppdatering
  - projekt utan ansvarig
  - försenade uppgifter
  - blockerande avvikelser i utförandet

- `Kräver kommersiell åtgärd`
  - projekt eller order som är på väg mot fakturering
  - underlag som saknar timmar, rader eller kontroll
  - projekt som borde markeras `Redo för fakturering`

- `Kräver ekonomisk åtgärd`
  - redo att fakturera
  - väntar på fastställelse
  - fastställd men ej skickad

- `Kräver betalningsuppföljning`
  - skickad men obetald
  - förfallen
  - påminnelse eller inkasso

- `Kräver stängning eller kontroll`
  - verifikationer utan bilaga
  - obalanser
  - underlag som blockerar periodstängning eller ren uppföljning

### Vad varje rad i pipelinen bör visa

Miniminivå:

- typ av ärende
- kund
- projekt
- order eller faktura när relevant
- ansvarig person
- nästa åtgärd
- varför den ligger i pipelinen
- när den senast uppdaterades

Det ska alltså gå att förstå både problemet och nästa steg direkt.

### Vad användaren ska kunna göra direkt från pipelinen

- öppna projekt
- öppna order
- öppna faktura
- öppna kund
- markera `Redo för fakturering`
- fastställa
- skapa faktura
- registrera betalning
- hoppa till blockerande verifikation eller underlag

Pipelinen måste vara en handlingsyta, inte bara en läslista.

### Hur detta skiljer sig från dagens `Att göra`

`Att göra` idag är stark som signalsida, men den är fortfarande främst en samling indikatorer.

Den gemensamma uppföljningspipelinen ska vara mer processnära:

- inte bara visa att något är fel
- utan visa var i kedjan ärendet befinner sig
- vem som äger nästa steg
- vad som krävs för att ärendet ska gå vidare

### Hur detta ska fungera i scenario 1

För ensamföretagaren ska pipelinen gärna kännas som en smart arbetslista:

- jobb att göra klart
- underlag att fakturera
- fakturor att följa upp
- ekonomiska avvikelser att åtgärda

Det ska vara snabbt och överblickbart, inte tung processadministration.

### Hur detta ska fungera i scenario 2

För teamflödet blir pipelinen den plats där överlämningen faktiskt blir synlig.

Den ska göra det lätt att se:

- vad drift fortfarande äger
- vad som väntar på projektansvarig
- vad ekonomi behöver agera på
- vad som ligger fast hos kund i form av obetalda fakturor

### Viktig avgränsning

Pipelinen ska inte ersätta specialiserade detaljvyer som:

- projektdetaljen
- orderdetaljen
- fakturadetaljen
- verifikationsvyn

Den ska i stället binda ihop dem så att användaren förstår nästa steg utan att själv behöva sy ihop processen mentalt.

## Utredning: Stöd för flera order per projekt

Nuvarande modell fungerar i praktiken som:

- `1 projekt = 1 order`

Det är en rimlig startmodell, men den behöver utredas inför nästa steg i produktens utveckling.

### Varför frågan behöver utredas

Det är inte säkert att ett projekt alltid ska bära exakt ett kommersiellt underlag genom hela sin livstid.

Utredningen behövs särskilt för lägen där:

- ett jobb får tillägg under resans gång
- delar ska faktureras separat
- arbete sker i etapper
- man vill skilja grundbeställning från ändringsarbete
- flera personer bygger underlag men ekonomi vill se tydlig kommersiell uppdelning

### Vad som fungerar bra med dagens modell

`1 projekt = 1 order` ger:

- enkelhet i startflödet
- lättbegriplig koppling mellan arbete och faktura
- låg administrativ tröskel i scenario 1
- mindre risk att användaren lägger underlag i fel affärsobjekt

Det är därför viktigt att inte lämna den enkelheten för tidigt.

### Vad som blir begränsande med dagens modell

När projektet växer eller förändras blir modellen mer pressad:

- ändringar pressas in i samma order
- det blir svårare att skilja grundjobb från tillägg
- delfakturering blir mindre tydlig
- godkännande blir svårare att följa
- uppföljning per kommersiell del blir mer oklar

### Mest pragmatiska nästa modell

Den mest rimliga utvecklingen ser ut att vara:

- projektet skapar fortfarande en huvudorder från start
- det ska senare gå att skapa en eller flera tilläggsordrar

Det betyder i praktiken:

- `Projekt`
  - `Huvudorder`
  - `Tilläggsorder 1`
  - `Tilläggsorder 2`
  - `Tilläggsorder 3`

På så sätt behålls enkelheten i starten samtidigt som modellen öppnar för verkligare affärsflöden.

### Vad som måste utredas innan detta införs

Följande frågor behöver besvaras tydligt:

- när ska användaren få skapa tilläggsorder
- vem får göra det
- hur ska huvudorder och tilläggsorder visas i projektet
- hur ska ordersummering visas på projektnivå
- hur ska fakturering fungera:
  - per enskild order
  - flera ordrar tillsammans
  - samlingsfaktura per kund
- hur ska status och uppföljning summeras mellan flera ordrar

### Rekommenderad hållning just nu

Det bör inte införas direkt bara för att det är flexiblare.

Rätt hållning nu är:

- behåll nuvarande enkelhet
- definiera målflöde, överlämning och faktureringskö först
- använd sedan huvudorder + tilläggsordrar som nästa strukturella steg om behoven kvarstår

### Slutsats i utredningen

Stöd för flera order per projekt verkar sannolikt vara rätt riktning på sikt.

Det bör dock byggas som:

- en kontrollerad utökning av nuvarande modell

inte som:

- ett fullständigt omtag där projekt och order frikopplas helt från varandra

Det ger bäst balans mellan enkelhet, begriplighet och framtida flexibilitet.

## Beslutspunkt: Huvudorder + tilläggsordrar

Efter utredningen bör den rekommenderade inriktningen formuleras tydligt.

### Rekommenderat beslut

Appen bör på sikt gå mot modellen:

- `1 projekt = 1 huvudorder + möjliga tilläggsordrar`

Det bör däremot inte införas som ett omedelbart tvingande arbetssätt i hela produkten.

### Varför detta är den rekommenderade modellen

Den modellen ger bäst balans mellan:

- enkel projektstart
- tydlig kommersiell struktur
- stöd för ändringsarbete
- stöd för delfakturering och etapper
- begriplighet för både scenario 1 och scenario 2

Den behåller det som redan fungerar bra idag:

- projektet som arbetsnav
- huvudorder direkt från projektstart

Samtidigt öppnar den för bättre kommersiell kontroll när ett projekt växer.

### Hur införandet bör ske

Införandet bör ske i tre nivåer:

#### Nivå 1: Behåll nuvarande beteende som standard

- nytt projekt skapar fortsatt huvudorder
- användaren märker ingen skillnad i enkla flöden

Detta skyddar scenario 1 från onödig komplexitet.

#### Nivå 2: Lägg till möjlighet att skapa tilläggsorder

- tilläggsorder ska vara ett aktivt val
- den ska skapas från projektytan eller orderytan
- den ska tydligt märkas som tillägg till huvudordern

Detta gör att scenario 2 får mer flexibilitet utan att standardflödet spricker.

#### Nivå 3: Bygg summering och tydlig visning på projektnivå

Projektet måste då kunna visa:

- huvudorder
- tilläggsordrar
- total kommersiell summa
- fakturerat totalt
- kvar att fakturera

Annars blir flera ordrar per projekt mer förvirrande än hjälpsamt.

### När modellen inte ska användas

För enkla jobb bör användaren fortfarande kunna klara sig helt med:

- projekt
- huvudorder
- faktura

Tilläggsordrar ska alltså vara ett stöd för verkliga behov, inte något som gör varje litet uppdrag tyngre.

### Risker som måste hanteras vid införande

Om modellen införs måste följande risker tas på allvar:

- fler beslut i UI:t
- större risk att lägga rader på fel order
- mer komplicerad fakturering
- mer komplicerad uppföljning
- högre krav på tydlig visualisering på projektnivå

Det betyder att lösningen bara är bra om UX blir mycket tydlig.

### Praktisk produktrekommendation

Den rekommenderade produktlinjen är därför:

1. behåll dagens huvudorder som standard
2. bygg först tydlig överlämning, faktureringskö och uppföljningspipeline
3. inför därefter tilläggsordrar som kontrollerad utökning
4. gör dem valfria och tydligt avgränsade i UI:t

Detta minimerar risken att systemet blir mer flexibelt på bekostnad av begriplighet.

## Rekommenderade förändringar i prioriteringsordning

Använd checklistan nedan som genomförandeplan.

- [x] 1. Definiera målflödet `projekt -> redo för fakturering -> faktura -> uppföljning`
  Sätt den avsedda huvudkedjan innan nya delsteg byggs, så att senare UI- och datamodellförändringar hänger ihop.

- [x] 2. Inför tydligt steg `Redo för fakturering`
  Det ska gå att markera projekt eller order som:
  - inte redo
  - under kontroll
  - redo för fakturering
  - fastställd för fakturering
  Detta bör bli den naturliga överlämningen mellan drift och ekonomi.

- [x] 3. Lyft fram order som eget affärssteg
  Ordern bör få en tydligare livscykel, till exempel:
  - `Utkast`
  - `Under arbete`
  - `Klar för godkännande`
  - `Fastställd`
  - `Fakturerad`
  - `Avslutad`
  Nuvarande statusmodell är för tunn för bolag med fler än en person.

- [x] 4. Skilj tydligare på arbetsprojekt och kommersiellt underlag
  Projektet ska fortsatt vara nav för arbete.
  Ordern ska tydligare bära:
  - vad som ska faktureras
  - vad som är fastställt
  - vad ekonomi faktiskt ska agera på
  Det behöver inte vara två olika system, men UI:t måste göra skillnaden tydlig.

- [x] 5. Bygg faktureringskö som separat arbetsyta för teamflöden
  För bolag där flera personer delar på överlämningen mellan drift och ekonomi bör det finnas en arbetsyta för:
  - redo att fakturera
  - väntar på fastställelse
  - fastställd idag
  - skickad
  - väntar på betalning
  - förfallen
  Detta ska vara ett kompletterande arbetsläge för scenario 2, inte en ersättning för direktfakturering i enkla scenario 1-flöden.

- [x] 6. Bygg bättre rollspecifik överlämning
  Exempel på tydlig ansvarskedja:
  - mottagare skapar projekt och kundkontakt
  - planerare sätter ansvar, uppgifter och delmål
  - utförare lägger tid och uppdateringar
  - projektansvarig markerar `redo för fakturering`
  - finance/vd fastställer order och skapar/skickar faktura
  Det bör synas tydligt i UI:t vem som äger nästa steg.

- [x] 7. Bygg smartare genvägar för scenario 1
  Scenario 1 fungerar redan bra i grunden och behöver främst snabbare genvägar ovanpå samma motor:
  - skapa orderrad direkt från tidrapportering
  - omvandla all ofakturerad tid till fakturaunderlag med ett klick
  - välja om tid ska bli en samlad orderrad, en rad per person eller en rad per uppgift
  - använda förinställt timpris eller projektpris
  - ha tydligare knapp i projektets ekonomidel för `skapa fakturaunderlag från tid`

- [x] 8. Samla uppföljningen i en gemensam pipeline
  Uppföljning bör kunna ses från ett sammanhållet läge:
  - projekt utan uppdatering
  - projekt redo för fakturering
  - fakturor att skicka
  - fakturor att boka
  - förfallna fakturor
  - verifikationer som blockerar stängning
  Idag finns detta i delar, men inte som en samlad kedja.

- [x] 9. Utred stöd för flera order per projekt
  Den mest pragmatiska utvecklingen av dagens modell är sannolikt:
  - en huvudorder kopplad till projektet från start
  - möjlighet att senare skapa en eller flera tilläggsordrar
  Detta ger bättre balans mellan enkelhet och flexibilitet.

- [x] 10. Besluta om och hur huvudorder + tilläggsordrar ska införas
  Dokumentera uttryckligen om modellen ska bli:
  - fortsatt `1 projekt = 1 order`
  - eller `1 projekt = huvudorder + möjliga tilläggsordrar`
  Notera då också nackdelarna:
  - fler beslut i UI:t
  - större risk för felregistrering
  - mer komplex fakturering
  - mer komplex uppföljning
  - högre krav på tydlig UX
  - risk att bygga för mycket för tidigt

---

## Konkreta produktförslag

## Förslag A: Ny gemensam statuskedja

Inför en separat kommersiell kedja utöver projektstatus:

- `Intaget`
- `Planerat`
- `Pågår`
- `Levererat`
- `Redo för fakturering`
- `Fakturerat`
- `Betalt`

Projektstatus och orderstatus bör inte försöka bära allt var för sig.

## Förslag B: Ny arbetsyta `Fakturering`

Ny sida där `admin` och `finance` ser:

- projekt/order redo för fakturering
- vad som saknas innan faktura kan skapas
- snabbgranskning av rader, tid och kunddata
- fastställ och skicka

## Förslag C: Tydlig checklista före faktura

Exempel:

- kund finns
- orderrader finns
- total > 0
- projekt inte markerat som blockerad
- eventuella timmar granskade
- underlag finns

Detta skulle minska osäkerhet och manuellt dubbelarbete.

## Förslag D: Rollanpassade genvägar ovanpå samma motor

Det behöver inte vara två olika system eller ett särskilt "enkelt läge" i hård mening.

Det kan räcka långt med att presentera samma motor olika beroende på arbetssätt:

- scenario 1 får fler genvägar:
  - tid till orderrad
  - snabb fakturering
  - mindre fokus på mellanliggande administrativa steg
- scenario 2 får tydligare kontrollpunkter:
  - redo för fakturering
  - fastställande
  - överlämning till ekonomi

Alltså:

- samma datamodell
- samma kärnflöde
- olika nivå av guidning och genvägar beroende på hur bolaget arbetar

---

## Rekommenderat nästa arbete i appen

Om detta ska omsättas i utveckling bör arbetet ske i denna ordning:

1. definiera målflödet `projekt -> redo för fakturering -> faktura -> uppföljning`
2. införa tydligt statussteg `redo för fakturering`
3. skapa ny arbetsyta för faktureringskö
4. tydliggöra orderns godkännande-/fastställandesteg
5. därefter utreda stöd för flera order per projekt

Om man börjar med fler order per projekt direkt innan överlämningslogiken är tydlig finns risk att komplexiteten ökar utan att användarflödet blir bättre.

---

## Implementationsroadmap

Nedan är en mer konkret byggordning för att omsätta målbilden i appen.

### Etapp 1: Tydliggör status och ansvar i befintligt flöde

Mål:

- få in målflödet i UI:t utan att riva upp nuvarande modell
- göra överlämningen tydlig mellan projekt, order och ekonomi

Detta är främst:

- UI
- mindre affärslogik
- mindre datamodellstillägg

Konkreta delar:

- införa visning av `Redo för fakturering` i projekt och order
- visa `Ägare nu`, `Nästa steg` och `Det här saknas`
- lägga in tydligare statushjälp i projektekonomi och orderdetalj
- lägga in enkel checklista före fakturering

Påverkar främst:

- [page.tsx](c:\Dev\projects\Company Manager Application\app\(app)\projects\[id]\page.tsx)
- [page.tsx](c:\Dev\projects\Company Manager Application\app\(app)\orders\[id]\page.tsx)
- relevanta API-routes och tabellfält för status

### Etapp 2: Bygg faktureringskö som ny arbetsyta

Mål:

- ge `admin` och `finance` en tydlig plats att arbeta från

Detta är främst:

- ny UI-yta
- query-/filterlogik
- måttlig datamodell/logik

Konkreta delar:

- ny sida eller sektion `Fakturering`
- kökolumner för:
  - redo att granska
  - väntar på fastställelse
  - fastställd
  - skickad
  - väntar på betalning
  - förfallen
- snabbåtgärder direkt från kön
- koppling till projekt, order, faktura och kund

Detta bör byggas innan flerorderstöd, så att processen först blir tydlig med dagens modell.

### Etapp 3: Smarta genvägar för scenario 1

Mål:

- göra ensamföretagarens väg ännu snabbare utan att bygga separat system

Detta är främst:

- UI
- affärslogik
- begränsad datamodell

Konkreta delar:

- `Skapa orderrad från tid`
- `Skapa fakturaunderlag från tid`
- val:
  - samlad rad
  - rad per person
  - rad per uppgift
- stöd för projektpris eller timpris
- tydlig snabbväg från ekonomiflik till faktura

Detta kan byggas parallellt med etapp 2 om write scope hålls separat.

### Etapp 4: Samlad uppföljningspipeline

Mål:

- låta användaren se hela kedjan från arbete till betalning i ett sammanhållet läge

Detta är främst:

- ny UI-yta
- query aggregation
- prioriteringslogik

Konkreta delar:

- samla signaler från `Att göra`, projekt, fakturering och ekonomi
- gruppera dem efter nästa handling
- visa ansvarig och blockerande information
- kunna hoppa direkt till rätt detaljvy

Det här blir sannolikt en vidareutveckling av dagens [page.tsx](c:\Dev\projects\Company Manager Application\app\(app)\todo\page.tsx), snarare än en helt fristående modul.

### Etapp 5: Förbered datamodellen för huvudorder + tilläggsordrar

Mål:

- göra framtida kommersiell uppdelning möjlig utan att slå sönder det nuvarande flödet

Detta är främst:

- datamodell
- backendlogik
- migrationsarbete

Konkreta delar:

- definiera relation mellan huvudorder och tilläggsorder
- införa ordertyp eller parent-relation
- definiera summering på projektnivå
- definiera hur fakturering ska hantera flera ordrar

Det här ska inte aktiveras i UI:t fullt ut förrän status, kö och överlämning fungerar bra.

### Etapp 6: Inför huvudorder + tilläggsordrar i UI

Mål:

- ge användaren kontrollerad flexibilitet när projektet växer

Detta är:

- UI
- backend
- uppföljningslogik
- tydlig UX-design

Konkreta delar:

- visa huvudorder först i projektet
- låta användaren skapa tilläggsorder aktivt
- tydlig märkning av kommersiell struktur
- summera:
  - totalt ordervärde
  - fakturerat
  - kvar att fakturera

Detta är en senare etapp och ska inte prioriteras före de tidigare processförbättringarna.

## Nuläge mot roadmapen

Nedan är en uppdaterad checklista baserad på appens faktiska nuläge i kodbasen per 2026-04-05.

Statusnyckel:

- `[x]` klart
- `[-]` delvis klart
- `[ ]` ej gjort ännu

### Etapp 1: Tydliggör status och ansvar i befintligt flöde

Övergripande bedömning: `klar`

- [x] `invoice_readiness_status` finns på projekt och order
- [x] statusstegen `Inte redo`, `Under kontroll`, `Redo för fakturering`, `Fastställd för fakturering` finns i datamodell och hjälplogik
- [x] projektvy visar `Ägare nu`, `Nästa steg` och `Det här saknas`
- [x] ordervy visar `Ägare nu`, `Nästa steg` och `Det här saknas`
- [x] enkel checklista före fakturering finns i projekt/order
- [x] statushjälp finns i projektekonomi och orderdetalj
- [x] överlämningen är nu genomdriven som backendregel för kundfaktura, delfaktura och samlingsfaktura

### Etapp 2: Bygg faktureringskö som ny arbetsyta

Övergripande bedömning: `klar`

- [x] faktureringskö finns funktionellt i appen
- [x] kösteg finns: `Redo att granska`, `Väntar på fastställelse`, `Fastställd`, `Skickad`, `Väntar på betalning`, `Förfallen`
- [x] snabbåtgärder för fastställelse och fakturering finns i befintliga vyer
- [x] koppling till projekt, order och faktura finns
- [x] arbetsytan har nu en tydlig canonical plats i ny sida `Fakturering`
- [x] navigation och stödvyer pekar nu mot `Fakturering` som huvudarbetsyta
- [-] vissa äldre stödvyer visar fortfarande delar av samma kö för kontext, men inte längre som primär plats

### Etapp 3: Smarta genvägar för scenario 1

Övergripande bedömning: `klar`

- [x] stöd finns för att skapa orderrader från fakturerbar tid
- [x] stöd finns för prisvarianter och line config vid omvandling från tid
- [x] snabb fakturering från order/projekt finns
- [x] orderdetaljen är nu en full ekonomiyta för att lägga till/ändra/ta bort orderrader
- [x] scenario-1-resan är nu tydligare paketerad som `tid -> orderunderlag -> faktura` i `Fakturering`
- [x] UX för valen `samlad rad`, `rad per person`, `rad per uppgift` finns nu i det huvudsakliga arbetsflödet

### Etapp 4: Samlad uppföljningspipeline

Övergripande bedömning: `klar`

- [x] `Att göra` använder ekonomiska signaler och `invoice_readiness_status`
- [x] projekt, order, fakturor och reskontra visar idag flera delar av kedjan
- [x] kredit, delfakturering och nettoeffekt syns i flera ekonomivyer
- [x] signalerna är nu samlade bättre mellan `Att göra` och `Fakturering`
- [x] pipelinen visar `vem äger nästa steg`, `vad blockerar`, `vad ska göras nu`
- [x] `Att göra` fungerar nu som handlingsnära ingång med djupare länkar till rätt läge i `Fakturering`
- [x] personlig vy `Väntar på mig nu` finns med prioritet, ansvarstyp och direktväg till rätt kö/filter

### Etapp 5: Förbered datamodellen för huvudorder + tilläggsordrar

Övergripande bedömning: `klar`

- [x] `order_kind` används
- [x] `parent_order_id` finns i modeller och vyer
- [x] huvudorder/ändringsorder/tilläggsorder kan visualiseras
- [x] explicit rotbegrepp för orderhierarki finns nu via `root_order_id`
- [x] backendmodellen begränsar sekundära order till huvudorder som parent
- [x] återanvändbar projektsummering finns nu i databaslager för ordermix och faktureringsutfall
- [x] definierad faktureringsmodell för flera order finns nu i databaslager via orderallokeringar och rollup-vyer

### Etapp 6: Inför huvudorder + tilläggsordrar i UI

Övergripande bedömning: `klar`

- [x] användaren kan skapa och arbeta med huvudorder samt underordnade ändrings-/tilläggsordrar i projektvyn
- [x] orderlistan visar nu hierarkirelation och gör strukturen synlig även i översikten
- [x] orderdetaljen visar orderfamilj, relation och familjesummering för netto/kvar
- [x] projektnivån summerar nu den kommersiella strukturen tydligare med orderfamilj, nettofakturerat och kvar att fakturera
- [x] UI:t använder nu huvudorder + underordnade ordrar som faktisk arbetsmodell ovanpå den stabiliserade processen

## Rekommenderad nästa punkt

Implementationsroadmapens Etapp 1-6 är nu genomförda i huvudsak.

Bästa nästa punkt att gå vidare med är därför inte en ny roadmap-etapp, utan ett konsolideringspass:

- förenkla äldre stödvyer som fortfarande duplicerar logik från `Fakturering`
- flytta fler summeringar från handberäknad UI-logik till de nya databasvyerna
- lägga till tester eller verifieringsskript för orderhierarki, allokering och kreditflöden
- därefter ta ställning till om nästa initiativ ska vara rapportering, automation eller extern integration

### Verifieringschecklista: orderfamilj, fakturering och kredit

Det här är nästa praktiska pass som bör genomföras innan större vidareutveckling.

#### Fall 1: Endast huvudorder

- [ ] skapa eller välj ett projekt med en huvudorder utan underordnade ordrar
- [ ] verifiera att `root_order_id = order.id`
- [ ] verifiera att ordern visas som `Huvudorder` i orderlistan
- [ ] verifiera att projektvyn visar `1 order` och `0 underordnade`
- [ ] verifiera att orderdetaljen visar korrekt familjesummering
- [ ] skapa faktura och kontrollera att netto/kvar uppdateras korrekt i projekt, order och fakturalista

#### Fall 2: Huvudorder + ändringsorder

- [ ] skapa eller välj ett projekt med en huvudorder och en `Ändringsorder`
- [ ] verifiera att ändringsordern får `parent_order_id = huvudorder.id`
- [ ] verifiera att ändringsordern får samma `root_order_id` som huvudordern
- [ ] verifiera att projektvyn visar båda ordrarna i samma familj
- [ ] verifiera att orderlistan visar relationen korrekt för båda ordrarna
- [ ] skapa faktura på ändringsordern och kontrollera att familjens netto/kvar räknas på hela strukturen

#### Fall 3: Huvudorder + tilläggsorder + kredit

- [ ] skapa eller välj ett projekt med huvudorder och `Tilläggsorder`
- [ ] skapa faktura där orderfamiljen får fakturerat värde
- [ ] skapa sedan kreditfaktura som träffar en rad med `order_id`
- [ ] verifiera att `project_order_rollups` visar ökat `credited_total`
- [ ] verifiera att `net_invoiced_total` minskar korrekt
- [ ] verifiera att projektvyn, orderdetaljen och reskontran visar samma nettoeffekt

#### Tekniska kontroller

- [ ] försök skapa `change` eller `supplement` utan `parent_order_id` och verifiera att databasen stoppar det
- [ ] försök koppla underordnad order till order i annat projekt och verifiera att databasen stoppar det
- [ ] försök koppla underordnad order till annan underordnad order och verifiera att databasen stoppar det
- [ ] verifiera att `order_hierarchy_nodes` och `project_order_rollups` används som canonical källa i relevanta vyer

### Rekommenderad ordning efter verifiering

1. genomför verifieringschecklistan ovan
2. fixa eventuella inkonsekvenser som hittas i orderfamilj/netto/allokering
3. först därefter välja nästa initiativ: rapportering, automation eller extern integration

## Typ av arbete per område

För att göra planeringen tydligare:

- `UI-förändringar`
  - statusvisning
  - checklistor
  - faktureringskö
  - pipeline
  - scenario 1-genvägar

- `Affärslogik`
  - regler för `Redo för fakturering`
  - fastställelse
  - tid till orderrad/fakturaunderlag
  - summeringslogik i faktureringskön

- `Datamodell / migrationer`
  - nya kommersiella statusfält
  - eventuella checklist- eller ownership-fält
  - relation huvudorder/tilläggsorder

- `Rättigheter / roller`
  - vem får markera redo
  - vem får fastställa
  - vem får skapa tilläggsorder
  - vad som ska vara synligt för olika roller

## Slutbedömning

Appen har redan en bra kärna för projekt, arbete, tid, ekonomi och uppföljning. Den stora förbättringen som behövs nu är inte fler enskilda funktioner, utan en tydligare sammanhängande affärsprocess.

Roadmapen 1-6 är nu genomförd. Det som ger mest värde härnäst är att bevisa att orderhierarki, allokering, fakturering och kredit håller ihop på riktiga data utan att olika vyer räknar olika.

Den bästa nästa förändringen är därför ett verifierings- och konsolideringspass, inte en ny stor feature.
