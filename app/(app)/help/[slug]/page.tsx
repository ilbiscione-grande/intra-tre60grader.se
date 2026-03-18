import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft, BookOpenText, CircleHelp } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHelpArticle, getRelatedHelpArticles, helpArticles } from '@/lib/help/articles';

export function generateStaticParams() {
  return helpArticles.map((article) => ({ slug: article.slug }));
}

export default function HelpArticlePage({ params }: { params: { slug: string } }) {
  const article = getHelpArticle(params.slug);

  if (!article) notFound();

  const relatedArticles = getRelatedHelpArticles(article.slug);

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till hjälp">
          <Link href={'/help' as Route}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Hjälpartikel</p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              {article.category === 'guide' ? <BookOpenText className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
            </span>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge>{article.category === 'guide' ? 'Guide' : 'Vanlig fråga'}</Badge>
                {article.audience ? <Badge>{article.audience}</Badge> : null}
              </div>
              <CardTitle className="text-xl leading-tight lg:text-2xl">{article.title}</CardTitle>
              <p className="max-w-3xl text-sm text-foreground/72">{article.summary}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {article.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base lg:text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-foreground/80">
                  {paragraph}
                </p>
              ))}
              {section.steps?.length ? (
                <div className="space-y-3 pt-1">
                  {section.steps.map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <p className="text-sm text-foreground/80">{step}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {article.cta ? (
        <Card>
          <CardHeader>
            <CardTitle>Nästa steg</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={article.cta.href}>{article.cta.label}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {relatedArticles.length ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Fortsätt här</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Relaterade artiklar</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {relatedArticles.map((relatedArticle) => (
              <Link key={relatedArticle.slug} href={`/help/${relatedArticle.slug}` as Route} className="block">
                <Card className="h-full transition-colors hover:border-primary/45 hover:bg-muted/10">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {relatedArticle.category === 'guide' ? <BookOpenText className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
                      </span>
                      <Badge>{relatedArticle.category === 'guide' ? 'Guide' : 'Vanlig fråga'}</Badge>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-base leading-snug">{relatedArticle.title}</CardTitle>
                      <p className="text-sm text-foreground/72">{relatedArticle.summary}</p>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
