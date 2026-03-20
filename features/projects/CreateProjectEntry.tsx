'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { createClient } from '@/lib/supabase/client';
import { useCreateProject, useProjectColumns, useProjectMembers, type ProjectMemberVisual } from '@/features/projects/projectQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CreateProjectFormData = {
  title: string;
  status: string;
  customerSelect?: string;
  newCustomerName?: string;
  orderTotal: number;
  memberIds: string[];
};

type CustomerItem = { id: string; name: string };
type ColumnItem = { key: string; title: string };

const NEW_CUSTOMER_VALUE = '__new__';

function buildSchema() {
  return z
    .object({
      title: z.string().min(2, 'Titel krävs'),
      status: z.string().min(1, 'Status krävs'),
      customerSelect: z.string().optional(),
      newCustomerName: z.string().optional(),
      orderTotal: z.coerce.number().min(0),
      memberIds: z.array(z.string()).default([])
    })
    .superRefine((value, ctx) => {
      if (value.customerSelect === NEW_CUSTOMER_VALUE && !(value.newCustomerName ?? '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ange namn på ny kund',
          path: ['newCustomerName']
        });
      }
    });
}

function ProjectForm({
  onSubmit,
  isPending,
  customers,
  columns,
  initialStatus,
  availableMembers
}: {
  onSubmit: (data: CreateProjectFormData) => Promise<void>;
  isPending: boolean;
  customers: CustomerItem[];
  columns: ColumnItem[];
  initialStatus: string;
  availableMembers: ProjectMemberVisual[];
}) {
  const schema = useMemo(() => buildSchema(), []);
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | ProjectMemberVisual['role']>('all');

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      status: initialStatus,
      customerSelect: '',
      newCustomerName: '',
      orderTotal: 0,
      memberIds: []
    }
  });

  const selectedCustomer = form.watch('customerSelect');
  const selectedMemberIds = form.watch('memberIds');
  const filteredMembers = useMemo(() => {
    if (memberRoleFilter === 'all') return availableMembers;
    return availableMembers.filter((member) => member.role === memberRoleFilter);
  }, [availableMembers, memberRoleFilter]);

  useEffect(() => {
    if (initialStatus && !form.getValues('status')) {
      form.setValue('status', initialStatus);
    }
  }, [form, initialStatus]);

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(async (data) => {
        await onSubmit(data);
        form.reset({
          title: '',
          status: initialStatus,
          customerSelect: '',
          newCustomerName: '',
          orderTotal: 0,
          memberIds: []
        });
      })}
    >
      <div className="space-y-1">
        <p className="text-sm">Projekttitel</p>
        <Input {...form.register('title')} placeholder="Nytt projekt" />
        {form.formState.errors.title && <p className="text-xs text-danger">{form.formState.errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-sm">Startkolumn</p>
        <Select value={form.watch('status')} onValueChange={(value) => form.setValue('status', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Välj kolumn" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.key} value={column.key}>
                {column.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <p className="text-sm">Kund</p>
        <Select value={selectedCustomer} onValueChange={(value) => form.setValue('customerSelect', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Välj befintlig eller ny" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_CUSTOMER_VALUE}>+ Ny kund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedCustomer === NEW_CUSTOMER_VALUE && (
        <div className="space-y-1">
          <p className="text-sm">Namn på ny kund</p>
          <Input {...form.register('newCustomerName')} placeholder="Kundnamn" />
          {form.formState.errors.newCustomerName && (
            <p className="text-xs text-danger">{form.formState.errors.newCustomerName.message}</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm">Ordertotal (valfritt)</p>
        <Input type="number" {...form.register('orderTotal')} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Tilldela medlemmar</p>
          <div className="flex flex-wrap gap-2">
            {(['all', 'member', 'finance', 'admin', 'auditor'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setMemberRoleFilter(filter)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  memberRoleFilter === filter ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'
                }`}
              >
                {filter === 'all' ? 'Alla' : filter}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => form.setValue('memberIds', filteredMembers.map((member) => member.user_id))}
          >
            Markera alla
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue('memberIds', [])}>
            Rensa
          </Button>
        </div>
        <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-2">
          {availableMembers.length === 0 ? <p className="text-sm text-foreground/65">Inga medlemmar hittades.</p> : null}
          {filteredMembers.map((member) => {
            const isSelected = selectedMemberIds.includes(member.user_id);
            return (
              <button
                key={member.id}
                type="button"
                className={`flex items-center justify-between gap-3 rounded-lg border p-2 text-left transition ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() =>
                  form.setValue(
                    'memberIds',
                    isSelected
                      ? selectedMemberIds.filter((id) => id !== member.user_id)
                      : [...selectedMemberIds, member.user_id]
                  )
                }
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileBadge
                    label={member.email ?? member.user_id}
                    color={member.color}
                    avatarUrl={member.avatar_url}
                    emoji={member.emoji}
                    className="h-8 w-8 shrink-0"
                    textClassName="text-xs font-semibold text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.email ?? member.user_id}</p>
                    <p className="text-xs text-foreground/55">{member.role}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-foreground/70">{isSelected ? 'Vald' : 'Lägg till'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button className="w-full" type="submit" disabled={isPending || columns.length === 0}>
        {isPending ? 'Skapar...' : 'Skapa projekt'}
      </Button>
    </form>
  );
}

export default function CreateProjectEntry({ companyId, mode }: { companyId: string; mode: 'mobile' | 'desktop' }) {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateProject(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);

  const customersQuery = useQuery<CustomerItem[]>({
    queryKey: ['customers', companyId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name');

      if (error) throw error;
      return data ?? [];
    }
  });

  const columns: ColumnItem[] = (columnsQuery.data ?? []).map((c) => ({ key: c.key, title: c.title }));
  const initialStatus = columns[0]?.key ?? '';

  async function submit(data: CreateProjectFormData) {
    const customerId = data.customerSelect && data.customerSelect !== NEW_CUSTOMER_VALUE ? data.customerSelect : null;
    const customerName = data.customerSelect === NEW_CUSTOMER_VALUE ? data.newCustomerName?.trim() ?? '' : null;

    await createMutation.mutateAsync({
      title: data.title,
      status: data.status,
      customer_id: customerId,
      customer_name: customerName,
      order_total: data.orderTotal,
      member_ids: data.memberIds,
      source: 'ui'
    });

    setOpen(false);
  }

  const customers = customersQuery.data ?? [];

  if (mode === 'mobile') {
    return (
      <Card>
        <CardContent className="p-3">
          <Button className="w-full" onClick={() => setOpen(true)}>
            Nytt projekt
          </Button>
          <ActionSheet open={open} onClose={() => setOpen(false)} title="Snabbskapa projekt" description="Funkar online och offline">
            <ProjectForm
              onSubmit={submit}
              isPending={createMutation.isPending}
              customers={customers}
              columns={columns}
              initialStatus={initialStatus}
              availableMembers={projectMembersQuery.data?.availableMembers ?? []}
            />
          </ActionSheet>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>Nytt projekt</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skapa projekt</DialogTitle>
            <DialogDescription>Skapar projekt och orderutkast via RPC.</DialogDescription>
          </DialogHeader>
          <ProjectForm
            onSubmit={submit}
            isPending={createMutation.isPending}
            customers={customers}
            columns={columns}
            initialStatus={initialStatus}
            availableMembers={projectMembersQuery.data?.availableMembers ?? []}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
