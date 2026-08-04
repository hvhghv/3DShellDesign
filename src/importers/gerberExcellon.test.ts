import { describe, expect, it } from "vitest";
import { parseGerberExcellon } from "./gerberExcellon";

const OUTLINE = `G04 Explicit board outline*\n%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.1*%\nD10*\nX10000000Y20000000D02*\nX90000000Y20000000D01*\nX90000000Y70000000D01*\nX10000000Y70000000D01*\nX10000000Y20000000D01*\nM02*`;

const DRILL = `M48\nMETRIC\nT01C3.200\nT02C0.800\n%\nT01\nX15.000Y25.000\nX85.000Y25.000\nX15.000Y65.000\nX85.000Y65.000\nT02\nX50.000Y45.000\nM30`;

describe("Gerber and Excellon importer", () => {
  it("uses the selected Gerber path for bounds and large drill hits as candidates", () => {
    const reference = parseGerberExcellon(
      OUTLINE,
      "controller-Edge_Cuts.gbr",
      DRILL,
      "controller-PTH.drl",
      1.2,
    );
    expect(reference.format).toBe("gerber-excellon");
    expect(reference.bounds).toEqual({ minX: 10, minY: 20, maxX: 90, maxY: 70 });
    expect(reference.outlineElements).toBe(4);
    expect(reference.drillHoleCount).toBe(5);
    expect(reference.mountingHoles).toHaveLength(4);
    expect(reference.mountingHoles[0]).toEqual({ x: 15, y: 25, diameter: 3.2 });
    expect(reference.thickness).toBe(1.2);
  });

  it("supports inch units and rejects a drill file as the selected outline", () => {
    const inchOutline = OUTLINE.replace("%MOMM*%", "%MOIN*%");
    const reference = parseGerberExcellon(inchOutline, "outline.gbr");
    expect(reference.bounds.maxX - reference.bounds.minX).toBeCloseTo(80 * 25.4);
    expect(() => parseGerberExcellon(DRILL, "wrong.gbr")).toThrow("Gerber");
  });
});
