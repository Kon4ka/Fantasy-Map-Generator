/** HTML insertion requires unprefixed SVG tags; XML serializers may introduce a namespace prefix. */
export function normalizeMapSvg(content: string): string {
  const root = /<((?:[\w.-]+:)?svg)\b[^>]*\bid=["']map["'][^>]*>/.exec(content);
  if (!root) throw new Error("Map SVG is missing or malformed");
  const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)((?:[\w.-]+:)?svg)\b[^>]*>/g;
  tags.lastIndex = root.index;
  let depth = 0;
  let end = 0;
  for (let tag = tags.exec(content); tag; tag = tags.exec(content)) {
    if (!tag[2]) continue;
    depth += tag[1] ? -1 : tag[0].endsWith("/>") ? 0 : 1;
    if (depth === 0) {
      end = tags.lastIndex;
      break;
    }
  }
  if (!end) throw new Error("Map SVG is missing or malformed");
  const svg = content.slice(root.index, end);
  const tag = root[1];
  const prefix = tag.includes(":") ? tag.slice(0, tag.indexOf(":")) : "";
  let normalized = svg.replace(/\r\n/g, "\n");
  if (prefix) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`(<\\/?)${escaped}:`, "g"), "$1");
  }
  return content.replace(svg, normalized);
}
