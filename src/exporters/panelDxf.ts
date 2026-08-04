import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import type { DesignerParameters } from "../domain/model";

function format(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function pair(code: number, value: string | number): string[] {
  return [String(code), String(value)];
}

export function createPanelDxf(parameters: DesignerParameters): string {
  if (!parameters.panelEnabled) throw new Error("当前设计未启用独立面板");
  const dimensions = deriveEnclosureDimensions(parameters);
  const width = dimensions.panelLength;
  const height = dimensions.panelWidth;
  const radius = Math.min(3.2, width / 2, height / 2);
  const vertices: Array<[number, number, number]> = [
    [radius, 0, 0],
    [width - radius, 0, Math.SQRT2 - 1],
    [width, radius, 0],
    [width, height - radius, Math.SQRT2 - 1],
    [width - radius, height, 0],
    [radius, height, Math.SQRT2 - 1],
    [0, height - radius, 0],
    [0, radius, Math.SQRT2 - 1],
  ];
  const lines = [
    ...pair(0, "SECTION"),
    ...pair(2, "HEADER"),
    ...pair(9, "$INSUNITS"),
    ...pair(70, 4),
    ...pair(0, "ENDSEC"),
    ...pair(0, "SECTION"),
    ...pair(2, "ENTITIES"),
    ...pair(0, "LWPOLYLINE"),
    ...pair(8, "CUT"),
    ...pair(90, vertices.length),
    ...pair(70, 1),
  ];
  for (const [x, y, bulge] of vertices) {
    lines.push(...pair(10, format(x)), ...pair(20, format(y)));
    if (bulge !== 0) lines.push(...pair(42, format(bulge)));
  }
  if (parameters.panelMountingType !== "slide") {
    const radiusValue = parameters.panelMountingType === "screw" ? 1.3 : 2.15;
    for (const [x, y] of getPanelMountingPoints(parameters)) {
      lines.push(
        ...pair(0, "CIRCLE"),
        ...pair(8, "CUT"),
        ...pair(10, format(x + width / 2)),
        ...pair(20, format(y + height / 2)),
        ...pair(40, format(radiusValue)),
      );
    }
  }
  lines.push(...pair(0, "ENDSEC"), ...pair(0, "EOF"));
  return `${lines.join("\r\n")}\r\n`;
}
