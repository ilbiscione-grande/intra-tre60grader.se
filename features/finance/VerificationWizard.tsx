'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus } from 'lucide-react';
import { useOnlineStatus } from '@/lib/ui/useOnlineStatus';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import { createClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';
import { useSaveDraft, useSendVerification } from '@/features/finance/financeQueries';
import { fileToAttachment } from '@/features/finance/attachmentStorage';
import { validateVerificationDraft } from '@/features/finance/verificationValidation';
import type { VerificationAttachment, VerificationDraft, VerificationSource } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MobileAttachmentPicker from '@/components/common/MobileAttachmentPicker';

type Template = {
  key: string;
  label: string;
  shortDescription: string;
  longDescription: string;
  direction: 'in' | 'out';
  account: string;
  accountName: string;
  vatRate: '0' | '6' | '12' | '25';
};

const templates = [
  {
    key: 'subscription',
    label: 'Betalat abonnemang',
    shortDescription: 'Löpande tjänst, till exempel programvara.',
    longDescription: 'Använd när du betalar för återkommande tjänster som system, molntjänster eller andra abonnemang.',
    direction: 'out',
    account: '6540',
    accountName: 'IT-tjänster',
    vatRate: '25'
  },
  {
    key: 'fuel',
    label: 'Tankat bilen',
    shortDescription: 'Drivmedel för företagsbil.',
    longDescription: 'Använd för drivmedelskostnader kopplade till företagets verksamhet.',
    direction: 'out',
    account: '5611',
    accountName: 'Drivmedel för personbilar',
    vatRate: '25'
  },
  {
    key: 'materials',
    label: 'Köpt material',
    shortDescription: 'Varu- eller materialinköp till verksamheten.',
    longDescription: 'Använd när du köper in material eller varor som behövs i företagets dagliga arbete.',
    direction: 'out',
    account: '4010',
    accountName: 'Varuinköp',
    vatRate: '25'
  },
  {
    key: 'office',
    label: 'Köpt kontorsmaterial',
    shortDescription: 'Förbrukning på kontoret.',
    longDescription: 'Använd för kontorsmaterial som papper, pennor och liknande förbrukningsartiklar.',
    direction: 'out',
    account: '6110',
    accountName: 'Kontorsmaterial',
    vatRate: '25'
  },
  {
    key: 'mobile_phone',
    label: 'Betalat mobil/telefoni',
    shortDescription: 'Mobilabonnemang och telefoni.',
    longDescription: 'Använd för företagets mobilabonnemang, telefoni och relaterade tjänster.',
    direction: 'out',
    account: '6212',
    accountName: 'Mobiltelefon',
    vatRate: '25'
  },
  {
    key: 'internet',
    label: 'Betalat internet',
    shortDescription: 'Bredband och internetanslutning.',
    longDescription: 'Använd för kostnader kopplade till bredband och internet i verksamheten.',
    direction: 'out',
    account: '6231',
    accountName: 'Datakommunikation',
    vatRate: '25'
  },
  {
    key: 'rent',
    label: 'Betalat lokalhyra',
    shortDescription: 'Hyra för kontor eller lokal.',
    longDescription: 'Använd för hyreskostnader av lokal eller kontor för verksamheten.',
    direction: 'out',
    account: '5010',
    accountName: 'Lokalhyra',
    vatRate: '0'
  },
  {
    key: 'salary',
    label: 'Betalat lön',
    shortDescription: 'Löneutbetalning till anställd.',
    longDescription: 'Använd vid löneutbetalning. I mer avancerad lönehantering kan fler konton krävas.',
    direction: 'out',
    account: '7010',
    accountName: 'Löner till kollektivanställda',
    vatRate: '0'
  },
  {
    key: 'employer_fees',
    label: 'Betalat arbetsgivaravgift',
    shortDescription: 'Arbetsgivaravgifter och sociala avgifter.',
    longDescription: 'Använd när arbetsgivaravgifter eller andra sociala avgifter betalas.',
    direction: 'out',
    account: '7510',
    accountName: 'Arbetsgivaravgifter',
    vatRate: '0'
  },
  {
    key: 'insurance',
    label: 'Betalat försäkring',
    shortDescription: 'Företags- eller fordonsförsäkring.',
    longDescription: 'Använd för försäkringspremier som företaget betalar.',
    direction: 'out',
    account: '6310',
    accountName: 'Företagsförsäkringar',
    vatRate: '0'
  },
  {
    key: 'bank_fee',
    label: 'Betalat bankavgift',
    shortDescription: 'Avgifter till bank eller betallösning.',
    longDescription: 'Använd för bankavgifter, kortavgifter och transaktionskostnader.',
    direction: 'out',
    account: '6570',
    accountName: 'Bankkostnader',
    vatRate: '0'
  },
  {
    key: 'travel',
    label: 'Betalat resa',
    shortDescription: 'Resor i tjänsten.',
    longDescription: 'Använd för tågbiljetter, flyg och andra resekostnader i tjänsten.',
    direction: 'out',
    account: '5800',
    accountName: 'Resekostnader',
    vatRate: '12'
  },
  {
    key: 'hotel',
    label: 'Betalat hotell',
    shortDescription: 'Boende vid tjänsteresa.',
    longDescription: 'Använd för hotell och boendekostnader vid tjänsteresor.',
    direction: 'out',
    account: '5831',
    accountName: 'Logikostnader',
    vatRate: '12'
  },
  {
    key: 'meals',
    label: 'Betalat representation/måltid',
    shortDescription: 'Måltidskostnader i verksamheten.',
    longDescription: 'Använd för representation och måltidskostnader där avdragsregler kan variera.',
    direction: 'out',
    account: '6071',
    accountName: 'Representation, avdragsgill',
    vatRate: '12'
  },
  {
    key: 'marketing',
    label: 'Betalat marknadsföring',
    shortDescription: 'Annonsering och kampanjer.',
    longDescription: 'Använd för annonsering, kampanjer och övriga marknadsföringskostnader.',
    direction: 'out',
    account: '5910',
    accountName: 'Annonsering',
    vatRate: '25'
  },
  {
    key: 'equipment',
    label: 'Köpt utrustning',
    shortDescription: 'Verktyg och mindre inventarier.',
    longDescription: 'Använd för mindre inventarier och utrustning som kostnadsförs direkt.',
    direction: 'out',
    account: '5410',
    accountName: 'Förbrukningsinventarier',
    vatRate: '25'
  },
  {
    key: 'consulting_cost',
    label: 'Betalat konsult',
    shortDescription: 'Inköpta konsulttjänster.',
    longDescription: 'Använd för externa konsulttjänster inom t.ex. ekonomi, juridik eller teknik.',
    direction: 'out',
    account: '6550',
    accountName: 'Konsultarvoden',
    vatRate: '25'
  },
  {
    key: 'leasing',
    label: 'Betalat leasing',
    shortDescription: 'Leasing av bil eller utrustning.',
    longDescription: 'Använd för löpande leasingavgifter i verksamheten.',
    direction: 'out',
    account: '5615',
    accountName: 'Leasing av personbilar',
    vatRate: '25'
  },
  {
    key: 'manual_out',
    label: 'Övrig utbetalning',
    shortDescription: 'Övrig kostnad utan moms.',
    longDescription: 'Använd för utbetalningar som inte passar standardmallarna, ofta utan moms.',
    direction: 'out',
    account: '6991',
    accountName: 'Övriga externa kostnader',
    vatRate: '0'
  },
  {
    key: 'sale_service',
    label: 'Sålt tjänst',
    shortDescription: 'Intäkt från tjänsteförsäljning.',
    longDescription: 'Använd när företaget säljer en tjänst och får betalt.',
    direction: 'in',
    account: '3041',
    accountName: 'Försäljning tjänster 25%',
    vatRate: '25'
  },
  {
    key: 'sale_goods',
    label: 'Sålt vara',
    shortDescription: 'Intäkt från varuförsäljning.',
    longDescription: 'Använd när företaget säljer en fysisk vara och får betalt.',
    direction: 'in',
    account: '3001',
    accountName: 'Försäljning varor 25%',
    vatRate: '25'
  },
  {
    key: 'consulting_income',
    label: 'Fått konsultarvode',
    shortDescription: 'Intäkt från konsultuppdrag.',
    longDescription: 'Använd när företaget fakturerar och får betalt för konsultarbete.',
    direction: 'in',
    account: '3048',
    accountName: 'Försäljning tjänster, momsfri eller särskild',
    vatRate: '25'
  },
  {
    key: 'rent_income',
    label: 'Fått hyresintäkt',
    shortDescription: 'Inkomst från uthyrning.',
    longDescription: 'Använd när företaget får intäkt från uthyrning av lokal eller utrustning.',
    direction: 'in',
    account: '3911',
    accountName: 'Hyresintäkter',
    vatRate: '0'
  },
  {
    key: 'interest_income',
    label: 'Fått ränteintäkt',
    shortDescription: 'Ränta från bank eller kund.',
    longDescription: 'Använd för ränteintäkter från bankkonto eller dröjsmålsränta.',
    direction: 'in',
    account: '8314',
    accountName: 'Skattefria ränteintäkter',
    vatRate: '0'
  },
  {
    key: 'insurance_comp',
    label: 'Fått försäkringsersättning',
    shortDescription: 'Utbetalning från försäkringsbolag.',
    longDescription: 'Använd när företaget får ersättning från ett försäkringsärende.',
    direction: 'in',
    account: '3997',
    accountName: 'Sjuklöneersättning och försäkringsersättning',
    vatRate: '0'
  },
  {
    key: 'tax_refund',
    label: 'Fått skatteåterbäring',
    shortDescription: 'Återbetalning från skattekonto.',
    longDescription: 'Använd när återbetalning kommer från skattekontot till företagskontot.',
    direction: 'in',
    account: '1630',
    accountName: 'Avräkning för skatter och avgifter',
    vatRate: '0'
  },
  {
    key: 'owner_deposit',
    label: 'Egen insättning',
    shortDescription: 'Ägare sätter in pengar i firman.',
    longDescription: 'Använd vid ägarinsättning i enskild firma eller motsvarande kapitaltillskott.',
    direction: 'in',
    account: '2018',
    accountName: 'Egen insättning',
    vatRate: '0'
  },
  {
    key: 'manual_in',
    label: 'Övrig inbetalning',
    shortDescription: 'Övrig intäkt utan moms.',
    longDescription: 'Använd för inbetalningar som inte passar standardmallarna, ofta utan moms.',
    direction: 'in',
    account: '3990',
    accountName: 'Övriga rörelseintäkter',
    vatRate: '0'
  }
] as const satisfies readonly Template[];

const templateKeys = templates.map((t) => t.key) as [
  (typeof templates)[number]['key'],
  ...(typeof templates)[number]['key'][]
];

type TemplateKey = (typeof templates)[number]['key'];

const schema = z.object({
  direction: z.enum(['in', 'out'], { required_error: 'Välj pengar in eller ut' }),
  template: z.enum(templateKeys, { required_error: 'Välj en händelse' }),
  date: z.string().min(1, 'Datum krävs'),
  description: z.string().min(3, 'Beskrivning måste vara minst 3 tecken'),
  total: z.coerce.number().positive('Belopp måste vara större än 0'),
  vatRate: z.enum(['0', '6', '12', '25'])
});

type WizardForm = z.infer<typeof schema>;
type Step = 1 | 2 | 3 | 4;
type DraftLine = VerificationDraft['lines'][number];
type TemplateUsageMap = Record<string, number>;

const VERIFICATION_TEMPLATE_PREF_KEY = 'verification_template_usage';

function normalizeUsageMap(value: unknown): TemplateUsageMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: TemplateUsageMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      result[key] = Math.floor(n);
    }
  }

  return result;
}

function toNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2));
}

function getTemplateConfig(templateKey: TemplateKey) {
  return templates.find((t) => t.key === templateKey) ?? templates[0];
}
function getOutputVatAccount(vatRate: WizardForm['vatRate']) {
  if (vatRate === '25') return '2611';
  if (vatRate === '12') return '2621';
  if (vatRate === '6') return '2631';
  return null;
}

function getVatAccountLabel(direction: Template['direction'], vatRate: WizardForm['vatRate']) {
  if (direction === 'out') return '2641 Ingående moms';
  const output = getOutputVatAccount(vatRate);
  if (output === '2621') return '2621 Utgående moms 12%';
  if (output === '2631') return '2631 Utgående moms 6%';
  return '2611 Utgående moms 25%';
}

function computeLines(values: WizardForm): DraftLine[] {
  const template = getTemplateConfig(values.template);
  const total = toMoney(values.total);
  const vatRate = Number(values.vatRate);
  const vatAmount = vatRate > 0 ? toMoney(total - total / (1 + vatRate / 100)) : 0;
  const netAmount = toMoney(total - vatAmount);
  const cashAccount = '1930';

  if (values.direction === 'out') {
    const lines: DraftLine[] = [{ account_no: template.account, debit: netAmount, credit: 0 }];
    if (vatAmount > 0) lines.push({ account_no: '2641', debit: vatAmount, credit: 0, vat_code: values.vatRate });
    lines.push({ account_no: cashAccount, debit: 0, credit: total });
    return lines;
  }

  const lines: DraftLine[] = [
    { account_no: cashAccount, debit: total, credit: 0 },
    { account_no: template.account, debit: 0, credit: netAmount }
  ];
  if (vatAmount > 0) {
    const outputVatAccount = getOutputVatAccount(values.vatRate);
    if (outputVatAccount) lines.push({ account_no: outputVatAccount, debit: 0, credit: vatAmount, vat_code: values.vatRate });
  }
  return lines;
}

const stepTitles: Record<Step, string> = {
  1: 'Underlag',
  2: 'Händelse',
  3: 'Detaljer',
  4: 'Granska'
};

export default function VerificationWizard({
  companyId,
  fullscreen = false
}: {
  companyId: string;
  fullscreen?: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachment, setAttachment] = useState<VerificationAttachment | undefined>();
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [detailsTemplate, setDetailsTemplate] = useState<TemplateKey | null>(null);
  const [templateUsage, setTemplateUsage] = useState<TemplateUsageMap>({});
  const [createdSummary, setCreatedSummary] = useState<{
    date: string;
    description: string;
    total: number;
    lines: DraftLine[];
    templateLabel: string;
    attachmentName?: string;
    source: VerificationSource;
    verificationId?: string;
  } | null>(null);
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const mode = useBreakpointMode();
  const isMobile = mode === 'mobile';
  const supabase = useMemo(() => createClient(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const saveDraftMutation = useSaveDraft();
  const sendMutation = useSendVerification();

  const form = useForm<WizardForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      description: '',
      total: 0,
      vatRate: '25'
    }
  });

  const values = form.watch();
  const lines = useMemo(() => {
    if (!values.direction || !values.template) return [];
    return computeLines(values as WizardForm);
  }, [values]);
  const busy = saveDraftMutation.isPending || sendMutation.isPending;
  const verificationSource: VerificationSource = isOnline ? (isMobile ? 'mobile' : 'desktop') : 'offline';

  useEffect(() => {
    let active = true;

    async function loadUsage() {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setCurrentUserId(null);
        setTemplateUsage({});
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('user_company_preferences')
        .select('preference_value')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .eq('preference_key', VERIFICATION_TEMPLATE_PREF_KEY)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setTemplateUsage({});
        return;
      }

      setTemplateUsage(normalizeUsageMap(data?.preference_value));
    }

    void loadUsage();

    return () => {
      active = false;
    };
  }, [companyId, supabase]);

  function persistUsage(next: TemplateUsageMap, userId: string) {
    void supabase.from('user_company_preferences').upsert(
      {
        company_id: companyId,
        user_id: userId,
        preference_key: VERIFICATION_TEMPLATE_PREF_KEY,
        preference_value: next
      },
      { onConflict: 'company_id,user_id,preference_key' }
    );
  }

  function markTemplateUsed(templateKey: TemplateKey) {
    setTemplateUsage((prev) => {
      const next: TemplateUsageMap = {
        ...prev,
        [templateKey]: (prev[templateKey] ?? 0) + 1
      };

      if (currentUserId) {
        persistUsage(next, currentUserId);
      }

      return next;
    });
  }

  function applyDirection(direction: 'in' | 'out') {
    form.setValue('direction', direction, { shouldDirty: true, shouldValidate: true });
    form.setValue('template', direction === 'in' ? 'sale_service' : 'materials', { shouldDirty: true, shouldValidate: true });
    setStep(2);
  }

  function applyTemplate(templateKey: TemplateKey) {
    const config = getTemplateConfig(templateKey);
    form.setValue('template', templateKey, { shouldDirty: true, shouldValidate: true });
    form.setValue('vatRate', config.vatRate, { shouldDirty: true, shouldValidate: true });

    const currentDescription = form.getValues('description')?.trim() ?? '';
    if (!currentDescription) form.setValue('description', config.label, { shouldDirty: true });

    markTemplateUsed(templateKey);
    setStep(3);
  }

  async function handleFilePicked(file: File | undefined) {
    if (!file) return;

    try {
      const prepared = await fileToAttachment(file);
      setAttachment(prepared);
      setAttachmentName(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte läsa bilagan');
    }
  }

  async function validateStep(target: Step) {
    if (target <= step) return true;
    if (step === 1) return form.trigger(['direction']);
    if (step === 2) return form.trigger(['template']);
    if (step === 3) return form.trigger(['date', 'description', 'total', 'vatRate']);
    return true;
  }

  async function goToStep(target: Step) {
    const ok = await validateStep(target);
    if (!ok) return;
    setStep(target);
  }

  function buildDraft(id: string): VerificationDraft {
    return {
      id,
      company_id: companyId,
      date: values.date,
      description: values.description,
      total: toMoney(values.total),
      created_at: new Date().toISOString(),
      lines,
      attachment,
      source: verificationSource
    };
  }

  const reviewValidation = useMemo(() => {
    if (step !== 4 || !values.direction || !values.template) return null;
    return validateVerificationDraft(buildDraft('preview'));
  }, [step, values.direction, values.template, values.date, values.description, values.total, values.vatRate, lines, attachment, verificationSource]);

  useEffect(() => {
    if (step !== 4 && submitErrors.length > 0) {
      setSubmitErrors([]);
    }
  }, [step, submitErrors.length]);

  async function toDraft(): Promise<VerificationDraft | null> {
    const valid = await form.trigger();
    if (!valid) return null;

    const draft = buildDraft(crypto.randomUUID());
    const validation = validateVerificationDraft(draft);

    if (!validation.ok) {
      setSubmitErrors(validation.errors);
      return null;
    }

    setSubmitErrors([]);
    return draft;
  }

  const templateOptions = useMemo(
    () =>
      templates
        .filter((item) => item.direction === values.direction)
        .sort((a, b) => {
          const bCount = templateUsage[b.key] ?? 0;
          const aCount = templateUsage[a.key] ?? 0;
          if (bCount !== aCount) return bCount - aCount;
          return a.label.localeCompare(b.label, 'sv');
        }),
    [values.direction, templateUsage]
  );
  const selectedTemplate = values.template ? getTemplateConfig(values.template as TemplateKey) : null;
  const detailsConfig = detailsTemplate ? getTemplateConfig(detailsTemplate) : null;

  function closeCreatedSummary() {
    setCreatedSummary(null);
    router.push('/finance');
  }

  const detailsRows = detailsConfig
    ? [
        detailsConfig.direction === 'out'
          ? { side: 'Debet', account: `${detailsConfig.account} ${detailsConfig.accountName}` }
          : { side: 'Debet', account: '1930 Företagskonto' },
        detailsConfig.direction === 'out'
          ? { side: 'Kredit', account: '1930 Företagskonto' }
          : { side: 'Kredit', account: `${detailsConfig.account} ${detailsConfig.accountName}` },
        detailsConfig.vatRate !== '0'
          ? detailsConfig.direction === 'out'
            ? { side: 'Debet', account: '2641 Ingående moms' }
            : { side: 'Kredit', account: '2611 Utgående moms' }
          : null
      ].filter(Boolean) as Array<{ side: string; account: string }>
    : [];
  const detailsExplanation = detailsConfig
    ? [
        detailsConfig.direction === 'out'
          ? 'Utbetalning bokas som kostnad i debet och pengar ut från företagskontot i kredit.'
          : 'Inbetalning bokas som pengar in på företagskontot i debet och intäkt i kredit.',
        detailsConfig.vatRate === '0'
          ? 'Moms hanteras inte för detta exempel (0%).'
          : `Moms delas ut automatiskt från totalbeloppet och bokas på ${getVatAccountLabel(detailsConfig.direction, detailsConfig.vatRate)} (${detailsConfig.vatRate}%).`,
        'Du kan ändra datum, beskrivning och belopp i steg 3 innan verifikationen läggs till.'
      ]
    : [];

  return (
    <Card
      className={`flex flex-col ${
        fullscreen
          ? 'min-h-[100dvh] rounded-none border-0 shadow-none'
          : 'h-[calc(100dvh-10.5rem)] min-h-[560px] md:h-[calc(100dvh-9rem)]'
      }`}
    >
      <CardHeader className={`space-y-3 ${fullscreen ? 'px-4 pb-4 pt-5 md:px-6' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Ny verifikation</CardTitle>
            <span className="rounded bg-muted px-2 py-1 text-xs">Steg {step}/4</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/finance')}>
            Avbryt
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((item) => {
            const n = item as Step;
            const active = n === step;
            const done = n < step;
            return (
              <button
                key={n}
                type="button"
                onClick={() => void goToStep(n)}
                className={`rounded border px-2 py-2 text-left text-xs ${
                  active ? 'border-primary bg-primary/10' : done ? 'border-border bg-muted/60' : 'border-border'
                }`}
              >
                <div className="font-medium">{n}. {stepTitles[n]}</div>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${fullscreen ? 'px-4 py-4 md:px-6' : 'p-6'}`}>
          {step === 1 ? (
            <div className={isMobile ? 'space-y-4 pt-2' : 'space-y-4'}>
              <p className={isMobile ? 'text-center text-sm font-medium' : 'text-sm font-medium'}>Lägg till underlag</p>
              <MobileAttachmentPicker
                label="Underlag"
                valueLabel={attachmentName || undefined}
                onPick={async (file) => {
                  await handleFilePicked(file);
                }}
                onClear={() => {
                  setAttachment(undefined);
                  setAttachmentName('');
                }}
              />
              {attachment ? (
                <div className="rounded-xl border border-border/70 bg-card p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Förhandsvisning</p>
                  {attachment.type.startsWith('image/') ? (
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className="max-h-44 w-auto rounded-lg border border-border/70 bg-muted/20 object-contain"
                    />
                  ) : attachment.type === 'application/pdf' ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                      <FileText className="h-5 w-5 text-foreground/65" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{attachment.name}</p>
                        <p className="text-xs text-foreground/60">PDF bifogad</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {values.direction === 'in' ? 'Riktning: Pengar in' : 'Riktning: Pengar ut'}
              </div>
              <p className="text-sm font-medium">Välj händelse</p>
              <div className="grid gap-2 md:grid-cols-2">
                {templateOptions.map((item) => (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailsTemplate(item.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDetailsTemplate(item.key);
                      }
                    }}
                    className={`flex items-center justify-between gap-3 rounded border p-3 text-left ${
                      values.template === item.key ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.shortDescription}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Lägg till ${item.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        applyTemplate(item.key);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {form.formState.errors.template ? <p className="text-xs text-destructive">{form.formState.errors.template.message}</p> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p>{values.direction === 'in' ? 'Pengar in' : 'Pengar ut'} · {selectedTemplate?.label ?? '-'}</p>
                <p className="text-xs text-muted-foreground">Konton hanteras automatiskt baserat på vald händelse.</p>
              </div>

              <label className="block space-y-1">
                <span className="text-sm">Datum</span>
                <Input type="date" {...form.register('date')} />
                {form.formState.errors.date ? <p className="text-xs text-destructive">{form.formState.errors.date.message}</p> : null}
              </label>

              <label className="block space-y-1">
                <span className="text-sm">Beskrivning</span>
                <Input placeholder="Beskrivning" {...form.register('description')} />
                {form.formState.errors.description ? <p className="text-xs text-destructive">{form.formState.errors.description.message}</p> : null}
              </label>

              <label className="block space-y-1">
                <span className="text-sm">Belopp (inkl moms)</span>
                <Input type="number" step="0.01" {...form.register('total')} />
                {form.formState.errors.total ? <p className="text-xs text-destructive">{form.formState.errors.total.message}</p> : null}
              </label>

              <label className="block space-y-1">
                <span className="text-sm">Momssats</span>
                <Select value={values.vatRate} onValueChange={(v) => form.setValue('vatRate', v as WizardForm['vatRate'])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj momssats" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="6">6%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p><span className="font-medium">Riktning:</span> {values.direction === 'in' ? 'Pengar in' : 'Pengar ut'}</p>
                <p><span className="font-medium">Händelse:</span> {selectedTemplate?.label ?? '-'}</p>
                <p><span className="font-medium">Datum:</span> {values.date}</p>
                <p><span className="font-medium">Beskrivning:</span> {values.description || '-'}</p>
                <p><span className="font-medium">Total:</span> {toMoney(values.total).toFixed(2)} kr</p>
                {attachmentName ? <p><span className="font-medium">Underlag:</span> {attachmentName}</p> : null}
                <p><span className="font-medium">Källa:</span> {verificationSource === 'mobile' ? 'Mobil' : verificationSource === 'desktop' ? 'Desktop' : 'Offline'}</p>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Konto</th>
                      <th className="px-3 py-2">Debet</th>
                      <th className="px-3 py-2">Kredit</th>
                      <th className="px-3 py-2">Momskod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={`${line.account_no}-${idx}`} className="border-t">
                        <td className="px-3 py-2">{line.account_no}</td>
                        <td className="px-3 py-2">{toMoney(line.debit).toFixed(2)}</td>
                        <td className="px-3 py-2">{toMoney(line.credit).toFixed(2)}</td>
                        <td className="px-3 py-2">{line.vat_code ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {reviewValidation && !reviewValidation.ok ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="mb-1 font-medium">Kontrollera innan du går vidare:</p>
                  <ul className="list-disc pl-4">
                    {reviewValidation.errors.map((item, idx) => (
                      <li key={`review-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {submitErrors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <p className="mb-1 font-medium">Kunde inte spara:</p>
                  <ul className="list-disc pl-4">
                    {submitErrors.map((item, idx) => (
                      <li key={`submit-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!isOnline ? <p className="text-xs text-amber-700">Ingen uppkoppling. Du kan spara som utkast och skicka senare.</p> : null}
            </div>
          ) : null}
        </div>

        <div className={`border-t bg-card ${fullscreen ? 'sticky bottom-0 p-4 md:px-6' : 'p-4'}`}>
          {step === 1 ? (
            <div className="space-y-2">
              {form.formState.errors.direction ? (
                <p className="text-xs text-destructive">{form.formState.errors.direction.message}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" className="h-12" onClick={() => applyDirection('in')}>
                  Pengar in
                </Button>
                <Button type="button" variant="secondary" className="h-12" onClick={() => applyDirection('out')}>
                  Pengar ut
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {step < 4 ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => setStep((step - 1) as Step)}>
                    Tillbaka
                  </Button>
                  <Button type="button" className="w-full" disabled={busy} onClick={() => void goToStep((step + 1) as Step)}>
                    Nästa
                  </Button>
                </div>
              ) : null}

              {step === 4 && isOnline ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => setStep((step - 1) as Step)}>
                    Tillbaka
                  </Button>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy || (reviewValidation ? !reviewValidation.ok : false)}
                    onClick={async () => {
                      const draft = await toDraft();
                      if (!draft) return;
                      const result = await sendMutation.mutateAsync(draft);
                      const verificationId =
                        result && typeof result === 'object' && 'result' in result
                          ? (result.result as { verification_id?: string })?.verification_id
                          : undefined;

                      setCreatedSummary({
                        date: draft.date,
                        description: draft.description,
                        total: draft.total,
                        lines: draft.lines,
                        templateLabel: selectedTemplate?.label ?? '-',
                        attachmentName: attachmentName || undefined,
                        source: draft.source ?? verificationSource,
                        verificationId
                      });
                    }}
                  >
                    Lägg till
                  </Button>
                </div>
              ) : null}

              {step === 4 && !isOnline ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => setStep((step - 1) as Step)}>
                    Tillbaka
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy || (reviewValidation ? !reviewValidation.ok : false)}
                    onClick={async () => {
                      const draft = await toDraft();
                      if (!draft) return;
                      await saveDraftMutation.mutateAsync(draft);
                    }}
                  >
                    Spara som utkast
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={Boolean(createdSummary)} onOpenChange={(open) => !open && closeCreatedSummary()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifikation tillagd</DialogTitle>
            <DialogDescription>Följande verifikation har lagts till.</DialogDescription>
          </DialogHeader>

          {createdSummary ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/30 p-3">
                <p><span className="font-medium">Händelse:</span> {createdSummary.templateLabel}</p>
                <p><span className="font-medium">Datum:</span> {createdSummary.date}</p>
                <p><span className="font-medium">Beskrivning:</span> {createdSummary.description}</p>
                <p><span className="font-medium">Total:</span> {toMoney(createdSummary.total).toFixed(2)} kr</p>
                {createdSummary.attachmentName ? <p><span className="font-medium">Underlag:</span> {createdSummary.attachmentName}</p> : null}
                <p><span className="font-medium">Källa:</span> {createdSummary.source === 'mobile' ? 'Mobil' : createdSummary.source === 'desktop' ? 'Desktop' : 'Offline'}</p>
                {createdSummary.verificationId ? <p><span className="font-medium">Verifikations-ID:</span> {createdSummary.verificationId}</p> : null}
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 font-medium">Konteringsrader</p>
                <div className="space-y-1 text-xs">
                  {createdSummary.lines.map((line, idx) => (
                    <p key={`${line.account_no}-${idx}`}>
                      {line.account_no}: D {toMoney(line.debit).toFixed(2)} / K {toMoney(line.credit).toFixed(2)}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={closeCreatedSummary}>
                  Stäng
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(detailsConfig)} onOpenChange={(open) => !open && setDetailsTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailsConfig?.label}</DialogTitle>
            <DialogDescription>{detailsConfig?.longDescription}</DialogDescription>
          </DialogHeader>

          {detailsConfig ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border bg-muted/30 p-3">
                <p><span className="font-medium">Riktning:</span> {detailsConfig.direction === 'in' ? 'Pengar in' : 'Pengar ut'}</p>
                <p><span className="font-medium">Standardkonto:</span> {detailsConfig.account} {detailsConfig.accountName}</p>
                <p><span className="font-medium">Standardmoms:</span> {detailsConfig.vatRate}%</p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 font-medium">Så fungerar detta exempel</p>
                <div className="space-y-1 text-xs">
                  {detailsExplanation.map((item, idx) => (
                    <p key={`${item}-${idx}`}>{item}</p>
                  ))}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 font-medium">Kontering som skapas</p>
                <div className="space-y-1 text-xs">
                  {detailsRows.map((row, idx) => (
                    <p key={`${row.account}-${idx}`}>
                      <span className="font-medium">{row.side}:</span> {row.account}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => {
                    applyTemplate(detailsConfig.key as TemplateKey);
                    setDetailsTemplate(null);
                  }}
                >
                  Använd exempel
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}














