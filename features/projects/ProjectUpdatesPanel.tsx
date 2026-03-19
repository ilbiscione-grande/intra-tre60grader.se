'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { Edit3, Paperclip, Reply, Send, Trash2, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import {
  ComposerAttachmentList,
  ProjectUpdateAttachments,
  type ProjectUpdateAttachmentView
} from './ProjectUpdateAttachments';
import {
  createProjectUpdateAttachmentSignedUrl,
  removeProjectUpdateAttachments,
  uploadProjectUpdateAttachment
} from './projectUpdateStorage';

type ProjectUpdateRow = DbRow<'project_updates'>;
type ProjectUpdateAttachmentRow = DbRow<'project_update_attachments'>;
type SystemActivityItem = {
  id: string;
  at: string;
  text: string;
  source: 'system' | 'user';
};

type ComposerState = {
  content: string;
  files: File[];
};

function emptyComposer(): ComposerState {
  return { content: '', files: [] };
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

function buildAttachmentMap(updates: ProjectUpdateRow[], attachments: ProjectUpdateAttachmentRow[]) {
  const map = new Map<string, ProjectUpdateAttachmentView[]>();

  attachments.forEach((attachment) => {
    const next = map.get(attachment.project_update_id) ?? [];
    next.push({
      id: attachment.id,
      path: attachment.path,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      fileSize: attachment.file_size
    });
    map.set(attachment.project_update_id, next);
  });

  updates.forEach((update) => {
    if (!update.attachment_path) return;
    const next = map.get(update.id) ?? [];
    if (next.some((attachment) => attachment.path === update.attachment_path)) return;
    next.push({
      id: `legacy-${update.id}`,
      path: update.attachment_path,
      fileName: update.attachment_name,
      fileType: update.attachment_type,
      fileSize: update.attachment_size
    });
    map.set(update.id, next);
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
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

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

  const attachmentsQuery = useQuery<ProjectUpdateAttachmentRow[]>({
    queryKey: ['project-update-attachments', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_update_attachments')
        .select('id,company_id,project_id,project_update_id,path,file_name,file_type,file_size,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .returns<ProjectUpdateAttachmentRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const attachmentUrlsQuery = useQuery<Record<string, string>>({
    queryKey: ['project-update-attachment-urls', companyId, projectId, attachmentsQuery.data?.map((item) => item.path).join('|') ?? 'none'],
    enabled: (attachmentsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const paths = Array.from(new Set((attachmentsQuery.data ?? []).map((item) => item.path).filter(Boolean)));
      const pairs = await Promise.all(
        paths.map(async (path) => [path, await createProjectUpdateAttachmentSignedUrl(path)] as const)
      );
      return Object.fromEntries(pairs);
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
      if (!content && composer.files.length === 0) {
        throw new Error('Skriv något eller bifoga minst en fil.');
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

      const { data: update, error } = await supabase
        .from('project_updates')
        .insert({
          company_id: companyId,
          project_id: projectId,
          parent_id: parentId,
          created_by: userId,
          content: content || null
        })
        .select('id')
        .single<{ id: string }>();

      if (error) throw error;
      if (!update?.id) throw new Error('Kunde inte skapa uppdateringen.');

      if (composer.files.length > 0) {
        const uploaded = await Promise.all(
          composer.files.map(async (file) => {
            const path = await uploadProjectUpdateAttachment({
              companyId,
              projectId,
              draftId: update.id,
              file
            });

            return {
              company_id: companyId,
              project_id: projectId,
              project_update_id: update.id,
              path,
              file_name: file.name,
              file_type: file.type || null,
              file_size: file.size
            };
          })
        );

        const { error: attachmentError } = await supabase.from('project_update_attachments').insert(uploaded);
        if (attachmentError) throw attachmentError;
      }
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-update-attachments', companyId, projectId] })
      ]);

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

  const updateContentMutation = useMutation({
    mutationFn: async ({ updateId, content }: { updateId: string; content: string }) => {
      const attachmentsForUpdate = attachmentMap.get(updateId) ?? [];
      if (!content.trim() && attachmentsForUpdate.length === 0) {
        throw new Error('En uppdatering måste innehålla text eller bilagor.');
      }

      const { error } = await supabase
        .from('project_updates')
        .update({ content: content.trim() || null })
        .eq('company_id', companyId)
        .eq('id', updateId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, projectId] });
      setEditingUpdateId(null);
      setEditingContent('');
      toast.success('Uppdatering sparad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte spara ändringen')
  });

  const deleteUpdateMutation = useMutation({
    mutationFn: async (updateId: string) => {
      const paths = (attachmentMap.get(updateId) ?? []).map((attachment) => attachment.path);

      const { error } = await supabase
        .from('project_updates')
        .delete()
        .eq('company_id', companyId)
        .eq('id', updateId);

      if (error) throw error;
      await removeProjectUpdateAttachments(paths).catch(() => null);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-update-attachments', companyId, projectId] })
      ]);
      toast.success('Uppdatering borttagen');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort uppdateringen')
  });

  const updates = updatesQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const childrenMap = useMemo(() => buildChildrenMap(updates), [updates]);
  const attachmentMap = useMemo(() => buildAttachmentMap(updates, attachments), [attachments, updates]);
  const rootUpdates = childrenMap.get(null) ?? [];

  function setReplyComposerValue(id: string, next: ComposerState) {
    setReplyComposers((prev) => ({ ...prev, [id]: next }));
  }

  function openAttachment(path: string) {
    const signedUrl = attachmentUrlsQuery.data?.[path];
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

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
    const isEditing = editingUpdateId === update.id;
    const canManage = Boolean(update.created_by && currentUserQuery.data && update.created_by === currentUserQuery.data);
    const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : 'ml-8';
    const attachmentsForUpdate = (attachmentMap.get(update.id) ?? []).map((attachment) => ({
      ...attachment,
      signedUrl: attachmentUrlsQuery.data?.[attachment.path]
    }));

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

          {isEditing ? (
            <div className="mt-3 space-y-3">
              <Textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} className="min-h-[96px]" />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => updateContentMutation.mutate({ updateId: update.id, content: editingContent })}
                  disabled={updateContentMutation.isPending}
                >
                  Spara
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingUpdateId(null)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : update.content ? (
            <div className="mt-3 space-y-2 text-sm text-foreground/85">{renderRichText(update.content)}</div>
          ) : null}

          <ProjectUpdateAttachments attachments={attachmentsForUpdate} onOpen={openAttachment} />

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
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingUpdateId(update.id);
                  setEditingContent(update.content ?? '');
                }}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                Redigera
              </Button>
            ) : null}
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => deleteUpdateMutation.mutate(update.id)}
                disabled={deleteUpdateMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Ta bort
              </Button>
            ) : null}
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

              <ComposerAttachmentList
                files={replyComposer.files}
                onRemove={(index) =>
                  setReplyComposerValue(update.id, {
                    ...replyComposer,
                    files: replyComposer.files.filter((_, currentIndex) => currentIndex !== index)
                  })
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <input
                    ref={(element) => {
                      replyFileRefs.current[update.id] = element;
                    }}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setReplyComposerValue(update.id, { ...replyComposer, files });
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => replyFileRefs.current[update.id]?.click()}>
                    <Paperclip className="mr-2 h-4 w-4" />
                    Bilagor
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

          <ComposerAttachmentList
            files={rootComposer.files}
            onRemove={(index) =>
              setRootComposer((prev) => ({
                ...prev,
                files: prev.files.filter((_, currentIndex) => currentIndex !== index)
              }))
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              ref={rootFileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setRootComposer((prev) => ({ ...prev, files }));
              }}
            />

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => rootFileRef.current?.click()}>
                <Paperclip className="mr-2 h-4 w-4" />
                Bilagor
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
