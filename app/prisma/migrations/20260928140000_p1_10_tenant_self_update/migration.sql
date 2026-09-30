-- P1-10: a tenant admin may edit the institution's display identity from /settings/general.
-- Column-level grant (least privilege): slug / customDomain / status stay platform-only.
-- Row scoping is enforced by app code (`where: { id: ctx.tenantId }` inside tx(tenantId)); Tenant has no RLS
-- because it is the host → tenant resolution table read before any tenant context exists.
GRANT UPDATE ("name", "nameEn", "locale", "timezone", "updatedAt") ON "Tenant" TO app_user;
