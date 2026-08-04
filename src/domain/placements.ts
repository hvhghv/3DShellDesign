import type {
  ConnectorPlacement,
  ConnectorSurface,
  DesignerParameters,
  EnclosureDimensions,
  EnclosureFace,
  PlacementRotation,
  PanelPlacement,
} from "./model";
import { getConnectorDefinition } from "../libraries/components";

export const ENCLOSURE_FACE_OPTIONS: ReadonlyArray<{
  id: EnclosureFace;
  name: string;
}> = [
  { id: "top", name: "顶盖" },
  { id: "bottom", name: "底板" },
  { id: "front", name: "前壁" },
  { id: "back", name: "后壁" },
  { id: "left", name: "左壁" },
  { id: "right", name: "右壁" },
];

export const PLACEMENT_ROTATIONS: readonly PlacementRotation[] = [0, 90, 180, 270];

export function isEnclosureFace(value: unknown): value is EnclosureFace {
  return ENCLOSURE_FACE_OPTIONS.some((option) => option.id === value);
}

export function isConnectorSurface(value: unknown): value is ConnectorSurface {
  return value === "panel" || isEnclosureFace(value);
}

export function isPlacementRotation(value: unknown): value is PlacementRotation {
  return PLACEMENT_ROTATIONS.some((rotation) => rotation === value);
}

export function getFaceLabel(face: EnclosureFace): string {
  return ENCLOSURE_FACE_OPTIONS.find((option) => option.id === face)?.name ?? "顶盖";
}

export function getConnectorSurfaceLabel(
  placement: ConnectorPlacement,
  parameters: DesignerParameters,
): string {
  if (placement.surface !== "panel") return getFaceLabel(placement.surface);
  const panel = getPanelPlacement(parameters, placement.panelId);
  return panel ? `可更换面板（${getFaceLabel(panel.face)}）` : "可更换面板";
}

export function getPanelPlacement(
  parameters: DesignerParameters,
  panelId: string | null,
): PanelPlacement | null {
  if (panelId) {
    return parameters.panelPlacements.find((panel) => panel.id === panelId) ?? null;
  }
  return parameters.panelPlacements[0] ?? null;
}

export function getPanelLabel(
  panel: PanelPlacement,
  parameters: DesignerParameters,
): string {
  const index = parameters.panelPlacements.findIndex((item) => item.id === panel.id);
  return `面板 ${index >= 0 ? index + 1 : 1}`;
}

export function getFaceSize(
  face: EnclosureFace,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): readonly [number, number] {
  if (face === "top" || face === "bottom") {
    return [dimensions.outsideLength, dimensions.outsideWidth];
  }
  if (face === "front" || face === "back") {
    return [dimensions.outsideLength, parameters.baseHeight];
  }
  return [dimensions.outsideWidth, parameters.baseHeight];
}

export function resolveConnectorFace(
  placement: ConnectorPlacement,
  parameters: DesignerParameters,
): EnclosureFace {
  if (placement.surface !== "panel") return placement.surface;
  return getPanelPlacement(parameters, placement.panelId)?.face ?? "top";
}

export function getConnectorSurfaceSize(
  placement: ConnectorPlacement,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): readonly [number, number] {
  if (placement.surface !== "panel") {
    return getFaceSize(placement.surface, parameters, dimensions);
  }
  const panel = getPanelPlacement(parameters, placement.panelId);
  return panel ? [panel.width, panel.height] : [0, 0];
}

export function getRotatedCutoutSize(
  placement: ConnectorPlacement,
): readonly [number, number] {
  return placement.rotation === 90 || placement.rotation === 270
    ? [placement.cutoutHeight, placement.cutoutWidth]
    : [placement.cutoutWidth, placement.cutoutHeight];
}

export function createConnectorPlacement(
  definitionId: string,
  id: string,
  surface: ConnectorSurface = "front",
): ConnectorPlacement {
  const definition = getConnectorDefinition(definitionId);
  return {
    id,
    definitionId: definition.id,
    surface,
    panelId: null,
    offsetU: 0,
    offsetV: surface === "front" ? -3 : 0,
    rotation: 0,
    cutoutWidth: definition.panelCutout.width,
    cutoutHeight: definition.panelCutout.height,
  };
}

export function getDefaultPanelSize(
  parameters: Pick<
    DesignerParameters,
    "pcbLength" | "pcbWidth" | "boardClearance" | "wallThickness" | "baseHeight"
  >,
  face: EnclosureFace,
): readonly [number, number] {
  const outsideLength =
    parameters.pcbLength + parameters.boardClearance * 2 + parameters.wallThickness * 2;
  const outsideWidth =
    parameters.pcbWidth + parameters.boardClearance * 2 + parameters.wallThickness * 2;
  const surfaceWidth = face === "left" || face === "right" ? outsideWidth : outsideLength;
  const surfaceHeight =
    face === "top" || face === "bottom" ? outsideWidth : parameters.baseHeight;
  return [
    Math.max(6, Math.min(surfaceWidth * 0.58, surfaceWidth - 4)),
    Math.max(6, Math.min(surfaceHeight * 0.52, surfaceHeight - 4)),
  ];
}

export function createPanelPlacement(
  parameters: Pick<
    DesignerParameters,
    "pcbLength" | "pcbWidth" | "boardClearance" | "wallThickness" | "baseHeight"
  >,
  id: string,
  face: EnclosureFace = "top",
): PanelPlacement {
  const [width, height] = getDefaultPanelSize(parameters, face);
  return {
    id,
    face,
    offsetU: 0,
    offsetV: 0,
    width,
    height,
    thickness: 2,
    mountingType: "screw",
    materialId: "acrylic-clear",
  };
}
