import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { RELIEF_ICONS, RELIEF_SETS } from "@/data/relief-icons";
import type { Ice } from "@/generators/ice-generator";
import { getReliefIconId } from "@/generators/relief-generator";
import type { ReliefSet } from "@/types/relief";
import { createGlacierReliefResolver } from "./glacier-relief";

const glacier: Ice = {
  i: 0,
  type: "glacier",
  points: [
    [0, 0],
    [40, 0],
    [40, 40],
    [0, 40]
  ]
};
const mountain = { icon: "relief-mount-3", x: 10, y: 10, s: 10 };

test("snow covers mountain centers only, without changing stored artwork or position", () => {
  const resolve = createGlacierReliefResolver([glacier]);
  expect(resolve(mountain)).toBe("relief-mountSnow-3");
  expect(resolve({ ...mountain, x: 50 })).toBe(mountain.icon);
  expect(resolve({ ...mountain, x: -8, s: 10 })).toBe(mountain.icon);
  expect(resolve({ ...mountain, icon: "relief-hill-3" })).toBe("relief-hill-3");
  expect(resolve({ ...mountain, icon: "relief-mountSnow-2" })).toBe("relief-mountSnow-2");
  expect(mountain).toEqual({ icon: "relief-mount-3", x: 10, y: 10, s: 10 });
});

test("moving a glacier moves snow coverage, not its saved vertices", () => {
  const moved: Ice = { ...glacier, offset: [100, 50] };
  const resolve = createGlacierReliefResolver([moved]);
  expect(resolve(mountain)).toBe(mountain.icon);
  expect(resolve({ ...mountain, x: 110, y: 60 })).toBe("relief-mountSnow-3");
  expect(moved.points).toEqual(glacier.points);
});

test("icebergs, missing ice and degenerate polygons do not snow-cover mountains", () => {
  const iceberg: Ice = { ...glacier, type: "iceberg", cellId: 1, size: 1 };
  expect(createGlacierReliefResolver([iceberg])(mountain)).toBe(mountain.icon);
  expect(createGlacierReliefResolver([])(mountain)).toBe(mountain.icon);
  expect(createGlacierReliefResolver([{ ...glacier, points: [] }])(mountain)).toBe(mountain.icon);
});

test("a mountain in a concave glacier's bounding box but outside its polygon stays unchanged", () => {
  const concave: Ice = {
    ...glacier,
    points: [
      [0, 0],
      [40, 0],
      [40, 10],
      [10, 10],
      [10, 40],
      [0, 40]
    ]
  };
  expect(createGlacierReliefResolver([concave])(mountain)).toBe(mountain.icon);
});

test("every mountain variant resolves to real snow artwork in its own set, including variant 7", () => {
  const html = readFileSync("src/index.html", "utf8");
  const resolve = createGlacierReliefResolver([glacier]);
  for (const set of Object.keys(RELIEF_SETS) as ReliefSet[]) {
    const variants = RELIEF_ICONS.find(entry => entry.set === RELIEF_SETS[set].base && entry.type === "mount")!;
    for (const variant of variants.variants) {
      const icon = getReliefIconId("mount", variant, set);
      const snow = resolve({ ...mountain, icon });
      expect(html.includes(`<symbol id="${snow}"`), snow).toBe(true);
      expect(snow.includes("mountSnow")).toBe(true);
      expect(snow.endsWith(RELIEF_SETS[set].suffix)).toBe(true);
    }
  }
});
