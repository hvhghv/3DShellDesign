import type { DesignerParameters } from "./model";

export interface VentPatternPoint {
  x: number;
  y: number;
  shape: "circle" | "slot" | "hexagon";
  width: number;
  height: number;
}

export function getVentPatternPoints(
  parameters: DesignerParameters,
): VentPatternPoint[] {
  if (parameters.ventPattern === "none") return [];
  const pitch = parameters.ventHoleSize + parameters.ventSpacing;
  const points: VentPatternPoint[] = [];
  for (let row = 0; row < parameters.ventRows; row += 1) {
    for (let column = 0; column < parameters.ventColumns; column += 1) {
      const stagger =
        parameters.ventPattern === "honeycomb" && row % 2 === 1 ? pitch / 2 : 0;
      points.push({
        x: (column - (parameters.ventColumns - 1) / 2) * pitch + stagger,
        y: (row - (parameters.ventRows - 1) / 2) * pitch,
        shape:
          parameters.ventPattern === "honeycomb"
            ? "hexagon"
            : parameters.ventPattern,
        width:
          parameters.ventPattern === "slot"
            ? parameters.ventHoleSize * 2.2
            : parameters.ventHoleSize,
        height: parameters.ventHoleSize,
      });
    }
  }
  return points;
}
