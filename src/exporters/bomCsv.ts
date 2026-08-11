import { getMaterial } from "../domain/materials";
import type { DesignerParameters } from "../domain/model";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import {
  BATTERY_MOUNT_FACE_LABELS,
  BATTERY_RETENTION_LABELS,
  getBatteryPreset,
} from "../domain/batteries";
import { getPanelMagnetPocketDepth } from "../domain/panelMounting";
import { PCB_MOUNTING_LABELS, PCB_RAIL_AXIS_LABELS } from "../domain/pcbMounting";
import { getConnectorSurfaceLabel, getFaceLabel } from "../domain/placements";
import { formatRemovableFaces, getRemovableFaces } from "../domain/removableFaces";
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
  const removableFaces = getRemovableFaces(parameters);
  const rows: Array<Array<string | number>> = [
    ["项目", "零件", "数量", "材料/规格", "工艺", "备注"],
    [projectName, "壳体主体", 1, shell.name, shell.process, `${parameters.wallThickness} mm 壁厚`],
    [
      projectName,
      "可拆面",
      removableFaces.length,
      shell.name,
      shell.process,
      `${formatRemovableFaces(parameters)} / ${parameters.closureType}`,
    ],
    [
      projectName,
      "PCB 固定结构",
      1,
      PCB_MOUNTING_LABELS[parameters.pcbMountingType],
      "壳体一体打印/装配",
      parameters.pcbMountingType === "screw"
        ? `PCB 基准高度 ${parameters.standoffHeight} mm`
        : `${PCB_RAIL_AXIS_LABELS[parameters.pcbRailAxis]}；导轨 ${parameters.pcbRailWidth} mm；滑槽余量 ${parameters.pcbRailClearance} mm；无底部支撑墙；${parameters.pcbMountingType === "rail-elastic" ? "闭口端上下挂点，橡皮筋沿长度上下包裹" : "滑入后螺丝锁定"}`,
    ],
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
      `${BATTERY_MOUNT_FACE_LABELS[placement.face]}；${BATTERY_RETENTION_LABELS[placement.retentionType]}；${placement.width} x ${placement.depth} x ${placement.height} mm`,
    ]);
    if (placement.retentionType === "elastic") {
      rows.push([
        projectName,
        `电池仓 ${index + 1} 橡皮筋`,
        1,
        "耐温橡皮筋 / O-ring，按实物周长选型",
        "装配",
        "挂在仓体两侧挂耳上，封住滑入端以便快拆",
      ]);
    }
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
      "可拆面紧固件",
      removableFaces.length * 4,
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
      removableFaces.length * 8,
      "直径 6 x 1.8 mm",
      "胶粘装配",
      `${getMagnetSupportOption(parameters.magnetSupportType).name}；装配前确认磁极`,
    ]);
  } else if (parameters.closureType === "hinge") {
    rows.push([projectName, "铰链销轴", 1, "直径 2.5 mm", "装配", "按打印公差校准"]);
  } else if (parameters.closureType === "spring-latch") {
    rows.push([
      projectName,
      "压缩弹簧",
      removableFaces.length * 4,
      "外径约 5 mm，高 4-6 mm",
      "装配",
      "装入弹簧杯；下压可拆面后旋转锁舌到卡扣挡块下方",
    ]);
  } else if (parameters.closureType === "pin") {
    rows.push([projectName, "快拆销轴", 2, "直径 2.5 mm 带拉环销", "装配", "按销轴实物直径校准孔隙"]);
  }
  return `\uFEFF${rows.map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}
