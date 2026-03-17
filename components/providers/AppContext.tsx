'use client';

import { createContext, useContext } from 'react';
import type { AvailableCompany, InternalAuthRole, Role } from '@/lib/types';

type AppContextValue = {
  companyId: string;
  companyName: string;
  role: Role;
  authRole: InternalAuthRole;
  userEmail?: string;
  companies: AvailableCompany[];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({
  value,
  children
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext måste användas inom AppContextProvider');
  }

  return context;
}
