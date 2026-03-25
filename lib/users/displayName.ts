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
  const explicitName = typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName.trim() : null;
  if (explicitName) return explicitName;

  const metadataName = getMetadataDisplayName(input.metadata);
  if (metadataName) return metadataName;

  if (typeof input.handle === 'string' && input.handle.trim()) {
    const formatted = input.handle
      .trim()
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    if (formatted) return formatted;
  }

  if (typeof input.email === 'string' && input.email.trim()) {
    const localPart = input.email.trim().split('@')[0]?.trim() ?? '';
    if (localPart) {
      const formatted = localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      return formatted || localPart;
    }
  }

  if (typeof input.userId === 'string' && input.userId.trim()) return input.userId.trim();
  return 'Okänd användare';
}
