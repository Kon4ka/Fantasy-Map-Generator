import { describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).ERROR = false;
(globalThis as Record<string, unknown>).changeViewMode = () => {};
const originalGetElementById = document.getElementById;
document.getElementById = (() =>
  ({
    on: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    remove: () => {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    style: {}
  }) as unknown as HTMLElement) as typeof document.getElementById;
const { createAvailableLandCellFinder, getHeightmapEditMode, setHeightmapEditMode, getEditorHeightColor } =
  await import("./heightmap-editor");
document.getElementById = originalGetElementById;

it("previews water with the ocean palette and distinguishes shallow water from trenches", () => {
  vi.stubGlobal("styles", { heightmap: { oceanHeights: { options: { scheme: "ocean-test" } } } });
  vi.stubGlobal("getColorScheme", (scheme: string) => (value: number) => `${scheme}:${value}`);
  expect(getEditorHeightColor(19).startsWith("ocean-test:")).toBe(true);
  expect(getEditorHeightColor(1)).not.toBe(getEditorHeightColor(19));
  expect(getEditorHeightColor(30).startsWith("bright:")).toBe(true);
  vi.unstubAllGlobals();
});

describe("heightmap edit mode", () => {
  it("keeps the internal mode when localization changes the visible label", () => {
    const element = { dataset: {}, textContent: "" } as unknown as HTMLElement;
    setHeightmapEditMode(element, "risk");
    element.textContent = "риск";

    expect(getHeightmapEditMode(element)).toBe("risk");
  });
});

describe("createAvailableLandCellFinder", () => {
  const cells: Parameters<typeof createAvailableLandCellFinder>[0] = {
    h: [25, 30, 18, 40],
    p: [
      [0, 0],
      [10, 0],
      [5, 0],
      [100, 0]
    ]
  };

  it("returns the nearest land cell and removes it from later assignments", () => {
    const findCell = createAvailableLandCellFinder(cells);

    expect(findCell(1, 0)).toBe(0);
    expect(findCell(1, 0)).toBe(1);
    expect(findCell(1, 0)).toBe(3);
  });

  it("never returns water cells", () => {
    const findCell = createAvailableLandCellFinder(cells);

    expect(findCell(5, 0)).not.toBe(2);
  });

  it("returns undefined when no land cell remains", () => {
    const findCell = createAvailableLandCellFinder({ h: [10], p: [[0, 0]] });

    expect(findCell(0, 0)).toBeUndefined();
  });
});
