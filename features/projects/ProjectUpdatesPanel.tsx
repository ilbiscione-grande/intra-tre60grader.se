'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Edit3, FileText, Heart, ImagePlus, MessageSquarePlus, MoreHorizontal, Paperclip, Reply, Send, Trash2, Type, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { Database, TableRow as DbRow } from '@/lib/supabase/database.types';
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
import type { ProjectMemberVisual } from '@/features/projects/projectQueries';

type ProjectUpdateRow = DbRow<'project_updates'>;
type ProjectUpdateAttachmentRow = DbRow<'project_update_attachments'>;

type ComposerState = {
  content: string;
  files: File[];
};

function emptyComposer(): ComposerState {
  return { content: '', files: [] };
}

function authorLabel(update: ProjectUpdateRow, currentUserId: string | null, author?: ProjectMemberVisual | null) {
  if (update.created_by && currentUserId && update.created_by === currentUserId) return 'Du';
  if (author) {
    return getUserDisplayName({
      displayName: author.display_name,
      email: author.email,
      handle: author.handle,
      userId: author.user_id
    });
  }
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
          <li key={`${key}-${index}`}>{renderTextWithMentions(line)}</li>
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
        {renderTextWithMentions(line)}
      </p>
    );
  });

  flushBullets('bullets-final');
  return blocks;
}

function renderTextWithMentions(text: string) {
  const parts = text.split(/(@[A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g);
  return parts.map((part, index) =>
    part.startsWith('@') ? (
      <span
        key={`${part}-${index}`}
        className="rounded-md bg-primary/10 px-1 py-0.5 font-medium text-primary"
      >
        {part}
      </span>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    )
  );
}

function buildChildrenMap(updates: ProjectUpdateRow[]) {
  const map = new Map<string | null, ProjectUpdateRow[]>();
  updates.forEach((update) => {
    const key = update.parent_id ?? null;
    const next = map.get(key) ?? [];
    next.push(update);
    map.set(key, next);
  });
  for (const [key, value] of map.entries()) {
    map.set(
      key,
      [...value].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    );
  }
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

function appendUniqueFiles(existing: File[], incoming: File[]) {
  const next = [...existing];
  incoming.forEach((file) => {
    const exists = next.some(
      (current) =>
        current.name === file.name &&
        current.size === file.size &&
        current.lastModified === file.lastModified
    );
    if (!exists) next.push(file);
  });
  return next;
}

function extractMentions(content: string | null) {
  const matches = (content ?? '').match(/@([A-Za-z0-9._%+-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)/g) ?? [];
  return matches.map((match) => match.slice(1).toLowerCase());
}

function roleLabel(role?: ProjectMemberVisual['role'] | null) {
  if (role === 'admin') return 'Admin';
  if (role === 'finance') return 'Ekonomi';
  if (role === 'auditor') return 'Revisor';
  return 'Medlem';
}

function formatUpdateDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function ProjectUpdatesPanel({
  companyId,
  projectId,
  isActive,
  onOpenUpdates,
  highlightUpdateId
}: {
  companyId: string;
  projectId: string;
  isActive: boolean;
  onOpenUpdates: () => void;
  highlightUpdateId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const db = supabase as unknown as {
    from: (table: string) => any;
  };
  const queryClient = useQueryClient();
  const rootCameraFileRef = useRef<HTMLInputElement | null>(null);
  const rootImageFileRef = useRef<HTMLInputElement | null>(null);
  const rootDocumentFileRef = useRef<HTMLInputElement | null>(null);
  const rootComposerCardRef = useRef<HTMLDivElement | null>(null);
  const replyFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const updateRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rootComposer, setRootComposer] = useState<ComposerState>(emptyComposer());
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyComposers, setReplyComposers] = useState<Record<string, ComposerState>>({});
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [expandedComposer, setExpandedComposer] = useState(false);
  const [rootAttachmentSheetOpen, setRootAttachmentSheetOpen] = useState(false);
  const [rootComposerVisible, setRootComposerVisible] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: ['current-user-identity'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return {
        id: data.user?.id ?? null,
        email: data.user?.email?.toLowerCase() ?? null
      };
    }
  });

  const updatesQuery = useQuery<ProjectUpdateRow[]>({
    queryKey: ['project-updates', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates')
        .select('id,company_id,project_id,parent_id,created_by,content,attachment_path,attachment_name,attachment_type,attachment_size,created_at,updated_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .returns<ProjectUpdateRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const likesQuery = useQuery<Array<{ id: string; project_update_id: string; user_id: string }>>({
    queryKey: ['project-update-likes', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from('project_update_likes')
        .select('id,project_update_id,user_id')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

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

  const directoryQuery = useQuery({
    queryKey: ['company-member-directory', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/company-members/directory?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa medlemskatalog');
      }
      const body = (await res.json()) as {
        availableMembers: ProjectMemberVisual[];
      };
      return body.availableMembers ?? [];
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
        currentUserQuery.data?.id ??
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

      const notifications: Array<Database['public']['Tables']['project_update_notifications']['Insert']> = [];
      const mentions = extractMentions(content);
      const directory = directoryQuery.data ?? [];

      directory
        .filter((member) =>
          mentions.some(
            (mention) =>
              mention === member.email?.toLowerCase() ||
              mention === member.handle?.toLowerCase()
          )
        )
        .map((member) => member.user_id)
        .filter((recipientUserId) => recipientUserId !== userId)
        .forEach((recipientUserId) => {
          notifications.push({
            company_id: companyId,
            project_id: projectId,
            project_update_id: update.id,
            recipient_user_id: recipientUserId,
            actor_user_id: userId,
            kind: 'mention'
          });
        });

      if (parentId) {
        const parent = updatesQuery.data?.find((item) => item.id === parentId);
        if (parent?.created_by && parent.created_by !== userId) {
          notifications.push({
            company_id: companyId,
            project_id: projectId,
            project_update_id: update.id,
            recipient_user_id: parent.created_by,
            actor_user_id: userId,
            kind: 'reply'
          });
        }
      }

      if (notifications.length > 0) {
        const uniqueNotifications = notifications.filter(
          (notification, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.recipient_user_id === notification.recipient_user_id &&
                candidate.kind === notification.kind
            ) === index
        );

        const { error: notificationError } = await supabase
          .from('project_update_notifications')
          .upsert(uniqueNotifications, { onConflict: 'project_update_id,recipient_user_id,kind' });

        if (notificationError) throw notificationError;
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
        setExpandedComposer(false);
        setRootComposerVisible(false);
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

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ updateId, liked }: { updateId: string; liked: boolean }) => {
      const userId = currentUserQuery.data?.id;
      if (!userId) throw new Error('Kunde inte identifiera användaren');

      if (liked) {
        const { error } = await db
          .from('project_update_likes')
          .delete()
          .eq('company_id', companyId)
          .eq('project_id', projectId)
          .eq('project_update_id', updateId)
          .eq('user_id', userId);
        if (error) throw error;
        return;
      }

      const { error } = await db.from('project_update_likes').insert({
        company_id: companyId,
        project_id: projectId,
        project_update_id: updateId,
        user_id: userId
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-update-likes', companyId, projectId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera gilla-markering')
  });

  const updates = updatesQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const memberByUserId = useMemo(() => {
    const map = new Map<string, ProjectMemberVisual>();
    for (const member of directoryQuery.data ?? []) {
      map.set(member.user_id, member);
    }
    return map;
  }, [directoryQuery.data]);
  const childrenMap = useMemo(() => buildChildrenMap(updates), [updates]);
  const attachmentMap = useMemo(() => buildAttachmentMap(updates, attachments), [attachments, updates]);
  const likesByUpdateId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const like of likesQuery.data ?? []) {
      const current = map.get(like.project_update_id) ?? new Set<string>();
      current.add(like.user_id);
      map.set(like.project_update_id, current);
    }
    return map;
  }, [likesQuery.data]);
  const rootUpdates = childrenMap.get(null) ?? [];

  useEffect(() => {
    if (!highlightUpdateId || !isActive) return;
    const target = updateRefs.current[highlightUpdateId];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightUpdateId, isActive, updates]);

  useEffect(() => {
    if (!rootComposerVisible) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (rootAttachmentSheetOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootComposerCardRef.current?.contains(target)) return;
      setRootComposerVisible(false);
      setExpandedComposer(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [rootAttachmentSheetOpen, rootComposerVisible]);

  function getMentionCandidates(content: string) {
    const match = content.match(/@([A-Za-z0-9._%+-]*)$/);
    const query = match?.[1]?.toLowerCase();
    if (!query) return [];
    return [...(directoryQuery.data ?? [])]
      .filter((member) => {
        const email = member.email?.toLowerCase() ?? '';
        const handle = member.handle?.toLowerCase() ?? '';
        return email.includes(query) || handle.includes(query);
      })
      .sort((a, b) => {
        const aHandle = a.handle?.toLowerCase() ?? '';
        const bHandle = b.handle?.toLowerCase() ?? '';
        const aEmail = a.email?.toLowerCase() ?? '';
        const bEmail = b.email?.toLowerCase() ?? '';
        const aStarts = aHandle.startsWith(query) || aEmail.startsWith(query);
        const bStarts = bHandle.startsWith(query) || bEmail.startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return (a.handle ?? a.email ?? '').localeCompare(b.handle ?? b.email ?? '', 'sv');
      })
      .slice(0, 5);
  }

  function applyMention(content: string, mention: string) {
    return content.replace(/@([A-Za-z0-9._%+-]*)$/, `@${mention} `);
  }

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
      const canManage = Boolean(update.created_by && currentUserQuery.data?.id && update.created_by === currentUserQuery.data.id);
      const isEdited = new Date(update.updated_at).getTime() > new Date(update.created_at).getTime() + 1000;
      const mentions = extractMentions(update.content);
      const currentEmail = currentUserQuery.data?.email ?? null;
      const currentHandle = currentEmail?.split('@')[0] ?? null;
      const mentionsCurrentUser = Boolean(
        currentEmail && mentions.some((mention) => mention === currentEmail || mention === currentHandle)
      );
    const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : 'ml-8';
    const attachmentsForUpdate = (attachmentMap.get(update.id) ?? []).map((attachment) => ({
      ...attachment,
      signedUrl: attachmentUrlsQuery.data?.[attachment.path]
    }));
    const author = update.created_by ? memberByUserId.get(update.created_by) ?? null : null;
    const authorDisplayName = author
      ? getUserDisplayName({
          displayName: author.display_name,
          email: author.email,
          handle: author.handle,
          userId: author.user_id
        })
      : update.created_by ?? 'Intern användare';
    const likedByUserIds = likesByUpdateId.get(update.id) ?? new Set<string>();
    const likeCount = likedByUserIds.size;
    const isLiked = Boolean(currentUserQuery.data?.id && likedByUserIds.has(currentUserQuery.data.id));
    const authorMetaRole = `${roleLabel(author?.role)}${update.parent_id ? ' · Svar' : ''}`;

    return (
      <div key={update.id} className={`space-y-3 ${indentClass}`}>
        <div
          ref={(element) => {
            updateRefs.current[update.id] = element;
          }}
          className={`rounded-xl border border-border/70 bg-card p-3 ${highlightUpdateId === update.id ? 'ring-2 ring-primary/40' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <ProfileBadge
                label={authorDisplayName}
                color={author?.color}
                avatarUrl={author?.avatar_url}
                emoji={author?.emoji}
                className="h-10 w-10 shrink-0"
                textClassName="text-xs font-semibold text-white"
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {authorLabel(update, currentUserQuery.data?.id ?? null, author)}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                  {authorMetaRole}
                </p>
                <p className="mt-1 text-xs text-foreground/55">
                  {formatUpdateDateTime(update.created_at)}
                </p>
                {isEdited || mentionsCurrentUser ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mentionsCurrentUser ? <Badge className="bg-primary/15 text-primary">Nämner dig</Badge> : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isEdited ? (
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/45"
                  title="Redigerad"
                  aria-label="Redigerad"
                >
                  <Edit3 className="h-4 w-4" />
                </span>
              ) : null}
              {canManage ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[220] w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingUpdateId(update.id);
                        setEditingContent(update.content ?? '');
                      }}
                    >
                      <Edit3 className="mr-2 h-4 w-4" />
                      Redigera
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteUpdateMutation.mutate(update.id)}
                      disabled={deleteUpdateMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Ta bort
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-center rounded-xl border border-border/70 bg-muted/35 text-foreground shadow-sm hover:bg-muted"
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`justify-center rounded-xl border shadow-sm ${
                isLiked
                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/20'
                  : 'border-border/70 bg-muted/35 text-foreground hover:bg-muted'
              }`}
              onClick={() => toggleLikeMutation.mutate({ updateId: update.id, liked: isLiked })}
              disabled={toggleLikeMutation.isPending || !currentUserQuery.data?.id}
            >
              <Heart className={`mr-2 h-4 w-4 ${isLiked ? 'fill-current text-rose-600' : ''}`} />
              {likeCount > 0 ? `Gilla (${likeCount})` : 'Gilla'}
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
                placeholder="Skriv ett svar... Du kan nämna någon med @namn eller @epost"
                className="min-h-[88px]"
              />

              {getMentionCandidates(replyComposer.content).length > 0 ? (
                <div className="rounded-lg border border-border/70 bg-background p-2">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Förslag</p>
                  <div className="space-y-1">
                    {getMentionCandidates(replyComposer.content).map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted"
                        onClick={() =>
                          setReplyComposerValue(update.id, {
                            ...replyComposer,
                            content: applyMention(replyComposer.content, member.handle ?? member.email ?? '')
                          })
                        }
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ProfileBadge
                            label={getUserDisplayName({
                              displayName: member.display_name,
                              email: member.email,
                              handle: member.handle,
                              userId: member.user_id
                            })}
                            color={member.color}
                            avatarUrl={member.avatar_url}
                            emoji={member.emoji}
                            className="h-6 w-6 shrink-0"
                            textClassName="text-[10px] font-semibold text-white"
                          />
                          <div className="min-w-0">
                            <p className="truncate">
                              {getUserDisplayName({
                                displayName: member.display_name,
                                email: member.email,
                                handle: member.handle,
                                userId: member.user_id
                              })}
                            </p>
                            <p className="truncate text-xs text-foreground/55">{member.email}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

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
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setReplyComposerValue(update.id, {
                        ...replyComposer,
                        files: appendUniqueFiles(replyComposer.files, files)
                      });
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
          <CardContent className="space-y-4">
            {updatesQuery.isLoading ? <p className="text-sm text-foreground/70">Laddar uppdateringar...</p> : null}
            {!updatesQuery.isLoading && rootUpdates.length === 0 ? (
              <p className="text-sm text-foreground/70">Inga projektuppdateringar ännu. Lägg till den första längst ner på sidan.</p>
            ) : null}

            <div className="space-y-3">{rootUpdates.map((update) => renderThread(update))}</div>
          </CardContent>
        </Card>
      ) : null}

      <Card
        ref={rootComposerCardRef}
        className={`sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 md:bottom-4 ${
          rootComposerVisible
            ? 'border-primary/20 bg-background/95 shadow-lg backdrop-blur'
            : 'border-transparent bg-transparent shadow-none backdrop-blur-0'
        }`}
      >
        <CardContent className={`space-y-3 ${rootComposerVisible ? 'p-3' : 'p-0'}`}>
          {rootComposerVisible ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-foreground/60"
                aria-label="Stäng uppdateringsdialog"
                onClick={() => {
                  setRootComposerVisible(false);
                  setExpandedComposer(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              ref={rootCameraFileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) setRootComposerVisible(true);
                setRootComposer((prev) => ({ ...prev, files: appendUniqueFiles(prev.files, files) }));
              }}
            />
            <input
              ref={rootImageFileRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) setRootComposerVisible(true);
                setRootComposer((prev) => ({ ...prev, files: appendUniqueFiles(prev.files, files) }));
              }}
            />
            <input
              ref={rootDocumentFileRef}
              type="file"
              multiple
              accept="application/pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) setRootComposerVisible(true);
                setRootComposer((prev) => ({ ...prev, files: appendUniqueFiles(prev.files, files) }));
              }}
            />

            <Button
              type="button"
              variant="default"
              size="icon"
              aria-label="Lägg till innehåll"
              className="relative border-primary/20 bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              onClick={() => setRootAttachmentSheetOpen(true)}
            >
              <MessageSquarePlus className="h-4 w-4" />
              {rootComposer.files.length > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {rootComposer.files.length > 9 ? '9+' : rootComposer.files.length}
                </span>
              ) : null}
            </Button>

            {rootComposerVisible ? (
              <>
                {expandedComposer ? (
                  <Textarea
                    id="project-update-input"
                    value={rootComposer.content}
                    onChange={(event) => setRootComposer((prev) => ({ ...prev, content: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        createUpdateMutation.mutate({ parentId: null, composer: rootComposer });
                      }
                    }}
                    placeholder="Skriv en uppdatering eller nämn någon med @..."
                    className="min-h-[88px] flex-1"
                  />
                ) : (
                  <Input
                    id="project-update-input"
                    value={rootComposer.content}
                    onChange={(event) => setRootComposer((prev) => ({ ...prev, content: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && event.shiftKey) {
                        event.preventDefault();
                        setExpandedComposer(true);
                        return;
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        createUpdateMutation.mutate({ parentId: null, composer: rootComposer });
                      }
                    }}
                    placeholder="Skriv en uppdatering eller nämn någon med @..."
                    className="h-11 flex-1"
                  />
                )}

                <Button
                  type="button"
                  size="icon"
                  onClick={() => createUpdateMutation.mutate({ parentId: null, composer: rootComposer })}
                  disabled={createUpdateMutation.isPending}
                  aria-label="Skicka uppdatering"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>

          {getMentionCandidates(rootComposer.content).length > 0 ? (
            <div className="rounded-lg border border-border/70 bg-background p-2">
              <div className="space-y-1">
                {getMentionCandidates(rootComposer.content).map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-muted"
                    onClick={() =>
                      setRootComposer((prev) => ({
                        ...prev,
                        content: applyMention(prev.content, member.handle ?? member.email ?? '')
                      }))
                    }
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ProfileBadge
                        label={getUserDisplayName({
                          displayName: member.display_name,
                          email: member.email,
                          handle: member.handle,
                          userId: member.user_id
                        })}
                        color={member.color}
                        avatarUrl={member.avatar_url}
                        emoji={member.emoji}
                        className="h-6 w-6 shrink-0"
                        textClassName="text-[10px] font-semibold text-white"
                      />
                      <div className="min-w-0">
                        <p className="truncate">
                          {getUserDisplayName({
                            displayName: member.display_name,
                            email: member.email,
                            handle: member.handle,
                            userId: member.user_id
                          })}
                        </p>
                        <p className="truncate text-xs text-foreground/55">{member.email}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {rootComposer.files.length > 0 ? (
            <ComposerAttachmentList
              files={rootComposer.files}
              onRemove={(index) =>
                setRootComposer((prev) => ({
                  ...prev,
                  files: prev.files.filter((_, currentIndex) => currentIndex !== index)
                }))
              }
            />
          ) : null}

        </CardContent>
      </Card>

      <ActionSheet
        open={rootAttachmentSheetOpen}
        onClose={() => setRootAttachmentSheetOpen(false)}
        title="Lägg till i uppdatering"
        description="Välj vad du vill lägga till i inlägget."
      >
        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setRootAttachmentSheetOpen(false);
              setRootComposerVisible(true);
              requestAnimationFrame(() => document.getElementById('project-update-input')?.focus());
            }}
          >
            <Type className="mr-2 h-4 w-4" />
            Text
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setRootAttachmentSheetOpen(false);
              setRootComposerVisible(true);
              requestAnimationFrame(() => rootCameraFileRef.current?.click());
            }}
          >
            <Camera className="mr-2 h-4 w-4" />
            Ta foto
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setRootAttachmentSheetOpen(false);
              setRootComposerVisible(true);
              requestAnimationFrame(() => rootImageFileRef.current?.click());
            }}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Bild
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setRootAttachmentSheetOpen(false);
              setRootComposerVisible(true);
              requestAnimationFrame(() => rootDocumentFileRef.current?.click());
            }}
          >
            <FileText className="mr-2 h-4 w-4" />
            Fil
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setRootAttachmentSheetOpen(false);
              setRootComposerVisible(true);
              setExpandedComposer((prev) => !prev);
            }}
          >
            <Type className="mr-2 h-4 w-4" />
            {expandedComposer ? 'Kompakt läge' : 'Större skrivläge'}
          </Button>
        </div>
      </ActionSheet>
    </Fragment>
  );
}
