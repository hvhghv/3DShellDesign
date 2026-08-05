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
      antennaPlacements: [
        {
          id: "antenna-1",
          definitionId: "sma-bulkhead-whip",
          surface: "back",
          panelId: null,
          offsetU: 52,
          offsetV: 0,
          rotation: 0,
          cutoutDiameter: 6.8,
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "antenna-edge-distance-antenna-1",
          part: "antenna",
        }),
      ]),
    );
  });

  it("migrates the legacy single antenna fields", () => {
    const parameters = normalizeDesignerParameters({
      ...DEFAULT_PARAMETERS,
      antennaPlacements: undefined,
      antennaEnabled: true,
      antennaDefinitionId: "rp-sma-bulkhead-whip",
      antennaOffset: 18,
    });

    expect(parameters.antennaPlacements).toEqual([
      expect.objectContaining({
        id: "antenna-1",
        definitionId: "rp-sma-bulkhead-whip",
        surface: "back",
        offsetU: 18,
        cutoutDiameter: 6.8,
      }),
    ]);
    expect(parameters).not.toHaveProperty("antennaEnabled");
    expect(parameters).not.toHaveProperty("antennaDefinitionId");
    expect(parameters).not.toHaveProperty("antennaOffset");
  });

  it("detects overlapping antenna and connector placements", () => {
    const antenna = {
      id: "antenna-1",
      definitionId: "sma-bulkhead-whip",
      surface: "front" as const,
      panelId: null,
      offsetU: 0,
      offsetV: 0,
      rotation: 0 as const,
      cutoutDiameter: 6.8,
    };
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: [
        { ...DEFAULT_PARAMETERS.connectorPlacements[0], offsetU: 0, offsetV: 0 },
      ],
      antennaPlacements: [antenna, { ...antenna, id: "antenna-2", offsetU: 5 }],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "antenna-overlap-antenna-1-antenna-2" }),
        expect.objectContaining({
          id: "antenna-connector-overlap-antenna-1-connector-1",
        }),
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
    const parameters = normalizeDesignerParameters({
      ...DEFAULT_PARAMETERS,
      panelPlacements: [{ id: "front-panel", face: "front" }],
    });
    const panel = parameters.panelPlacements[0];

    expect(panel.width).toBeCloseTo(62.64, 3);
    expect(panel.height).toBeCloseTo(12.48, 3);
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
