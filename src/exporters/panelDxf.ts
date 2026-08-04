import { getPanelMountingPoints } from "../domain/enclosure";
import type { DesignerParameters } from "../domain/model";
import { getPanelPlacement, getRotatedCutoutSize } from "../domain/placements";
import { getConnectorDefinition } from "../libraries/components";

function format(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function pair(code: number, value: string | number): string[] {
  return [String(code), String(value)];
}

function appendRoundedPolyline(
  lines: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  const vertices: Array<[number, number, number]> = [
    [x + safeRadius, y, 0],
    [x + width - safeRadius, y, Math.SQRT2 - 1],
    [x + width, y + safeRadius, 0],
    [x + width, y + height - safeRadius, Math.SQRT2 - 1],
    [x + width - safeRadius, y + height, 0],
    [x + safeRadius, y + height, Math.SQRT2 - 1],
    [x, y + height - safeRadius, 0],
    [x, y + safeRadius, Math.SQRT2 - 1],
  ];
  lines.push(
    ...pair(0, "LWPOLYLINE"),
    ...pair(8, "CUT"),
    ...pair(90, vertices.length),
    ...pair(70, 1),
  );
  for (const [pointX, pointY, bulge] of vertices) {
    lines.push(...pair(10, format(pointX)), ...pair(20, format(pointY)));
    if (bulge !== 0) lines.push(...pair(42, format(bulge)));
  }
}

export function createPanelDxf(
  parameters: DesignerParameters,
  panelId: string | null = null,
): string {
  const panel = getPanelPlacement(parameters, panelId);
  if (!panel) throw new Error("当前设计没有可导出的面板");
  const width = panel.width;
  const height = panel.height;
  const lines = [
    ...pair(0, "SECTION"),
    ...pair(2, "HEADER"),
    ...pair(9, "$INSUNITS"),
    ...pair(70, 4),
    ...pair(0, "ENDSEC"),
    ...pair(0, "SECTION"),
    ...pair(2, "ENTITIES"),
  ];
  appendRoundedPolyline(lines, 0, 0, width, height, 3.2);
  if (panel.mountingType !== "slide") {
    const radiusValue = panel.mountingType === "screw" ? 1.3 : 2.15;
    for (const [x, y] of getPanelMountingPoints(panel)) {
      lines.push(
        ...pair(0, "CIRCLE"),
        ...pair(8, "CUT"),
        ...pair(10, format(x + width / 2)),
        ...pair(20, format(y + height / 2)),
        ...pair(40, format(radiusValue)),
      );
    }
  }
  for (const placement of parameters.connectorPlacements) {
    if (placement.surface !== "panel" || placement.panelId !== panel.id) continue;
    const definition = getConnectorDefinition(placement.definitionId);
    const [cutoutWidth, cutoutHeight] = getRotatedCutoutSize(placement);
    const centerX = placement.offsetU + width / 2;
    const centerY = placement.offsetV + height / 2;
    if (definition.panelCutout.shape === "circle") {
      lines.push(
        ...pair(0, "CIRCLE"),
        ...pair(8, "CUT"),
        ...pair(10, format(centerX)),
        ...pair(20, format(centerY)),
        ...pair(40, format(cutoutWidth / 2)),
      );
    } else {
      appendRoundedPolyline(
        lines,
        centerX - cutoutWidth / 2,
        centerY - cutoutHeight / 2,
        cutoutWidth,
        cutoutHeight,
        definition.panelCutout.cornerRadius,
      );
    }
  }
  lines.push(...pair(0, "ENDSEC"), ...pair(0, "EOF"));
  return `${lines.join("\r\n")}\r\n`;
}
