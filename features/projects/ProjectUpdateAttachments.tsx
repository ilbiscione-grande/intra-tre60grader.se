'use client';

import { Paperclip } from 'lucide-react';

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
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate">{file.name}</p>
            <p className="text-xs text-foreground/55">
              {file.size < 1024 ? `${file.size} B` : `${Math.max(file.size / 1024, 1).toFixed(0)} KB`}
            </p>
          </div>
          <button
            type="button"
            className="text-foreground/55 transition hover:text-foreground"
            onClick={() => onRemove(index)}
            aria-label="Ta bort bilaga"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
