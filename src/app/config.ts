/** Public project metadata. Set VITE_REPO_URL at build time once the repository exists. */
export const SITE = {
  name: 'TraceDetective',
  tagline: 'Find the bottleneck. Understand the cause. Fix it faster.',
  creator: 'Harika Behara',
  repoUrl: (import.meta.env.VITE_REPO_URL as string | undefined) ?? '',
  license: 'MIT',
} as const;
