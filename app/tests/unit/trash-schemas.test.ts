/** P1-08 pure-logic tests: trash kinds, query defaults, bulk bounds, retention arithmetic. */
import { describe, expect, it } from "vitest";
import {
  TRASH_KINDS,
  TRASH_RETENTION_DAYS,
  emptyTrashSchema,
  purgeAfter,
  purgeCutoff,
  schedulePurgeSchema,
  trashItemsSchema,
  trashQuerySchema,
} from "@/features/trash/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("trash schemas", () => {
  it("covers exactly the six soft-deletable kinds (academic catalogue is hard-deleted, not trashed)", () => {
    expect([...TRASH_KINDS]).toEqual(["USER", "ROLE", "COURSE", "OFFERING", "FILE", "NOTIFICATION"]);
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it("query defaults to the USER tab, page 1 × 20 and trims the search", () => {
    const q = trashQuerySchema.parse({});
    expect(q).toEqual({ kind: "USER", q: "", page: 1, pageSize: 20 });
    expect(trashQuerySchema.parse({ kind: "FILE", q: "  x  ", page: "3" })).toMatchObject({
      kind: "FILE",
      q: "x",
      page: 3,
    });
    expect(trashQuerySchema.safeParse({ kind: "COLLEGE" }).success).toBe(false);
  });

  it("bulk input is strict and bounded to 1..200 uuids", () => {
    expect(trashItemsSchema.parse({ kind: "ROLE", ids: [uuid] }).ids).toHaveLength(1);
    expect(trashItemsSchema.safeParse({ kind: "ROLE", ids: [] }).success).toBe(false);
    expect(
      trashItemsSchema.safeParse({ kind: "ROLE", ids: Array.from({ length: 201 }, () => uuid) }).success,
    ).toBe(false);
    expect(trashItemsSchema.safeParse({ kind: "ROLE", ids: [uuid], extra: 1 }).success).toBe(false);
    expect(trashItemsSchema.safeParse({ kind: "ROLE", ids: ["not-a-uuid"] }).success).toBe(false);
  });

  it("emptyTrash accepts no kind (whole bin) or one kind; schedulePurge defaults to 30 days within 1..365", () => {
    expect(emptyTrashSchema.parse({})).toEqual({});
    expect(emptyTrashSchema.parse({ kind: "FILE" })).toEqual({ kind: "FILE" });
    expect(schedulePurgeSchema.parse({})).toEqual({ olderThanDays: 30 });
    expect(schedulePurgeSchema.parse({ olderThanDays: "7" })).toEqual({ olderThanDays: 7 });
    expect(schedulePurgeSchema.safeParse({ olderThanDays: 0 }).success).toBe(false);
    expect(schedulePurgeSchema.safeParse({ olderThanDays: 366 }).success).toBe(false);
  });

  it("purgeAfter / purgeCutoff are exact day arithmetic", () => {
    const deleted = new Date("2026-09-01T10:00:00.000Z");
    expect(purgeAfter(deleted).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(purgeAfter(deleted, 7).toISOString()).toBe("2026-09-08T10:00:00.000Z");
    const now = new Date("2026-10-01T10:00:00.000Z");
    expect(purgeCutoff(now, 30).toISOString()).toBe("2026-09-01T10:00:00.000Z");
    // A row deleted exactly 30 days ago is expired (<= cutoff); 29 days is not.
    expect(deleted.getTime() <= purgeCutoff(now, 30).getTime()).toBe(true);
    expect(new Date("2026-09-02T10:00:00.000Z").getTime() <= purgeCutoff(now, 30).getTime()).toBe(false);
  });
});
