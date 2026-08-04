import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  deriveEnclosureDimensions,
  normalizeDesignerParameters,
  validateDesign,
} from "./enclosure";

describe("enclosure domain", () => {
  it("derives enclosure dimensions from PCB and clearance", () => {
    const dimensions = deriveEnclosureDimensions(DEFAULT_PARAMETERS);

    expect(dimensions.insideLength).toBe(104);
    expect(dimensions.insideWidth).toBe(74);
    expect(dimensions.outsideLength).toBe(108);
    expect(dimensions.outsideWidth).toBe(78);
    expect(dimensions.totalHeight).toBe(26);
  });

  it("reports a material wall thickness violation", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      shellMaterialId: "pc",
      wallThickness: 1,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "wall-too-thin", level: "error" }),
      ]),
    );
  });

  it("reports unsupported snap fit material", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      shellMaterialId: "pla",
      closureType: "snap",
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "snap-material", level: "warning" }),
      ]),
    );
  });

  it("accepts the default design", () => {
    const blockingIssues = validateDesign(DEFAULT_PARAMETERS).filter(
      (issue) => issue.level === "error",
    );

    expect(blockingIssues).toHaveLength(0);
  });

  it("checks antenna edge distance", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      antennaEnabled: true,
      antennaOffset: 52,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "antenna-edge-distance", part: "antenna" }),
      ]),
    );
  });

  it("rejects floor magnet columns that intersect the PCB envelope", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      closureType: "magnet",
      magnetSupportType: "floor-column",
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "magnet-column-pcb-clearance",
          level: "error",
          part: "base",
        }),
      ]),
    );
  });

  it("accepts floor magnet columns after reserving enough board clearance", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      closureType: "magnet",
      magnetSupportType: "floor-column",
      boardClearance: 10,
    });

    expect(
      issues.find((issue) => issue.id === "magnet-column-pcb-clearance"),
    ).toBeUndefined();
  });

  it("sizes a panel from its selected enclosure face", () => {
    const dimensions = deriveEnclosureDimensions({
      ...DEFAULT_PARAMETERS,
      panelFace: "front",
    });

    expect(dimensions.panelLength).toBeCloseTo(62.64, 3);
    expect(dimensions.panelWidth).toBeCloseTo(12.48, 3);
  });

  it("migrates the legacy single front connector", () => {
    const parameters = normalizeDesignerParameters({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: undefined,
      typeCPortEnabled: true,
      connectorDefinitionId: "dc-5521-jack",
      typeCPortWidth: 9.5,
      typeCPortHeight: 9.5,
      typeCPortOffset: 14,
    });

    expect(parameters.connectorPlacements).toEqual([
      expect.objectContaining({
        definitionId: "dc-5521-jack",
        surface: "front",
        offsetU: 14,
        cutoutWidth: 9.5,
      }),
    ]);
    expect(parameters).not.toHaveProperty("typeCPortEnabled");
  });

  it("detects overlapping connectors on the same face", () => {
    const first = DEFAULT_PARAMETERS.connectorPlacements[0];
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: [
        first,
        { ...first, id: "connector-2", offsetU: 4 },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "connector-overlap-connector-1-connector-2" }),
      ]),
    );
  });
});
