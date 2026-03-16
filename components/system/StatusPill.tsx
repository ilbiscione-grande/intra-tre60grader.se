import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';
import { type AppProjectStatus, statusConfig } from '@/components/system/tokens';

type StatusPillProps = {
  status: AppProjectStatus;
  className?: string;
};

export function StatusPill({ status, className }: StatusPillProps) {
  const config = statusConfig[status];

  return <Badge className={cn('rounded-full px-3 py-1 text-xs font-medium', config.className, className)}>{config.label}</Badge>;
}
