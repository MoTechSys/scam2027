import { describe, expect, it } from "vitest";
import {
  actionResource,
  auditExportSchema,
  auditQuerySchema,
  csvEscape,
  csvLine,
  dayRangeInTimeZone,
  diffSnapshots,
} from "@/features/audit/schemas";

describe("auditQuerySchema", () => {
  it("applies defaults and drops empty strings", () => {
    const q = auditQuerySchema.parse({ q: "  ", entity: "", actorId: "", from: "" });
    expect(q).toMatchObject({ page: 1, pageSize: 25, actorKind: "ANY" });
    expect(q.q).toBeUndefined();
    expect(q.entity).toBeUndefined();
    expect(q.actorId).toBeUndefined();
    expect(q.from).toBeUndefined();
  });
  it("clamps pageSize and rejects bad dates / ids", () => {
    expect(auditQuerySchema.safeParse({ pageSize: 1000 }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ from: "2026/01/01" }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ actorId: "not-a-uuid" }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ actorKind: "HACK" }).success).toBe(false);
  });
  it("export contract is strict (unknown params are rejected)", () => {
    expect(auditExportSchema.safeParse({ q: "x", page: 2 }).success).toBe(false);
    expect(auditExportSchema.safeParse({ q: "x", action: "user." }).success).toBe(true);
  });
});

describe("csvEscape / csvLine", () => {
  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("l1\nl2")).toBe('"l1\nl2"');
  });
  it("neutralises spreadsheet formula injection", () => {
    for (const bad of ["=1+1", "+cmd", "-cmd", "@SUM(A1)", "\tx"])
      expect(csvEscape(bad).startsWith("'")).toBe(true);
    expect(csvEscape('=HYPERLINK("x"),y')).toBe('"\'=HYPERLINK(""x""),y"');
  });
  it("serialises dates as ISO, objects as JSON, null/undefined as empty", () => {
    expect(csvEscape(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvLine(["a", 1, null])).toBe("a,1,\r\n");
  });
});

describe("diffSnapshots", () => {
  it("classifies added / removed / changed / same and sorts keys", () => {
    const rows = diffSnapshots(
      { name: "A", status: "ACTIVE", phone: "1" },
      { name: "B", status: "ACTIVE", email: "e" },
    );
    expect(rows.map((r) => `${r.key}:${r.kind}`)).toEqual([
      "email:added",
      "name:changed",
      "phone:removed",
      "status:same",
    ]);
  });
  it("compares nested structures structurally", () => {
    const rows = diffSnapshots({ perms: ["a", "b"], meta: { x: 1 } }, { perms: ["a", "b"], meta: { x: 2 } });
    expect(rows.find((r) => r.key === "perms")?.kind).toBe("same");
    expect(rows.find((r) => r.key === "meta")?.kind).toBe("changed");
  });
  it("wraps non-object snapshots so the panel is never empty", () => {
    expect(diffSnapshots(undefined, { count: 3 })).toEqual([
      { key: "count", before: undefined, after: 3, kind: "added" },
    ]);
    expect(diffSnapshots(null, null)).toEqual([]);
    expect(diffSnapshots("x", "y")[0]).toMatchObject({ key: "value", kind: "changed" });
  });
});

describe("actionResource / dayRangeInTimeZone", () => {
  it("extracts the resource prefix", () => {
    expect(actionResource("user.create")).toBe("user");
    expect(actionResource("auth.login.success")).toBe("auth");
  });
  it("computes tenant-local day bounds (Riyadh is UTC+3, no DST)", () => {
    const { start, end } = dayRangeInTimeZone("2026-03-15", "Asia/Riyadh");
    expect(start.toISOString()).toBe("2026-03-14T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-15T20:59:59.999Z");
  });
  it("is DST-aware (Europe/Berlin spring forward)", () => {
    const { start, end } = dayRangeInTimeZone("2026-03-29", "Europe/Berlin");
    expect(start.toISOString()).toBe("2026-03-28T23:00:00.000Z"); // still CET (+1) at midnight
    expect(end.toISOString()).toBe("2026-03-29T21:59:59.999Z"); // CEST (+2) at the next midnight
  });
});
