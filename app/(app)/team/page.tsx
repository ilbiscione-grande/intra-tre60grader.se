'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Role } from '@/lib/types';

type MemberView = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
};

const roles: Role[] = ['member', 'finance', 'admin', 'auditor'];

function rollEtikett(role: Role) {
  const map: Record<Role, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role];
}

export default function TeamPage() {
  const { role, companyId, userEmail } = useAppContext();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('member');

  const membersQuery = useQuery<MemberView[]>({
    queryKey: ['team-members', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/members?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa medlemmar');
      }

      const body = (await res.json()) as { members: MemberView[] };
      return body.members ?? [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error('E-post krävs');

      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, email: cleanEmail, role: newRole })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte lägga till medlem');
      }

      return (await res.json()) as { ok: boolean; invited?: boolean };
    },
    onSuccess: async (result) => {
      setEmail('');
      setNewRole('member');
      await queryClient.invalidateQueries({ queryKey: ['team-members', companyId] });
      toast.success(result?.invited ? 'Inbjudan skickad och roll tilldelad' : 'Medlem tillagd/uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till medlem');
    }
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, userId, role })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte uppdatera roll');
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['team-members', companyId] });
      toast.success('Roll uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte byta roll');
    }
  });

  const removeMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const res = await fetch(`/api/admin/members?companyId=${companyId}&userId=${userId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte ta bort medlem');
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['team-members', companyId] });
      toast.success('Medlem borttagen');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort medlem');
    }
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  return (
    <RoleGate role={role} allow={['admin']}>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/70">Lägg till medlem via e-post och välj roll. Om användaren inte finns skickas en inbjudan automatiskt.</p>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder="user@company.com"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="md:col-span-2"
              />
              <Select value={newRole} onValueChange={(value) => setNewRole(value as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Sparar...' : 'Lägg till / uppdatera medlem'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {membersQuery.isLoading && <p className="text-sm">Laddar...</p>}
            {!membersQuery.isLoading && members.length === 0 && (
              <p className="text-sm text-foreground/70">Inga medlemmar hittades.</p>
            )}

            {members.map((member) => {
              const isSelf = (member.email ?? '').toLowerCase() === (userEmail ?? '').toLowerCase();

              return (
                <div key={member.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{member.email ?? member.user_id}</p>
                      <p className="text-xs text-foreground/70">user_id: {member.user_id}</p>
                    </div>
                    <Badge>{rollEtikett(member.role)}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) => changeRoleMutation.mutate({ userId: member.user_id, role: value as Role })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="destructive"
                      onClick={() => removeMutation.mutate({ userId: member.user_id })}
                      disabled={removeMutation.isPending || isSelf}
                    >
                      Ta bort
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </RoleGate>
  );
}
