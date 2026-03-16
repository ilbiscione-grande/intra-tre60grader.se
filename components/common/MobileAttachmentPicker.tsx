'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, X } from 'lucide-react';
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <Button type="button" variant="outline" className="h-11 justify-start" onClick={() => cameraRef.current?.click()}>
          <Camera className="mr-2 h-4 w-4" /> Ta foto
        </Button>
        <Button type="button" variant="outline" className="h-11 justify-start" onClick={() => galleryRef.current?.click()}>
          <ImageIcon className="mr-2 h-4 w-4" /> Galleri
        </Button>
        {includeFileButton ? (
          <Button type="button" variant="outline" className="h-11 justify-start" onClick={() => fileRef.current?.click()}>
            <FileText className="mr-2 h-4 w-4" /> Fil
          </Button>
        ) : null}
        {statusName && onClear ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 justify-start"
            onClick={() => {
              setPickedMeta(null);
              setError(null);
              onClear();
            }}
          >
            <X className="mr-2 h-4 w-4" /> Rensa
          </Button>
        ) : null}
      </div>

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
          statusName ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-muted/40 text-foreground/70',
          error ? 'border-destructive/40 bg-destructive/5 text-destructive' : ''
        )}
      >
        {error ? (
          <span>{error}</span>
        ) : statusName ? (
          <span>
            {label}: {statusName}
            {pickedMeta ? ` · ${formatBytes(pickedMeta.size)} · ${pickedMeta.type}` : ''}
          </span>
        ) : (
          <span>{label}: ingen vald</span>
        )}
      </div>
    </div>
  );
}
