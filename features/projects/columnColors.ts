export const PROJECT_COLUMN_COLOR_OPTIONS = [
  { value: '', label: 'Standard', background: undefined, accent: undefined },
  { value: 'sand', label: 'Sand', background: 'rgba(245, 222, 179, 0.24)', accent: 'rgba(217, 119, 6, 0.55)' },
  { value: 'yellow', label: 'Gul', background: 'rgba(250, 204, 21, 0.2)', accent: 'rgba(234, 179, 8, 0.65)' },
  { value: 'green', label: 'Grön', background: 'rgba(74, 222, 128, 0.2)', accent: 'rgba(34, 197, 94, 0.62)' },
  { value: 'blue', label: 'Blå', background: 'rgba(96, 165, 250, 0.2)', accent: 'rgba(59, 130, 246, 0.62)' },
  { value: 'violet', label: 'Violett', background: 'rgba(167, 139, 250, 0.2)', accent: 'rgba(139, 92, 246, 0.62)' },
  { value: 'rose', label: 'Rosa', background: 'rgba(251, 113, 133, 0.2)', accent: 'rgba(244, 63, 94, 0.62)' }
] as const;

const DEFAULT_STATUS_COLOR_MAP: Record<string, { background: string; accent: string }> = {
  todo: {
    background: 'rgba(59, 130, 246, 0.08)',
    accent: 'rgba(59, 130, 246, 0.42)'
  },
  in_progress: {
    background: 'rgba(245, 158, 11, 0.08)',
    accent: 'rgba(245, 158, 11, 0.45)'
  },
  review: {
    background: 'rgba(168, 85, 247, 0.08)',
    accent: 'rgba(168, 85, 247, 0.45)'
  },
  done: {
    background: 'rgba(34, 197, 94, 0.08)',
    accent: 'rgba(34, 197, 94, 0.42)'
  }
};

export function getProjectColumnBackground(color: string | null | undefined, status?: string | null) {
  const explicit = PROJECT_COLUMN_COLOR_OPTIONS.find((option) => option.value === (color ?? ''))?.background;
  if (explicit) return explicit;
  if (status) return DEFAULT_STATUS_COLOR_MAP[status]?.background;
  return undefined;
}

export function getProjectColumnAccent(color: string | null | undefined, status?: string | null) {
  const explicit = PROJECT_COLUMN_COLOR_OPTIONS.find((option) => option.value === (color ?? ''))?.accent;
  if (explicit) return explicit;
  if (status) return DEFAULT_STATUS_COLOR_MAP[status]?.accent;
  return undefined;
}
