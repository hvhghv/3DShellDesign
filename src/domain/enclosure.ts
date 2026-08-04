import { getMaterial } from "./materials";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getVentPatternPoints } from "./patterns";
import type {
  DesignerParameters,
  EnclosureDimensions,
  PcbReference,
  ValidationIssue,
} from "./model";

export const DEFAULT_PARAMETERS: DesignerParameters = {
  enclosureTemplateId: "rounded-split",
  pcbLength: 100,
  pcbWidth: 70,
  pcbThickness: 1.6,
  componentHeight: 12,
  boardClearance: 2,
  wallThickness: 2,
  bottomThickness: 2,
  baseHeight: 24,
  cornerRadius: 6,
  standoffHeight: 4,
  lidThickness: 2,
  closureType: "screw",
  shellMaterialId: "petg",
  panelEnabled: true,
  panelMaterialId: "acrylic-clear",
  panelThickness: 2,
  panelMountingType: "screw",
  typeCPortEnabled: true,
  connectorDefinitionId: "usb-c-receptacle",
  typeCPortWidth: 12,
  typeCPortHeight: 7,
  typeCPortOffset: 0,
  antennaEnabled: false,
  antennaDefinitionId: "sma-bulkhead-whip",
  antennaOffset: 20,
  closureFastenerId: "m3-self-tapping",
  ventPattern: "none",
  ventRows: 3,
  ventColumns: 5,
  ventHoleSize: 4,
  ventSpacing: 2,
};

export function deriveEnclosureDimensions(
  parameters: DesignerParameters,
): EnclosureDimensions {
  const insideLength = parameters.pcbLength + parameters.boardClearance * 2;
  const insideWidth = parameters.pcbWidth + parameters.boardClearance * 2;
  const outsideLength = insideLength + parameters.wallThickness * 2;
  const outsideWidth = insideWidth + parameters.wallThickness * 2;

  return {
    outsideLength,
    outsideWidth,
    totalHeight: parameters.baseHeight + parameters.lidThickness,
    insideLength,
    insideWidth,
    availableComponentHeight:
      parameters.baseHeight -
      parameters.bottomThickness -
      parameters.standoffHeight -
      parameters.pcbThickness,
    mountingInset: Math.max(4, parameters.boardClearance + 1.5),
    panelLength: Math.max(20, outsideLength * 0.58),
    panelWidth: Math.max(16, outsideWidth * 0.52),
  };
}

export function getPanelMountingPoints(
  parameters: DesignerParameters,
): Array<readonly [number, number]> {
  const dimensions = deriveEnclosureDimensions(parameters);
  const x = dimensions.panelLength / 2 - 5;
  const y = dimensions.panelWidth / 2 - 5;
  return [
    [-x, -y],
    [x, -y],
    [-x, y],
    [x, y],
  ];
}

export function validateDesign(
  parameters: DesignerParameters,
  pcbReference: PcbReference | null = null,
): ValidationIssue[] {
  const material = getMaterial(parameters.shellMaterialId);
  const panelMaterial = getMaterial(parameters.panelMaterialId);
  const dimensions = deriveEnclosureDimensions(parameters);
  const issues: ValidationIssue[] = [];

  if (parameters.wallThickness < material.minWall) {
    issues.push({
      id: "wall-too-thin",
      level: "error",
      title: "壳体壁厚不足",
      detail: `${material.shortName} 建议至少 ${material.minWall.toFixed(1)} mm`,
      part: "base",
    });
  }

  if (parameters.boardClearance < material.minClearance) {
    issues.push({
      id: "board-clearance-low",
      level: "warning",
      title: "PCB 装配间隙偏小",
      detail: `${material.shortName} 建议不小于 ${material.minClearance.toFixed(2)} mm`,
      part: "pcb",
    });
  }

  if (dimensions.availableComponentHeight < parameters.componentHeight + 2) {
    issues.push({
      id: "component-height",
      level: "error",
      title: "元件顶部空间不足",
      detail: `可用 ${dimensions.availableComponentHeight.toFixed(1)} mm，需要至少 ${(parameters.componentHeight + 2).toFixed(1)} mm`,
      part: "lid",
    });
  }

  if (parameters.cornerRadius < parameters.wallThickness + 1) {
    issues.push({
      id: "corner-radius",
      level: "warning",
      title: "外壳圆角偏小",
      detail: "增大圆角可改善壁厚连续性和打印质量",
      part: "base",
    });
  }

  if (parameters.closureType === "snap" && !material.supportsSnapFit) {
    issues.push({
      id: "snap-material",
      level: "warning",
      title: "当前材料不适合卡扣",
      detail: `${material.shortName} 的长期受力卡扣存在开裂风险`,
      part: "lid",
    });
  }

  if (
    parameters.panelEnabled &&
    parameters.panelThickness < panelMaterial.minWall
  ) {
    issues.push({
      id: "panel-thickness",
      level: "error",
      title: "面板厚度不足",
      detail: `${panelMaterial.shortName} 建议至少 ${panelMaterial.minWall.toFixed(1)} mm`,
      part: "panel",
    });
  }

  if (parameters.typeCPortEnabled) {
    const connector = getConnectorDefinition(parameters.connectorDefinitionId);
    const availableSide = dimensions.outsideLength - parameters.cornerRadius * 2;
    const portEdge =
      availableSide / 2 -
      Math.abs(parameters.typeCPortOffset) -
      parameters.typeCPortWidth / 2;

    if (portEdge < parameters.wallThickness * 2) {
      issues.push({
        id: "port-edge-distance",
        level: "error",
        title: `${connector.name}开孔距边缘过近`,
        detail: `当前剩余 ${Math.max(0, portEdge).toFixed(1)} mm`,
        part: "connector",
      });
    }
  }

  if (parameters.antennaEnabled) {
    const antenna = getAntennaDefinition(parameters.antennaDefinitionId);
    const mountingWidth = Math.max(
      antenna.visualGeometry.width,
      antenna.enclosureCutout?.diameter ?? 0,
    );
    const edgeDistance =
      (dimensions.outsideLength - parameters.cornerRadius * 2) / 2 -
      Math.abs(parameters.antennaOffset) -
      mountingWidth / 2;
    if (edgeDistance < parameters.wallThickness * 2) {
      issues.push({
        id: "antenna-edge-distance",
        level: "error",
        title: `${antenna.name}距边缘过近`,
        detail: `当前剩余 ${Math.max(0, edgeDistance).toFixed(1)} mm，需要保留壁厚和圆角区域`,
        part: "antenna",
      });
    }

    const antennaCenterHeight =
      parameters.bottomThickness +
      parameters.standoffHeight +
      parameters.pcbThickness / 2 +
      antenna.heightAboveBoardCenter;
    if (
      antennaCenterHeight + antenna.visualGeometry.height / 2 >
      parameters.baseHeight - parameters.wallThickness
    ) {
      issues.push({
        id: "antenna-height",
        level: "error",
        title: `${antenna.name}安装高度不足`,
        detail: "提高下壳高度或选择更紧凑的天线",
        part: "antenna",
      });
    }
  }

  if (parameters.ventPattern !== "none") {
    const points = getVentPatternPoints(parameters);
    const maximumX = Math.max(...points.map((point) => Math.abs(point.x) + point.width / 2));
    const maximumY = Math.max(...points.map((point) => Math.abs(point.y) + point.height / 2));
    if (
      maximumX > dimensions.insideLength / 2 - 6 ||
      maximumY > dimensions.insideWidth / 2 - 6
    ) {
      issues.push({
        id: "vent-pattern-bounds",
        level: "error",
        title: "镂空阵列超出安全区域",
        detail: "减少行列数、孔径或增大壳体尺寸",
        part: "base",
      });
    } else if (parameters.ventSpacing < Math.max(1.2, material.minWall * 0.8)) {
      issues.push({
        id: "vent-web-thin",
        level: "warning",
        title: "镂空剩余筋宽偏小",
        detail: `${material.shortName} 建议孔间至少 ${Math.max(1.2, material.minWall * 0.8).toFixed(1)} mm`,
        part: "base",
      });
    }
  }

  if (pcbReference && pcbReference.unsupportedOutlineElements > 0) {
    issues.push({
      id: "pcb-outline-partial",
      level: "warning",
      title: "PCB 板框包含未支持图元",
      detail: `${pcbReference.unsupportedOutlineElements} 段仅计入已识别边界，请核对外形尺寸`,
      part: "pcb",
    });
  }

  if (issues.length === 0) {
    issues.push({
      id: "design-ready",
      level: "info",
      title: "基础检查通过",
      detail: "当前参数未发现阻断问题",
      part: "project",
    });
  }

  return issues;
}

export function clampParameter(
  key: keyof DesignerParameters,
  value: DesignerParameters[keyof DesignerParameters],
): DesignerParameters[keyof DesignerParameters] {
  if (typeof value !== "number") return value;

  const ranges: Partial<
    Record<keyof DesignerParameters, readonly [number, number]>
  > = {
    pcbLength: [20, 300],
    pcbWidth: [20, 220],
    pcbThickness: [0.6, 5],
    componentHeight: [0, 80],
    boardClearance: [0, 15],
    wallThickness: [0.8, 8],
    bottomThickness: [0.8, 8],
    baseHeight: [8, 120],
    cornerRadius: [0.5, 30],
    standoffHeight: [0, 30],
    lidThickness: [0.8, 8],
    panelThickness: [0.5, 10],
    typeCPortWidth: [6, 30],
    typeCPortHeight: [3, 20],
    typeCPortOffset: [-120, 120],
    antennaOffset: [-120, 120],
    ventRows: [1, 12],
    ventColumns: [1, 16],
    ventHoleSize: [1.5, 12],
    ventSpacing: [0.8, 12],
  };
  const range = ranges[key];
  if (!range) return value;
  return Math.min(range[1], Math.max(range[0], value));
}
