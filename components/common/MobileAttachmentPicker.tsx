'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, X } from 'lucide-react';
import ActionSheet from '@/components/common/ActionSheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type MobileAttachmentPickerProps = {
  label: string;
  valueLabel?: string;
  onPick: (file: File) => void | Promise<void>;
  onClear?: () => void;
  className?: string;
  includeFileButton?: boolean;
  maxSizeMb?: number;
};

type PickedMeta = {
  name: string;
  size: number;
  type: string;
};

const DEFAULT_MAX_SIZE_MB = 10;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function isAllowedType(file: File) {
  return file.type.startsWith('image/') || file.type === 'application/pdf';
}

export default function MobileAttachmentPicker({
  label,
  valueLabel,
  onPick,
  onClear,
  className,
  includeFileButton = true,
  maxSizeMb = DEFAULT_MAX_SIZE_MB
}: MobileAttachmentPickerProps) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [pickedMeta, setPickedMeta] = useState<PickedMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!valueLabel) {
      setPickedMeta(null);
      setError(null);
    }
  }, [valueLabel]);

  async function handlePick(file: File | undefined) {
    if (!file) return;

    if (!isAllowedType(file)) {
      setError('Endast bild eller PDF är tillåtet.');
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Filen är för stor. Max ${maxSizeMb} MB.`);
      return;
    }

    setError(null);
    setPickedMeta({ name: file.name, size: file.size, type: file.type || 'okänd' });
    await onPick(file);
  }

  const statusName = valueLabel || pickedMeta?.name;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-2">
        <div className="flex justify-center">
          <Button
            type="button"
            className="h-40 w-40 flex-col rounded-full text-base"
            onClick={() => setSheetOpen(true)}
          >
            <PlusIcon />
            <span className="mt-2 text-center leading-tight">Lägg till bilaga</span>
          </Button>
        </div>
        {statusName && onClear ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full rounded-full"
            onClick={() => {
              setPickedMeta(null);
              setError(null);
              onClear();
            }}
          >
            <X className="mr-2 h-4 w-4" /> Rensa bilaga
          </Button>
        ) : null}
      </div>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Lägg till bilaga"
        description="Välj hur du vill lägga till underlaget."
      >
        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setSheetOpen(false);
              cameraRef.current?.click();
            }}
          >
            <Camera className="mr-2 h-4 w-4" /> Ta foto
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setSheetOpen(false);
              galleryRef.current?.click();
            }}
          >
            <ImageIcon className="mr-2 h-4 w-4" /> Galleri
          </Button>
          {includeFileButton ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl"
              onClick={() => {
                setSheetOpen(false);
                fileRef.current?.click();
              }}
            >
              <FileText className="mr-2 h-4 w-4" /> Dokument
            </Button>
          ) : null}
        </div>
      </ActionSheet>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void handlePick(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void handlePick(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => {
          void handlePick(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      <div
        className={cn(
          'rounded-md border px-3 py-2 text-xs',
          statusName ? 'hidden' : 'bg-muted/40 text-foreground/70',
          error ? 'border-destructive/40 bg-destructive/5 text-destructive' : ''
        )}
      >
        {error ? (
          <span>{error}</span>
        ) : (
          <span>{label}: ingen vald</span>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl leading-none text-current">
      +
    </span>
  );
}
