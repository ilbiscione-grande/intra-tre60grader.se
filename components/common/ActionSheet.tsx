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
      <DialogContent className="top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl border-x-0 border-b-0 left-0 right-0 bottom-0 p-4 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:w-[95vw] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
        <div className="safe-bottom">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="mt-3">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}