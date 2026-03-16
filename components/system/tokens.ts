export type AppProjectStatus = 'upcoming' | 'ongoing' | 'delivered' | 'invoiced';
export type OfflineState = 'offline' | 'syncing' | 'conflict';

export const colorTokens = {
  base: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0'
  },
  primary: {
    default: '#2563EB',
    hover: '#1D4ED8',
    soft: '#DBEAFE'
  },
  status: {
    upcoming: { bg: '#E0F2FE', text: '#0369A1' },
    ongoing: { bg: '#EDE9FE', text: '#6D28D9' },
    delivered: { bg: '#DCFCE7', text: '#166534' },
    invoiced: { bg: '#F1F5F9', text: '#334155' }
  },
  system: {
    offline: { bg: '#FEF3C7', text: '#92400E' },
    syncing: { bg: '#E0EDFF', text: '#1E3A8A' },
    conflict: { bg: '#FEE2E2', text: '#991B1B' }
  },
  money: {
    in: { bg: '#DCFCE7', text: '#166534' },
    out: { bg: '#F1F5F9', text: '#0F172A' }
  }
} as const;

export const typographyTokens = {
  fontFamily: 'Inter',
  mobile: {
    h1: '22-24px',
    h2: '18px',
    body: '15-16px'
  },
  desktop: {
    h1: '28px',
    h2: '20px',
    body: '14-16px'
  }
} as const;

export const spacingTokens = {
  cardPaddingMobile: '16px',
  cardPaddingDesktop: '20px',
  minTouchTarget: '44-48px',
  radius: {
    card: '12px',
    button: '10px'
  },
  shadow: 'shadow-sm'
} as const;

export const statusConfig: Record<AppProjectStatus, { label: string; className: string }> = {
  upcoming: {
    label: 'Kommande',
    className: 'bg-[hsl(var(--status-upcoming-bg))] text-[hsl(var(--status-upcoming-fg))]'
  },
  ongoing: {
    label: 'Pågående',
    className: 'bg-[hsl(var(--status-ongoing-bg))] text-[hsl(var(--status-ongoing-fg))]'
  },
  delivered: {
    label: 'Levererade',
    className: 'bg-[hsl(var(--status-delivered-bg))] text-[hsl(var(--status-delivered-fg))]'
  },
  invoiced: {
    label: 'Fakturerade',
    className: 'bg-[hsl(var(--status-invoiced-bg))] text-[hsl(var(--status-invoiced-fg))]'
  }
};

export const offlineStateConfig: Record<OfflineState, { message: string; className: string }> = {
  offline: {
    message: 'Offline – visar senast sparad data',
    className: 'bg-[hsl(var(--offline-bg))] text-[hsl(var(--offline-fg))]'
  },
  syncing: {
    message: 'Synkar ändringar…',
    className: 'bg-[hsl(var(--syncing-bg))] text-[hsl(var(--syncing-fg))]'
  },
  conflict: {
    message: 'Konflikt – nyare ändringar finns online',
    className: 'bg-[hsl(var(--conflict-bg))] text-[hsl(var(--conflict-fg))]'
  }
};
