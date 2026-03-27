'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

export type SimpleSelectOption = {
  value: string;
  label: string;
};

export default function SimpleSelect({
  value,
  onValueChange,
  options,
  disabled = false,
  className
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SimpleSelectOption[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" />
    </div>
  );
}
