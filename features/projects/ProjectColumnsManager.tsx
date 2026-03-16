'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useProjectColumns } from '@/features/projects/projectQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

function toKeySeed(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function makeUniqueKey(existing: string[], seed: string) {
  const base = seed || 'kolumn';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export default function ProjectColumnsManager({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const columnsQuery = useProjectColumns(companyId);
  const columns = columnsQuery.data ?? [];

  const [newTitle, setNewTitle] = useState('');

  const addMutation = useMutation({
    mutationFn: async () => {
      const title = newTitle.trim();
      if (!title) throw new Error('Kolumnnamn krävs');

      const existingKeys = columns.map((c) => c.key);
      const key = makeUniqueKey(existingKeys, toKeySeed(title));
      const position = (columns.at(-1)?.position ?? 0) + 1;

      const { error } = await supabase.from('project_columns').insert({
        company_id: companyId,
        key,
        title,
        position
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewTitle('');
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn tillagd');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till kolumn')
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const clean = title.trim();
      if (!clean) throw new Error('Kolumnnamn krävs');
      const { error } = await supabase
        .from('project_columns')
        .update({ title: clean })
        .eq('company_id', companyId)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kolumn')
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, key }: { id: string; key: string }) => {
      if (columns.length <= 1) throw new Error('Minst en kolumn måste finnas kvar');

      const fallback = columns.find((c) => c.id !== id);
      if (!fallback) throw new Error('Ingen reservkolumn hittades');

      const { error: moveError } = await supabase
        .from('projects')
        .update({ status: fallback.key })
        .eq('company_id', companyId)
        .eq('status', key);
      if (moveError) throw moveError;

      const { error: deleteError } = await supabase
        .from('project_columns')
        .delete()
        .eq('company_id', companyId)
        .eq('id', id);
      if (deleteError) throw deleteError;

      const remaining = columns
        .filter((c) => c.id !== id)
        .sort((a, b) => a.position - b.position)
        .map((c, i) => ({ id: c.id, position: i + 1 }));

      for (const item of remaining) {
        const { error: posError } = await supabase
          .from('project_columns')
          .update({ position: item.position })
          .eq('company_id', companyId)
          .eq('id', item.id);
        if (posError) throw posError;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Kolumn borttagen');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort kolumn')
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kolumner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Ny kolumnrubrik"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
            Lägg till
          </Button>
        </div>

        <div className="space-y-2">
          {columns.map((column) => (
            <ColumnRow
              key={column.id}
              title={column.title}
              onSave={(title) => renameMutation.mutate({ id: column.id, title })}
              onDelete={() => removeMutation.mutate({ id: column.id, key: column.key })}
              deleting={removeMutation.isPending}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ColumnRow({
  title,
  onSave,
  onDelete,
  deleting
}: {
  title: string;
  onSave: (title: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [draft, setDraft] = useState(title);

  return (
    <div className="flex gap-2">
      <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button variant="secondary" onClick={() => onSave(draft)}>
        Spara
      </Button>
      <Button variant="destructive" onClick={onDelete} disabled={deleting}>
        Ta bort
      </Button>
    </div>
  );
}
