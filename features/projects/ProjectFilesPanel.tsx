'use client';

import { useMemo, useState } from 'react';
import { Eye, FileText, FolderOpen, History, ImageIcon, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import type { TableInsertRow, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { Role } from '@/lib/types';
import type { ProjectMemberVisual } from '@/features/projects/projectQueries';
import { createProjectFileSignedUrl, removeProjectFiles, uploadProjectFile } from './projectFileStorage';

type ProjectFileRow = DbRow<'project_files'>;

const PROJECT_FILE_CATEGORIES = [
  { value: 'all', label: 'Alla' },
  { value: 'brief', label: 'Brief' },
  { value: 'agreement', label: 'Avtal' },
  { value: 'delivery', label: 'Leverans' },
  { value: 'source', label: 'Underlag' },
  { value: 'planning', label: 'Planering' },
  { value: 'other', label: 'Övrigt' }
] as const;

function categoryLabel(category: string) {
  return PROJECT_FILE_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

function formatFileSize(fileSize: number | null) {
  if (!fileSize) return 'Storlek okänd';
  if (fileSize < 1024) return `${fileSize} B`;
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(0)} KB`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(fileType: string | null) {
  return typeof fileType === 'string' && fileType.startsWith('image/');
}

function isPdf(fileType: string | null, fileName: string) {
  return fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

export default function ProjectFilesPanel({
  companyId,
  projectId,
  role,
  members
}: {
  companyId: string;
  projectId: string;
  role: Role;
  members: ProjectMemberVisual[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<'brief' | 'agreement' | 'delivery' | 'source' | 'planning' | 'other'>('other');
  const [filterCategory, setFilterCategory] = useState<(typeof PROJECT_FILE_CATEGORIES)[number]['value']>('all');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const mode = useBreakpointMode();

  const currentUserQuery = useQuery({
    queryKey: ['current-user-id'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    }
  });

  const filesQuery = useQuery<ProjectFileRow[]>({
    queryKey: ['project-files', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_files')
        .select('id,company_id,project_id,category,title,path,file_name,file_type,file_size,created_by,created_at,updated_at,replaces_file_id,version_group_id,version_no')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .returns<ProjectFileRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const signedUrlsQuery = useQuery<Record<string, string>>({
    queryKey: ['project-file-urls', companyId, projectId, filesQuery.data?.map((item) => item.path).join('|') ?? 'none'],
    enabled: (filesQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const paths = Array.from(new Set((filesQuery.data ?? []).map((item) => item.path).filter(Boolean)));
      const pairs = await Promise.all(paths.map(async (path) => [path, await createProjectFileSignedUrl(path)] as const));
      return Object.fromEntries(pairs);
    }
  });

  const memberByUserId = useMemo(() => {
    const map = new Map<string, ProjectMemberVisual>();
    for (const member of members) map.set(member.user_id, member);
    return map;
  }, [members]);

  const versionGroups = useMemo(() => {
    const map = new Map<string, ProjectFileRow[]>();
    for (const file of filesQuery.data ?? []) {
      const key = file.version_group_id || file.id;
      const next = map.get(key) ?? [];
      next.push(file);
      map.set(key, next);
    }

    return Array.from(map.entries())
      .map(([versionGroupId, groupFiles]) => {
        const versions = [...groupFiles].sort((a, b) => {
          if (a.version_no !== b.version_no) return b.version_no - a.version_no;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return {
          versionGroupId,
          latest: versions[0],
          versions
        };
      })
      .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
  }, [filesQuery.data]);

  const filteredFiles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return versionGroups.filter(({ latest: file }) => {
      if (filterCategory !== 'all' && file.category !== filterCategory) return false;
      if (!normalizedSearch) return true;
      return [file.title, file.file_name, categoryLabel(file.category), memberByUserId.get(file.created_by ?? '')?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [versionGroups, filterCategory, search, memberByUserId]);

  const groupedCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const { latest: file } of versionGroups) {
      map.set(file.category, (map.get(file.category) ?? 0) + 1);
    }
    return map;
  }, [versionGroups]);

  const totalVersionCount = filesQuery.data?.length ?? 0;

  const canUpload = role !== 'auditor';

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error('Välj minst en fil.');
      const createdBy = currentUserQuery.data;
      if (!createdBy) throw new Error('Kunde inte identifiera uppladdaren.');

      const rows: TableInsertRow<'project_files'>[] = [];

      for (const file of files) {
        const fileId = crypto.randomUUID();
        const path = await uploadProjectFile({
          companyId,
          projectId,
          fileId,
          file
        });

        rows.push({
          id: fileId,
          company_id: companyId,
          project_id: projectId,
          category,
          title: files.length === 1 ? title.trim() || null : null,
          path,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          created_by: createdBy,
          replaces_file_id: null,
          version_group_id: fileId,
          version_no: 1
        });
      }

      const { error } = await supabase.from('project_files').insert(rows);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-files', companyId, projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-file-urls', companyId, projectId] })
      ]);
      setFiles([]);
      setTitle('');
      toast.success('Projektfiler uppladdade');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ladda upp projektfiler');
    }
  });

  const uploadVersionMutation = useMutation({
    mutationFn: async ({ baseFile, file }: { baseFile: ProjectFileRow; file: File }) => {
      const createdBy = currentUserQuery.data;
      if (!createdBy) throw new Error('Kunde inte identifiera uppladdaren.');

      const fileId = crypto.randomUUID();
      const path = await uploadProjectFile({
        companyId,
        projectId,
        fileId,
        file
      });

      const { error } = await supabase.from('project_files').insert({
        id: fileId,
        company_id: companyId,
        project_id: projectId,
        category: baseFile.category,
        title: baseFile.title,
        path,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        created_by: createdBy,
        replaces_file_id: baseFile.id,
        version_group_id: baseFile.version_group_id,
        version_no: (baseFile.version_no ?? 1) + 1
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-files', companyId, projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-file-urls', companyId, projectId] })
      ]);
      toast.success('Ny filversion uppladdad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ladda upp ny version');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (file: ProjectFileRow) => {
      const { error } = await supabase.from('project_files').delete().eq('company_id', companyId).eq('id', file.id);
      if (error) throw error;
      await removeProjectFiles([file.path]).catch(() => null);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-files', companyId, projectId] }),
        queryClient.invalidateQueries({ queryKey: ['project-file-urls', companyId, projectId] })
      ]);
      toast.success('Projektfil borttagen');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort projektfilen');
    }
  });

  function openFile(path: string) {
    const signedUrl = signedUrlsQuery.data?.[path];
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    void createProjectFileSignedUrl(path)
      .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Kunde inte öppna filen'));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Projektfiler</p>
          <p className="mt-1 font-medium">{versionGroups.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Kategorier i bruk</p>
          <p className="mt-1 font-medium">{groupedCount.size}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Filversioner</p>
          <p className="mt-1 font-medium">{totalVersionCount}</p>
        </div>
      </div>

      {canUpload ? (
        mode === 'mobile' ? (
          <>
            <Button type="button" className="w-full" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Ladda upp projektfiler
            </Button>
            <ActionSheet open={uploadOpen} onClose={() => setUploadOpen(false)} title="Projektfiler" description="Lägg till filer, bilder eller underlag">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary/10 text-foreground">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Ladda upp projektfiler
                  </Badge>
                  <p className="text-sm text-foreground/65">Separat från faktura- och uppdateringsbilagor.</p>
                </div>
                <div className="grid gap-3">
                  <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                    <SelectTrigger><SelectValue placeholder="Kategori" /></SelectTrigger>
                    <SelectContent>
                      {PROJECT_FILE_CATEGORIES.filter((item) => item.value !== 'all').map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titel för filen (valfritt, används bäst för en fil)" />
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground">
                    <Plus className="mr-2 h-4 w-4" />
                    Välj filer
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                      onChange={(event) => {
                        const selected = Array.from(event.target.files ?? []);
                        setFiles((prev) => [...prev, ...selected]);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
                {files.length > 0 ? (
                  <div className="rounded-lg border border-dashed p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">Valda filer</p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setFiles([])}>Rensa</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <Badge key={`${file.name}-${file.lastModified}-${index}`} className="bg-muted/70 text-foreground">
                          {file.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => uploadMutation.mutate(undefined, { onSuccess: () => setUploadOpen(false) })}
                  disabled={files.length === 0 || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? 'Laddar upp...' : 'Ladda upp'}
                </Button>
              </div>
            </ActionSheet>
          </>
        ) : (
          <Card>
            <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/10 text-foreground">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Ladda upp projektfiler
              </Badge>
              <p className="text-sm text-foreground/65">Separat från faktura- och uppdateringsbilagor.</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px,1fr,auto]">
              <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_FILE_CATEGORIES.filter((item) => item.value !== 'all').map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Titel för filen (valfritt, används bäst för en fil)"
              />
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground">
                <Plus className="mr-2 h-4 w-4" />
                Välj filer
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);
                    setFiles((prev) => [...prev, ...selected]);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            {files.length > 0 ? (
              <div className="rounded-lg border border-dashed p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Valda filer</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFiles([])}>
                    Rensa
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <Badge key={`${file.name}-${file.lastModified}-${index}`} className="bg-muted/70 text-foreground">
                      {file.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="button" onClick={() => uploadMutation.mutate()} disabled={files.length === 0 || uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Laddar upp...' : 'Ladda upp'}
              </Button>
            </div>
            </CardContent>
          </Card>
        )
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {PROJECT_FILE_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilterCategory(item.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                filterCategory === item.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'
              }`}
            >
              {item.label}
              {item.value !== 'all' ? ` • ${groupedCount.get(item.value) ?? 0}` : ''}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Sök på titel, filnamn eller uppladdare"
          className="md:max-w-xs"
        />
      </div>

      {filesQuery.isLoading ? <p className="text-sm text-foreground/70">Laddar projektfiler...</p> : null}

      {!filesQuery.isLoading && filteredFiles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-foreground/70">
          Inga projektfiler matchar filtret ännu.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredFiles.map(({ latest: file, versions, versionGroupId }) => {
          const author = file.created_by ? memberByUserId.get(file.created_by) ?? null : null;
          const signedUrl = signedUrlsQuery.data?.[file.path];
          const canDelete = role === 'admin' || role === 'finance' || (currentUserQuery.data && file.created_by === currentUserQuery.data);

          return (
            <Card key={file.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-muted/60 text-foreground">{categoryLabel(file.category)}</Badge>
                      {versions.length > 1 ? <Badge className="border border-border bg-background">{versions.length} versioner</Badge> : null}
                      <Badge className="border border-border bg-background">v{file.version_no}</Badge>
                    </div>
                    <p className="mt-2 truncate text-base font-semibold">{file.title?.trim() || file.file_name}</p>
                    {file.title?.trim() ? <p className="truncate text-sm text-foreground/60">{file.file_name}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" onClick={() => openFile(file.path)} aria-label="Öppna fil">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canUpload ? (
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground">
                        <Upload className="mr-2 h-4 w-4" />
                        Ny version
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                          onChange={(event) => {
                            const nextFile = event.target.files?.[0];
                            if (!nextFile) return;
                            uploadVersionMutation.mutate({ baseFile: file, file: nextFile });
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    ) : null}
                    {canDelete ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(file)}
                        disabled={deleteMutation.isPending || uploadVersionMutation.isPending}
                        aria-label="Ta bort fil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {isImage(file.file_type) && signedUrl ? (
                  <button
                    type="button"
                    className="overflow-hidden rounded-xl border border-border/70 text-left"
                    onClick={() => openFile(file.path)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signedUrl} alt={file.title?.trim() || file.file_name} className={`${mode === 'mobile' ? 'h-32' : 'h-44'} w-full object-cover`} />
                  </button>
                ) : isPdf(file.file_type, file.file_name) && signedUrl ? (
                  <div className="overflow-hidden rounded-xl border border-border/70">
                    <iframe src={signedUrl} title={file.title?.trim() || file.file_name} className={`${mode === 'mobile' ? 'h-32' : 'h-44'} w-full bg-background`} />
                  </div>
                ) : (
                  <div className={`flex ${mode === 'mobile' ? 'h-24' : 'h-32'} items-center justify-center rounded-xl border border-border/70 bg-muted/15 text-foreground/55`}>
                    <div className="flex flex-col items-center gap-2">
                      {isPdf(file.file_type, file.file_name) ? <FileText className="h-8 w-8" /> : <FolderOpen className="h-8 w-8" />}
                      <span className="text-sm">{file.file_type?.split('/')[1]?.toUpperCase() ?? 'FIL'}</span>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Uppladdad av</p>
                    <div className="mt-2 flex items-center gap-2">
                      <ProfileBadge
                        label={author?.email ?? file.created_by ?? 'Intern användare'}
                        color={author?.color}
                        avatarUrl={author?.avatar_url}
                        emoji={author?.emoji}
                        className="h-8 w-8 shrink-0"
                        textClassName="text-xs font-semibold text-white"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{author?.email ?? 'Intern användare'}</p>
                        <p className="text-xs text-foreground/55">{new Date(file.created_at).toLocaleString('sv-SE')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Filinfo</p>
                    <div className="mt-2 space-y-1 text-sm text-foreground/75">
                      <p className="flex items-center gap-2">
                        {isImage(file.file_type) ? <ImageIcon className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                        {formatFileSize(file.file_size)}
                      </p>
                      <p>{file.file_type || 'Filtyp okänd'}</p>
                    </div>
                  </div>
                </div>

                {versions.length > 1 ? (
                  <details className="rounded-lg border border-dashed p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                      <span className="inline-flex items-center gap-2">
                        <History className="h-4 w-4 text-foreground/55" />
                        Versionshistorik
                      </span>
                      <span className="text-xs text-foreground/55">{versions.length} versioner</span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      {versions.map((version) => {
                        const versionAuthor = version.created_by ? memberByUserId.get(version.created_by) ?? null : null;
                        return (
                          <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className="border border-border bg-background">v{version.version_no}</Badge>
                                {version.id === file.id ? <Badge className="bg-primary/10 text-foreground">Aktuell</Badge> : null}
                              </div>
                              <p className="mt-1 truncate font-medium">{version.file_name}</p>
                              <p className="text-xs text-foreground/55">
                                {formatFileSize(version.file_size)} • {new Date(version.created_at).toLocaleString('sv-SE')} • {versionAuthor?.email ?? 'Intern användare'}
                              </p>
                            </div>
                            <Button type="button" size="sm" variant="outline" onClick={() => openFile(version.path)}>
                              Öppna
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
