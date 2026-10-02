import { describe, expect, it } from "vitest";
import { normalizeMapSvg } from "./map-format";

describe("normalizeMapSvg", () => {
  it("preserves ordinary saves", () => {
    const content = '1.153.1|\r\n<svg id="map"><text>Island</text></svg>\r\n{"label":"Island"}';
    expect(normalizeMapSvg(content)).toBe(content);
  });

  it("repairs namespaced tags without changing saved world sections", () => {
    const content =
      '<svg:svg id="map" xmlns:svg="http://www.w3.org/2000/svg"><svg:g><svg:text>Island</svg:text></svg:g></svg:svg>\r\n{"label":"svg:svg"}';
    expect(normalizeMapSvg(content)).toBe(
      '<svg id="map" xmlns:svg="http://www.w3.org/2000/svg"><g><text>Island</text></g></svg>\r\n{"label":"svg:svg"}'
    );
  });

  it("normalizes SVG line endings but keeps section delimiters", () => {
    const content = "header\r\n<s.svg:svg id='map'>\r\n<g/>\r\n</s.svg:svg>\r\nworld";
    expect(normalizeMapSvg(content)).toBe("header\r\n<svg id='map'>\n<g/>\n</svg>\r\nworld");
  });

  it("keeps other namespaces and nested svg elements", () => {
    const content = '<s:svg id="map"><metadata><rdf:RDF/></metadata><svg/><s:g/></s:svg>';
    expect(normalizeMapSvg(content)).toBe('<svg id="map"><metadata><rdf:RDF/></metadata><svg/><g/></svg>');
  });

  it("rejects missing map roots", () => {
    expect(() => normalizeMapSvg('<svg id="mapOther"></svg>')).toThrow("Map SVG");
  });

  it("handles nested roots without touching SVG strings in later JSON sections", () => {
    const content = '<s:svg id="map">\r\n<s:svg><s:g/></s:svg>\r\n</s:svg>\r\n{"note":"<s:svg>"}';
    expect(normalizeMapSvg(content)).toBe('<svg id="map">\n<svg><g/></svg>\n</svg>\r\n{"note":"<s:svg>"}');
  });

  it("rejects incomplete SVG and ignores closing tags inside comments", () => {
    expect(() => normalizeMapSvg('<svg id="map"><!-- </svg> -->')).toThrow("Map SVG");
  });
});
