import {
  getPanelMountingPoints,
  PANEL_SCREW_CLEARANCE_RADIUS,
} from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
import { PANEL_SCREW_HEAD_RECESS_RADIUS } from "../domain/screwRecess";
import {
  getPanelMagnetPocketDepth,
  PANEL_MAGNET_RADIUS,
  PANEL_SNAP_POST_DEPTH,
  PANEL_SNAP_POST_RADIUS,
} from "../domain/panelMounting";
import { getPanelPlacement, getRotatedCutoutSize } from "../domain/placements";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  hasThroughPanelCutout,
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
  const radius = Math.min(panel.cornerRadius, width / 2, height / 2);
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
      : getPanelMountingPoints(panel).flatMap(([x, y]) => {
          const centerX = format(x + width / 2);
          const centerY = format(height / 2 - y);
          if (panel.mountingType === "magnet") {
            return [
              `  <circle class="back-pocket" data-depth="${format(getPanelMagnetPocketDepth(panel.thickness))}" cx="${centerX}" cy="${centerY}" r="${format(PANEL_MAGNET_RADIUS)}" fill="none" stroke="#996515" stroke-width="0.1" stroke-dasharray="0.8 0.5" vector-effect="non-scaling-stroke"/>`,
            ];
          }
          if (panel.mountingType === "snap") {
            return [
              `  <circle class="snap-post" data-depth="${format(PANEL_SNAP_POST_DEPTH)}" cx="${centerX}" cy="${centerY}" r="${format(PANEL_SNAP_POST_RADIUS)}" fill="none" stroke="#286746" stroke-width="0.1" stroke-dasharray="0.5 0.4" vector-effect="non-scaling-stroke"/>`,
            ];
          }
          const holes = [
            `  <circle cx="${centerX}" cy="${centerY}" r="${format(PANEL_SCREW_CLEARANCE_RADIUS)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
          ];
          if (panel.screwHeadRecessEnabled) {
            holes.push(
              `  <circle class="pocket" data-depth="${format(panel.screwHeadRecessDepth)}" cx="${centerX}" cy="${centerY}" r="${format(PANEL_SCREW_HEAD_RECESS_RADIUS)}" fill="none" stroke="#666666" stroke-width="0.1" stroke-dasharray="0.8 0.5" vector-effect="non-scaling-stroke"/>`,
            );
          }
          return holes;
        });
  const connectorCutouts = parameters.connectorPlacements
    .filter(
      (placement) =>
        placement.surface === "panel" && placement.panelId === panel.id,
    )
    .flatMap((placement) => {
      const definition = getConnectorDefinition(placement.definitionId);
      if (!hasThroughPanelCutout(definition)) return [];
      const [cutoutWidth, cutoutHeight] = getRotatedCutoutSize(placement);
      const centerX = placement.offsetU + width / 2;
      const centerY = height / 2 - placement.offsetV;
      if (definition.panelCutout.shape === "circle") {
        return [
          `  <circle cx="${format(centerX)}" cy="${format(centerY)}" r="${format(cutoutWidth / 2)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
        ];
      }
      return [
        `  <rect x="${format(centerX - cutoutWidth / 2)}" y="${format(centerY - cutoutHeight / 2)}" width="${format(cutoutWidth)}" height="${format(cutoutHeight)}" rx="${format(Math.min(definition.panelCutout.cornerRadius, cutoutWidth / 2, cutoutHeight / 2))}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
      ];
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
