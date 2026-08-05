import { describe, expect, it } from "vitest";
import { getPlacementSurfaceOffsets } from "./placements";

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
});
