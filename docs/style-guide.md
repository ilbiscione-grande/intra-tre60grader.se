# Style Guide - Company Manager Application

## Design principles
- Calm: neutral backgrounds, soft contrast, low-noise surfaces.
- Clear: strong hierarchy, obvious active states, explicit status language.
- Robust: offline-first status handling, clear conflict recovery patterns.
- Mobile app-like first: large touch targets, simple flows, bottom nav always visible.
- Desktop expanded second: sidebar + topbar with higher information density and retained breathing room.

## Tokens

### Color tokens
Base
- background: `#F8FAFC`
- card: `#FFFFFF`
- text-primary: `#0F172A`
- text-secondary: `#64748B`
- border: `#E2E8F0`

Primary
- primary: `#2563EB`
- primary-hover: `#1D4ED8`
- primary-soft: `#DBEAFE`

Project status
- upcoming: bg `#E0F2FE`, text `#0369A1`
- ongoing: bg `#EDE9FE`, text `#6D28D9`
- delivered: bg `#DCFCE7`, text `#166534`
- invoiced: bg `#F1F5F9`, text `#334155`

System state
- offline: subtle amber tokens (`--offline-bg`, `--offline-fg`)
- syncing: blue/gray tokens (`--syncing-bg`, `--syncing-fg`)
- conflict: red tokens only for conflict (`--conflict-bg`, `--conflict-fg`)

Finance state
- money-in: discrete green tokens (`--money-in-bg`, `--money-in-fg`)
- money-out: neutral dark tokens (`--money-out-bg`, `--money-out-fg`), not red by default

### Typography
- Font family: Inter
- Mobile sizes
- H1: 22-24px
- H2: 18px
- Body: 15-16px
- Desktop sizes
- H1: 28px
- H2: 20px
- Body: 14-16px
- Utility classes: `.text-h1`, `.text-h2`, `.text-body`, `.text-body-lg`

### Spacing, radius, shadow
- Card padding: `16px` mobile, `20px` desktop
- Touch targets: min `44-48px`
- Card radius: `12px`
- Button radius: `10px`
- Shadow: `shadow-sm` style (`shadow-card`), avoid heavy shadows

## Component rules

### Buttons
- Primary button is full-width on mobile and 48px high.
- Secondary and outline are visually clear but low-emphasis.
- Destructive exists and is reserved for irreversible actions.
- Focus ring must use semantic ring token.

### Cards
- Soft surfaces with subtle border + light shadow.
- No heavy borders or deep shadows.
- Keep content grouped and scannable.

### Inputs
- Touch-friendly height (`h-12` mobile, `h-11` desktop).
- Always pair with visible label and optional helper text.
- Focus state is ring-based and high contrast.

### Dialogs / ActionSheet
- Mobile uses bottom sheet pattern.
- Desktop falls back to centered dialog surface.
- Use for conflict review and high-focus actions.

### Navigation
- MobileBottomNav: max 4 items (`Projects`, `Customers`, `Finance` role-gated, `Profile`).
- DesktopSidebar: same + `Reports` under finance/admin context.
- Active state: soft blue background + clear icon/text contrast.
- Icon set: lucide-react only.

## Mobile vs desktop rules
- Mobile (`<1024px`): app-like layout, simple flows, large controls, card/list fallback for data.
- Desktop (`>=1024px`): expanded layout with sidebar + topbar, denser but still airy sections.
- Avoid dense tables on mobile; use list/card fallback patterns.

## Offline and synchronization UI
- Offline banner variants
- Offline: `Offline – visar senast sparad data`
- Syncing: `Synkar ändringar…`
- Conflict: `Konflikt – nyare ändringar finns online` + CTA `Visa`
- Display queue and conflict badges where relevant (`queuedCount`, `conflictCount`).
- Toast copy
- Success: `Sparat`
- Offline queue: `Ändringen sparades lokalt och synkas när du är online`
- Conflict: `Nyare ändringar online – din ändring kräver granskning`

## Accessibility checklist
- Touch targets are at least 44x44px (48px preferred for primary actions).
- Text/background contrast passes WCAG AA in normal states.
- Focus styles are visible on all interactive elements.
- Buttons, icon-only controls, and nav items include labels/aria-labels.
- Do not encode critical status using color alone; include text.
- Offline/conflict states must be announced clearly and stay visible until resolved.


