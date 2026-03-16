'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bell, ChartColumn, FolderKanban, HandCoins, Users } from 'lucide-react';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import MobileBottomNav from '@/components/nav/MobileBottomNav';
import { AppButton } from '@/components/system/AppButton';
import { AppCard } from '@/components/system/AppCard';
import { ActionSheet } from '@/components/system/ActionSheet';
import { MobileHeader } from '@/components/system/MobileHeader';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { StatusPill } from '@/components/system/StatusPill';
import { colorTokens } from '@/components/system/tokens';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

const companies = [
  { value: 'a', label: 'North Studio AB' },
  { value: 'b', label: 'Flow Consulting AB' }
];

type Swatch = {
  name: string;
  value: string;
  note?: string;
};

function ColorSwatch({ name, value, note }: Swatch) {
  return (
    <div className="rounded-card border bg-card p-3">
      <div className="h-14 rounded-md border" style={{ backgroundColor: value }} />
      <p className="mt-2 text-sm font-medium">{name}</p>
      <p className="text-xs text-muted-foreground">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export default function StyleGuidePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const mode = useBreakpointMode();

  const swatches = useMemo<Swatch[]>(
    () => [
      { name: 'Background', value: colorTokens.base.background },
      { name: 'Card', value: colorTokens.base.card },
      { name: 'Text Primary', value: colorTokens.base.textPrimary },
      { name: 'Text Secondary', value: colorTokens.base.textSecondary },
      { name: 'Border', value: colorTokens.base.border },
      { name: 'Primary', value: colorTokens.primary.default },
      { name: 'Primary Hover', value: colorTokens.primary.hover },
      { name: 'Primary Soft', value: colorTokens.primary.soft },
      { name: 'Offline', value: colorTokens.system.offline.bg },
      { name: 'Syncing', value: colorTokens.system.syncing.bg },
      { name: 'Conflict', value: colorTokens.system.conflict.bg },
      { name: 'Money In', value: colorTokens.money.in.bg },
      { name: 'Money Out', value: colorTokens.money.out.bg }
    ],
    []
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
      <MobileHeader
        title="Style Guide"
        companies={companies}
        activeCompany="a"
        onCompanyChange={() => {}}
        userLabel="Användarmeny"
      />

      <section className="space-y-2">
        <h1 className="text-h1">Design System Showcase</h1>
        <p className="text-body text-muted-foreground">
          Mode: <strong>{mode}</strong> ({mode === 'mobile' ? 'app-like with bottom nav' : 'expanded with sidebar + topbar'})
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Colors</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((swatch) => (
            <ColorSwatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Typography</h2>
        <AppCard>
          <div className="space-y-3">
            <p className="text-h1">H1 - Calm, clear, strong hierarchy</p>
            <p className="text-h2">H2 - Section heading with compact rhythm</p>
            <p className="text-body">Body - Designed for readability in operational screens.</p>
            <p className="text-body-lg text-muted-foreground">Body Large - For key explanatory text in forms and cards.</p>
          </div>
        </AppCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Buttons</h2>
        <AppCard>
          <div className="grid gap-3 lg:grid-cols-2">
            <AppButton>Primary (mobile full width)</AppButton>
            <AppButton variant="secondary" mobileFullWidth>
              Secondary
            </AppButton>
            <AppButton variant="outline" mobileFullWidth>
              Outline
            </AppButton>
            <AppButton variant="destructive" mobileFullWidth>
              Destructive (sparingly)
            </AppButton>
          </div>
        </AppCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Cards</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <AppCard title="Project flow" description="Subtle movement cues with clear status progression.">
            <div className="flex flex-wrap gap-2">
              <StatusPill status="upcoming" />
              <StatusPill status="ongoing" />
              <StatusPill status="delivered" />
              <StatusPill status="invoiced" />
            </div>
          </AppCard>
          <AppCard title="Mobil tabellfallback" description="Använd listor/kort i mobil i stället för täta tabeller.">
            <div className="space-y-2 lg:hidden">
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">North Office Fitout</p>
                <p className="text-xs text-muted-foreground">SEK 88 000 - Ongoing</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Warehouse refresh</p>
                <p className="text-xs text-muted-foreground">SEK 42 000 - Upcoming</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>North Office Fitout</TableCell>
                    <TableCell>Ongoing</TableCell>
                    <TableCell className="text-right">SEK 88 000</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Warehouse refresh</TableCell>
                    <TableCell>Upcoming</TableCell>
                    <TableCell className="text-right">SEK 42 000</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </AppCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Forms</h2>
        <AppCard>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="project-name" className="text-sm font-medium">
                Project name
              </label>
              <Input id="project-name" placeholder="Example: Office rebuild Q2" />
              <p className="text-xs text-muted-foreground">Touch-friendly size. Keep helper text short and actionable.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="project-owner" className="text-sm font-medium">
                Responsible owner
              </label>
              <Input id="project-owner" placeholder="Type name" />
            </div>
          </div>
        </AppCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Navigering (MobileBottomNav + DesktopSidebar)</h2>
        <div className="rounded-card border bg-card p-3">
          <p className="text-sm text-muted-foreground">Desktop preview</p>
          <div className="mt-3 hidden overflow-hidden rounded-lg border lg:block">
            <DesktopSidebar role="admin" collapsed={false} onToggle={() => {}} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 lg:hidden">
            <div className="flex min-h-action items-center justify-center rounded-button bg-primary-soft text-xs font-medium text-primary">
              <FolderKanban className="mr-1 h-4 w-4" /> Projekt
            </div>
            <div className="flex min-h-action items-center justify-center rounded-button border text-xs font-medium">
              <Users className="mr-1 h-4 w-4" /> Kunder
            </div>
            <div className="flex min-h-action items-center justify-center rounded-button border text-xs font-medium">
              <HandCoins className="mr-1 h-4 w-4" /> Ekonomi
            </div>
            <div className="flex min-h-action items-center justify-center rounded-button border text-xs font-medium">
              <Bell className="mr-1 h-4 w-4" /> Profil
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Ekonomi/Rapporter is role-gated in production navigation.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Status Pills</h2>
        <AppCard>
          <div className="flex flex-wrap gap-2">
            <StatusPill status="upcoming" />
            <StatusPill status="ongoing" />
            <StatusPill status="delivered" />
            <StatusPill status="invoiced" />
          </div>
        </AppCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Offline- och konfliktlägen</h2>
        <div className="space-y-2">
          <OfflineBanner state="offline" queuedCount={3} />
          <OfflineBanner state="syncing" queuedCount={2} />
          <OfflineBanner state="conflict" queuedCount={1} conflictCount={2} onViewConflict={() => setSheetOpen(true)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Toast patterns</h2>
        <AppCard>
          <div className="grid gap-2 lg:grid-cols-3">
            <AppButton
              mobileFullWidth
              variant="secondary"
              onClick={() => toast.success('Sparat')}
              aria-label="Show success toast"
            >
              Success toast
            </AppButton>
            <AppButton
              mobileFullWidth
              variant="outline"
              onClick={() => toast('Ändringen sparades lokalt och synkas när du är online')}
              aria-label="Show offline queue toast"
            >
              Offline-kö notis
            </AppButton>
            <AppButton
              mobileFullWidth
              variant="destructive"
              onClick={() => toast.error('Nyare ändringar online – din ändring kräver granskning')}
              aria-label="Show conflict toast"
            >
              Conflict toast
            </AppButton>
          </div>
        </AppCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Action Sheet</h2>
        <AppCard>
          <AppButton variant="secondary" mobileFullWidth onClick={() => setSheetOpen(true)}>
            Öppna bottom sheet
          </AppButton>
        </AppCard>
      </section>

      <ActionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Conflict details"
        description="Review differences before confirming the final value."
      >
        <div className="space-y-2">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Invoice #4201</p>
            <p className="text-xs text-muted-foreground">Online has newer total. Verify account rows before merge.</p>
          </div>
          <div className="flex gap-2">
            <AppButton mobileFullWidth>Review now</AppButton>
            <AppButton mobileFullWidth variant="outline" onClick={() => setSheetOpen(false)}>
              Later
            </AppButton>
          </div>
        </div>
      </ActionSheet>

      <div className="block lg:hidden" aria-hidden>
        <MobileBottomNav role="admin" />
      </div>
      <div className="hidden lg:block rounded-card border bg-card p-4">
        <p className="text-sm text-muted-foreground">Desktop topbar area for expanded mode</p>
        <div className="mt-2 flex min-h-action items-center justify-between rounded-lg border bg-background px-3">
          <span className="text-sm font-medium">Company Manager</span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ChartColumn className="h-4 w-4" />
            <span className="text-xs">Rapporter available for Ekonomi/Admin</span>
          </div>
        </div>
      </div>
    </main>
  );
}


