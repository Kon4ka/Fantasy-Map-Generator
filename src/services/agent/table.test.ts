import { describe, expect, it } from "vitest";
import { compact, toTable } from "./table";

const rows = [
  { id: 1, name: "Valeyn", state: [1, "North"], area: 120.456 },
  { id: 2, name: "Kaishi", state: [2, "South"], area: 80 },
  { id: 3, name: "Alakhea", state: [1, "North"], area: 300 }
];

describe("toTable", () => {
  it("projects default fields and pages", () => {
    const table = toTable(rows, { limit: 2 }, ["id", "name"]);
    expect(table).toEqual({
      cols: ["id", "name"],
      rows: [
        [1, "Valeyn"],
        [2, "Kaishi"]
      ],
      total: 3,
      next: 2
    });
    expect(toTable(rows, { limit: 2, cursor: 2 }, ["id"]).rows).toEqual([[3]]);
  });

  it("filters by value, ref id, ref name and ranges", () => {
    expect(toTable(rows, { where: { state: 1 } }, ["id"]).rows).toEqual([[1], [3]]);
    expect(toTable(rows, { where: { state: { like: "sou" } } }, ["id"]).rows).toEqual([[2]]);
    expect(toTable(rows, { where: { area: { gt: 100, lt: 200 } } }, ["id"]).rows).toEqual([[1]]);
    expect(toTable(rows, { where: { id: { in: [2, 3] }, name: { ne: "Kaishi" } } }, ["id"]).rows).toEqual([[3]]);
  });

  it("sorts both ways and rounds numbers", () => {
    expect(toTable(rows, { sort: "-area", fields: ["area"] }, []).rows).toEqual([[300], [120.46], [80]]);
    expect(toTable(rows, { sort: "name" }, ["name"]).rows.flat()).toEqual(["Alakhea", "Kaishi", "Valeyn"]);
  });
});

describe("compact", () => {
  it("shortens long text and rounds nested numbers", () => {
    expect(compact({ a: 1.2345, b: [2.555], c: "x".repeat(300) })).toEqual({
      a: 1.23,
      b: [2.56],
      c: `${"x".repeat(200)}…`
    });
  });
});
