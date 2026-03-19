'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { Paperclip, Reply, Send, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import { createProjectUpdateAttachmentSignedUrl, uploadProjectUpdateAttachment } from './projectUpdateStorage';

type ProjectUpdateRow = DbRow<'project_updates'>;
type SystemActivityItem = {
  id: string;
  at: string;
  text: string;
  source: 'system' | 'user';
};

type ComposerState = {
  content: string;
  file: File | null;
};

function emptyComposer(): ComposerState {
  return { content: '', file: null };
}

function authorLabel(update: ProjectUpdateRow, currentUserId: string | null) {
  if (update.created_by && currentUserId && update.created_by === currentUserId) return 'Du';
  if (update.parent_id) return 'Svar';
  return 'Intern användare';
}

function renderRichText(content: string | null) {
  const lines = (content ?? '').split('\n');
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (key: string) => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {bulletBuffer.map((line, index) => (
          <li key={`${key}-${index}`}>{line}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');

    if (isBullet) {
      bulletBuffer.push(trimmed.slice(2).trim());
      return;
    }

    flushBullets(`bullets-${index}`);

    if (!trimmed) {
      blocks.push(<div key={`spacer-${index}`} className="h-1" />);
      return;
    }

    blocks.push(
      <p key={`line-${index}`} className="whitespace-pre-wrap leading-relaxed">
        {line}
      </p>
    );
  });

  flushBullets('bullets-final');
  return blocks;
}

function buildChildrenMap(updates: ProjectUpdateRow[]) {
  const map = new Map<string | null, ProjectUpdateRow[]>();
  updates.forEach((update) => {
    const key = update.parent_id ?? null;
    const next = map.get(key) ?? [];
    next.push(update);
    map.set(key, next);
  });
  return map;
}

export default function ProjectUpdatesPanel({
  companyId,
  projectId,
  isActive,
  onOpenUpdates,
  systemActivity
}: {
  companyId: string;
  projectId: string;
  isActive: boolean;
  onOpenUpdates: () => void;
  systemActivity: SystemActivityItem[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const rootFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [rootComposer, setRootComposer] = useState<ComposerState>(emptyComposer());
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyComposers, setReplyComposers] = useState<Record<string, ComposerState>>({});

  const currentUserQuery = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    }
  });

  const updatesQuery = useQuery<ProjectUpdateRow[]>({
    queryKey: ['project-updates', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates')
        .select('id,company_id,project_id,parent_id,created_by,content,attachment_path,attachment_name,attachment_type,attachment_size,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .returns<ProjectUpdateRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const createUpdateMutation = useMutation({
    mutationFn: async ({
      parentId,
      composer
    }: {
      parentId: string | null;
      composer: ComposerState;
    }) => {
      const content = composer.content.trim();
      let attachmentPath: string | null = null;

      if (!content && !composer.file) {
        throw new Error('Skriv något eller bifoga en fil.');
      }

      if (composer.file) {
        attachmentPath = await uploadProjectUpdateAttachment({
          companyId,
          projectId,
          draftId: crypto.randomUUID(),
          file: composer.file
        });
      }

      const userId =
        currentUserQuery.data ??
        (
          await supabase.auth.getUser().catch(() => ({
            data: { user: null }
          }))
        ).data.user?.id ??
        null;

      if (!userId) {
        throw new Error('Kunde inte identifiera användaren för uppdateringen.');
      }

      const { error } = await supabase.from('project_updates').insert({
        company_id: companyId,
        project_id: projectId,
        parent_id: parentId,
        created_by: userId,
        content: content || null,
        attachment_path: attachmentPath,
        attachment_name: composer.file?.name ?? null,
        attachment_type: composer.file?.type ?? null,
        attachment_size: composer.file?.size ?? null
      });

      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, projectId] });

      if (variables.parentId) {
        setReplyComposers((prev) => ({ ...prev, [variables.parentId!]: emptyComposer() }));
        setReplyTargetId(null);
      } else {
        setRootComposer(emptyComposer());
      }

      toast.success(variables.parentId ? 'Svar tillagt' : 'Uppdatering publicerad');
      onOpenUpdates();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte spara uppdatering')
  });

  const updates = updatesQuery.data ?? [];
  const childrenMap = useMemo(() => buildChildrenMap(updates), [updates]);
  const rootUpdates = childrenMap.get(null) ?? [];

  function setReplyComposerValue(id: string, next: ComposerState) {
    setReplyComposers((prev) => ({ ...prev, [id]: next }));
  }

  function openAttachment(path: string) {
    void createProjectUpdateAttachmentSignedUrl(path)
      .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Kunde inte öppna bilagan');
      });
  }

  function renderThread(update: ProjectUpdateRow, depth = 0): React.ReactNode {
    const replies = childrenMap.get(update.id) ?? [];
    const replyComposer = replyComposers[update.id] ?? emptyComposer();
    const isReplyOpen = replyTargetId === update.id;
    const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : 'ml-8';

    return (
      <div key={update.id} className={`space-y-3 ${indentClass}`}>
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-muted/70">{authorLabel(update, currentUserQuery.data ?? null)}</Badge>
              {update.parent_id ? <Badge className="bg-secondary/80">Svar</Badge> : <Badge>Uppdatering</Badge>}
            </div>
            <p className="text-xs text-foreground/55">{new Date(update.created_at).toLocaleString('sv-SE')}</p>
          </div>

          {update.content ? <div className="mt-3 space-y-2 text-sm text-foreground/85">{renderRichText(update.content)}</div> : null}

          {update.attachment_path ? (
            <button
              type="button"
              className="mt-3 flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-muted/25"
              onClick={() => openAttachment(update.attachment_path!)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-foreground/55" />
                <span className="truncate">{update.attachment_name ?? 'Bilaga'}</span>
              </span>
              <span className="text-xs text-foreground/55">
                {update.attachment_size ? `${Math.max(update.attachment_size / 1024, 1).toFixed(0)} KB` : 'Öppna'}
              </span>
            </button>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setReplyTargetId(isReplyOpen ? null : update.id);
                if (!replyComposers[update.id]) {
                  setReplyComposerValue(update.id, emptyComposer());
                }
              }}
            >
              <Reply className="mr-2 h-4 w-4" />
              Svara
            </Button>
          </div>

          {isReplyOpen ? (
            <div className="mt-3 space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
              <Textarea
                value={replyComposer.content}
                onChange={(event) =>
                  setReplyComposerValue(update.id, {
                    ...replyComposer,
                    content: event.target.value
                  })
                }
                placeholder="Skriv ett svar..."
                className="min-h-[88px]"
              />

              {replyComposer.file ? (
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-3 py-2 text-sm">
                  <span className="truncate">{replyComposer.file.name}</span>
                  <button
                    type="button"
                    className="text-foreground/55 transition hover:text-foreground"
                    onClick={() => setReplyComposerValue(update.id, { ...replyComposer, file: null })}
                    aria-label="Ta bort bilaga"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <input
                    ref={(element) => {
                      replyFileRefs.current[update.id] = element;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setReplyComposerValue(update.id, { ...replyComposer, file });
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => replyFileRefs.current[update.id]?.click()}>
                    <Paperclip className="mr-2 h-4 w-4" />
                    Bilaga
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTargetId(null)}>
                    Avbryt
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => createUpdateMutation.mutate({ parentId: update.id, composer: replyComposer })}
                    disabled={createUpdateMutation.isPending}
                  >
                    Skicka svar
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {replies.length > 0 ? <div className="space-y-3">{replies.map((reply) => renderThread(reply, depth + 1))}</div> : null}
      </div>
    );
  }

  return (
    <Fragment>
      {isActive ? (
        <Card>
          <CardHeader>
            <CardTitle>Uppdateringar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {updatesQuery.isLoading ? <p className="text-sm text-foreground/70">Laddar uppdateringar...</p> : null}
            {!updatesQuery.isLoading && rootUpdates.length === 0 ? (
              <p className="text-sm text-foreground/70">Inga projektuppdateringar ännu. Lägg till den första längst ner på sidan.</p>
            ) : null}

            <div className="space-y-3">{rootUpdates.map((update) => renderThread(update))}</div>

            {systemActivity.length > 0 ? (
              <div className="space-y-3 border-t border-border/70 pt-4">
                <p className="text-sm font-medium text-foreground/80">Systemhändelser</p>
                {systemActivity.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-lg border border-dashed p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.text}</p>
                      <Badge className="bg-secondary/80">{item.source}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/55">{new Date(item.at).toLocaleString('sv-SE')}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 border-primary/20 bg-background/95 shadow-lg backdrop-blur md:bottom-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ny projektuppdatering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={rootComposer.content}
            onChange={(event) => setRootComposer((prev) => ({ ...prev, content: event.target.value }))}
            placeholder={'Skriv en uppdatering...\n- du kan använda punktlistor\n- eller bara vanlig text'}
          />

          {rootComposer.file ? (
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/15 px-3 py-2 text-sm">
              <span className="truncate">{rootComposer.file.name}</span>
              <button
                type="button"
                className="text-foreground/55 transition hover:text-foreground"
                onClick={() => setRootComposer((prev) => ({ ...prev, file: null }))}
                aria-label="Ta bort bilaga"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              ref={rootFileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setRootComposer((prev) => ({ ...prev, file }));
              }}
            />

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => rootFileRef.current?.click()}>
                <Paperclip className="mr-2 h-4 w-4" />
                Bilaga
              </Button>
              {!isActive ? (
                <Button type="button" variant="ghost" onClick={onOpenUpdates}>
                  Visa uppdateringar
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={() => createUpdateMutation.mutate({ parentId: null, composer: rootComposer })}
              disabled={createUpdateMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Publicera
            </Button>
          </div>
        </CardContent>
      </Card>
    </Fragment>
  );
}
