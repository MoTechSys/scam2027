/**
 * Password policy constants — FR-AUTH-002. Kept free of Node-only imports so Zod schemas that reference the floor can
 * be bundled into client components (settings forms) without dragging argon2 into the browser build.
 */
export const PASSWORD_MIN = 10;
