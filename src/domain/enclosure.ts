import { getMaterial } from "./materials";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getVentPatternPoints } from "./patterns";
import { MAGNET_GEOMETRY } from "./magnetSupport";
import {
  createConnectorPlacement,
  getConnectorSurfaceSize,
  getFaceSize,
  getRotatedCutoutSize,
  isConnectorSurface,
  isEnclosureFace,
  isPlacementRotation,
  resolveConnectorFace,
} from "./placements";
import type {
  ConnectorPlacement,
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
  magnetSupportType: "corner-shelf",
  shellMaterialId: "petg",
  panelEnabled: true,
  panelMaterialId: "acrylic-clear",
  panelThickness: 2,
  panelMountingType: "screw",
  panelFace: "top",
  panelOffsetU: 0,
  panelOffsetV: 0,
  connectorPlacements: [
    createConnectorPlacement("usb-c-receptacle", "connector-1"),
  ],
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
  const panelSurfaceLength =
    parameters.panelFace === "left" || parameters.panelFace === "right"
      ? outsideWidth
      : outsideLength;
  const panelSurfaceWidth =
    parameters.panelFace === "top" || parameters.panelFace === "bottom"
      ? outsideWidth
      : parameters.baseHeight;

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
    panelLength: Math.max(
      6,
      Math.min(panelSurfaceLength * 0.58, panelSurfaceLength - 4),
    ),
    panelWidth: Math.max(
      6,
      Math.min(panelSurfaceWidth * 0.52, panelSurfaceWidth - 4),
    ),
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

interface LegacyDesignerParameters extends Partial<DesignerParameters> {
  typeCPortEnabled?: boolean;
  connectorDefinitionId?: string;
  typeCPortWidth?: number;
  typeCPortHeight?: number;
  typeCPortOffset?: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeDesignerParameters(value: unknown): DesignerParameters {
  const candidate =
    value && typeof value === "object"
      ? (value as LegacyDesignerParameters)
      : ({} as LegacyDesignerParameters);
  let connectorPlacements: ConnectorPlacement[];
  if (Array.isArray(candidate.connectorPlacements)) {
    connectorPlacements = candidate.connectorPlacements.map((placement, index) => {
      const raw =
        placement && typeof placement === "object"
          ? (placement as Partial<ConnectorPlacement>)
          : ({} as Partial<ConnectorPlacement>);
      const definition = getConnectorDefinition(
        typeof raw.definitionId === "string" ? raw.definitionId : "usb-c-receptacle",
      );
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `connector-${index + 1}`,
        definitionId: definition.id,
        surface: isConnectorSurface(raw.surface) ? raw.surface : "front",
        offsetU: finiteOr(raw.offsetU, 0),
        offsetV: finiteOr(raw.offsetV, -3),
        rotation: isPlacementRotation(raw.rotation) ? raw.rotation : 0,
        cutoutWidth: finiteOr(raw.cutoutWidth, definition.panelCutout.width),
        cutoutHeight: finiteOr(raw.cutoutHeight, definition.panelCutout.height),
      };
    });
  } else if (candidate.typeCPortEnabled === false) {
    connectorPlacements = [];
  } else if (candidate.typeCPortEnabled === true) {
    const definition = getConnectorDefinition(
      candidate.connectorDefinitionId ?? "usb-c-receptacle",
    );
    connectorPlacements = [
      {
        ...createConnectorPlacement(definition.id, "connector-1"),
        offsetU: finiteOr(candidate.typeCPortOffset, 0),
        cutoutWidth: finiteOr(
          candidate.typeCPortWidth,
          definition.panelCutout.width,
        ),
        cutoutHeight: finiteOr(
          candidate.typeCPortHeight,
          definition.panelCutout.height,
        ),
      },
    ];
  } else {
    connectorPlacements = DEFAULT_PARAMETERS.connectorPlacements.map((item) => ({
      ...item,
    }));
  }

  const normalized = {
    ...DEFAULT_PARAMETERS,
    ...candidate,
    panelFace: isEnclosureFace(candidate.panelFace)
      ? candidate.panelFace
      : DEFAULT_PARAMETERS.panelFace,
    panelOffsetU: finiteOr(candidate.panelOffsetU, 0),
    panelOffsetV: finiteOr(candidate.panelOffsetV, 0),
    connectorPlacements,
  } as DesignerParameters & Record<string, unknown>;
  for (const key of [
    "typeCPortEnabled",
    "connectorDefinitionId",
    "typeCPortWidth",
    "typeCPortHeight",
    "typeCPortOffset",
  ]) {
    delete normalized[key];
  }
  return normalized;
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

  if (parameters.closureType === "magnet") {
    if (
      parameters.magnetSupportType === "floor-column" &&
      parameters.boardClearance <
        MAGNET_GEOMETRY.centerInset + MAGNET_GEOMETRY.floorColumnRadius
    ) {
      issues.push({
        id: "magnet-column-pcb-clearance",
        level: "error",
        title: "磁铁立柱侵入 PCB 区域",
        detail: `底板连续立柱需要至少 ${(MAGNET_GEOMETRY.centerInset + MAGNET_GEOMETRY.floorColumnRadius).toFixed(1)} mm 板边间隙`,
        part: "base",
      });
    }

    const supportBottom =
      parameters.baseHeight -
      MAGNET_GEOMETRY.supportThickness -
      (parameters.magnetSupportType === "wall-bracket"
        ? MAGNET_GEOMETRY.wallBracketRibDrop
        : 0);
    const componentTop =
      parameters.bottomThickness +
      parameters.standoffHeight +
      parameters.pcbThickness +
      parameters.componentHeight;
    if (
      parameters.magnetSupportType !== "floor-column" &&
      componentTop + 0.5 > supportBottom
    ) {
      issues.push({
        id: "magnet-support-component-envelope",
        level: "warning",
        title: "磁铁托台可能接近顶部元件",
        detail: "请确认 PCB 四角或侧壁附近没有进入托台区域的高元件",
        part: "base",
      });
    }
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

  if (parameters.panelEnabled) {
    const [surfaceWidth, surfaceHeight] = getFaceSize(
      parameters.panelFace,
      parameters,
      dimensions,
    );
    if (
      Math.abs(parameters.panelOffsetU) + dimensions.panelLength / 2 >
        surfaceWidth / 2 - 2 ||
      Math.abs(parameters.panelOffsetV) + dimensions.panelWidth / 2 >
        surfaceHeight / 2 - 2
    ) {
      issues.push({
        id: "panel-face-bounds",
        level: "error",
        title: "面板超出安装面",
        detail: "减小面板偏移，确保面板边缘完整落在所选壳体表面",
        part: "panel",
      });
    }
  }

  for (const [index, placement] of parameters.connectorPlacements.entries()) {
    const connector = getConnectorDefinition(placement.definitionId);
    if (placement.surface === "panel" && !parameters.panelEnabled) {
      issues.push({
        id: `connector-panel-disabled-${placement.id}`,
        level: "error",
        title: `${connector.name}缺少安装面板`,
        detail: "启用可更换面板，或将接口改放到壳体表面",
        part: "connector",
      });
      continue;
    }
    const [surfaceWidth, surfaceHeight] = getConnectorSurfaceSize(
      placement,
      parameters,
      dimensions,
    );
    const [cutoutWidth, cutoutHeight] = getRotatedCutoutSize(placement);
    const edgeMargin = placement.surface === "panel"
      ? 2
      : Math.max(2, parameters.wallThickness * 2);
    const remainingU =
      surfaceWidth / 2 - Math.abs(placement.offsetU) - cutoutWidth / 2;
    const remainingV =
      surfaceHeight / 2 - Math.abs(placement.offsetV) - cutoutHeight / 2;
    if (remainingU < edgeMargin || remainingV < edgeMargin) {
      issues.push({
        id: `connector-edge-distance-${placement.id}`,
        level: "error",
        title: `${connector.name}超出安全放置区域`,
        detail: `接口 ${index + 1} 距安装面边缘至少保留 ${edgeMargin.toFixed(1)} mm`,
        part: "connector",
      });
    }

    if (
      parameters.panelEnabled &&
      placement.surface !== "panel" &&
      placement.surface === parameters.panelFace &&
      Math.abs(placement.offsetU - parameters.panelOffsetU) <
        (cutoutWidth + dimensions.panelLength) / 2 &&
      Math.abs(placement.offsetV - parameters.panelOffsetV) <
        (cutoutHeight + dimensions.panelWidth) / 2
    ) {
      issues.push({
        id: `connector-panel-overlap-${placement.id}`,
        level: "error",
        title: `${connector.name}与面板区域重叠`,
        detail: "将接口目标改为可更换面板，或移动到面板区域之外",
        part: "connector",
      });
    }
  }

  for (let first = 0; first < parameters.connectorPlacements.length; first += 1) {
    const firstPlacement = parameters.connectorPlacements[first];
    const firstFace = resolveConnectorFace(firstPlacement, parameters);
    const [firstWidth, firstHeight] = getRotatedCutoutSize(firstPlacement);
    const firstU = firstPlacement.offsetU +
      (firstPlacement.surface === "panel" ? parameters.panelOffsetU : 0);
    const firstV = firstPlacement.offsetV +
      (firstPlacement.surface === "panel" ? parameters.panelOffsetV : 0);
    for (
      let second = first + 1;
      second < parameters.connectorPlacements.length;
      second += 1
    ) {
      const secondPlacement = parameters.connectorPlacements[second];
      if (resolveConnectorFace(secondPlacement, parameters) !== firstFace) continue;
      const [secondWidth, secondHeight] = getRotatedCutoutSize(secondPlacement);
      const secondU = secondPlacement.offsetU +
        (secondPlacement.surface === "panel" ? parameters.panelOffsetU : 0);
      const secondV = secondPlacement.offsetV +
        (secondPlacement.surface === "panel" ? parameters.panelOffsetV : 0);
      if (
        Math.abs(firstU - secondU) < (firstWidth + secondWidth) / 2 + 2 &&
        Math.abs(firstV - secondV) < (firstHeight + secondHeight) / 2 + 2
      ) {
        issues.push({
          id: `connector-overlap-${firstPlacement.id}-${secondPlacement.id}`,
          level: "error",
          title: "接口开孔相互重叠",
          detail: "移动其中一个接口，至少保留 2 mm 壳体材料",
          part: "connector",
        });
      }
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
    panelOffsetU: [-300, 300],
    panelOffsetV: [-300, 300],
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
