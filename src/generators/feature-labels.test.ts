import { describe, expect, it } from "vitest";
import type { PackedGraph } from "@/types/PackedGraph";
import { refitFeatureLabels } from "./feature-labels";

function fixture(): PackedGraph {
  return {
    features: [
      { i: 0 },
      { i: 1, name: "Continent North", vertices: [0, 1, 2, 3] },
      { i: 2, name: "Floating Island", vertices: [4, 5, 6, 7] },
      { i: 3, name: "Lake", vertices: [] }
    ],
    vertices: {
      p: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30]
      ]
    },
    cells: {
      i: [0, 1, 2, 3],
      f: new Uint16Array([1, 1, 2, 3]),
      p: [
        [3, 3],
        [5, 5],
        [25, 25],
        [4, 5]
      ]
    },
    addedLabels: [
      {
        i: 4,
        x: 100,
        y: 100,
        label: { text: "NORTH", group: "added", dx: 40, pathPoints: [[100, 100]] },
        note: "Kept"
      },
      { i: 8, x: 30, y: 50, label: { text: "Floating Island", dy: 12, hidden: true, fontSize: 16 } },
      { i: 9, x: 42, y: 80, label: { text: "Mountain range" }, note: "Unrelated" }
    ]
  } as unknown as PackedGraph;
}

describe("refitFeatureLabels", () => {
  it("moves matched geographic labels onto their own cells and creates missing labels", () => {
    const graph = fixture();
    const annotation = structuredClone(graph.addedLabels[2]);
    expect(refitFeatureLabels(graph)).toBe(3);
    expect(graph.addedLabels[0]).toEqual({
      i: 4,
      x: 5,
      y: 5,
      featureId: 1,
      label: { text: "Continent North", group: "added" },
      note: "Kept"
    });
    expect(graph.addedLabels[1]).toEqual({
      i: 8,
      x: 25,
      y: 25,
      featureId: 2,
      label: { text: "Floating Island", fontSize: 16 }
    });
    expect(graph.addedLabels[2]).toEqual(annotation);
    expect(graph.addedLabels[3]).toMatchObject({ i: 10, x: 4, y: 5, featureId: 3, label: { text: "Lake" } });
  });

  it("is idempotent and associations survive save/load and renaming", () => {
    const graph = fixture();
    refitFeatureLabels(graph);
    graph.addedLabels = JSON.parse(JSON.stringify(graph.addedLabels));
    graph.features[2].name = "Renamed";
    refitFeatureLabels(graph);
    expect(graph.addedLabels).toHaveLength(4);
    expect(graph.addedLabels.find(label => label.featureId === 2)?.label.text).toBe("Renamed");
  });

  it("chooses the nearest of identically named islands and keeps unresolvable annotations", () => {
    const graph = fixture();
    graph.features[1].name = "Twin";
    graph.features[2].name = "Twin";
    graph.addedLabels[0].label.text = "No matching feature";
    graph.addedLabels[1].label.text = "Twin";
    refitFeatureLabels(graph);
    expect(graph.addedLabels[0].featureId).toBeUndefined();
    expect(graph.addedLabels[1].featureId).toBe(2);
    expect(graph.addedLabels.filter(label => label.featureId === 1)).toHaveLength(1);
  });

  it("does not label nameless or deleted features without cells", () => {
    const graph = fixture();
    graph.features[2].name = "";
    graph.features.push({ i: 4, name: "Removed", vertices: [] } as unknown as (typeof graph.features)[number]);
    refitFeatureLabels(graph);
    expect(graph.addedLabels.filter(label => label.featureId !== undefined).map(label => label.featureId)).toEqual([
      1, 3
    ]);
  });
});
