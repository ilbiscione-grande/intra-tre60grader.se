import Link from 'next/link';
import type { Route } from 'next';
import { AlertTriangle, CircleHelp, FileText, FolderKanban, LifeBuoy, ReceiptText, ShieldAlert, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const quickGuides = [
  {
    title: 'Kom igang snabbt',
    text: 'Börja med att välja rätt bolag i profilmenyn, skapa sedan kund, projekt och order i den ordningen för ett rent flöde.',
    icon: CircleHelp
  },
  {
    title: 'Så jobbar du i appen',
    text: 'Projekt används för planering, ordrar för utförande, och ekonomi för verifikationer, fakturor och uppföljning.',
    icon: FolderKanban
  },
  {
    title: 'Säkerhet',
    text: 'Interna användare bör aktivera TOTP-MFA under Säkerhet för att skydda projekt- och bolagsdata bättre.',
    icon: ShieldAlert
  }
] as const;

const workflowSteps = [
  'Skapa eller hitta kunden under Kunder.',
  'Skapa projekt och koppla arbetet till rätt kund.',
  'Lägg order och orderrader för det som ska utföras eller faktureras.',
  'Följ upp ekonomi, verifikationer och fakturor under Ekonomi och Fakturor.'
] as const;

const faqItems = [
  {
    title: 'Jag har råkat skapa en felaktig faktura och måste ta bort den',
    icon: ReceiptText,
    steps: [
      'Öppna fakturan eller ordern som fakturan skapades från.',
      'Kontrollera först om fakturan redan har bokförts eller skickats vidare.',
      'Om den inte ska gälla längre, använd makulering eller kreditflöde enligt ert arbetssätt i ekonomin.',
      'Om projektets ekonomi är låst efter utställning behöver du korrigera via rätt ekonomiflöde i stället för att ändra historiken direkt.'
    ],
    cta: { href: '/invoices' as Route, label: 'Öppna fakturor' }
  },
  {
    title: 'Jag har fått en reklamation, hur gör jag då',
    icon: AlertTriangle,
    steps: [
      'Öppna rätt kund och projekt så du arbetar i rätt kontext.',
      'Dokumentera reklamationen i uppdateringar eller bilagor om underlag finns.',
      'Avgör om ni ska justera orderrader, skapa kredit eller lägga till nytt åtgärdsarbete.',
      'Följ upp ekonomin först när ni vet om reklamationen påverkar pris eller fakturering.'
    ],
    cta: { href: '/projects' as Route, label: 'Öppna projekt' }
  },
  {
    title: 'Jag behöver lägga till en ny verifikation',
    icon: FileText,
    steps: [
      'Gå till Ekonomi och välj Ny verifikation.',
      'Lägg till foto, galleri eller dokument som underlag i första steget.',
      'Fyll i datum, beskrivning och bokföringsrader innan du slutför.',
      'Kontrollera att totalsumman och konton stämmer innan du sparar.'
    ],
    cta: { href: '/finance/verifications/new' as Route, label: 'Ny verifikation' }
  },
  {
    title: 'Jag behöver bjuda in eller ändra en intern användare',
    icon: Users,
    steps: [
      'Öppna Medlemmar om du har administratörsbehörighet.',
      'Lägg till nya användare med rätt intern roll och kontrollera status.',
      'Använd Säkerhet för att följa upp MFA och känsligare kontohändelser.',
      'Inaktivera eller justera åtkomst direkt om någon inte längre ska ha åtkomst.'
    ],
    cta: { href: '/team' as Route, label: 'Öppna medlemmar' }
  }
] as const;

const shortcutLinks = [
  { href: '/customers' as Route, label: 'Kunder' },
  { href: '/projects' as Route, label: 'Projekt' },
  { href: '/orders' as Route, label: 'Ordrar' },
  { href: '/finance' as Route, label: 'Ekonomi' },
  { href: '/settings/security' as Route, label: 'Säkerhet' }
] as const satisfies ReadonlyArray<{ href: Route; label: string }>;

export default function HelpPage() {
  return (
    <section className="space-y-5">
      <div className="rounded-card border border-border/80 bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Hjälp</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Guide och snabblösningar</h1>
            </div>
            <p className="max-w-3xl text-sm text-foreground/72">
              Här hittar du en kort guide till hur appen används och svar på vanliga situationer i vardagen. Målet är att du ska hitta rätt
              flöde direkt, utan att behöva leta runt i flera vyer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge>Snabbguide</Badge>
              <Badge>Vanliga frågor</Badge>
              <Badge>Praktiska lösningar</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {quickGuides.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <CardHeader className="space-y-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle className="text-base lg:text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/72">{item.text}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Så använder du appen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workflowSteps.map((step, index) => (
            <div key={step} className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <p className="text-sm text-foreground/80">{step}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {shortcutLinks.map((item) => (
              <Button key={item.href} asChild variant="secondary" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Vanliga frågor</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Snabba lösningar</h2>
        </div>

        <div className="grid gap-4">
          {faqItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardHeader className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Fråga</p>
                      <CardTitle className="text-base leading-snug lg:text-lg">{item.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.steps.map((step, index) => (
                    <div key={step} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-[11px] font-semibold text-foreground/70">
                        {index + 1}
                      </span>
                      <p className="text-sm text-foreground/78">{step}</p>
                    </div>
                  ))}
                  <div className="pt-1">
                    <Button asChild size="sm" variant="outline">
                      <Link href={item.cta.href}>{item.cta.label}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Behöver du mer hjälp?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground/72">
          <p>Börja med att öppna rätt kund, projekt eller order. De flesta åtgärder blir enklare när du jobbar i rätt kontext.</p>
          <p>
            Om något ser låst ut i ekonomin beror det ofta på att historik redan har bokförts eller fakturerats. Då ska du korrigera via ett nytt
            ekonomiflöde i stället för att skriva om gamla uppgifter.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
