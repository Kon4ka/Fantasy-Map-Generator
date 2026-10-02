// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setViewportSize, setViewportTransform } from "@/components/viewport";
import { ViewportLayers } from "@/renderers/viewport/viewport-renderer";

const state = vi.hoisted(() => ({ iceOn: true, reliefOn: true }));
vi.mock("@/components/layers", () => ({
  Layers: {
    isOn: (id: string) => (id === "ice" ? state.iceOn : state.reliefOn),
    draw: () => drawRelief()
  }
}));

import { drawIce, redrawGlacier } from "./draw-ice";
import { drawRelief, removeRelief } from "./draw-relief-icons";

const frames: FrameRequestCallback[] = [];
function flushFrames(): void {
  while (frames.length) frames.shift()!(0);
}
const href = () => document.querySelector("#terrain use")?.getAttribute("href");

beforeEach(() => {
  state.iceOn = state.reliefOn = true;
  document.body.innerHTML = '<svg><g id="ice"></g><g id="terrain"></g></svg>';
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  globalThis.pack = {
    relief: [{ icon: "relief-mount-3-bw", x: 10, y: 10, s: 10 }],
    ice: [
      {
        i: 0,
        type: "glacier",
        points: [
          [0, 0],
          [40, 0],
          [40, 40],
          [0, 40]
        ]
      }
    ]
  } as typeof pack;
  setViewportSize(100, 100);
  setViewportTransform(1, 0, 0);
});

afterEach(() => {
  flushFrames();
  removeRelief();
  vi.unstubAllGlobals();
});

test("ice toggles and glacier moves update snow without regenerating relief", () => {
  const saved = structuredClone(pack.relief);
  drawRelief();
  expect(href()).toBe("#relief-mountSnow-3-bw");
  state.iceOn = false;
  ViewportLayers.renderNow();
  expect(href()).toBe("#relief-mount-3-bw");
  state.iceOn = true;
  pack.ice[0].offset = [100, 0];
  drawIce();
  flushFrames();
  expect(href()).toBe("#relief-mount-3-bw");
  pack.ice[0].offset = [0, 0];
  redrawGlacier(0);
  flushFrames();
  expect(href()).toBe("#relief-mountSnow-3-bw");
  pack.ice = [];
  redrawGlacier(0);
  flushFrames();
  expect(href()).toBe("#relief-mount-3-bw");
  expect(pack.relief).toEqual(saved);
});

test("icebergs keep their polygons and saved offsets", () => {
  pack.ice.push({
    i: 1,
    type: "iceberg",
    cellId: 5,
    size: 1,
    points: [
      [50, 50],
      [60, 50],
      [55, 60]
    ],
    offset: [2, 3]
  });
  drawIce();
  expect(document.querySelector('#ice [data-id="1"]')?.getAttribute("points")).toBe("50,50,60,50,55,60");
  expect(document.querySelector('#ice [data-id="1"]')?.getAttribute("transform")).toBe("translate(2,3)");
  expect(document.querySelector('#ice [data-id="1"]')?.hasAttribute("type")).toBe(false);
});

test("viewport exports derive the same snow artwork and retain placement and source data", () => {
  drawRelief();
  const clone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  clone.innerHTML = '<g id="terrain"></g>';
  ViewportLayers.renderTo(clone);
  const mountain = clone.querySelector("use")!;
  expect(mountain.getAttribute("href")).toBe("#relief-mountSnow-3-bw");
  expect(mountain.getAttribute("x")).toBe("10");
  expect(mountain.getAttribute("width")).toBe("10");
  expect(pack.relief[0].icon).toBe("relief-mount-3-bw");
});
