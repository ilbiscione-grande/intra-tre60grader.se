import { getUserDisplayName } from '@/features/profile/profileBadge';

type RawMetadata = Record<string, unknown> | null | undefined;

export function getMetadataDisplayName(metadata: RawMetadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const direct =
    (typeof metadata.display_name === 'string' && metadata.display_name.trim() ? metadata.display_name : null) ??
    (typeof metadata.full_name === 'string' && metadata.full_name.trim() ? metadata.full_name : null) ??
    (typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name : null);

  return direct?.trim() ?? null;
}

export function resolveUserDisplayName(input: {
  displayName?: string | null;
  metadata?: RawMetadata;
  email?: string | null;
  handle?: string | null;
  userId?: string | null;
}) {
  return getUserDisplayName({
    displayName: input.displayName,
    fullName: getMetadataDisplayName(input.metadata),
    email: input.email,
    handle: input.handle,
    userId: input.userId
  });
}
