import { describe, expect, it } from "vitest";
import {
  clampPlacementOffsets,
  constrainSurfacePlacements,
  getPlacementSurfaceOffsets,
} from "./placements";
import { DEFAULT_PARAMETERS, deriveEnclosureDimensions } from "./enclosure";

describe("surface placements", () => {
  it("converts absolute face coordinates to panel-relative offsets", () => {
    const parameters = {
      panelPlacements: [
        {
          id: "panel-offset",
          face: "top" as const,
          width: 60,
          height: 40,
          offsetU: 14,
          offsetV: -6,
          thickness: 2,
          insetDepth: 0,
          cornerRadius: 3.2,
          borderWidth: 2,
          mountingInsetX: 5,
          mountingInsetY: 5,
          screwHeadRecessEnabled: false,
          screwHeadRecessDepth: 1.2,
          materialId: "acrylic-clear",
          mountingType: "screw" as const,
        },
      ],
    };

    expect(
      getPlacementSurfaceOffsets(
        { surface: "panel", panelId: "panel-offset" },
        parameters,
        20,
        3,
      ),
    ).toEqual([6, 9]);
    expect(
      getPlacementSurfaceOffsets(
        { surface: "front", panelId: null },
        parameters,
        20,
        3,
      ),
    ).toEqual([20, 3]);
  });

  it("clamps a feature to the usable area of its installation surface", () => {
    expect(clampPlacementOffsets(41.5, -30, 108, 78, 62.64, 40.56, 2)).toEqual([
      20.68,
      -16.72,
    ]);
  });

  it("constrains panels and attached features when loading cached parameters", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      face: "bottom" as const,
      offsetU: 41.5,
      offsetV: 50,
    };
    const parameters = {
      ...DEFAULT_PARAMETERS,
      panelPlacements: [panel],
      connectorPlacements: [
        {
          ...DEFAULT_PARAMETERS.connectorPlacements[0],
          surface: "panel" as const,
          panelId: panel.id,
          offsetU: 40,
          offsetV: -40,
        },
      ],
    };
    const constrained = constrainSurfacePlacements(
      parameters,
      deriveEnclosureDimensions(parameters),
    );

    expect(constrained.panelPlacements[0]).toEqual(
      expect.objectContaining({ offsetU: 20.68, offsetV: 16.72 }),
    );
    expect(constrained.connectorPlacements[0]).toEqual(
      expect.objectContaining({ offsetU: 23.32, offsetV: -14.78 }),
    );
  });
});
