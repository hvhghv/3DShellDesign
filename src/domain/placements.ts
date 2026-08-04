import type {
  ConnectorPlacement,
  ConnectorSurface,
  DesignerParameters,
  EnclosureDimensions,
  EnclosureFace,
  PlacementRotation,
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
  surface: ConnectorSurface,
  parameters: DesignerParameters,
): string {
  return surface === "panel"
    ? `可更换面板（${getFaceLabel(parameters.panelFace)}）`
    : getFaceLabel(surface);
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
  return placement.surface === "panel" ? parameters.panelFace : placement.surface;
}

export function getConnectorSurfaceSize(
  placement: ConnectorPlacement,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): readonly [number, number] {
  return placement.surface === "panel"
    ? [dimensions.panelLength, dimensions.panelWidth]
    : getFaceSize(placement.surface, parameters, dimensions);
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
    offsetU: 0,
    offsetV: surface === "front" ? -3 : 0,
    rotation: 0,
    cutoutWidth: definition.panelCutout.width,
    cutoutHeight: definition.panelCutout.height,
  };
}
