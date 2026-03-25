'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { canManageTeam, canViewFinance, canViewProjectSummary, canViewReporting } from '@/lib/auth/capabilities';
import type { Capability, CompanyMemberCapability, Role } from '@/lib/types';

type MemberView = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
  display_name: string | null;
};

type ProjectAssignmentRow = {
  id: string;
  company_id: string;
  project_id: string;
  user_id: string;
};

const roles: Role[] = ['member', 'finance', 'admin', 'auditor'];
const capabilityOptions: Capability[] = ['finance', 'project_lead', 'reporting', 'team_admin'];

function rollEtikett(role: Role) {
  const map: Record<Role, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role];
}

function capabilityLabel(capability: Capability) {
  const map: Record<Capability, string> = {
    finance: 'Ekonomi',
    project_lead: 'Projektledare',
    reporting: 'Rapporter',
    team_admin: 'Team admin'
  };
  return map[capability];
}

function accessSummary(role: Role, capabilities: Capability[]) {
  return {
    projectSummary: canViewProjectSummary(role, capabilities),
    finance: canViewFinance(role, capabilities),
    reporting: canViewReporting(role, capabilities),
    team: canManageTeam(role, capabilities)
  };
}

export default function TeamPage() {
  const { role, companyId, userEmail, capabilities } = useAppContext();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('member');
  const [pendingCapabilityByUser, setPendingCapabilityByUser] = useState<Record<string, Capability>>({});
  const canEditTeam = canManageTeam(role, capabilities);

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

  const capabilitiesQuery = useQuery<CompanyMemberCapability[]>({
    queryKey: ['team-member-capabilities', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/member-capabilities?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa capabilities');
      }

      const body = (await res.json()) as { capabilities: CompanyMemberCapability[] };
      return body.capabilities ?? [];
    }
  });

  const projectAssignmentsQuery = useQuery<ProjectAssignmentRow[]>({
    queryKey: ['team-project-assignments', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/project-members?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa projekttilldelningar');
      }

      const body = (await res.json()) as { assignments: ProjectAssignmentRow[] };
      return body.assignments ?? [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const cleanName = displayName.trim();
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanName) throw new Error('Namn krävs');
      if (!cleanEmail) throw new Error('E-post krävs');

      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, email: cleanEmail, displayName: cleanName, role: newRole })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte lägga till medlem');
      }

      return (await res.json()) as { ok: boolean; invited?: boolean };
    },
    onSuccess: async (result) => {
      setDisplayName('');
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

  const addCapabilityMutation = useMutation({
    mutationFn: async ({ userId, capability }: { userId: string; capability: Capability }) => {
      const res = await fetch('/api/admin/member-capabilities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, userId, capability })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte lägga till capability');
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['team-member-capabilities', companyId] });
      toast.success(`${capabilityLabel(variables.capability)} tillagd`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till capability');
    }
  });

  const removeCapabilityMutation = useMutation({
    mutationFn: async ({ userId, capability }: { userId: string; capability: Capability }) => {
      const params = new URLSearchParams({ companyId, userId, capability });
      const res = await fetch(`/api/admin/member-capabilities?${params.toString()}`, { method: 'DELETE' });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte ta bort capability');
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['team-member-capabilities', companyId] });
      toast.success(`${capabilityLabel(variables.capability)} borttagen`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort capability');
    }
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const capabilitiesByUserId = useMemo(() => {
    const map = new Map<string, Capability[]>();

    for (const row of capabilitiesQuery.data ?? []) {
      const current = map.get(row.user_id) ?? [];
      current.push(row.capability as Capability);
      map.set(row.user_id, current);
    }

    return map;
  }, [capabilitiesQuery.data]);
  const projectCountByUserId = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of projectAssignmentsQuery.data ?? []) {
      map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
    }

    return map;
  }, [projectAssignmentsQuery.data]);
  const membersWithCapabilitiesCount = useMemo(
    () => members.filter((member) => (capabilitiesByUserId.get(member.user_id) ?? []).length > 0).length,
    [members, capabilitiesByUserId]
  );
  const projectLeadsCount = useMemo(
    () => members.filter((member) => (capabilitiesByUserId.get(member.user_id) ?? []).includes('project_lead')).length,
    [members, capabilitiesByUserId]
  );

  if (!canEditTeam) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Medlemshantering är endast tillgänglig för team admin eller admin.</p>;
  }

  return (
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Teamöversikt</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-foreground/70">Medlemmar</p>
              <p className="text-sm font-semibold">{members.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-foreground/70">Med capability</p>
              <p className="text-sm font-semibold">{membersWithCapabilitiesCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-foreground/70">Projektledare</p>
              <p className="text-sm font-semibold">{projectLeadsCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-foreground/70">Aktiva projekttilldelningar</p>
              <p className="text-sm font-semibold">{projectAssignmentsQuery.data?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/70">Lägg till medlem via e-post och välj roll. Om användaren inte finns skickas en inbjudan automatiskt.</p>
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder="Fullständigt namn"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="md:col-span-1"
              />
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
              const memberCapabilities = capabilitiesByUserId.get(member.user_id) ?? [];
              const availableCapabilities = capabilityOptions.filter((capability) => !memberCapabilities.includes(capability));
              const pendingCapability = pendingCapabilityByUser[member.user_id] ?? availableCapabilities[0] ?? 'finance';
              const assignedProjectCount = projectCountByUserId.get(member.user_id) ?? 0;
              const access = accessSummary(member.role, memberCapabilities);
              const displayName = getUserDisplayName({
                displayName: member.display_name,
                email: member.email,
                userId: member.user_id
              });

              return (
                <div key={member.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{displayName}</p>
                      <p className="text-xs text-foreground/70">user_id: {member.user_id}</p>
                      {member.email && member.email !== displayName ? <p className="text-xs text-foreground/55">{member.email}</p> : null}
                    </div>
                    <Badge>{rollEtikett(member.role)}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="border border-border/70 bg-muted/20 text-foreground">Basroll: {rollEtikett(member.role)}</Badge>
                    <Badge className="border border-border/70 bg-muted/20 text-foreground">Projekt: {assignedProjectCount}</Badge>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Effektiv åtkomst</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {access.projectSummary ? <Badge>Projektöversikt</Badge> : null}
                      {access.finance ? <Badge>Ekonomi</Badge> : null}
                      {access.reporting ? <Badge>Rapporter</Badge> : null}
                      {access.team ? <Badge>Team</Badge> : null}
                      {!access.projectSummary && !access.finance && !access.reporting && !access.team ? (
                        <span className="text-sm text-foreground/60">Bara grundåtkomst.</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Funktionsroller</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {memberCapabilities.length === 0 ? (
                        <span className="text-sm text-foreground/60">Inga capabilities tilldelade.</span>
                      ) : (
                        memberCapabilities.map((capability) => (
                          <span key={capability} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-sm">
                            <span>{capabilityLabel(capability)}</span>
                            <button
                              type="button"
                              className="text-foreground/55 transition hover:text-foreground"
                              onClick={() => removeCapabilityMutation.mutate({ userId: member.user_id, capability })}
                              aria-label={`Ta bort ${capabilityLabel(capability)}`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
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

                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border/70 bg-muted/10 p-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Lägg till capability</span>
                      <Select
                        value={pendingCapability}
                        onValueChange={(value) =>
                          setPendingCapabilityByUser((prev) => ({
                            ...prev,
                            [member.user_id]: value as Capability
                          }))
                        }
                        disabled={availableCapabilities.length === 0}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCapabilities.length === 0 ? (
                            <SelectItem value="none" disabled>
                              Alla redan tilldelade
                            </SelectItem>
                          ) : (
                            availableCapabilities.map((capability) => (
                              <SelectItem key={capability} value={capability}>
                                {capabilityLabel(capability)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </label>
                    <Button
                      variant="secondary"
                      disabled={availableCapabilities.length === 0 || addCapabilityMutation.isPending}
                      onClick={() => addCapabilityMutation.mutate({ userId: member.user_id, capability: pendingCapability })}
                    >
                      Lägg till
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
  );
}
