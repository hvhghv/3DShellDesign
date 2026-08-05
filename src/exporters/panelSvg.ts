import { getPanelMountingPoints } from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
import { getPanelPlacement, getRotatedCutoutSize } from "../domain/placements";
import {
  getAntennaDefinition,
  getConnectorDefinition,
} from "../libraries/components";

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createPanelSvg(
  parameters: DesignerParameters,
  panelId: string | null = null,
): string {
  const panel = getPanelPlacement(parameters, panelId);
  if (!panel) throw new Error("当前设计没有可导出的面板");
  const width = panel.width;
  const height = panel.height;
  const radius = Math.min(3.2, width / 2, height / 2);
  const material = getMaterial(panel.materialId);
  const path = [
    `M ${format(radius)} 0`,
    `H ${format(width - radius)}`,
    `A ${format(radius)} ${format(radius)} 0 0 1 ${format(width)} ${format(radius)}`,
    `V ${format(height - radius)}`,
    `A ${format(radius)} ${format(radius)} 0 0 1 ${format(width - radius)} ${format(height)}`,
    `H ${format(radius)}`,
    `A ${format(radius)} ${format(radius)} 0 0 1 0 ${format(height - radius)}`,
    `V ${format(radius)}`,
    `A ${format(radius)} ${format(radius)} 0 0 1 ${format(radius)} 0`,
    "Z",
  ].join(" ");
  const mountingHoles =
    panel.mountingType === "slide"
      ? []
      : getPanelMountingPoints(panel).map(([x, y]) => {
          const radius = panel.mountingType === "screw" ? 1.3 : 2.15;
          return `  <circle cx="${format(x + width / 2)}" cy="${format(height / 2 - y)}" r="${format(radius)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`;
        });
  const connectorCutouts = parameters.connectorPlacements
    .filter(
      (placement) =>
        placement.surface === "panel" && placement.panelId === panel.id,
    )
    .map((placement) => {
      const definition = getConnectorDefinition(placement.definitionId);
      const [cutoutWidth, cutoutHeight] = getRotatedCutoutSize(placement);
      const centerX = placement.offsetU + width / 2;
      const centerY = height / 2 - placement.offsetV;
      if (definition.panelCutout.shape === "circle") {
        return `  <circle cx="${format(centerX)}" cy="${format(centerY)}" r="${format(cutoutWidth / 2)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`;
      }
      return `  <rect x="${format(centerX - cutoutWidth / 2)}" y="${format(centerY - cutoutHeight / 2)}" width="${format(cutoutWidth)}" height="${format(cutoutHeight)}" rx="${format(Math.min(definition.panelCutout.cornerRadius, cutoutWidth / 2, cutoutHeight / 2))}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`;
    });
  const antennaCutouts = parameters.antennaPlacements
    .filter(
      (placement) =>
        placement.surface === "panel" &&
        placement.panelId === panel.id &&
        placement.cutoutDiameter > 0 &&
        getAntennaDefinition(placement.definitionId).enclosureCutout !== null,
    )
    .map((placement) => {
      const centerX = placement.offsetU + width / 2;
      const centerY = height / 2 - placement.offsetV;
      return `  <circle cx="${format(centerX)}" cy="${format(centerY)}" r="${format(placement.cutoutDiameter / 2)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`;
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}mm" height="${format(height)}mm" viewBox="0 0 ${format(width)} ${format(height)}">`,
    "  <title>3DShellDesigner replaceable panel</title>",
    `  <desc>${escapeXml(material.name)}, ${format(panel.thickness)} mm</desc>`,
    `  <path d="${path}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
    ...mountingHoles,
    ...connectorCutouts,
    ...antennaCutouts,
    "</svg>",
    "",
  ].join("\n");
}
