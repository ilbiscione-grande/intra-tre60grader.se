import type { Route } from 'next';
import {
  BriefcaseBusiness,
  Camera,
  CheckSquare2,
  Clock3,
  FilePlus2,
  ReceiptText,
  Timer
} from 'lucide-react';
import { canWriteFinance } from '@/lib/auth/capabilities';
import type { Capability, Role } from '@/lib/types';

type MobileQuickActionDefinition = {
  id: string;
  label: string;
  description: string;
  href?: Route;
  icon: React.ComponentType<{ className?: string }>;
  visible: (role: Role, capabilities: Capability[]) => boolean;
};

const mobileQuickActionDefinitions: MobileQuickActionDefinition[] = [
  {
    id: 'time',
    label: 'Starta tid',
    description: 'Starta eller fortsätt timer',
    icon: Clock3,
    visible: () => true
  },
  {
    id: 'task',
    label: 'Ny uppgift',
    description: 'Gå till projekt och skapa uppgift',
    href: '/projects' as Route,
    icon: CheckSquare2,
    visible: () => true
  },
  {
    id: 'update',
    label: 'Ny uppdatering',
    description: 'Öppna projekt och lägg till uppdatering',
    href: '/projects' as Route,
    icon: ReceiptText,
    visible: () => true
  },
  {
    id: 'verification',
    label: 'Ny verifikation',
    description: 'Registrera ny verifikation',
    href: '/finance/verifications/new' as Route,
    icon: FilePlus2,
    visible: (role, capabilities) => canWriteFinance(role, capabilities)
  },
  {
    id: 'attachment',
    label: 'Fota underlag',
    description: 'Välj befintlig verifikation och lägg till underlag',
    href: '/finance?view=verifications&attachment=without' as Route,
    icon: Camera,
    visible: (role, capabilities) => canWriteFinance(role, capabilities)
  }
];

export type MobileQuickAction = {
  id: string;
  label: string;
  description: string;
  href?: Route;
  icon: React.ComponentType<{ className?: string }>;
};

export function getMobileQuickActions(role: Role, capabilities: Capability[], hasActiveTimer: boolean) {
  return mobileQuickActionDefinitions
    .filter((item) => item.visible(role, capabilities))
    .map((item) => {
      if (item.id !== 'time') return item;

      return {
        ...item,
        label: hasActiveTimer ? 'Öppna timer' : 'Starta tid',
        description: hasActiveTimer ? 'Pausa, fortsätt eller stoppa timer' : item.description,
        icon: hasActiveTimer ? Timer : item.icon
      };
    });
}

export function getPrimaryMobileQuickActions(role: Role, capabilities: Capability[], hasActiveTimer: boolean) {
  return getMobileQuickActions(role, capabilities, hasActiveTimer).slice(0, 4);
}

export function getSecondaryMobileQuickActions(role: Role, capabilities: Capability[], hasActiveTimer: boolean) {
  return getMobileQuickActions(role, capabilities, hasActiveTimer).slice(4);
}

export function getDesktopQuickCreateItems(role: Role, capabilities: Capability[]) {
  return [
    {
      id: 'project',
      href: '/projects?create=project' as Route,
      label: 'Nytt projekt',
      icon: BriefcaseBusiness
    },
    ...mobileQuickActionDefinitions
      .filter((item) => item.id !== 'time' && item.visible(role, capabilities))
      .map((item) => ({
        id: item.id,
        href: item.href as Route,
        label: item.label,
        description: item.description,
        icon: item.icon
      }))
  ];
}
