import { color, interpolateRgbBasis } from "d3";
import { describe, expect, it } from "vitest";
import {
  type ColorRamp,
  editableColorRamp,
  encodeColorRamp,
  getColorScheme,
  heightColorPosition,
  interpolateColorRamp,
  parseColorRamp
} from "./heightmap-colors";

const ramp: ColorRamp = {
  name: "Sea",
  interpolation: "linear",
  stops: [
    { position: 0, color: "#ffffff" },
    { position: 0.2, color: "#00ffff" },
    { position: 1, color: "#000000" }
  ]
};
const hex = (value: string) => color(value)!.formatHex();

describe("positioned heightmap palettes", () => {
  it("spans the entire ramp for ocean depths and preserves the land scale", () => {
    expect(heightColorPosition(19)).toBe(0);
    expect(heightColorPosition(0)).toBe(1);
    expect(heightColorPosition(9.5)).toBe(0.5);
    expect(heightColorPosition(20)).toBe(0.8);
    expect(heightColorPosition(100)).toBe(0);
    expect(heightColorPosition(-5)).toBe(1);
  });
  it("passes exactly through each stop, with unequal transition widths", () => {
    const scheme = interpolateColorRamp(ramp);
    expect(hex(scheme(0))).toBe("#ffffff");
    expect(hex(scheme(0.2))).toBe("#00ffff");
    expect(hex(scheme(1))).toBe("#000000");
    expect(hex(scheme(0.1))).toBe("#80ffff");
    expect(hex(scheme(0.6))).toBe("#008080");
  });
  it("supports smooth and constant transitions, including stacked stops", () => {
    expect(interpolateColorRamp({ ...ramp, interpolation: "smooth" })(0.05)).not.toBe(interpolateColorRamp(ramp)(0.05));
    const constant = interpolateColorRamp({ ...ramp, interpolation: "constant" });
    expect(constant(0.199)).toBe("#ffffff");
    expect(constant(0.2)).toBe("#00ffff");
    expect(interpolateColorRamp({ ...ramp, stops: [...ramp.stops, { position: 0.2, color: "#ff0000" }] })(0.2)).toBe(
      "rgb(255, 0, 0)"
    );
  });
  it("clamps before first / after last stop and round-trips names, positions and interpolation", () => {
    const saved = JSON.parse(JSON.stringify({ scheme: encodeColorRamp(ramp) }));
    expect(parseColorRamp(saved.scheme)).toEqual(ramp);
    expect(hex(getColorScheme(saved.scheme)(0.2))).toBe("#00ffff");
    const short = interpolateColorRamp({ ...ramp, stops: ramp.stops.slice(1) });
    expect(short(0)).toBe("#00ffff");
    expect(short(5)).toBe("#000000");
  });
  it("keeps old comma-separated palettes intact and makes them editable", () => {
    const old = "#ffffff,#004488,#000000";
    const basis = interpolateRgbBasis(old.split(","));
    expect(getColorScheme(old)(0.25)).toBe(basis(0.25));
    expect(editableColorRamp(old).stops.map(stop => stop.position)).toEqual([0, 0.5, 1]);
    expect(editableColorRamp("natural").stops).toHaveLength(5);
  });
  it("rejects malformed / oversized palette data and safely falls back", () => {
    for (const value of [
      "ramp:bad",
      "ramp:null",
      "#bad,#fff",
      `ramp:${JSON.stringify({ ...ramp, stops: [{ position: -1, color: "#000000" }, ramp.stops[0]] })}`,
      `ramp:${JSON.stringify({ ...ramp, stops: Array(33).fill(ramp.stops[0]) })}`
    ]) {
      expect(parseColorRamp(value)).toBeNull();
      expect(getColorScheme(value)(0.5)).toBe(getColorScheme("bright")(0.5));
    }
  });
});
