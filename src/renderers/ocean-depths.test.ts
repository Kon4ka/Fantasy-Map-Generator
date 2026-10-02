// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Styles } from "@/generators/styles";
import { stylesFromMap } from "@/generators/styles-legacy";
import { encodeColorRamp } from "@/utils/heightmap-colors";
import { drawHeightmap, drawHeights, drawOceanDepths } from "./draw-heightmap";

beforeEach(() => {
  document.body.innerHTML =
    '<svg><g id="oceanHeights" data-layer="oceanDepths"/><g id="terrs" data-layer="heightmap">' +
    '<g id="landHeights" data-group="landHeights"/></g></svg>';
  Styles.set(Styles.parse(Styles.defaults));
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("TIME", false);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  vi.stubGlobal("getColorScheme", () => (value: number) => `rgb(0, 0, ${Math.round(value * 255)})`);
  vi.stubGlobal("grid", {
    cells: { i: [0, 1], h: [5, 30], c: [[1], [0]], v: [[], []] },
    points: [
      [0, 0],
      [10, 10]
    ],
    boundary: [],
    cellsX: 2,
    cellsY: 1,
    spacing: 10,
    vertices: { c: [], p: [] }
  });
  vi.stubGlobal("options", { map: { graph: { width: 100, height: 100 } } });
});

describe("independent ocean depths", () => {
  it("uses the same full depth range in preview, with neutral land instead of ocean colors", () => {
    let pixels: Uint8ClampedArray | undefined;
    const data = { data: new Uint8ClampedArray(12) };
    const context = {
      createImageData: () => data,
      putImageData: () => {
        pixels = data.data;
      }
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("preview");
    drawHeights({
      heights: [19, 0, 40],
      width: 3,
      height: 1,
      scheme: t => (t < 0.5 ? "#ffffff" : "#000000"),
      renderOcean: true,
      oceanOnly: true
    });
    expect(Array.from(pixels!)).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 100, 112, 116, 255]);
    vi.restoreAllMocks();
  });
  it("colors the ocean base with the deepest endpoint of a self-contained palette", () => {
    styles.heightmap.oceanHeights.options.scheme = encodeColorRamp({
      name: "Sea",
      interpolation: "linear",
      stops: [
        { position: 0, color: "#ffffff" },
        { position: 1, color: "#002255" }
      ]
    });
    drawOceanDepths();
    expect(document.querySelector("#oceanHeights > rect")!.getAttribute("fill")).toBe("#002255");
  });
  it("draws contour-only depths without drawing or clearing land contours", () => {
    styles.heightmap.oceanHeights.options.contours.mode = "only";
    styles.heightmap.landHeights.options.contours.mode = "overlay";
    drawOceanDepths();
    expect(document.querySelector("#oceanHeights > rect")).toBeNull();
    expect(document.querySelector("#oceanHeights > .heightmap-contours")).not.toBeNull();
    expect(document.querySelector("#landHeights")!.children).toHaveLength(0);
    const contours = document.querySelector("#oceanHeights > .heightmap-contours");
    drawHeightmap();
    expect(document.querySelector("#oceanHeights > .heightmap-contours")).toBe(contours);
    expect(document.querySelector("#landHeights > .heightmap-contours")).not.toBeNull();
  });

  it("renders water without land heights, even if an old ocean-render flag is off", () => {
    drawOceanDepths();
    expect(document.querySelector("#oceanHeights > rect")).not.toBeNull();
    expect(document.querySelector("#landHeights")!.children).toHaveLength(0);
    expect(document.getElementById("oceanHeights")!.getAttribute("mask")).toBe("url(#water)");
  });

  it("redrawing either band preserves the other band's SVG content", () => {
    drawOceanDepths();
    const ocean = document.querySelector("#oceanHeights > rect");
    drawHeightmap();
    expect(document.querySelector("#oceanHeights > rect")).toBe(ocean);
    const land = document.querySelector("#landHeights > rect");
    drawOceanDepths();
    expect(document.querySelector("#landHeights > rect")).toBe(land);
  });

  it("writes ocean styles outside the land-height group and cannot fill over the land", () => {
    styles.heightmap.oceanHeights.attrs.opacity = 0.42;
    styles.heightmap.oceanHeights.attrs.mask = null;
    Styles.write("heightmap");
    const ocean = document.getElementById("oceanHeights")!;
    expect(ocean.getAttribute("opacity")).toBe("0.42");
    expect(ocean.getAttribute("mask")).toBe("url(#water)");
    expect(document.getElementById("landHeights")!.getAttribute("opacity")).toBe("1");
    expect(ocean.hasAttribute("scheme")).toBe(false);
  });

  it("harvests separate ocean styles for saves using the existing schema", () => {
    document.getElementById("oceanHeights")!.setAttribute("opacity", "0.37");
    expect(stylesFromMap().heightmap.oceanHeights.attrs.opacity).toBe(0.37);
  });
});
