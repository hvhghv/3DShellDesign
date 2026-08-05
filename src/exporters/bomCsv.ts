import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import { getBatteryPreset } from "../domain/batteries";
import { getPanelMagnetPocketDepth } from "../domain/panelMounting";
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
      placement.mountingType === "magnet"
        ? 8
        : placement.mountingType === "slide"
          ? 2
          : 4,
      placement.mountingType === "magnet"
        ? "直径 4.3 mm 圆形磁铁"
        : placement.mountingType === "snap"
          ? "一体弹性柱卡扣"
          : placement.mountingType,
      "装配",
      placement.mountingType === "screw" && placement.screwHeadRecessEnabled
        ? `低头螺丝；面板沉孔 ${placement.screwHeadRecessDepth} mm`
        : placement.mountingType === "magnet"
          ? `面板与壳体各 4 颗；盲孔深度 ${getPanelMagnetPocketDepth(placement.thickness)} mm；确认磁极`
          : placement.mountingType === "snap"
            ? "卡柱与面板一体制造，按材料收缩率校准"
            : "",
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
  parameters.batteryCompartments.forEach((placement, index) => {
    const preset = getBatteryPreset(placement.preset);
    rows.push([
      projectName,
      `电池仓 ${index + 1}`,
      1,
      `${preset.name} / ${placement.cellCount} 槽`,
      "壳体一体打印",
      `${placement.width} x ${placement.depth} x ${placement.height} mm`,
    ]);
    rows.push([
      projectName,
      preset.id === "lipo" ? "软包锂电池" : `${preset.id.toUpperCase()} 电池`,
      placement.cellCount,
      `${preset.cellLength} x ${preset.cellWidth} x ${preset.cellHeight} mm 包络`,
      "装配",
      "电池与触点规格按实物复核",
    ]);
  });
  if (parameters.closureType === "screw") {
    const fastener = getFastenerDefinition(parameters.closureFastenerId);
    rows.push([
      projectName,
      "顶盖紧固件",
      4,
      fastener.metadata.bomName,
      "装配",
      parameters.closureScrewHeadRecessEnabled
        ? `${fastener.metadata.notes}；使用适配 ${parameters.closureScrewHeadRecessDepth} mm 沉孔的低头螺丝`
        : fastener.metadata.notes,
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
  } else if (parameters.closureType === "pin") {
    rows.push([projectName, "快拆销轴", 2, "直径 2.5 mm 带拉环销", "装配", "按销轴实物直径校准孔隙"]);
  }
  return `\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}
