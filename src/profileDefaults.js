export const DEFAULT_PROFILES = [
  {
    id: 'family',
    name: 'Family',
    color: '#ffd60a',
    role: 'household',
    enabledModules: ['home', 'calendar', 'grocery', 'documents', 'chat'],
  },
  {
    id: 'justin',
    name: 'Justin',
    color: '#7dd3fc',
    role: 'adult',
    enabledModules: ['home', 'tasks', 'calendar', 'grocery', 'documents', 'chat'],
  },
  {
    id: 'wife',
    name: 'Wife',
    color: '#f0abfc',
    role: 'adult',
    enabledModules: ['home', 'calendar', 'grocery', 'documents', 'tips', 'chat'],
  },
];

function normalizeProfile(profile, fallback = {}) {
  const id = String(profile?.id || fallback.id || '').trim().toLowerCase();
  const now = new Date().toISOString();
  return {
    ...fallback,
    ...(profile && typeof profile === 'object' ? profile : {}),
    id,
    name: String(profile?.name || fallback.name || id || 'Profile'),
    color: String(profile?.color || fallback.color || '#ffd60a'),
    role: String(profile?.role || fallback.role || 'adult'),
    enabledModules: Array.isArray(profile?.enabledModules) ? profile.enabledModules : fallback.enabledModules || ['home'],
    createdAt: profile?.createdAt || fallback.createdAt || now,
    updatedAt: profile?.updatedAt || fallback.updatedAt || now,
  };
}

export function normalizeProfiles(profiles) {
  const byId = new Map(DEFAULT_PROFILES.map(profile => [profile.id, normalizeProfile(profile)]));
  if (Array.isArray(profiles)) {
    profiles.forEach(profile => {
      const normalized = normalizeProfile(profile, byId.get(String(profile?.id || '').toLowerCase()) || {});
      if (normalized.id) byId.set(normalized.id, normalized);
    });
  }
  return [...byId.values()];
}
