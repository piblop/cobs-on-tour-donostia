import { defineConfig, type Plugin } from 'vite';
import { validateContent, formatIssues } from './src/data/validate.ts';

/**
 * Base path for GitHub Pages. Set BASE_PATH=/<repository>/ for a project site,
 * or leave unset for a root site / custom domain.
 */
function resolveBase(): string {
  const raw = process.env.BASE_PATH?.trim();
  if (!raw) return '/';
  const withLead = raw.startsWith('/') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

/** Fail the build when content tables are invalid. */
function contentValidation(): Plugin {
  return {
    name: 'cobs-content-validation',
    buildStart() {
      const issues = validateContent();
      if (issues.length > 0) {
        this.error(`Content validation failed:\n${formatIssues(issues)}`);
      }
    },
  };
}

/**
 * Pages cannot set response headers, so the CSP ships as a meta tag.
 * Production only: the dev server injects inline styles for HMR.
 * Note: a meta CSP cannot use frame-ancestors, so this gives no clickjacking protection.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'cobs-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig({
  base: resolveBase(),
  plugins: [contentValidation(), contentSecurityPolicy()],
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
