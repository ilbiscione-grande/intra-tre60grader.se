'use client';

import Link from 'next/link';
import { ArrowLeft, Building2, Mail, MapPin, Phone, ReceiptText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

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

export default function CustomerDetailsPage() {
  const { companyId } = useAppContext();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const supabase = createClient();

  const query = useQuery<Customer | null>({
    queryKey: ['customer', companyId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name,archived_at,org_no,vat_no,billing_email,phone,address_line1,address_line2,postal_code,city,country')
        .eq('company_id', companyId)
        .eq('id', customerId)
        .maybeSingle<Customer>();

      if (error) throw error;
      return data;
    }
  });

  if (query.isLoading) return <p>Laddar kund...</p>;
  if (!query.data) return <p>Kunden hittades inte.</p>;

  const customer = query.data;
  const billingAddress = [customer.address_line1, customer.address_line2, customer.postal_code, customer.city, customer.country]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till kunder">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Kund</p>
          <h2 className="text-lg font-semibold">{customer.name}</h2>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {customer.archived_at ? <Badge>Arkiverad</Badge> : <Badge>Aktiv</Badge>}
        {customer.org_no ? <Badge>{customer.org_no}</Badge> : null}
        {customer.city ? <Badge>{customer.city}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grunduppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={Building2} label="Kundnamn" value={customer.name} />
            <InfoRow icon={ReceiptText} label="Organisationsnummer" value={customer.org_no ?? '-'} />
            <InfoRow icon={ReceiptText} label="Momsregistreringsnummer" value={customer.vat_no ?? '-'} />
            <InfoRow icon={Phone} label="Telefon" value={customer.phone ?? '-'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fakturering</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={Mail} label="Faktura e-post" value={customer.billing_email ?? '-'} />
            <InfoRow icon={MapPin} label="Adress" value={billingAddress || '-'} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teknisk information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground/70">
          <p className="break-all font-mono">Kund-ID: {customer.id}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="mt-1 break-words text-sm font-medium text-foreground/85">{value}</p>
        </div>
      </div>
    </div>
  );
}
