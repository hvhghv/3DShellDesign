import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
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
  if (parameters.panelEnabled) {
    const panel = getMaterial(parameters.panelMaterialId);
    rows.push([
      projectName,
      "可更换面板",
      1,
      panel.name,
      panel.process,
      `${parameters.panelThickness} mm / ${parameters.panelMountingType}`,
    ]);
    rows.push([
      projectName,
      "面板固定件",
      parameters.panelMountingType === "slide" ? 2 : 4,
      parameters.panelMountingType,
      "装配",
      "",
    ]);
  }
  if (parameters.typeCPortEnabled) {
    const connector = getConnectorDefinition(parameters.connectorDefinitionId);
    rows.push([
      projectName,
      connector.name,
      1,
      connector.metadata.bomName,
      "PCB 装配",
      connector.toleranceRules.description,
    ]);
  }
  if (parameters.antennaEnabled) {
    const antenna = getAntennaDefinition(parameters.antennaDefinitionId);
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
    rows.push([projectName, "圆形磁铁", 8, "直径 6 mm", "胶粘装配", "装配前确认磁极"]);
  } else if (parameters.closureType === "hinge") {
    rows.push([projectName, "铰链销轴", 1, "直径 2.5 mm", "装配", "按打印公差校准"]);
  }
  return `\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}
