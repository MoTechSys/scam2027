import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Lint policy (docs/50-quality/00-DEFINITION-OF-DONE.md):
 *  - Next core-web-vitals + TypeScript
 *  - jsx-a11y strict (WCAG 2.1 AA)
 *  - RTL safety: forbid physical-direction Tailwind classes (ml-/mr-/pl-/pr-/left-/right-/text-left/text-right)
 *    in favour of logical ones (ms-/me-/ps-/pe-/start-/end-/text-start/text-end).
 *  - No direct `@prisma/client` import outside lib/db (tenant isolation must go through `db(tenantId)`).
 */
const physicalDirectionClass =
  "\\b(?:-?(?:ml|mr|pl|pr|left|right|rounded-l|rounded-r|border-l|border-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-|text-left\\b|text-right\\b)";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next already registers the jsx-a11y plugin; we only layer the *strict* rule set on top.
    files: ["src/**/*.{ts,tsx}"],
    rules: { ...jsxA11y.flatConfigs.strict.rules },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name='className'] > Literal[value=/${physicalDirectionClass}/]`,
          message: "Use logical (RTL-safe) Tailwind classes: ms-/me-/ps-/pe-/start-/end-/text-start/text-end.",
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${physicalDirectionClass}/]`,
          message: "Use logical (RTL-safe) Tailwind classes: ms-/me-/ps-/pe-/start-/end-/text-start/text-end.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              importNames: ["PrismaClient"],
              message: "Import `db`/`platformPrisma` from `@/lib/db` — never instantiate PrismaClient directly.",
            },
          ],
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/lib/db/**/*.ts", "prisma/**/*.ts", "e2e/**/*.ts", "vitest.config.ts", "playwright.config.ts", "scripts/**"],
    rules: { "no-restricted-imports": "off" },
  },
  // scripts/ui-upstream/** is vendored shadcn source consumed by scripts/port-ui.py — never compiled; the ported
  // output in src/components/ui is what gets linted.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/generated/**",
    "scripts/ui-upstream/**",
  ]),
]);
