import { getMaterial } from "./materials";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  supportsDisplayScrewMounting,
} from "../libraries/components";
import { getVentPatternPoints } from "./patterns";
import { MAGNET_GEOMETRY } from "./magnetSupport";
import {
  constrainBatteryCompartment,
  createBatteryCompartment,
  getBatteryMinimumDimensions,
  getBatteryPreset,
} from "./batteries";
import {
  isPcbInsertionSide,
  isPcbMountingType,
  isPcbRailAxis,
} from "./pcbMounting";
import {
  getPcbRailEntryFace,
  synchronizePcbRailDirection,
} from "./pcbRailDirection";
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
import { normalizeRemovableFaces } from "./removableFaces";
import { DEFAULT_SCREW_HEAD_RECESS_DEPTH } from "./screwRecess";
import type {
  AntennaPlacement,
  BatteryCompartmentPlacement,
  ConnectorPlacement,
  CustomComponentPlacement,
  ClosureType,
  DesignerParameters,
  DisplayMountingType,
  EnclosureDimensions,
  PcbReference,
  PcbReferencePlacement,
  PanelPlacement,
  PlacementRotation,
  ValidationIssue,
} from "./model";

const CLOSURE_TYPES: readonly ClosureType[] = [
  "screw",
  "magnet",
  "snap",
  "latch",
  "spring-latch",
  "slide",
  "hinge",
  "pin",
];

function isClosureType(value: unknown): value is ClosureType {
  return CLOSURE_TYPES.some((type) => type === value);
}

const DISPLAY_MOUNTING_TYPES: readonly DisplayMountingType[] = [
  "none",
  "screw",
];

function isDisplayMountingType(value: unknown): value is DisplayMountingType {
  return DISPLAY_MOUNTING_TYPES.some((type) => type === value);
}

export const DEFAULT_PARAMETERS: DesignerParameters = {
  enclosureTemplateId: "rounded-split",
  parametricPcbEnabled: true,
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
  pcbOffsetX: 0,
  pcbOffsetZ: 0,
  pcbElevation: 0,
  pcbMountingType: "screw",
  pcbRailClearance: 0.4,
  pcbRailWidth: 3,
  pcbRailHeight: 2.2,
  pcbStopWidth: 4,
  pcbElasticBandWidth: 3,
  pcbRailAxis: "z",
  pcbInsertionSide: "right",
  pcbRailEntryFace: "front",
  lidFace: "top",
  removableFaces: ["top"],
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
      insetDepth: 0,
      cornerRadius: 3.2,
      borderWidth: 2,
      mountingInsetX: 5,
      mountingInsetY: 5,
      screwHeadRecessEnabled: false,
      screwHeadRecessDepth: DEFAULT_SCREW_HEAD_RECESS_DEPTH,
      mountingType: "screw",
      materialId: "acrylic-clear",
    },
  ],
  connectorPlacements: [
    createConnectorPlacement("usb-c-receptacle", "connector-1"),
  ],
  antennaPlacements: [],
  customComponents: [],
  batteryCompartments: [],
  pcbReferences: [],
  closureFastenerId: "m3-self-tapping",
  closureScrewHeadRecessEnabled: false,
  closureScrewHeadRecessDepth: DEFAULT_SCREW_HEAD_RECESS_DEPTH,
  ventPattern: "none",
  ventRows: 3,
  ventColumns: 5,
  ventHoleSize: 4,
  ventSpacing: 2,
};

export const PANEL_SCREW_CLEARANCE_RADIUS = 1.6;
export const PANEL_SCREW_HEAD_RADIUS = 2.5;
export const PANEL_SCREW_PILOT_RADIUS = 1.15;
export const PANEL_SCREW_TAB_RADIUS = 4;

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
      parameters.pcbElevation -
      parameters.pcbThickness,
    mountingInset: Math.max(4, parameters.boardClearance + 1.5),
  };
}

function rotateLocalPoint(
  u: number,
  v: number,
  rotation: PlacementRotation,
): readonly [number, number] {
  if (rotation === 90) return [-v, u];
  if (rotation === 180) return [-u, -v];
  if (rotation === 270) return [v, -u];
  return [u, v];
}

function getDisplayMountingPoints(
  pcbWidth: number,
  pcbHeight: number,
): ReadonlyArray<readonly [number, number]> {
  const inset = Math.min(3, Math.max(1.4, Math.min(pcbWidth, pcbHeight) * 0.18));
  const u = Math.max(1.2, pcbWidth / 2 - inset);
  const v = Math.max(1.2, pcbHeight / 2 - inset);
  return [
    [-u, -v],
    [u, -v],
    [-u, v],
    [u, v],
  ];
}

export function getPanelMountingPoints(
  panel: PanelPlacement,
): Array<readonly [number, number]> {
  const x = Math.max(1.5, panel.width / 2 - panel.mountingInsetX);
  const y = Math.max(1.5, panel.height / 2 - panel.mountingInsetY);
  return [
    [-x, -y],
    [x, -y],
    [-x, y],
    [x, y],
  ];
}

interface LegacyDesignerParameters extends Partial<DesignerParameters> {
  parametricPcbEnabled?: boolean;
  typeCPortEnabled?: boolean;
  connectorDefinitionId?: string;
  typeCPortWidth?: number;
  typeCPortHeight?: number;
  typeCPortOffset?: number;
  panelEnabled?: boolean;
  panelMaterialId?: string;
  panelThickness?: number;
  panelMountingType?: "screw" | "magnet" | "snap" | "slide";
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
    pcbElevation: finiteOr(candidate.pcbElevation, DEFAULT_PARAMETERS.pcbElevation),
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
        insetDepth: Math.max(0, finiteOr(raw.insetDepth, 0)),
        cornerRadius: Math.max(0, finiteOr(raw.cornerRadius, 3.2)),
        borderWidth: Math.max(0.8, finiteOr(raw.borderWidth, 2)),
        mountingInsetX: Math.max(2, finiteOr(raw.mountingInsetX, 5)),
        mountingInsetY: Math.max(2, finiteOr(raw.mountingInsetY, 5)),
        screwHeadRecessEnabled: raw.screwHeadRecessEnabled === true,
        screwHeadRecessDepth: Math.max(
          0.1,
          finiteOr(
            raw.screwHeadRecessDepth,
            DEFAULT_SCREW_HEAD_RECESS_DEPTH,
          ),
        ),
        mountingType:
          raw.mountingType === "magnet" ||
          raw.mountingType === "snap" ||
          raw.mountingType === "slide"
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
        insetDepth: 0,
        cornerRadius: 3.2,
        borderWidth: 2,
        mountingInsetX: 5,
        mountingInsetY: 5,
        screwHeadRecessEnabled: false,
        screwHeadRecessDepth: DEFAULT_SCREW_HEAD_RECESS_DEPTH,
        mountingType:
          candidate.panelMountingType === "magnet" ||
          candidate.panelMountingType === "snap" ||
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
      const surface = isConnectorSurface(raw.surface) ? raw.surface : "front";
      const panelId =
        surface === "panel"
          ? panelPlacements.some((panel) => panel.id === raw.panelId)
            ? raw.panelId ?? null
            : panelPlacements[0]?.id ?? null
          : null;
      const displayMountingType =
        definition.displaySpec &&
        isDisplayMountingType(raw.displayMountingType) &&
        raw.displayMountingType === "screw" &&
        surface === "panel" &&
        panelId !== null &&
        supportsDisplayScrewMounting(definition)
          ? "screw"
          : definition.displaySpec
            ? "none"
            : undefined;
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `connector-${index + 1}`,
        definitionId: definition.id,
        surface,
        panelId,
        offsetU: finiteOr(raw.offsetU, 0),
        offsetV: finiteOr(raw.offsetV, -3),
        rotation: isPlacementRotation(raw.rotation) ? raw.rotation : 0,
        cutoutWidth: finiteOr(raw.cutoutWidth, definition.panelCutout.width),
        cutoutHeight: finiteOr(raw.cutoutHeight, definition.panelCutout.height),
        displayMountingType,
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

  const customComponents: CustomComponentPlacement[] = Array.isArray(
    candidate.customComponents,
  )
    ? candidate.customComponents.map((component, index) => {
        const raw =
          component && typeof component === "object"
            ? (component as Partial<CustomComponentPlacement>)
            : {};
        const shape =
          raw.shape === "cylinder" || raw.shape === "model" ? raw.shape : "box";
        return {
          id:
            typeof raw.id === "string" && raw.id
              ? raw.id
              : `custom-${index + 1}`,
          name:
            typeof raw.name === "string" && raw.name
              ? raw.name
              : `自定义组件 ${index + 1}`,
          shape,
          width: Math.max(0.5, finiteOr(raw.width, 12)),
          height: Math.max(0.5, finiteOr(raw.height, 8)),
          depth: Math.max(0.5, finiteOr(raw.depth, shape === "cylinder" ? 12 : 10)),
          positionX: finiteOr(raw.positionX, 0),
          positionY: finiteOr(
            raw.positionY,
            dimensionSource.bottomThickness +
              dimensionSource.standoffHeight +
              dimensionSource.pcbThickness +
              4,
          ),
          positionZ: finiteOr(raw.positionZ, 0),
          rotationX: finiteOr(raw.rotationX, 0),
          rotationY: finiteOr(raw.rotationY, 0),
          rotationZ: finiteOr(raw.rotationZ, 0),
          color:
            typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)
              ? raw.color
              : "#4f7f6a",
          sourceName:
            typeof raw.sourceName === "string" && raw.sourceName
              ? raw.sourceName
              : null,
        };
      })
    : [];

  const pcbReferences: PcbReferencePlacement[] = Array.isArray(
    candidate.pcbReferences,
  )
    ? candidate.pcbReferences.flatMap((placement, index) => {
        if (!placement || typeof placement !== "object") return [];
        const raw = placement as Partial<PcbReferencePlacement>;
        const reference = raw.reference;
        if (
          !reference ||
          typeof reference !== "object" ||
          typeof reference.sourceName !== "string" ||
          !reference.bounds
        ) {
          return [];
        }
        return [{
          id:
            typeof raw.id === "string" && raw.id ? raw.id : `pcb-${index + 1}`,
          reference,
          offsetX: finiteOr(raw.offsetX, 0),
          offsetZ: finiteOr(raw.offsetZ, 0),
          elevation: Math.max(0, finiteOr(raw.elevation, 0)),
          rotation: isPlacementRotation(raw.rotation) ? raw.rotation : 0,
        }];
      })
    : [];

  const batteryCompartments: BatteryCompartmentPlacement[] = Array.isArray(
    candidate.batteryCompartments,
  )
    ? candidate.batteryCompartments.map((compartment, index) => {
        const raw =
          compartment && typeof compartment === "object"
            ? (compartment as Partial<BatteryCompartmentPlacement>)
            : {};
        const rawFace = (raw as { face?: unknown }).face;
        const fallback = createBatteryCompartment(
          typeof raw.id === "string" && raw.id
            ? raw.id
            : `battery-${index + 1}`,
          raw.preset === "aaa" ||
            raw.preset === "aa" ||
            raw.preset === "18650" ||
            raw.preset === "lipo" ||
            raw.preset === "custom"
            ? raw.preset
            : "aa",
        );
        return constrainBatteryCompartment({
          ...fallback,
          ...raw,
          id: fallback.id,
          preset: fallback.preset,
          face:
            rawFace === "lid"
              ? "top"
              : rawFace === "top" ||
                  rawFace === "bottom" ||
                  rawFace === "front" ||
                  rawFace === "back" ||
                  rawFace === "left" ||
                  rawFace === "right"
                ? rawFace
                : fallback.face,
          retentionType:
            raw.retentionType === "elastic" || raw.retentionType === "clip"
              ? raw.retentionType
              : fallback.retentionType,
          insertionSide:
            raw.insertionSide === "left" || raw.insertionSide === "right"
              ? raw.insertionSide
              : fallback.insertionSide,
          cellCount: finiteOr(raw.cellCount, fallback.cellCount),
          width: finiteOr(raw.width, fallback.width),
          depth: finiteOr(raw.depth, fallback.depth),
          height: finiteOr(raw.height, fallback.height),
          wallThickness: finiteOr(raw.wallThickness, fallback.wallThickness),
          clearance: finiteOr(raw.clearance, fallback.clearance),
          offsetX: finiteOr(raw.offsetX, 0),
          offsetZ: finiteOr(raw.offsetZ, 0),
          rotation: isPlacementRotation(raw.rotation) ? raw.rotation : 0,
        });
      })
    : [];

  const lidFace = isEnclosureFace(candidate.lidFace)
    ? candidate.lidFace
    : DEFAULT_PARAMETERS.lidFace;
  const removableFaces = normalizeRemovableFaces(
    candidate.removableFaces,
    lidFace,
  );
  const pcbRailAxis = isPcbRailAxis(candidate.pcbRailAxis)
    ? candidate.pcbRailAxis
    : DEFAULT_PARAMETERS.pcbRailAxis;
  const pcbInsertionSide = isPcbInsertionSide(candidate.pcbInsertionSide)
    ? candidate.pcbInsertionSide
    : DEFAULT_PARAMETERS.pcbInsertionSide;

  const normalized = {
    ...DEFAULT_PARAMETERS,
    ...candidate,
    panelPlacements,
    connectorPlacements,
    antennaPlacements,
    customComponents,
    batteryCompartments,
    pcbReferences,
    parametricPcbEnabled:
      typeof candidate.parametricPcbEnabled === "boolean"
        ? candidate.parametricPcbEnabled
        : pcbReferences.length > 0
          ? false
        : DEFAULT_PARAMETERS.parametricPcbEnabled,
    closureType: isClosureType(candidate.closureType)
      ? candidate.closureType
      : DEFAULT_PARAMETERS.closureType,
    pcbMountingType: isPcbMountingType(candidate.pcbMountingType)
      ? candidate.pcbMountingType
      : DEFAULT_PARAMETERS.pcbMountingType,
    pcbOffsetX: Math.min(
      500,
      Math.max(-500, finiteOr(candidate.pcbOffsetX, DEFAULT_PARAMETERS.pcbOffsetX)),
    ),
    pcbOffsetZ: Math.min(
      500,
      Math.max(-500, finiteOr(candidate.pcbOffsetZ, DEFAULT_PARAMETERS.pcbOffsetZ)),
    ),
    pcbElevation: Math.min(
      300,
      Math.max(
        -dimensionSource.standoffHeight,
        finiteOr(candidate.pcbElevation, DEFAULT_PARAMETERS.pcbElevation),
      ),
    ),
    pcbRailClearance: Math.min(
      2,
      Math.max(0.1, finiteOr(candidate.pcbRailClearance, DEFAULT_PARAMETERS.pcbRailClearance)),
    ),
    pcbRailWidth: Math.min(
      8,
      Math.max(1.2, finiteOr(candidate.pcbRailWidth, DEFAULT_PARAMETERS.pcbRailWidth)),
    ),
    pcbRailHeight: Math.min(
      6,
      Math.max(1, finiteOr(candidate.pcbRailHeight, DEFAULT_PARAMETERS.pcbRailHeight)),
    ),
    pcbStopWidth: Math.min(
      20,
      Math.max(0.8, finiteOr(candidate.pcbStopWidth, DEFAULT_PARAMETERS.pcbStopWidth)),
    ),
    pcbElasticBandWidth: Math.min(
      8,
      Math.max(1, finiteOr(candidate.pcbElasticBandWidth, DEFAULT_PARAMETERS.pcbElasticBandWidth)),
    ),
    pcbRailAxis,
    pcbInsertionSide,
    pcbRailEntryFace: isEnclosureFace(candidate.pcbRailEntryFace)
      ? candidate.pcbRailEntryFace
      : getPcbRailEntryFace(pcbRailAxis, pcbInsertionSide),
    lidFace,
    removableFaces,
    closureScrewHeadRecessEnabled:
      candidate.closureScrewHeadRecessEnabled === true,
    closureScrewHeadRecessDepth: Math.max(
      0.1,
      finiteOr(
        candidate.closureScrewHeadRecessDepth,
        DEFAULT_SCREW_HEAD_RECESS_DEPTH,
      ),
    ),
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
  const synchronized = synchronizePcbRailDirection(normalized);
  return constrainSurfacePlacements(
    synchronized,
    deriveEnclosureDimensions(synchronized),
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

  if (parameters.pcbMountingType !== "screw") {
    const railClearance = parameters.pcbRailWidth + 0.4;
    if (parameters.boardClearance < railClearance) {
      issues.push({
        id: "pcb-rail-clearance",
        level: "error",
        title: "PCB 滑槽侵入壳体间隙",
        detail: `滑槽固定需要板边间隙至少 ${railClearance.toFixed(1)} mm，当前为 ${parameters.boardClearance.toFixed(1)} mm`,
        part: "pcb",
      });
    }
    if (parameters.standoffHeight < 1.2) {
      issues.push({
        id: "pcb-rail-floor-gap",
        level: "warning",
        title: "PCB 滑槽底部空间偏小",
        detail: "滑槽需要 PCB 基准高度至少 1.2 mm 才能形成下托边和装配余量",
        part: "pcb",
      });
    }
  }

  if (
    (parameters.closureType === "snap" ||
      parameters.closureType === "latch" ||
      parameters.closureType === "spring-latch") &&
    !material.supportsSnapFit
  ) {
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
    if (panel.mountingType === "snap" && !panelMaterial.supportsSnapFit) {
      issues.push({
        id: `panel-snap-material-${panel.id}`,
        level: "warning",
        title: `面板 ${index + 1} 材料不适合弹性卡扣`,
        detail: `${panelMaterial.shortName} 缺少反复弯曲能力，建议改用 PETG/PA 或磁吸固定`,
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

    if (
      placement.displayMountingType === "screw" &&
      targetPanel &&
      connector.displaySpec &&
      supportsDisplayScrewMounting(connector)
    ) {
      const bossRadius = 2.55;
      const safeU = targetPanel.width / 2 - bossRadius - 0.4;
      const safeV = targetPanel.height / 2 - bossRadius - 0.4;
      const mountingPoints = getDisplayMountingPoints(
        connector.displaySpec.pcbWidth,
        connector.displaySpec.pcbHeight,
      );
      const outsidePanel = mountingPoints.some(([localU, localV]) => {
        const [rotatedU, rotatedV] = rotateLocalPoint(
          localU,
          localV,
          placement.rotation,
        );
        return (
          Math.abs(placement.offsetU + rotatedU) > safeU ||
          Math.abs(placement.offsetV + rotatedV) > safeV
        );
      });
      if (outsidePanel) {
        issues.push({
          id: `display-screw-mount-outside-panel-${placement.id}`,
          level: "error",
          title: `${connector.name}螺丝固定点超出面板`,
          detail: "扩大面板、移动显示屏，或将显示屏固定方式改为无",
          part: "connector",
        });
      }
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

  const referencePlacements =
    parameters.pcbReferences.length > 0
      ? parameters.pcbReferences
      : pcbReference
        ? [{
            id: "pcb-legacy",
            reference: pcbReference,
            offsetX: 0,
            offsetZ: 0,
            elevation: 0,
            rotation: 0 as const,
          }]
        : [];
  if (referencePlacements.length === 0 && parameters.parametricPcbEnabled) {
    const boardBottom =
      parameters.bottomThickness +
      parameters.standoffHeight +
      parameters.pcbElevation;
    const boardTop = boardBottom + parameters.pcbThickness + parameters.componentHeight;
    if (
      Math.abs(parameters.pcbOffsetX) + parameters.pcbLength / 2 >
        dimensions.insideLength / 2 ||
      Math.abs(parameters.pcbOffsetZ) + parameters.pcbWidth / 2 >
        dimensions.insideWidth / 2 ||
      boardBottom < parameters.bottomThickness - 0.01 ||
      boardTop > parameters.baseHeight
    ) {
      issues.push({
        id: "pcb-parametric-outside",
        level: "error",
        title: "参数 PCB 超出壳体内部",
        detail: "调整 PCB X/Y/Z 位置、板边间隙、主体高度或元件高度",
        part: "pcb",
      });
    }
  }
  for (const placement of referencePlacements) {
    const reference = placement.reference;
    if (reference.unsupportedOutlineElements > 0) {
      issues.push({
        id: `pcb-outline-partial-${placement.id}`,
        level: "warning",
        title: "PCB 板框包含未支持图元",
        detail: `${reference.unsupportedOutlineElements} 段仅计入已识别边界，请核对外形尺寸`,
        part: "pcb",
      });
    }
    const rawLength = reference.bounds.maxX - reference.bounds.minX;
    const rawWidth = reference.bounds.maxY - reference.bounds.minY;
    const quarterTurn = placement.rotation === 90 || placement.rotation === 270;
    const length = quarterTurn ? rawWidth : rawLength;
    const width = quarterTurn ? rawLength : rawWidth;
    if (
      Math.abs(placement.offsetX) + length / 2 > dimensions.insideLength / 2 ||
      Math.abs(placement.offsetZ) + width / 2 > dimensions.insideWidth / 2
    ) {
      issues.push({
        id: `pcb-outside-${placement.id}`,
        level: "error",
        title: "PCB 超出壳体内部",
        detail: "调整该 PCB 的 X/Z 偏移、旋转或增大壳体尺寸",
        part: "pcb",
      });
    }
  }

  for (const component of parameters.customComponents) {
    if (
      Math.abs(component.positionX) + component.width / 2 >
        dimensions.insideLength / 2 ||
      Math.abs(component.positionZ) + component.depth / 2 >
        dimensions.insideWidth / 2 ||
      component.positionY - component.height / 2 < parameters.bottomThickness ||
      component.positionY + component.height / 2 > parameters.baseHeight
    ) {
      issues.push({
        id: `custom-outside-${component.id}`,
        level: "warning",
        title: "自定义组件超出壳体内部",
        detail: "调整组件位置或壳体尺寸，并复核旋转后的实际包络",
        part: "custom",
      });
    }
  }

  for (const compartment of parameters.batteryCompartments) {
    const quarterTurn =
      compartment.rotation === 90 || compartment.rotation === 270;
    const width = quarterTurn ? compartment.depth : compartment.width;
    const depth = quarterTurn ? compartment.width : compartment.depth;
    const preset = getBatteryPreset(compartment.preset);
    const [requiredWidth, requiredDepth] =
      getBatteryMinimumDimensions(compartment);
    if (
      compartment.width + 0.01 < requiredWidth ||
      compartment.depth + 0.01 < requiredDepth
    ) {
      issues.push({
        id: `battery-fit-${compartment.id}`,
        level: "error",
        title: "电池仓内部尺寸不足",
        detail: "增大仓体长度、宽度或减少槽位，需保留电池间隙和端部接触片空间",
        part: "battery",
      });
    }
    const compartmentHeight = Math.max(compartment.height, preset.cellHeight + 0.2);
    const sideMounted =
      compartment.face === "front" ||
      compartment.face === "back" ||
      compartment.face === "left" ||
      compartment.face === "right";
    const surfaceWidth =
      compartment.face === "left" || compartment.face === "right"
        ? dimensions.insideWidth
        : dimensions.insideLength;
    const surfaceHeight =
      compartment.face === "top" || compartment.face === "bottom"
        ? dimensions.insideWidth
        : Math.max(2, parameters.baseHeight - parameters.bottomThickness);
    const outsideFootprint =
      Math.abs(compartment.offsetX) + width / 2 > surfaceWidth / 2 ||
      Math.abs(compartment.offsetZ) + depth / 2 > surfaceHeight / 2;
    const bottomHeightCollision =
      compartment.face === "bottom" &&
      parameters.bottomThickness + compartmentHeight > parameters.baseHeight;
    const componentTop =
      parameters.bottomThickness +
      parameters.standoffHeight +
      parameters.pcbElevation +
      parameters.pcbThickness +
      parameters.componentHeight;
    const lidHeightCollision =
      compartment.face === "top" &&
      compartmentHeight + 0.5 > parameters.baseHeight - componentTop;
    const sideIntrusionCollision =
      sideMounted &&
      compartmentHeight + 0.5 >
        (compartment.face === "front" || compartment.face === "back"
          ? dimensions.insideWidth
          : dimensions.insideLength);
    if (
      outsideFootprint ||
      bottomHeightCollision ||
      lidHeightCollision ||
      sideIntrusionCollision
    ) {
      issues.push({
        id: `battery-outside-${compartment.id}`,
        level: "error",
        title: "电池仓超出壳体内部",
        detail:
          compartment.face === "top" && lidHeightCollision
            ? "顶部电池仓会向下侵入 PCB 或元件高度，增大壳体高度或降低 PCB/元件包络"
            : "调整电池仓偏移、旋转、槽位数量或增大壳体尺寸",
        part: "battery",
      });
    }
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
    pcbOffsetX: [-500, 500],
    pcbOffsetZ: [-500, 500],
    pcbElevation: [-30, 300],
    pcbRailClearance: [0.1, 2],
    pcbRailWidth: [1.2, 8],
    pcbRailHeight: [1, 6],
    pcbStopWidth: [0.8, 20],
    pcbElasticBandWidth: [1, 8],
    lidThickness: [0.8, 8],
    closureScrewHeadRecessDepth: [0.1, 7.6],
    ventRows: [1, 12],
    ventColumns: [1, 16],
    ventHoleSize: [1.5, 12],
    ventSpacing: [0.8, 12],
  };
  const range = ranges[key];
  if (!range) return value;
  return Math.min(range[1], Math.max(range[0], value));
}
