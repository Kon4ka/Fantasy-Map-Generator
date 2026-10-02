import {
  color,
  interpolateGreens,
  interpolateGreys,
  interpolateRdYlGn,
  interpolateRgb,
  interpolateRgbBasis,
  interpolateSpectral
} from "d3";

export interface ColorStop {
  position: number;
  color: string;
}
export interface ColorRamp {
  name: string;
  interpolation: "linear" | "smooth" | "constant";
  stops: ColorStop[];
}

export const builtInHeightmapSchemes: Record<string, (value: number) => string> = {
  bright: interpolateSpectral,
  light: interpolateRdYlGn,
  natural: interpolateRgbBasis(["white", "#EEEECC", "tan", "green", "teal"]),
  green: interpolateGreens,
  olive: interpolateRgbBasis(["#ffffff", "#cea48d", "#d5b085", "#0c2c19", "#151320"]),
  livid: interpolateRgbBasis(["#BBBBDD", "#2A3440", "#17343B", "#0A1E24"]),
  monochrome: interpolateGreys
};

export function parseColorRamp(value: string): ColorRamp | null {
  if (value.startsWith("#")) {
    const colors = value.split(",");
    if (colors.length < 2 || colors.length > 32 || colors.some(value => !/^#[\da-f]{6}$/i.test(value))) return null;
    return {
      name: "",
      interpolation: "linear",
      stops: colors.map((color, i) => ({ color, position: i / (colors.length - 1) }))
    };
  }
  if (!value.startsWith("ramp:")) return null;
  try {
    const ramp: unknown = JSON.parse(value.slice(5));
    if (!ramp || typeof ramp !== "object") return null;
    const { name, interpolation, stops } = ramp as Partial<ColorRamp>;
    if (typeof name !== "string" || !["linear", "smooth", "constant"].includes(interpolation ?? "")) return null;
    if (!Array.isArray(stops) || stops.length < 2 || stops.length > 32) return null;
    if (
      stops.some(
        stop =>
          !stop ||
          !Number.isFinite(stop.position) ||
          stop.position < 0 ||
          stop.position > 1 ||
          !/^#[\da-f]{6}$/i.test(stop.color)
      )
    )
      return null;
    return {
      name: name.slice(0, 80),
      interpolation: interpolation!,
      stops: [...stops].sort((a, b) => a.position - b.position)
    };
  } catch {
    return null;
  }
}

export function encodeColorRamp(ramp: ColorRamp): string {
  return `ramp:${JSON.stringify({ ...ramp, stops: [...ramp.stops].sort((a, b) => a.position - b.position) })}`;
}

export function interpolateColorRamp(ramp: ColorRamp): (position: number) => string {
  const stops = [...ramp.stops].sort((a, b) => a.position - b.position);
  const blends = stops.slice(1).map((stop, i) => interpolateRgb(stops[i].color, stop.color));
  return position => {
    if (position < stops[0].position) return stops[0].color;
    for (let i = 1; i < stops.length; i++) {
      if (position >= stops[i].position) continue;
      if (ramp.interpolation === "constant") return stops[i - 1].color;
      let t = (position - stops[i - 1].position) / (stops[i].position - stops[i - 1].position);
      if (ramp.interpolation === "smooth") t = t * t * (3 - 2 * t);
      return blends[i - 1](t);
    }
    return stops[stops.length - 1].color;
  };
}

export function getColorScheme(value: string | null): (position: number) => string {
  if (value && Object.hasOwn(builtInHeightmapSchemes, value)) return builtInHeightmapSchemes[value];
  const ramp = parseColorRamp(value ?? "");
  if (!ramp) return builtInHeightmapSchemes.bright;
  // Keep comma-separated palettes compatible until explicitly edited.
  return value!.startsWith("#") ? interpolateRgbBasis(ramp.stops.map(stop => stop.color)) : interpolateColorRamp(ramp);
}

export function heightColorPosition(height: number): number {
  return Math.max(0, Math.min(1, height < 20 ? (19 - height) / 19 : 1 - height / 100));
}

export function editableColorRamp(value: string): ColorRamp {
  const existing = parseColorRamp(value);
  if (existing) return existing;
  const scheme = getColorScheme(value);
  return {
    name: "",
    interpolation: "linear",
    stops: [0, 0.25, 0.5, 0.75, 1].map(position => ({ position, color: color(scheme(position))!.formatHex() }))
  };
}
