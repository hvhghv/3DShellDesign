import { getMaterial } from "./materials";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getVentPatternPoints } from "./patterns";
import { MAGNET_GEOMETRY } from "./magnetSupport";
import {
  createConnectorPlacement,
  createAntennaPlacement,
  createPanelPlacement,
  constrainSurfacePlacements,
  getAntennaMountingSize,
  getConnectorSurfaceSize,
  getAntennaSurfaceSize,
  getFaceSize,
  getDefaultPanelSize,
  getPanelPlacement,
  getRotatedCutoutSize,
  isConnectorSurface,
  isEnclosureFace,
  isPlacementRotation,
  resolveAntennaFace,
  resolveConnectorFace,
} from "./placements";
import type {
  AntennaPlacement,
  ConnectorPlacement,
  DesignerParameters,
  EnclosureDimensions,
  PcbReference,
  PanelPlacement,
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
  panelPlacements: [
    {
      id: "panel-1",
      face: "top",
      offsetU: 0,
      offsetV: 0,
      width: 62.64,
      height: 40.56,
      thickness: 2,
      mountingType: "screw",
      materialId: "acrylic-clear",
    },
  ],
  connectorPlacements: [
    createConnectorPlacement("usb-c-receptacle", "connector-1"),
  ],
  antennaPlacements: [],
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
  };
}

export function getPanelMountingPoints(
  panel: PanelPlacement,
): Array<readonly [number, number]> {
  const x = Math.max(1.5, panel.width / 2 - 5);
  const y = Math.max(1.5, panel.height / 2 - 5);
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
  panelEnabled?: boolean;
  panelMaterialId?: string;
  panelThickness?: number;
  panelMountingType?: "screw" | "magnet" | "slide";
  panelFace?: unknown;
  panelOffsetU?: number;
  panelOffsetV?: number;
  antennaEnabled?: boolean;
  antennaDefinitionId?: string;
  antennaOffset?: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeDesignerParameters(value: unknown): DesignerParameters {
  const candidate =
    value && typeof value === "object"
      ? (value as LegacyDesignerParameters)
      : ({} as LegacyDesignerParameters);
  const dimensionSource = {
    pcbLength: finiteOr(candidate.pcbLength, DEFAULT_PARAMETERS.pcbLength),
    pcbWidth: finiteOr(candidate.pcbWidth, DEFAULT_PARAMETERS.pcbWidth),
    boardClearance: finiteOr(
      candidate.boardClearance,
      DEFAULT_PARAMETERS.boardClearance,
    ),
    wallThickness: finiteOr(
      candidate.wallThickness,
      DEFAULT_PARAMETERS.wallThickness,
    ),
    baseHeight: finiteOr(candidate.baseHeight, DEFAULT_PARAMETERS.baseHeight),
    bottomThickness: finiteOr(
      candidate.bottomThickness,
      DEFAULT_PARAMETERS.bottomThickness,
    ),
    standoffHeight: finiteOr(
      candidate.standoffHeight,
      DEFAULT_PARAMETERS.standoffHeight,
    ),
    pcbThickness: finiteOr(
      candidate.pcbThickness,
      DEFAULT_PARAMETERS.pcbThickness,
    ),
  };
  let panelPlacements: PanelPlacement[];
  if (Array.isArray(candidate.panelPlacements)) {
    panelPlacements = candidate.panelPlacements.map((placement, index) => {
      const raw =
        placement && typeof placement === "object"
          ? (placement as Partial<PanelPlacement>)
          : ({} as Partial<PanelPlacement>);
      const face = isEnclosureFace(raw.face) ? raw.face : "top";
      const [defaultWidth, defaultHeight] = getDefaultPanelSize(
        dimensionSource,
        face,
      );
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `panel-${index + 1}`,
        face,
        offsetU: finiteOr(raw.offsetU, 0),
        offsetV: finiteOr(raw.offsetV, 0),
        width: Math.max(6, finiteOr(raw.width, defaultWidth)),
        height: Math.max(6, finiteOr(raw.height, defaultHeight)),
        thickness: Math.max(0.5, finiteOr(raw.thickness, 2)),
        mountingType:
          raw.mountingType === "magnet" || raw.mountingType === "slide"
            ? raw.mountingType
            : "screw",
        materialId:
          typeof raw.materialId === "string"
            ? getMaterial(raw.materialId).id
            : "acrylic-clear",
      };
    });
  } else if (candidate.panelEnabled === false) {
    panelPlacements = [];
  } else {
    const face = isEnclosureFace(candidate.panelFace) ? candidate.panelFace : "top";
    panelPlacements = [
      {
        ...createPanelPlacement(dimensionSource, "panel-1", face),
        offsetU: finiteOr(candidate.panelOffsetU, 0),
        offsetV: finiteOr(candidate.panelOffsetV, 0),
        thickness: finiteOr(candidate.panelThickness, 2),
        mountingType:
          candidate.panelMountingType === "magnet" ||
          candidate.panelMountingType === "slide"
            ? candidate.panelMountingType
            : "screw",
        materialId:
          typeof candidate.panelMaterialId === "string"
            ? getMaterial(candidate.panelMaterialId).id
            : "acrylic-clear",
      },
    ];
  }

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
        panelId:
          raw.surface === "panel"
            ? panelPlacements.some((panel) => panel.id === raw.panelId)
              ? raw.panelId ?? null
              : panelPlacements[0]?.id ?? null
            : null,
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

  let antennaPlacements: AntennaPlacement[];
  if (Array.isArray(candidate.antennaPlacements)) {
    antennaPlacements = candidate.antennaPlacements.map((placement, index) => {
      const raw =
        placement && typeof placement === "object"
          ? (placement as Partial<AntennaPlacement>)
          : ({} as Partial<AntennaPlacement>);
      const definition = getAntennaDefinition(
        typeof raw.definitionId === "string"
          ? raw.definitionId
          : "sma-bulkhead-whip",
      );
      const surface = isConnectorSurface(raw.surface) ? raw.surface : "back";
      return {
        ...createAntennaPlacement(
          dimensionSource,
          definition.id,
          typeof raw.id === "string" && raw.id ? raw.id : `antenna-${index + 1}`,
          surface,
        ),
        panelId:
          surface === "panel"
            ? panelPlacements.some((panel) => panel.id === raw.panelId)
              ? raw.panelId ?? null
              : panelPlacements[0]?.id ?? null
            : null,
        offsetU: finiteOr(raw.offsetU, 0),
        offsetV: finiteOr(raw.offsetV, 0),
        rotation: isPlacementRotation(raw.rotation) ? raw.rotation : 0,
        cutoutDiameter: Math.max(
          0,
          finiteOr(
            raw.cutoutDiameter,
            definition.enclosureCutout?.diameter ?? 0,
          ),
        ),
      };
    });
  } else if (candidate.antennaEnabled) {
    const definition = getAntennaDefinition(
      candidate.antennaDefinitionId ?? "sma-bulkhead-whip",
    );
    antennaPlacements = [
      {
        ...createAntennaPlacement(
          dimensionSource,
          definition.id,
          "antenna-1",
        ),
        offsetU: finiteOr(candidate.antennaOffset, 20),
      },
    ];
  } else {
    antennaPlacements = [];
  }

  const normalized = {
    ...DEFAULT_PARAMETERS,
    ...candidate,
    panelPlacements,
    connectorPlacements,
    antennaPlacements,
  } as DesignerParameters & Record<string, unknown>;
  for (const key of [
    "typeCPortEnabled",
    "connectorDefinitionId",
    "typeCPortWidth",
    "typeCPortHeight",
    "typeCPortOffset",
    "panelEnabled",
    "panelMaterialId",
    "panelThickness",
    "panelMountingType",
    "panelFace",
    "panelOffsetU",
    "panelOffsetV",
    "antennaEnabled",
    "antennaDefinitionId",
    "antennaOffset",
  ]) {
    delete normalized[key];
  }
  return constrainSurfacePlacements(
    normalized,
    deriveEnclosureDimensions(normalized),
  );
}

export function validateDesign(
  parameters: DesignerParameters,
  pcbReference: PcbReference | null = null,
): ValidationIssue[] {
  const material = getMaterial(parameters.shellMaterialId);
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

  for (const [index, panel] of parameters.panelPlacements.entries()) {
    const panelMaterial = getMaterial(panel.materialId);
    if (panel.thickness < panelMaterial.minWall) {
      issues.push({
        id: `panel-thickness-${panel.id}`,
        level: "error",
        title: `面板 ${index + 1} 厚度不足`,
        detail: `${panelMaterial.shortName} 建议至少 ${panelMaterial.minWall.toFixed(1)} mm`,
        part: "panel",
      });
    }
    const [surfaceWidth, surfaceHeight] = getFaceSize(
      panel.face,
      parameters,
      dimensions,
    );
    if (
      Math.abs(panel.offsetU) + panel.width / 2 >
        surfaceWidth / 2 - 2 ||
      Math.abs(panel.offsetV) + panel.height / 2 >
        surfaceHeight / 2 - 2
    ) {
      issues.push({
        id: `panel-face-bounds-${panel.id}`,
        level: "error",
        title: `面板 ${index + 1} 超出安装面`,
        detail: "减小面板偏移，确保面板边缘完整落在所选壳体表面",
        part: "panel",
      });
    }
  }

  for (let first = 0; first < parameters.panelPlacements.length; first += 1) {
    const firstPanel = parameters.panelPlacements[first];
    for (
      let second = first + 1;
      second < parameters.panelPlacements.length;
      second += 1
    ) {
      const secondPanel = parameters.panelPlacements[second];
      if (firstPanel.face !== secondPanel.face) continue;
      if (
        Math.abs(firstPanel.offsetU - secondPanel.offsetU) <
          (firstPanel.width + secondPanel.width) / 2 + 2 &&
        Math.abs(firstPanel.offsetV - secondPanel.offsetV) <
          (firstPanel.height + secondPanel.height) / 2 + 2
      ) {
        issues.push({
          id: `panel-overlap-${firstPanel.id}-${secondPanel.id}`,
          level: "error",
          title: "面板开窗相互重叠",
          detail: "移动或缩小其中一个面板，至少保留 2 mm 壳体材料",
          part: "panel",
        });
      }
    }
  }

  for (const [index, placement] of parameters.connectorPlacements.entries()) {
    const connector = getConnectorDefinition(placement.definitionId);
    const targetPanel =
      placement.surface === "panel"
        ? parameters.panelPlacements.find((panel) => panel.id === placement.panelId)
        : null;
    if (placement.surface === "panel" && !targetPanel) {
      issues.push({
        id: `connector-panel-disabled-${placement.id}`,
        level: "error",
        title: `${connector.name}缺少安装面板`,
        detail: "选择一个现有面板，或将接口改放到壳体表面",
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

    if (placement.surface !== "panel") {
      for (const panel of parameters.panelPlacements) {
        if (
          placement.surface === panel.face &&
          Math.abs(placement.offsetU - panel.offsetU) <
            (cutoutWidth + panel.width) / 2 &&
          Math.abs(placement.offsetV - panel.offsetV) <
            (cutoutHeight + panel.height) / 2
        ) {
          issues.push({
            id: `connector-panel-overlap-${placement.id}-${panel.id}`,
            level: "error",
            title: `${connector.name}与面板区域重叠`,
            detail: "将接口目标改为对应面板，或移动到面板区域之外",
            part: "connector",
          });
        }
      }
    }
  }

  for (let first = 0; first < parameters.connectorPlacements.length; first += 1) {
    const firstPlacement = parameters.connectorPlacements[first];
    const firstFace = resolveConnectorFace(firstPlacement, parameters);
    const [firstWidth, firstHeight] = getRotatedCutoutSize(firstPlacement);
    const firstPanel =
      firstPlacement.surface === "panel"
        ? getPanelPlacement(parameters, firstPlacement.panelId)
        : null;
    const firstU = firstPlacement.offsetU + (firstPanel?.offsetU ?? 0);
    const firstV = firstPlacement.offsetV + (firstPanel?.offsetV ?? 0);
    for (
      let second = first + 1;
      second < parameters.connectorPlacements.length;
      second += 1
    ) {
      const secondPlacement = parameters.connectorPlacements[second];
      if (resolveConnectorFace(secondPlacement, parameters) !== firstFace) continue;
      const [secondWidth, secondHeight] = getRotatedCutoutSize(secondPlacement);
      const secondPanel =
        secondPlacement.surface === "panel"
          ? getPanelPlacement(parameters, secondPlacement.panelId)
          : null;
      const secondU = secondPlacement.offsetU + (secondPanel?.offsetU ?? 0);
      const secondV = secondPlacement.offsetV + (secondPanel?.offsetV ?? 0);
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

  for (const [index, placement] of parameters.antennaPlacements.entries()) {
    const antenna = getAntennaDefinition(placement.definitionId);
    const targetPanel =
      placement.surface === "panel"
        ? getPanelPlacement(parameters, placement.panelId)
        : null;
    if (placement.surface === "panel" && !targetPanel) {
      issues.push({
        id: `antenna-panel-missing-${placement.id}`,
        level: "error",
        title: `${antenna.name}缺少安装面板`,
        detail: "选择一个现有面板，或将天线改放到壳体表面",
        part: "antenna",
      });
      continue;
    }
    const [surfaceWidth, surfaceHeight] = getAntennaSurfaceSize(
      placement,
      parameters,
      dimensions,
    );
    const [mountingWidth, mountingHeight] = getAntennaMountingSize(placement);
    const edgeMargin = placement.surface === "panel"
      ? 2
      : Math.max(2, parameters.wallThickness * 2);
    if (
      surfaceWidth / 2 - Math.abs(placement.offsetU) - mountingWidth / 2 <
        edgeMargin ||
      surfaceHeight / 2 - Math.abs(placement.offsetV) - mountingHeight / 2 <
        edgeMargin
    ) {
      issues.push({
        id: `antenna-edge-distance-${placement.id}`,
        level: "error",
        title: `${antenna.name}超出安全放置区域`,
        detail: `天线 ${index + 1} 距安装面边缘至少保留 ${edgeMargin.toFixed(1)} mm`,
        part: "antenna",
      });
    }

    if (placement.surface !== "panel") {
      for (const panel of parameters.panelPlacements) {
        if (
          placement.surface === panel.face &&
          Math.abs(placement.offsetU - panel.offsetU) <
            (mountingWidth + panel.width) / 2 &&
          Math.abs(placement.offsetV - panel.offsetV) <
            (mountingHeight + panel.height) / 2
        ) {
          issues.push({
            id: `antenna-panel-overlap-${placement.id}-${panel.id}`,
            level: "error",
            title: `${antenna.name}与面板区域重叠`,
            detail: "将天线目标改为对应面板，或移动到面板区域之外",
            part: "antenna",
          });
        }
      }
    }
  }

  for (let first = 0; first < parameters.antennaPlacements.length; first += 1) {
    const firstPlacement = parameters.antennaPlacements[first];
    const firstPanel =
      firstPlacement.surface === "panel"
        ? getPanelPlacement(parameters, firstPlacement.panelId)
        : null;
    if (firstPlacement.surface === "panel" && !firstPanel) continue;
    const firstFace = resolveAntennaFace(firstPlacement, parameters);
    const [firstWidth, firstHeight] = getAntennaMountingSize(firstPlacement);
    const firstU = firstPlacement.offsetU + (firstPanel?.offsetU ?? 0);
    const firstV = firstPlacement.offsetV + (firstPanel?.offsetV ?? 0);
    for (
      let second = first + 1;
      second < parameters.antennaPlacements.length;
      second += 1
    ) {
      const secondPlacement = parameters.antennaPlacements[second];
      const secondPanel =
        secondPlacement.surface === "panel"
          ? getPanelPlacement(parameters, secondPlacement.panelId)
          : null;
      if (secondPlacement.surface === "panel" && !secondPanel) continue;
      if (resolveAntennaFace(secondPlacement, parameters) !== firstFace) continue;
      const [secondWidth, secondHeight] = getAntennaMountingSize(secondPlacement);
      const secondU = secondPlacement.offsetU + (secondPanel?.offsetU ?? 0);
      const secondV = secondPlacement.offsetV + (secondPanel?.offsetV ?? 0);
      if (
        Math.abs(firstU - secondU) < (firstWidth + secondWidth) / 2 + 2 &&
        Math.abs(firstV - secondV) < (firstHeight + secondHeight) / 2 + 2
      ) {
        issues.push({
          id: `antenna-overlap-${firstPlacement.id}-${secondPlacement.id}`,
          level: "error",
          title: "天线安装区域相互重叠",
          detail: "移动其中一个天线，至少保留 2 mm 壳体材料和装配空间",
          part: "antenna",
        });
      }
    }
  }

  for (const antennaPlacement of parameters.antennaPlacements) {
    const antennaPanel =
      antennaPlacement.surface === "panel"
        ? getPanelPlacement(parameters, antennaPlacement.panelId)
        : null;
    if (antennaPlacement.surface === "panel" && !antennaPanel) continue;
    const antennaFace = resolveAntennaFace(antennaPlacement, parameters);
    const [antennaWidth, antennaHeight] =
      getAntennaMountingSize(antennaPlacement);
    const antennaU = antennaPlacement.offsetU + (antennaPanel?.offsetU ?? 0);
    const antennaV = antennaPlacement.offsetV + (antennaPanel?.offsetV ?? 0);
    for (const connectorPlacement of parameters.connectorPlacements) {
      const connectorPanel =
        connectorPlacement.surface === "panel"
          ? getPanelPlacement(parameters, connectorPlacement.panelId)
          : null;
      if (connectorPlacement.surface === "panel" && !connectorPanel) continue;
      if (resolveConnectorFace(connectorPlacement, parameters) !== antennaFace) {
        continue;
      }
      const [connectorWidth, connectorHeight] =
        getRotatedCutoutSize(connectorPlacement);
      const connectorU =
        connectorPlacement.offsetU + (connectorPanel?.offsetU ?? 0);
      const connectorV =
        connectorPlacement.offsetV + (connectorPanel?.offsetV ?? 0);
      if (
        Math.abs(antennaU - connectorU) <
          (antennaWidth + connectorWidth) / 2 + 2 &&
        Math.abs(antennaV - connectorV) <
          (antennaHeight + connectorHeight) / 2 + 2
      ) {
        issues.push({
          id: `antenna-connector-overlap-${antennaPlacement.id}-${connectorPlacement.id}`,
          level: "error",
          title: "天线与接口安装区域重叠",
          detail: "移动天线或接口，至少保留 2 mm 壳体材料和装配空间",
          part: "antenna",
        });
      }
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
    ventRows: [1, 12],
    ventColumns: [1, 16],
    ventHoleSize: [1.5, 12],
    ventSpacing: [0.8, 12],
  };
  const range = ranges[key];
  if (!range) return value;
  return Math.min(range[1], Math.max(range[0], value));
}
