'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export type ProjectUpdateAttachmentView = {
  id: string;
  path: string;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  signedUrl?: string;
};

function isImageAttachment(fileType: string | null) {
  return typeof fileType === 'string' && fileType.startsWith('image/');
}

function formatSize(fileSize: number | null) {
  if (!fileSize) return '';
  if (fileSize < 1024) return `${fileSize} B`;
  return `${Math.max(fileSize / 1024, 1).toFixed(0)} KB`;
}

function fileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.trim().toUpperCase();
  return extension && extension.length <= 5 ? extension : 'FIL';
}

export function ProjectUpdateAttachments({
  attachments,
  onOpen
}: {
  attachments: ProjectUpdateAttachmentView[];
  onOpen: (path: string) => void;
}) {
  const [previewAttachment, setPreviewAttachment] = useState<ProjectUpdateAttachmentView | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const image = isImageAttachment(attachment.fileType) && attachment.signedUrl;

          return image ? (
            <button
              key={attachment.id}
              type="button"
              className="overflow-hidden rounded-xl border border-border/70 bg-muted/10 text-left transition hover:border-primary/40"
              onClick={() => setPreviewAttachment(attachment)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.signedUrl} alt={attachment.fileName ?? 'Bilaga'} className="h-40 w-full object-cover" />
              <div className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">{attachment.fileName ?? 'Bild'}</span>
                <span className="text-xs text-foreground/55">{formatSize(attachment.fileSize)}</span>
              </div>
            </button>
          ) : (
            <button
              key={attachment.id}
              type="button"
              className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-muted/25"
              onClick={() => onOpen(attachment.path)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-foreground/55" />
                <span className="truncate">{attachment.fileName ?? 'Bilaga'}</span>
              </span>
              <span className="text-xs text-foreground/55">{formatSize(attachment.fileSize) || 'Öppna'}</span>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{previewAttachment?.fileName ?? 'Bildförhandsvisning'}</DialogTitle>
          <div className="relative overflow-hidden rounded-2xl bg-black/90">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:bg-background"
              aria-label="Stäng bild"
              onClick={() => setPreviewAttachment(null)}
            >
              <X className="h-5 w-5" />
            </button>
            {previewAttachment?.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewAttachment.signedUrl}
                alt={previewAttachment.fileName ?? 'Bilaga'}
                className="max-h-[82vh] w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ComposerAttachmentList({
  files,
  onRemove
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => {
        if (preview.url) URL.revokeObjectURL(preview.url);
      });
    };
  }, [previews]);

  if (files.length === 0) return null;

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {previews.map(({ file, url }, index) => (
        <div key={`${file.name}-${index}`} className="relative w-[88px] shrink-0">
          <button
            type="button"
            className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground/65 shadow-sm transition hover:text-foreground"
            onClick={() => onRemove(index)}
            aria-label="Ta bort bilaga"
          >
            ×
          </button>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/15">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={file.name} className="h-[88px] w-[88px] object-cover" />
            ) : (
              <div className="flex h-[88px] w-[88px] flex-col items-center justify-center gap-1 bg-muted/30 text-foreground/65">
                <FileText className="h-5 w-5" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {fileExtension(file.name)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-1 text-center text-[11px] text-foreground/55">{formatSize(file.size)}</p>
        </div>
      ))}
    </div>
  );
}
