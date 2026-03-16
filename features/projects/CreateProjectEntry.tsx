'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import ActionSheet from '@/components/common/ActionSheet';
import { createClient } from '@/lib/supabase/client';
import { useCreateProject, useProjectColumns } from '@/features/projects/projectQueries';
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
      orderTotal: z.coerce.number().min(0)
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
  initialStatus
}: {
  onSubmit: (data: CreateProjectFormData) => Promise<void>;
  isPending: boolean;
  customers: CustomerItem[];
  columns: ColumnItem[];
  initialStatus: string;
}) {
  const schema = useMemo(() => buildSchema(), []);

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      status: initialStatus,
      customerSelect: '',
      newCustomerName: '',
      orderTotal: 0
    }
  });

  const selectedCustomer = form.watch('customerSelect');

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
          orderTotal: 0
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
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
