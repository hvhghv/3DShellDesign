import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "./enclosure";
import { getVentPatternPoints } from "./patterns";

describe("vent pattern layout", () => {
  it("creates a centered regular grid", () => {
    const points = getVentPatternPoints({
      ...DEFAULT_PARAMETERS,
      ventPattern: "circle",
      ventRows: 3,
      ventColumns: 5,
      ventHoleSize: 4,
      ventSpacing: 2,
    });
    expect(points).toHaveLength(15);
    expect(points[0]).toMatchObject({ x: -12, y: -6, shape: "circle" });
    expect(points[7]).toMatchObject({ x: 0, y: 0 });
  });

  it("stagger offsets every second honeycomb row", () => {
    const points = getVentPatternPoints({
      ...DEFAULT_PARAMETERS,
      ventPattern: "honeycomb",
      ventRows: 2,
      ventColumns: 2,
    });
    expect(points[2].x - points[0].x).toBe(3);
    expect(points.every((point) => point.shape === "hexagon")).toBe(true);
  });
});
