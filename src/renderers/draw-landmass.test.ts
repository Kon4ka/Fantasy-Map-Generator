// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { applyGraphSize } from "@/components/canvas";
import { Layer } from "@/components/layers";
import { drawLandmass } from "./draw-landmass";

vi.mock("@/generators/coastline-generator", () => ({
  Coastline: { getFeaturePath: () => "M20,20h10v10z" }
}));

beforeEach(() => {
  document.body.innerHTML =
    '<svg id="map" width="800" height="500"><defs id="deftemp">' +
    '<g id="featurePaths"/><mask id="land"/><mask id="water"/></defs><g id="landmass"/></svg>';
  vi.stubGlobal("TIME", false);
  vi.stubGlobal("options", { map: { graph: { width: 1600, height: 1000 } } });
  vi.stubGlobal("pack", { features: [undefined, { i: 1, type: "island" }, { i: 2, type: "lake" }] });
});

it("covers the whole graph rather than the smaller browser viewport", () => {
  drawLandmass(new Layer({ id: "landmass", parent: "viewbox" }));
  expect(document.querySelector("#water > rect")!.getAttribute("height")).toBe("1000");
  expect(document.querySelector("#water > rect")!.getAttribute("width")).toBe("1600");
  expect(document.getElementById("water")!.getAttribute("maskUnits")).toBe("userSpaceOnUse");
  expect(document.getElementById("water")!.getAttribute("height")).toBe("1000");
  expect(document.querySelector('#water use[data-f="1"]')!.getAttribute("fill")).toBe("black");
  expect(document.querySelector('#water use[data-f="2"]')!.getAttribute("fill")).toBe("white");
});

it("resizes both the water coverage and mask bounds with the graph", () => {
  drawLandmass(new Layer({ id: "landmass", parent: "viewbox" }));
  options.map.graph.height = 1800;
  applyGraphSize();
  expect(document.querySelector("#water > rect")!.getAttribute("height")).toBe("1800");
  expect(document.getElementById("water")!.getAttribute("height")).toBe("1800");
});
