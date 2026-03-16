'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

type ActionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function ActionSheet({ open, onOpenChange, title, description, children }: ActionSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl border-x-0 border-b-0 p-4 sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[95vw] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border">
        <div className="safe-bottom">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="mt-4">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
