'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { ensureCustomerByName } from '@/features/projects/customerResolver';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

const schema = z.object({
  name: z.string().min(2, 'Ange kundnamn'),
  org_no: z.string().optional(),
  vat_no: z.string().optional(),
  billing_email: z.string().optional(),
  phone: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional()
});

type FormData = z.infer<typeof schema>;
type CustomerView = 'active' | 'archived';
type Customer = {
  id: string;
  name: string;
  archived_at: string | null;
  org_no: string | null;
  vat_no: string | null;
  billing_email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

export default function CustomersPage() {
  const { companyId } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [view, setView] = useState<CustomerView>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Customer>>({});

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      org_no: '',
      vat_no: '',
      billing_email: '',
      phone: '',
      address_line1: '',
      address_line2: '',
      postal_code: '',
      city: '',
      country: ''
    }
  });

  const query = useQuery<Customer[]>({
    queryKey: ['customers', companyId, view],
    queryFn: async () => {
      let request = supabase
        .from('customers')
        .select('id,name,archived_at,org_no,vat_no,billing_email,phone,address_line1,address_line2,postal_code,city,country')
        .eq('company_id', companyId)
        .order('name');

      request = view === 'active' ? request.is('archived_at', null) : request.not('archived_at', 'is', null);

      const { data, error } = await request.returns<Customer[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const filteredCustomers = useMemo(() => {
    const customers = query.data ?? [];
    const needle = searchTerm.trim().toLowerCase();

    if (!needle) {
      return customers;
    }

    return customers.filter((customer) =>
      [
        customer.name,
        customer.org_no,
        customer.vat_no,
        customer.billing_email,
        customer.phone,
        customer.city
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query.data, searchTerm]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['customers', companyId] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const name = data.name.trim();
      const existingCustomer = await ensureCustomerByName(companyId, name);

      const supabaseUntyped = supabase as unknown as {
        from: (table: 'customers') => {
          update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => {
              eq: (column2: string, value2: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      };

      const { error } = await supabaseUntyped
        .from('customers')
        .update({
          org_no: nullIfEmpty(data.org_no),
          vat_no: nullIfEmpty(data.vat_no),
          billing_email: nullIfEmpty(data.billing_email),
          phone: nullIfEmpty(data.phone),
          address_line1: nullIfEmpty(data.address_line1),
          address_line2: nullIfEmpty(data.address_line2),
          postal_code: nullIfEmpty(data.postal_code),
          city: nullIfEmpty(data.city),
          country: nullIfEmpty(data.country)
        })
        .eq('company_id', companyId)
        .eq('id', existingCustomer.id);

      if (error) throw new Error(error.message);

      return existingCustomer;
    },
    onSuccess: async (result) => {
      await refresh();
      form.reset({
        name: '',
        org_no: '',
        vat_no: '',
        billing_email: '',
        phone: '',
        address_line1: '',
        address_line2: '',
        postal_code: '',
        city: '',
        country: ''
      });
      setCreateOpen(false);
      if (result.created) toast.success('Kund skapad');
      else if (result.revived) toast.success('Kund återställd från arkiv');
      else toast.success('Kunden finns redan');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa kund');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; draft: Partial<Customer> }) => {
      const cleanName = (payload.draft.name ?? '').trim();
      if (!cleanName) throw new Error('Namn får inte vara tomt');

      const supabaseUntyped = supabase as unknown as {
        from: (table: 'customers') => {
          update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => {
              eq: (column2: string, value2: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      };

      const { error } = await supabaseUntyped
        .from('customers')
        .update({
          name: cleanName,
          org_no: nullIfEmpty(payload.draft.org_no),
          vat_no: nullIfEmpty(payload.draft.vat_no),
          billing_email: nullIfEmpty(payload.draft.billing_email),
          phone: nullIfEmpty(payload.draft.phone),
          address_line1: nullIfEmpty(payload.draft.address_line1),
          address_line2: nullIfEmpty(payload.draft.address_line2),
          postal_code: nullIfEmpty(payload.draft.postal_code),
          city: nullIfEmpty(payload.draft.city),
          country: nullIfEmpty(payload.draft.country)
        })
        .eq('company_id', companyId)
        .eq('id', payload.id);

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setEditDraft({});
      toast.success('Kund uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kund');
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('customers')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('company_id', companyId)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await refresh();
      setArchiveTarget(null);
      toast.success(variables.archived ? 'Kund arkiverad' : 'Kund återställd');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera arkivstatus');
    }
  });

  function startEdit(customer: Customer) {
    setEditing(customer);
    setEditDraft({ ...customer });
  }

  function setEditField<K extends keyof Customer>(key: K, value: Customer[K]) {
    setEditDraft((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateDialog() {
    const initialName = searchTerm.trim();
    form.reset({
      name: initialName,
      org_no: '',
      vat_no: '',
      billing_email: '',
      phone: '',
      address_line1: '',
      address_line2: '',
      postal_code: '',
      city: '',
      country: ''
    });
    setCreateOpen(true);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Kunder</h2>
        <div className="flex gap-2">
          <Button variant={view === 'active' ? 'default' : 'secondary'} size="sm" onClick={() => setView('active')}>
            Aktiva
          </Button>
          <Button variant={view === 'archived' ? 'default' : 'secondary'} size="sm" onClick={() => setView('archived')}>
            Arkiverade
          </Button>
        </div>
      </div>

      {view === 'active' && (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-base">Sök kunder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                  placeholder="Sök på namn, org.nr, e-post eller stad"
                />
              </div>
              <Button type="button" size="icon" onClick={openCreateDialog} aria-label="Ny kund">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/25 px-3 py-2 text-xs text-foreground/65">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? 'kund' : 'kunder'} visas
            </div>
          </CardContent>
        </Card>
      )}

      {filteredCustomers.map((customer) => (
        <Card key={customer.id}>
          <CardHeader className="p-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/customers/${customer.id}` as Route} className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <CardTitle className="truncate text-base">{customer.name}</CardTitle>
                  {customer.archived_at && <Badge>Arkiverad</Badge>}
                </div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Åtgärder">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!customer.archived_at && (
                    <DropdownMenuItem onClick={() => startEdit(customer)}>
                      Redigera
                    </DropdownMenuItem>
                  )}
                  {!customer.archived_at ? (
                    <DropdownMenuItem onClick={() => setArchiveTarget(customer)}>Arkivera</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={async () => {
                        await archiveMutation.mutateAsync({ id: customer.id, archived: false });
                      }}
                    >
                      Aterstall
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href={`/customers/${customer.id}` as Route} className="block">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-3 transition hover:border-primary/35 hover:bg-muted/25">
                <div className="min-w-0 space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {customer.org_no ? <Badge className="bg-muted text-foreground/80">Org.nr {customer.org_no}</Badge> : null}
                    {customer.phone ? <Badge className="bg-muted text-foreground/80">{customer.phone}</Badge> : null}
                    {customer.city ? <Badge className="bg-muted text-foreground/80">{customer.city}</Badge> : null}
                  </div>
                  <div className="space-y-1 text-foreground/65">
                    {customer.billing_email ? <p className="truncate">Faktura: {customer.billing_email}</p> : null}
                    {customer.vat_no ? <p className="truncate">Momsnr: {customer.vat_no}</p> : null}
                    {!customer.org_no && !customer.phone && !customer.city && !customer.billing_email && !customer.vat_no ? (
                      <p className="text-foreground/60">Inga kompletterande uppgifter ännu.</p>
                    ) : null}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-foreground/45" />
              </div>
            </Link>
          </CardContent>
        </Card>
      ))}

      {filteredCustomers.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-foreground/70">
            Inga kunder matchar sökningen.
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            form.reset({
              name: '',
              org_no: '',
              vat_no: '',
              billing_email: '',
              phone: '',
              address_line1: '',
              address_line2: '',
              postal_code: '',
              city: '',
              country: ''
            });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny kund</DialogTitle>
            <DialogDescription>Lägg till en ny kund i bolaget.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={form.handleSubmit(async (data) => {
              await createMutation.mutateAsync(data);
            })}
          >
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Grunduppgifter</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <InputWithLabel label="Namn" value={String(form.watch('name') ?? '')} onChange={(v) => form.setValue('name', v)} />
                  <InputWithLabel label="Organisationsnummer" value={String(form.watch('org_no') ?? '')} onChange={(v) => form.setValue('org_no', v)} />
                  <InputWithLabel label="Momsregistreringsnummer" value={String(form.watch('vat_no') ?? '')} onChange={(v) => form.setValue('vat_no', v)} />
                  <InputWithLabel label="Telefon" value={String(form.watch('phone') ?? '')} onChange={(v) => form.setValue('phone', v)} />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">Fakturering</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <InputWithLabel label="Faktura e-post" value={String(form.watch('billing_email') ?? '')} onChange={(v) => form.setValue('billing_email', v)} />
                  <InputWithLabel label="Adressrad 1" value={String(form.watch('address_line1') ?? '')} onChange={(v) => form.setValue('address_line1', v)} />
                  <InputWithLabel label="Adressrad 2" value={String(form.watch('address_line2') ?? '')} onChange={(v) => form.setValue('address_line2', v)} />
                  <InputWithLabel label="Postnummer" value={String(form.watch('postal_code') ?? '')} onChange={(v) => form.setValue('postal_code', v)} />
                  <InputWithLabel label="Stad" value={String(form.watch('city') ?? '')} onChange={(v) => form.setValue('city', v)} />
                  <InputWithLabel label="Land" value={String(form.watch('country') ?? '')} onChange={(v) => form.setValue('country', v)} />
                </div>
              </div>
            </div>
            {form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Sparar...' : 'Lägg till'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera kund</DialogTitle>
            <DialogDescription>Uppdatera kundens fakturauppgifter.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Grunduppgifter</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <InputWithLabel label="Namn" value={String(editDraft.name ?? '')} onChange={(v) => setEditField('name', v)} />
                <InputWithLabel label="Organisationsnummer" value={String(editDraft.org_no ?? '')} onChange={(v) => setEditField('org_no', v)} />
                <InputWithLabel label="Momsregistreringsnummer" value={String(editDraft.vat_no ?? '')} onChange={(v) => setEditField('vat_no', v)} />
                <InputWithLabel label="Telefon" value={String(editDraft.phone ?? '')} onChange={(v) => setEditField('phone', v)} />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Fakturering</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <InputWithLabel label="Faktura e-post" value={String(editDraft.billing_email ?? '')} onChange={(v) => setEditField('billing_email', v)} />
                <InputWithLabel label="Adressrad 1" value={String(editDraft.address_line1 ?? '')} onChange={(v) => setEditField('address_line1', v)} />
                <InputWithLabel label="Adressrad 2" value={String(editDraft.address_line2 ?? '')} onChange={(v) => setEditField('address_line2', v)} />
                <InputWithLabel label="Postnummer" value={String(editDraft.postal_code ?? '')} onChange={(v) => setEditField('postal_code', v)} />
                <InputWithLabel label="Stad" value={String(editDraft.city ?? '')} onChange={(v) => setEditField('city', v)} />
                <InputWithLabel label="Land" value={String(editDraft.country ?? '')} onChange={(v) => setEditField('country', v)} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setEditDraft({});
              }}
            >
              Avbryt
            </Button>
            <Button
              disabled={!editing || updateMutation.isPending}
              onClick={async () => {
                if (!editing) return;
                await updateMutation.mutateAsync({ id: editing.id, draft: editDraft });
              }}
            >
              Spara
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arkivera kund</DialogTitle>
            <DialogDescription>
              Kunden markeras som arkiverad (`archived_at`) och döljs från aktiva listan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Kund: <strong>{archiveTarget?.name}</strong>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
                Avbryt
              </Button>
              <Button
                disabled={!archiveTarget || archiveMutation.isPending}
                onClick={async () => {
                  if (!archiveTarget) return;
                  await archiveMutation.mutateAsync({ id: archiveTarget.id, archived: true });
                }}
              >
                Arkivera
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function InputWithLabel({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function nullIfEmpty(value: string | null | undefined) {
  const clean = (value ?? '').trim();
  return clean.length === 0 ? null : clean;
}


