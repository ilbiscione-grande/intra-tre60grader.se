import AppShell from "@/components/layout/AppShell";
import { AppContextProvider } from "@/components/providers/AppContext";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { requireStaff } from "@/lib/auth/authContext";
import { getCompanyAccess } from "@/lib/auth/getActiveCompany";
import { getSession } from "@/lib/auth/getSession";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  const session = await getSession();
  const { active, companies } = await getCompanyAccess();

  if (!active || !session) {
    throw new Error("Unauthorized access");
  }

  return (
    <QueryProvider>
      <AppContextProvider
        value={{
          companyId: active.companyId,
          companyName: active.companyName,
          role: active.role,
          userEmail: session.user.email,
          companies,
        }}
      >
        <AppShell
          role={active.role}
          companyName={active.companyName}
          userEmail={session.user.email}
        >
          {children}
        </AppShell>
      </AppContextProvider>
    </QueryProvider>
  );
}
