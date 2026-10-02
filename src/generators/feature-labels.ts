import polylabel from "polylabel";
import type { Point } from "@/types/global";
import type { PackedGraph } from "@/types/PackedGraph";
import type { AddedLabel } from "./added-labels";
import type { Feature } from "./features-generator";

const normalize = (name = "") =>
  name
    .replace(/\|/g, " ")
    .replace(/^\(\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
const shortName = (name: string) => normalize(name).replace(/^(continent|archipelago|континент|архипелаг)\s+/, "");

/** Reuse matching legacy labels; unrelated annotations stay untouched. */
export function refitFeatureLabels(graph: PackedGraph): number {
  const cellsByFeature = new Map<number, number[]>();
  for (const cell of graph.cells.i) {
    const id = graph.cells.f[cell];
    const cells = cellsByFeature.get(id) ?? [];
    cells.push(cell);
    cellsByFeature.set(id, cells);
  }

  const anchors = new Map<number, Point>();
  for (const feature of graph.features) {
    if (!feature?.i || !feature.name?.trim()) continue;
    const cells = cellsByFeature.get(feature.i);
    if (cells?.length) anchors.set(feature.i, getAnchor(graph, feature, cells));
  }

  const associated = new Map<number, AddedLabel[]>();
  for (const added of graph.addedLabels) {
    const matches = graph.features.filter(
      feature => feature?.i && anchors.has(feature.i) && shortName(feature.name) === shortName(added.label.text ?? "")
    );
    const featureId = anchors.has(added.featureId ?? -1)
      ? added.featureId
      : matches.sort((a, b) => distance(anchors.get(a.i)!, added) - distance(anchors.get(b.i)!, added))[0]?.i;
    if (featureId === undefined) continue;
    const labels = associated.get(featureId) ?? [];
    labels.push(added);
    associated.set(featureId, labels);
  }

  let nextId = graph.addedLabels.reduce((max, added) => Math.max(max, added.i), 0);
  for (const [featureId, [x, y]] of anchors) {
    const labels = associated.get(featureId) ?? [];
    if (!labels.length) {
      const added: AddedLabel = { i: ++nextId, x, y, featureId, label: { group: "added" } };
      graph.addedLabels.push(added);
      labels.push(added);
    }
    for (const added of labels) {
      added.featureId = featureId;
      added.x = x;
      added.y = y;
      added.label.text = graph.features[featureId].name;
      for (const key of ["dx", "dy", "pathPoints", "startOffset", "hidden"] as const) delete added.label[key];
    }
  }
  return anchors.size;
}

function getAnchor(graph: PackedGraph, feature: Feature, cells: number[]): Point {
  const polygon = (feature.vertices ?? []).map(vertex => graph.vertices.p[vertex]).filter(Boolean);
  const target =
    polygon.length >= 3
      ? polylabel([polygon], 1)
      : cells.reduce<Point>(
          (sum, cell) => [
            sum[0] + graph.cells.p[cell][0] / cells.length,
            sum[1] + graph.cells.p[cell][1] / cells.length
          ],
          [0, 0]
        );
  // Snap to one of this feature's cells: concave shores and inner lakes cannot strand the anchor in another feature.
  const cell = cells.reduce((best, cell) =>
    distance(graph.cells.p[cell], { x: target[0], y: target[1] }) <
    distance(graph.cells.p[best], { x: target[0], y: target[1] })
      ? cell
      : best
  );
  return [...graph.cells.p[cell]];
}

function distance([x, y]: Point, other: { x: number; y: number }): number {
  return (x - other.x) ** 2 + (y - other.y) ** 2;
}
