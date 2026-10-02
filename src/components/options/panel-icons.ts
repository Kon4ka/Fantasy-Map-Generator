// Icons and categories shared by the Layers and Tools tabs
export type Category = "nature" | "society" | "politics" | "economy" | "notes";

export const CATEGORIES: [Category, string][] = [
  ["nature", "Nature"],
  ["society", "Society"],
  ["politics", "Politics"],
  ["economy", "Economy"],
  ["notes", "Map notes"]
];

// Glyphs the icon font lacks
const SVG: Record<string, string> = {
  river: '<path d="M7 2c6 4-5 8 1 12s-2 6 4 8 M14 2c3 2-1 4 2 6"/>',
  ice: '<path d="M12 2v20 M3.3 7l17.4 10 M3.3 17L20.7 7 M9 4l3 2 3-2 M9 20l3-2 3 2"/>',
  depths: '<path d="M2 6c3-2 5 2 8 0s5 2 8 0 M12 10v11 M8 17l4 4 4-4"/>',
  cells: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z M12 2v20 M3.3 7l17.4 10 M20.7 7L3.3 17"/>',
  lake: '<path d="M3 13c0-4 4-7 9-7s9 3 9 7-4 6-9 6-9-2-9-6z M8 12c2-1 4 1 6 0"/>',
  grid: '<path d="M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18"/>',
  windRose: '<path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/>',
  borders: '<path d="M3 20l3-3 M9 14l2-2 M14 9l2-2 M19 4l2-2"/>',
  scaleBar: '<path d="M3 16h18 M3 11v5 M9 13v3 M15 13v3 M21 11v5"/>'
};

/** An icon-font glyph by name, or one of the inline SVG glyphs above */
export const iconHTML = (name: string): string =>
  SVG[name]
    ? `<svg class="panel-icon" viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>`
    : `<i class="panel-icon icon-${name}" aria-hidden="true"></i>`;
