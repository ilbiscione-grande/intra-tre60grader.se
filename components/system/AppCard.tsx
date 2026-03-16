import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/ui/cn';

type AppCardProps = {
  title?: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

export function AppCard({ title, description, className, contentClassName, children }: AppCardProps) {
  return (
    <Card className={cn('rounded-card border-border/80 bg-card shadow-card', className)}>
      {(title || description) && (
        <CardHeader className="p-4 lg:p-5">
          {title ? <CardTitle className="text-h2">{title}</CardTitle> : null}
          {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
        </CardHeader>
      )}
      <CardContent className={cn('p-4 lg:p-5', title || description ? 'pt-0' : '', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
