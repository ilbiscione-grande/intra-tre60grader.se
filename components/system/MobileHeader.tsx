'use client';

import { Building2, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type CompanyOption = {
  value: string;
  label: string;
};

type MobileHeaderProps = {
  title: string;
  companies: CompanyOption[];
  activeCompany: string;
  onCompanyChange?: (value: string) => void;
  userLabel?: string;
};

export function MobileHeader({ title, companies, activeCompany, onCompanyChange, userLabel = 'Anvandare' }: MobileHeaderProps) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b bg-card/95 px-4 pb-3 pt-2 backdrop-blur">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-h1">{title}</h1>
          <Button variant="ghost" size="icon" aria-label={userLabel} className="min-h-action min-w-action rounded-full">
            <UserCircle2 className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={activeCompany} onValueChange={onCompanyChange}>
            <SelectTrigger className="h-11 w-full rounded-button">
              <SelectValue placeholder="Valj bolag" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.value} value={company.value}>
                  {company.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
