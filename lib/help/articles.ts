import type { Route } from 'next';

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  category: 'guide' | 'faq';
  audience?: string;
  featured?: boolean;
  keywords: string[];
  sections: Array<{
    title: string;
    paragraphs: string[];
    steps?: string[];
  }>;
  cta?: {
    href: Route;
    label: string;
  };
};

export const helpArticles: HelpArticle[] = [
  {
    slug: 'kom-igang',
    title: 'Kom igång i appen',
    summary: 'Börja i rätt ordning så blir både uppföljning och ekonomi enklare senare.',
    category: 'guide',
    audience: 'Alla interna användare',
    featured: true,
    keywords: ['kom igång', 'guide', 'kund', 'projekt', 'order', 'ekonomi'],
    sections: [
      {
        title: 'Översikt',
        paragraphs: [
          'Tre60 är byggt för att du ska gå från kund till projekt, vidare till order och därefter till ekonomi. Håller du den ordningen blir arbetsflödet betydligt renare.',
          'När grunden är rätt från början blir det lättare att följa upp arbete, fakturering och historik senare.'
        ]
      },
      {
        title: 'Rekommenderat arbetsflöde',
        paragraphs: ['Utgå från det här flödet när du startar nytt arbete eller sätter upp en ny kundrelation.'],
        steps: [
          'Kontrollera att du står i rätt bolag via profilmenyn.',
          'Skapa eller hitta kunden under Kunder.',
          'Skapa projektet och koppla det till rätt kund.',
          'Lägg order och orderrader för det som ska utföras eller faktureras.',
          'Följ upp verifikationer, fakturor och ekonomiska händelser under Ekonomi.'
        ]
      }
    ],
    cta: { href: '/projects' as Route, label: 'Öppna projekt' }
  },
  {
    slug: 'anvanda-projekt-och-order',
    title: 'Så använder du projekt och ordrar',
    summary: 'Projekt ger överblick. Order hanterar det som faktiskt ska utföras eller faktureras.',
    category: 'guide',
    audience: 'Projekt och administration',
    featured: true,
    keywords: ['projekt', 'ordrar', 'planering', 'utförande', 'kund'],
    sections: [
      {
        title: 'Projekt',
        paragraphs: [
          'Projektet är er samlade yta för planering, status och uppföljning. Där ska uppdraget vara begripligt även för någon som öppnar det senare.',
          'Använd projektet för helhetsbilden: uppdateringar, bilagor, ekonomiöversikt och kopplingen till kund.'
        ]
      },
      {
        title: 'Order',
        paragraphs: [
          'Ordern är den konkreta arbets- och faktureringsytan. Där ligger orderrader, status och de ekonomiska händelser som hör till leveransen.',
          'När något ska göras, följas upp eller faktureras ska det normalt hamna i en order.'
        ]
      },
      {
        title: 'Praktiskt arbetssätt',
        paragraphs: ['Håll projektet som överblick och ordern som operativ detaljvy.'],
        steps: [
          'Lägg upp projektet först.',
          'Skapa order från projektets ekonomidel när arbete ska utföras.',
          'Lägg orderrader tydligt så att både utförande och fakturering blir läsbara.',
          'Öppna projektet igen när du behöver helhetsbild eller uppföljning.'
        ]
      }
    ],
    cta: { href: '/orders' as Route, label: 'Öppna ordrar' }
  },
  {
    slug: 'skapa-och-hantera-kunder',
    title: 'Skapa och hantera kunder',
    summary: 'Håll kundkortet kort, korrekt och tillräckligt komplett för både projekt och ekonomi.',
    category: 'guide',
    audience: 'Sälj, projekt och administration',
    keywords: ['kunder', 'kontaktperson', 'orgnummer', 'fakturering', 'kundkort'],
    sections: [
      {
        title: 'När du skapar en kund',
        paragraphs: [
          'Lägg in de viktigaste uppgifterna direkt: namn, organisationsnummer och kontaktväg. Då fungerar kunden direkt i både projekt, order och ekonomi.',
          'Om faktureringen ska gå till annan adress eller e-post, fyll i det i faktureringsdelen redan från början.'
        ],
        steps: [
          'Sök alltid först så du inte skapar dubletter.',
          'Skapa kunden från plusknappen i kundvyn om den inte finns.',
          'Fyll i grunduppgifter och faktureringsuppgifter så långt du kan direkt.',
          'Komplettera i kunddetaljen om du behöver lägga till mer senare.'
        ]
      }
    ],
    cta: { href: '/customers' as Route, label: 'Öppna kunder' }
  },
  {
    slug: 'mfa-och-kontosakerhet',
    title: 'Aktivera MFA och säkra ditt konto',
    summary: 'Tvåstegsverifiering ger bättre skydd för interna konton och tar bara någon minut att aktivera.',
    category: 'guide',
    audience: 'Alla interna användare',
    keywords: ['mfa', 'totp', 'säkerhet', 'autentisering', 'authenticator'],
    sections: [
      {
        title: 'Varför MFA är viktigt',
        paragraphs: [
          'MFA skyddar interna konton om ett lösenord eller en länk skulle hamna fel. Det är ett enkelt sätt att höja säkerheten utan att ändra hur du arbetar i övrigt.',
          'Just nu är MFA frivillig, men lösningen är redan förberedd för att kunna krävas senare för känsligare roller.'
        ]
      },
      {
        title: 'Så aktiverar du MFA',
        paragraphs: ['Du aktiverar TOTP från säkerhetsinställningarna med en autentiseringsapp som Google Authenticator, Microsoft Authenticator eller 1Password.'],
        steps: [
          'Öppna Säkerhet under inställningar.',
          'Starta MFA-setup och skanna QR-koden.',
          'Skriv in den första 6-siffriga koden för att verifiera faktorn.',
          'Kontrollera att MFA-status visar att faktorn är aktiv.'
        ]
      }
    ],
    cta: { href: '/settings/security' as Route, label: 'Öppna säkerhet' }
  },
  {
    slug: 'felaktig-faktura',
    title: 'Jag har råkat skapa en felaktig faktura',
    summary: 'Rätta fakturan på rätt sätt utan att skapa oreda i historik eller låst ekonomi.',
    category: 'faq',
    audience: 'Ekonomi och administration',
    featured: true,
    keywords: ['faktura', 'felaktig faktura', 'kredit', 'makulera', 'låsning'],
    sections: [
      {
        title: 'Börja här',
        paragraphs: [
          'Börja alltid med att kontrollera fakturans status. Det avgör om du kan rätta enkelt eller om du måste korrigera genom ett ekonomiflöde.',
          'Om ekonomi redan är låst ska du normalt rätta framåt i tiden, inte skriva om historiken.'
        ],
        steps: [
          'Öppna fakturan och kontrollera status.',
          'Om fakturan inte ska gälla längre, använd makulering eller kredit enligt ert arbetssätt.',
          'Om order eller projekt är låst, korrigera framåt i tiden i stället för att ändra gammal data.',
          'Lämna gärna en tydlig notering om varför ändringen gjordes.'
        ]
      }
    ],
    cta: { href: '/invoices' as Route, label: 'Öppna fakturor' }
  },
  {
    slug: 'kreditera-faktura',
    title: 'Jag behöver kreditera en faktura',
    summary: 'Kreditera på ett spårbart sätt när en faktura helt eller delvis ska återtas.',
    category: 'faq',
    audience: 'Ekonomi och administration',
    keywords: ['kreditfaktura', 'kreditera', 'faktura', 'ekonomi'],
    sections: [
      {
        title: 'När kredit är rätt väg',
        paragraphs: [
          'Kreditering är rätt när en redan skapad eller skickad faktura inte längre ska gälla helt eller delvis. Målet är att rätta ekonomin utan att tappa spårbarheten.',
          'Utgå alltid från den ursprungliga fakturan eller ordern så att sambandet blir tydligt.'
        ],
        steps: [
          'Öppna den aktuella fakturan och kontrollera status.',
          'Avgör om hela beloppet eller bara en del ska krediteras.',
          'Använd kreditflödet enligt ert arbetssätt i stället för att skriva om den gamla fakturan.',
          'Lämna en kort orsak så att nästa person förstår varför krediten skapades.'
        ]
      }
    ],
    cta: { href: '/invoices' as Route, label: 'Öppna fakturor' }
  },
  {
    slug: 'reklamation',
    title: 'Jag har fått en reklamation',
    summary: 'Hantera reklamationen i rätt ordning så att både kunddialog och ekonomi förblir spårbara.',
    category: 'faq',
    audience: 'Projekt och administration',
    keywords: ['reklamation', 'kund', 'projekt', 'kredit', 'åtgärd'],
    sections: [
      {
        title: 'Arbetssätt',
        paragraphs: [
          'Börja i rätt kund eller projekt så att all historik och kommunikation hamnar där den hör hemma. Lägg till underlag direkt om det finns bilder, filer eller annan dokumentation.',
          'Bestäm därefter om reklamationen ska leda till nytt arbete, justerad order eller en ekonomisk korrigering.'
        ],
        steps: [
          'Öppna rätt kund och projekt.',
          'Dokumentera reklamationen i uppdateringar eller bilagor.',
          'Bedöm om orderrader behöver justeras eller om nytt arbete ska läggas upp.',
          'Gör ekonomiska ändringar först när det är klart hur reklamationen ska lösas.'
        ]
      }
    ],
    cta: { href: '/projects' as Route, label: 'Öppna projekt' }
  },
  {
    slug: 'stanga-projekt',
    title: 'Jag vill stänga ett projekt',
    summary: 'Stäng projekt först när order, ekonomi och uppföljning är i rätt läge.',
    category: 'faq',
    audience: 'Projekt och administration',
    keywords: ['stäng projekt', 'projekt', 'slutfört', 'uppföljning'],
    sections: [
      {
        title: 'Innan du stänger projektet',
        paragraphs: [
          'Ett projekt bör inte stängas bara för att arbetet känns klart. Kontrollera först att order, uppföljning och ekonomi faktiskt är färdiga.',
          'När projektet stängs ska någon annan kunna förstå att inget mer väntar.'
        ],
        steps: [
          'Kontrollera att öppna order är avslutade eller i rätt status.',
          'Säkerställ att eventuella reklamationer eller restpunkter är hanterade.',
          'Kontrollera att fakturering och ekonomi inte väntar på något mer.',
          'Uppdatera projektets status så att det tydligt framgår att arbetet är klart.'
        ]
      }
    ],
    cta: { href: '/projects' as Route, label: 'Öppna projekt' }
  },
  {
    slug: 'hittar-inte-kund-eller-projekt',
    title: 'Jag hittar inte rätt kund eller projekt',
    summary: 'Börja med bolag, sökning och arkivering innan du antar att något saknas.',
    category: 'faq',
    audience: 'Alla interna användare',
    keywords: ['saknas', 'kund', 'projekt', 'sökning', 'arkiverad'],
    sections: [
      {
        title: 'Kontrollera detta först',
        paragraphs: [
          'Det vanligaste felet är att du står i fel bolag eller söker för brett eller för smalt. Ibland är posten också arkiverad eller registrerad under annat namn än du förväntar dig.',
          'Börja därför alltid med kontexten innan du antar att något saknas i systemet.'
        ],
        steps: [
          'Kontrollera aktivt bolag i profilmenyn.',
          'Sök på namn, organisationsnummer eller annan tydlig identifierare.',
          'Se om posten kan vara arkiverad eller återställd under annat namn.',
          'Öppna relaterad kund, order eller projekt om du vet att objektet hänger ihop med annat arbete.'
        ]
      }
    ],
    cta: { href: '/customers' as Route, label: 'Öppna kunder' }
  },
  {
    slug: 'ratt-kunduppgifter',
    title: 'Jag behöver rätta kunduppgifter',
    summary: 'Rätta kunduppgifter utan att skapa dubbletter eller blanda ihop faktureringsdata.',
    category: 'faq',
    audience: 'Sälj, projekt och administration',
    keywords: ['kunduppgifter', 'kund', 'orgnummer', 'fakturering', 'kontakt'],
    sections: [
      {
        title: 'Rätta på rätt ställe',
        paragraphs: [
          'Om en kund redan finns ska uppgifterna normalt rättas på kundkortet, inte genom att skapa en ny kund. Det gäller särskilt namn, organisationsnummer och faktureringsuppgifter.',
          'Håll isär vanliga kontaktuppgifter och ren faktureringsinformation så att ekonomin inte påverkas av misstag.'
        ],
        steps: [
          'Öppna kunddetaljen från kundlistan.',
          'Rätta grunduppgifter om felet gäller namn, telefon eller organisationsnummer.',
          'Rätta faktureringsdelen separat om det gäller fakturaadress eller faktura-e-post.',
          'Spara och kontrollera att rätt kund fortfarande används i projekt och order.'
        ]
      }
    ],
    cta: { href: '/customers' as Route, label: 'Öppna kunder' }
  },
  {
    slug: 'lagga-till-verifikation',
    title: 'Jag behöver lägga till en ny verifikation',
    summary: 'Börja med underlaget och säkra att totalsumman stämmer innan du sparar.',
    category: 'faq',
    audience: 'Ekonomi',
    keywords: ['verifikation', 'underlag', 'bokföring', 'ekonomi'],
    sections: [
      {
        title: 'Steg för steg',
        paragraphs: [
          'Ny verifikation öppnas i ett fokuserat flöde för att det ska vara enkelt att arbeta från mobil eller surfplatta. Börja med underlaget och fyll sedan i resten.',
          'Det viktigaste innan du sparar är att underlaget är rätt och att totalsumman går ihop.'
        ],
        steps: [
          'Öppna Ny verifikation.',
          'Lägg till foto, galleri eller dokument i första steget.',
          'Fyll i datum och beskrivning.',
          'Lägg till bokföringsrader och kontrollera debet, kredit och totalsumma.',
          'Spara först när underlag och siffror ser rätt ut.'
        ]
      }
    ],
    cta: { href: '/finance/verifications/new' as Route, label: 'Ny verifikation' }
  },
  {
    slug: 'delbetalning',
    title: 'Jag har fått en delbetalning',
    summary: 'Hantera delbetalningar utan att tappa kontroll över vad som är betalt och vad som återstår.',
    category: 'faq',
    audience: 'Ekonomi',
    keywords: ['delbetalning', 'betalning', 'kundreskontra', 'faktura'],
    sections: [
      {
        title: 'Arbeta stegvis',
        paragraphs: [
          'Vid delbetalning är det viktigt att du registrerar det som faktiskt kommit in, utan att markera hela fakturan som slutbetald av misstag.',
          'Tänk alltid i två delar: inbetalt belopp och kvarvarande rest.'
        ],
        steps: [
          'Öppna fakturan eller reskontraposten som betalningen hör till.',
          'Registrera endast det belopp som faktiskt kommit in.',
          'Kontrollera att kvarvarande saldo fortfarande är synligt efter registreringen.',
          'Lämna en tydlig notering om betalningen är del av en avbetalning eller överenskommelse.'
        ]
      }
    ],
    cta: { href: '/receivables' as Route, label: 'Öppna kundreskontra' }
  },
  {
    slug: 'lagga-till-bilaga-eller-underlag',
    title: 'Jag behöver lägga till bilaga eller underlag',
    summary: 'Lägg till foto, galleri eller dokument direkt i mobilflödet och kontrollera previewn innan du går vidare.',
    category: 'faq',
    audience: 'Alla interna användare',
    keywords: ['bilaga', 'underlag', 'foto', 'galleri', 'dokument'],
    sections: [
      {
        title: 'Bilagor i mobilen',
        paragraphs: [
          'När du lägger till underlag i mobilen kan du välja mellan att ta foto, hämta från galleri eller välja ett dokument.',
          'Efter valet visas en thumbnail eller preview så att du snabbt ser att rätt fil följde med.'
        ],
        steps: [
          'Tryck på Lägg till bilaga.',
          'Välj foto, galleri eller dokument.',
          'Kontrollera thumbnail och filstorlek.',
          'Ta bort bilagan med krysset om du behöver välja om.'
        ]
      }
    ],
    cta: { href: '/finance/verifications/new' as Route, label: 'Öppna ny verifikation' }
  },
  {
    slug: 'folja-upp-obetalda-fakturor',
    title: 'Jag behöver följa upp obetalda fakturor',
    summary: 'Få överblick över vad som förfaller, vad som är försenat och vad som behöver följas upp först.',
    category: 'faq',
    audience: 'Ekonomi och administration',
    keywords: ['obetalda fakturor', 'förfallna', 'kundreskontra', 'påminnelse'],
    sections: [
      {
        title: 'Börja med överblicken',
        paragraphs: [
          'Börja i kundreskontran eller fakturalistan och sortera efter det som faktiskt kräver åtgärd nu. Du sparar tid om du arbetar med förfallna poster först.',
          'Titta inte bara på beloppet. Titta också på status, ålder och om det redan finns en pågående dialog med kunden.'
        ],
        steps: [
          'Öppna fakturor eller kundreskontra.',
          'Identifiera vilka poster som är förfallna eller delbetalda.',
          'Prioritera det som är äldst eller mest affärskritiskt.',
          'Dokumentera uppföljningen så att nästa person ser vad som redan är gjort.'
        ]
      }
    ],
    cta: { href: '/receivables' as Route, label: 'Öppna kundreskontra' }
  },
  {
    slug: 'ratt-orderrad',
    title: 'Jag behöver rätta en orderrad',
    summary: 'Justera orderrader tydligt så att både utförande och fakturering fortsätter vara begripliga.',
    category: 'faq',
    audience: 'Projekt och administration',
    keywords: ['orderrad', 'order', 'korrigera', 'antal', 'pris'],
    sections: [
      {
        title: 'När en orderrad blivit fel',
        paragraphs: [
          'Rätta orderraden på ett sätt som fortfarande går att förstå i efterhand. Det gäller särskilt när pris, antal eller moms blivit fel.',
          'Om ordern redan påverkat ekonomi eller fakturering kan det vara bättre att justera framåt än att skriva om historiken.'
        ],
        steps: [
          'Öppna ordern och kontrollera om raden redan påverkat fakturering.',
          'Rätta titel, antal, pris eller moms så att raden blir tydlig för nästa person.',
          'Om ekonomi redan är låst, gör en framåtriktad korrigering i stället för att ändra gammal historik.',
          'Kontrollera totalsumman efter ändringen.'
        ]
      }
    ],
    cta: { href: '/orders' as Route, label: 'Öppna ordrar' }
  },
  {
    slug: 'hantera-medlemmar',
    title: 'Jag behöver bjuda in eller ändra en intern användare',
    summary: 'Sätt rätt roll från början och justera åtkomst direkt när någon byter ansvar eller lämnar.',
    category: 'faq',
    audience: 'Admin',
    keywords: ['medlemmar', 'användare', 'admin', 'roller', 'mfa'],
    sections: [
      {
        title: 'Roller och åtkomst',
        paragraphs: [
          'Interna användare ska få rätt roll direkt så att navigation, ekonomi och säkerhetsytor blir korrekta från start.',
          'När någon inte längre ska ha åtkomst ska det justeras direkt, inte vid ett senare tillfälle.'
        ],
        steps: [
          'Öppna Medlemmar om du har adminbehörighet.',
          'Lägg till eller ändra användaren med rätt intern roll.',
          'Kontrollera status och följ upp MFA i säkerhetsdelen om kontot är känsligt.',
          'Justera eller stäng av åtkomst direkt när någon byter ansvar eller lämnar.'
        ]
      }
    ],
    cta: { href: '/team' as Route, label: 'Öppna medlemmar' }
  }
];

export function getHelpArticle(slug: string) {
  return helpArticles.find((article) => article.slug === slug) ?? null;
}

export function getRelatedHelpArticles(slug: string, limit = 3) {
  const current = getHelpArticle(slug);
  if (!current) return [];

  return helpArticles
    .filter((article) => article.slug !== slug)
    .map((article) => {
      const sharedKeywords = article.keywords.filter((keyword) => current.keywords.includes(keyword)).length;
      const sharedCategory = article.category === current.category ? 1 : 0;
      const sharedAudience = article.audience && current.audience && article.audience === current.audience ? 1 : 0;
      return { article, score: sharedKeywords * 3 + sharedCategory + sharedAudience };
    })
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, 'sv'))
    .slice(0, limit)
    .map((entry) => entry.article);
}
