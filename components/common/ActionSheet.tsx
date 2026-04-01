'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

export default function ActionSheet({
  open,
  onClose,
  title = 'Åtgärd',
  description,
  children
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="left-0 right-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl border-x-0 border-b-0 p-4 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:w-[95vw] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
        <div className="safe-bottom flex max-h-[min(82vh,calc(100dvh-1rem-env(safe-area-inset-top)))] flex-col sm:max-h-[85vh]">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
