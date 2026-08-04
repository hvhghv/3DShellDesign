import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";

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

export function createPanelSvg(parameters: DesignerParameters): string {
  if (!parameters.panelEnabled) throw new Error("当前设计未启用独立面板");
  const dimensions = deriveEnclosureDimensions(parameters);
  const width = dimensions.panelLength;
  const height = dimensions.panelWidth;
  const radius = Math.min(3.2, width / 2, height / 2);
  const material = getMaterial(parameters.panelMaterialId);
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
    parameters.panelMountingType === "slide"
      ? []
      : getPanelMountingPoints(parameters).map(([x, y]) => {
          const radius = parameters.panelMountingType === "screw" ? 1.3 : 2.15;
          return `  <circle cx="${format(x + width / 2)}" cy="${format(height / 2 - y)}" r="${format(radius)}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`;
        });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}mm" height="${format(height)}mm" viewBox="0 0 ${format(width)} ${format(height)}">`,
    "  <title>3DShellDesigner replaceable panel</title>",
    `  <desc>${escapeXml(material.name)}, ${format(parameters.panelThickness)} mm</desc>`,
    `  <path d="${path}" fill="none" stroke="#000000" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`,
    ...mountingHoles,
    "</svg>",
    "",
  ].join("\n");
}
