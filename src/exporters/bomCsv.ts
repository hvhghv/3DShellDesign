import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import { getConnectorSurfaceLabel, getFaceLabel } from "../domain/placements";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
} from "../libraries/components";

function csv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createBomCsv(
  projectName: string,
  parameters: DesignerParameters,
): string {
  const shell = getMaterial(parameters.shellMaterialId);
  const rows: Array<Array<string | number>> = [
    ["项目", "零件", "数量", "材料/规格", "工艺", "备注"],
    [projectName, "下壳", 1, shell.name, shell.process, `${parameters.wallThickness} mm 壁厚`],
    [projectName, "顶盖", 1, shell.name, shell.process, parameters.closureType],
  ];
  parameters.panelPlacements.forEach((placement, index) => {
    const panel = getMaterial(placement.materialId);
    rows.push([
      projectName,
      `可更换面板 ${index + 1}`,
      1,
      panel.name,
      panel.process,
      `${placement.thickness} mm / ${getFaceLabel(placement.face)} / ${placement.mountingType}`,
    ]);
    rows.push([
      projectName,
      `面板 ${index + 1} 固定件`,
      placement.mountingType === "slide" ? 2 : 4,
      placement.mountingType,
      "装配",
      "",
    ]);
  });
  for (const placement of parameters.connectorPlacements) {
    const connector = getConnectorDefinition(placement.definitionId);
    rows.push([
      projectName,
      connector.name,
      1,
      connector.metadata.bomName,
      "PCB 装配",
      `${getConnectorSurfaceLabel(placement, parameters)}；${connector.toleranceRules.description}`,
    ]);
  }
  for (const placement of parameters.antennaPlacements) {
    const antenna = getAntennaDefinition(placement.definitionId);
    rows.push([
      projectName,
      antenna.name,
      1,
      antenna.metadata.bomName,
      antenna.enclosureCutout ? "穿板装配" : "内部装配",
      `${antenna.metadata.frequencyBand}；${antenna.metadata.notes}`,
    ]);
  }
  if (parameters.closureType === "screw") {
    const fastener = getFastenerDefinition(parameters.closureFastenerId);
    rows.push([
      projectName,
      "顶盖紧固件",
      4,
      fastener.metadata.bomName,
      "装配",
      fastener.metadata.notes,
    ]);
  } else if (parameters.closureType === "magnet") {
    rows.push([
      projectName,
      "圆形磁铁",
      8,
      "直径 6 x 1.8 mm",
      "胶粘装配",
      `${getMagnetSupportOption(parameters.magnetSupportType).name}；装配前确认磁极`,
    ]);
  } else if (parameters.closureType === "hinge") {
    rows.push([projectName, "铰链销轴", 1, "直径 2.5 mm", "装配", "按打印公差校准"]);
  }
  return `\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}
