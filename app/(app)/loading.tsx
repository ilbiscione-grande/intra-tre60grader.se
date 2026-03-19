export default function AppLoading() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-card border border-border/80 bg-card p-5 shadow-card">
            <div className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted/80" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
