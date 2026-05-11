import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directorio del paquete frontend (evita lockfile en carpetas padre, p. ej. Documents). */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const nm = (...segments: string[]) =>
  path.join(projectRoot, 'node_modules', ...segments);

/**
 * Turbopack puede resolver `@import "tailwindcss"` desde un directorio equivocado
 * cuando hay `package.json` / lockfiles en carpetas superiores. Alias explícitos
 * apuntan siempre a `frontend/node_modules`.
 */
const turbopackResolveAlias: Record<string, string> = {
  tailwindcss: nm('tailwindcss'),
  'tw-animate-css': nm('tw-animate-css'),
  /** `exports` de shadcn solo declara condición `style`; ruta estable en el paquete publicado. */
  'shadcn/tailwind.css': nm('shadcn', 'dist', 'tailwind.css'),
};

const allowedDevOrigins =
  process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(',')
    .map((h) => h.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: projectRoot,
    resolveAlias: turbopackResolveAlias,
  },
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
