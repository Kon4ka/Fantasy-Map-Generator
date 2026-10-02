import { polygonContains } from "d3";
import { RELIEF_ICONS } from "@/data/relief-icons";
import type { Ice } from "@/generators/ice-generator";
import type { ReliefIcon } from "@/generators/relief-generator";

/** Derive snow artwork without changing the saved or manually positioned relief icons. */
export function createGlacierReliefResolver(ice: readonly Ice[]): (data: ReliefIcon) => string {
  const glaciers = ice
    .filter(element => element.type === "glacier" && element.points.length >= 3)
    .map(glacier => {
      const [dx, dy] = glacier.offset ?? [0, 0];
      const points = glacier.points.map(([x, y]): [number, number] => [x + dx, y + dy]);
      return {
        points,
        x0: Math.min(...points.map(point => point[0])),
        y0: Math.min(...points.map(point => point[1])),
        x1: Math.max(...points.map(point => point[0])),
        y1: Math.max(...points.map(point => point[1]))
      };
    });

  return ({ icon, x, y, s }) => {
    const match = /^relief-mount-(\d+)(-bw|-illustrated)?$/.exec(icon);
    if (!match || !glaciers.length) return icon;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const covered = glaciers.some(
      glacier =>
        cx >= glacier.x0 &&
        cx <= glacier.x1 &&
        cy >= glacier.y0 &&
        cy <= glacier.y1 &&
        polygonContains(glacier.points, [cx, cy])
    );
    if (!covered) return icon;

    const variant = Number(match[1]);
    const suffix = match[2] ?? "";
    const set = suffix === "-illustrated" ? "illustrated" : suffix === "-bw" || variant > 1 ? "colored" : "simple";
    const snow = RELIEF_ICONS.find(entry => entry.set === set && entry.type === "mountSnow");
    if (!snow) return icon;
    const snowVariant = snow.variants.includes(variant) ? variant : snow.variants[snow.variants.length - 1];
    return `relief-mountSnow-${snowVariant}${suffix}`;
  };
}
