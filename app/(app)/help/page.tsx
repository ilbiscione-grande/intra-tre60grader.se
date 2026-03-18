'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, BookOpenText, CircleHelp, LifeBuoy, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { helpArticles } from '@/lib/help/articles';

type FilterKey = 'all' | 'featured' | 'guide' | 'faq';

const shortcutLinks = [
  { href: '/customers' as Route, label: 'Kunder' },
  { href: '/projects' as Route, label: 'Projekt' },
  { href: '/orders' as Route, label: 'Ordrar' },
  { href: '/finance' as Route, label: 'Ekonomi' },
  { href: '/settings/security' as Route, label: 'Säkerhet' }
] as const;

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return helpArticles.filter((article) => {
      const matchesFilter =
        filter === 'all'
          ? true
          : filter === 'featured'
            ? Boolean(article.featured)
            : article.category === filter;

      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [article.title, article.summary, article.audience, ...article.keywords].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [filter, query]);

  const guideArticles = filteredArticles.filter((article) => article.category === 'guide');
  const faqArticles = filteredArticles.filter((article) => article.category === 'faq');
  const featuredArticles = filteredArticles.filter((article) => article.featured);
  const totalGuides = helpArticles.filter((article) => article.category === 'guide').length;
  const totalFaqs = helpArticles.filter((article) => article.category === 'faq').length;
  const totalFeatured = helpArticles.filter((article) => article.featured).length;

  const filterChips: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'Alla', count: helpArticles.length },
    { key: 'featured', label: 'Mest använda', count: totalFeatured },
    { key: 'guide', label: 'Guider', count: totalGuides },
    { key: 'faq', label: 'Vanliga frågor', count: totalFaqs }
  ];

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-card border border-border/80 bg-card shadow-card">
        <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-primary">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Supportcenter</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Guider, svar och nästa steg</h1>
              </div>
              <p className="max-w-3xl text-sm text-foreground/72">
                Sök efter det du behöver hjälp med eller öppna en artikel direkt. Guiderna är skrivna för att vara korta, konkreta och lätta att
                använda i vardagen.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-border/70 p-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök efter faktura, reklamation, verifikation, medlemmar..."
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filterChips.map((chip) => {
                const active = filter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilter(chip.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-muted/25 text-foreground/78 hover:bg-muted/45'
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span className={`${active ? 'text-primary-foreground/85' : 'text-foreground/45'}`}>{chip.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Tillgängligt nu</p>
              <p className="mt-2 text-2xl font-semibold">{filteredArticles.length}</p>
              <p className="mt-1 text-sm text-foreground/68">artiklar matchar det du ser just nu</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Vanligast</p>
              <p className="mt-2 text-base font-semibold">Fakturor, reklamationer och verifikationer</p>
              <p className="mt-1 text-sm text-foreground/68">är de mest återkommande hjälpärena</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Tips</p>
              </div>
              <p className="mt-2 text-sm text-foreground/72">Öppna en artikel om du vill ha steg-för-steg, inte bara en kort sammanfattning.</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {shortcutLinks.map((item) => (
              <Button key={item.href} asChild variant="secondary" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <HelpSection
        title="Mest använda frågor"
        eyebrow="Vanligt just nu"
        emptyText="Inga utvalda hjälpartiklar matchar din sökning."
        items={featuredArticles}
        compactSummary
      />

      <HelpSection
        title="Guider"
        eyebrow="Arbetssätt"
        emptyText="Inga guider matchar din sökning."
        items={guideArticles}
      />

      <HelpSection
        title="Vanliga frågor"
        eyebrow="Snabba lösningar"
        emptyText="Inga hjälpartiklar matchar din sökning."
        items={faqArticles}
      />
    </section>
  );
}

function HelpSection({
  title,
  eyebrow,
  emptyText,
  items,
  compactSummary = false
}: {
  title: string;
  eyebrow: string;
  emptyText: string;
  items: typeof helpArticles;
  compactSummary?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      </div>

      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((article) => (
            <Link key={article.slug} href={`/help/${article.slug}` as Route} className="block">
              <Card className="h-full transition-colors hover:border-primary/45 hover:bg-muted/10">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {article.category === 'guide' ? <BookOpenText className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      {article.featured ? <Badge>Mest använd</Badge> : null}
                      <Badge>{article.category === 'guide' ? 'Guide' : 'Vanlig fråga'}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-base leading-snug lg:text-lg">{article.title}</CardTitle>
                    <p className={`text-sm text-foreground/72 ${compactSummary ? 'line-clamp-2' : ''}`}>{article.summary}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {article.audience ? <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">{article.audience}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {article.keywords.slice(0, 3).map((keyword) => (
                      <Badge key={keyword}>{keyword}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-sm font-medium text-primary">
                    <span>Öppna artikel</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-foreground/70">{emptyText}</CardContent>
        </Card>
      )}
    </div>
  );
}
