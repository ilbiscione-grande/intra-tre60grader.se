'use client';

import { useEffect, useMemo } from 'react';
import { FileText, Paperclip } from 'lucide-react';

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
  if (attachments.length === 0) return null;

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {attachments.map((attachment) => {
        const image = isImageAttachment(attachment.fileType) && attachment.signedUrl;

        return image ? (
          <button
            key={attachment.id}
            type="button"
            className="overflow-hidden rounded-xl border border-border/70 bg-muted/10 text-left transition hover:border-primary/40"
            onClick={() => onOpen(attachment.path)}
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
