/** Public project metadata. Set VITE_REPO_URL at build time once the repository exists. */
export const SITE = {
  name: 'TraceDetective',
  tagline: 'Find the bottleneck. Understand the cause. Fix it faster.',
  creator: 'Harika Behara',
  repoUrl: (import.meta.env.VITE_REPO_URL as string | undefined) ?? '',
  license: 'MIT',
  /** TraceDetective PageSpeed proxy (holds the Google API key server-side). Empty: call Google's keyless API directly. */
  psiProxyUrl: ((import.meta.env.VITE_PSI_PROXY_URL as string | undefined) ?? '').trim(),
} as const;
