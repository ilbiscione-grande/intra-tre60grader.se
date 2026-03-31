export const PROJECT_COLUMN_COLOR_OPTIONS = [
  { value: '', label: 'Standard', background: undefined },
  { value: 'sand', label: 'Sand', background: 'rgba(245, 222, 179, 0.18)' },
  { value: 'yellow', label: 'Gul', background: 'rgba(250, 204, 21, 0.14)' },
  { value: 'green', label: 'Grön', background: 'rgba(74, 222, 128, 0.14)' },
  { value: 'blue', label: 'Blå', background: 'rgba(96, 165, 250, 0.14)' },
  { value: 'violet', label: 'Violett', background: 'rgba(167, 139, 250, 0.14)' },
  { value: 'rose', label: 'Rosa', background: 'rgba(251, 113, 133, 0.14)' }
] as const;

export function getProjectColumnBackground(color: string | null | undefined) {
  return PROJECT_COLUMN_COLOR_OPTIONS.find((option) => option.value === (color ?? ''))?.background;
}
