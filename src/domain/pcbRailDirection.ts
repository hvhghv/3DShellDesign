import type {
  DesignerParameters,
  EnclosureFace,
  PcbInsertionSide,
  PcbRailAxis,
} from "./model";
import type { PcbMountingEnvelope, PcbRailLayout } from "./pcbMounting";

const ENTRY_FACE_LABELS: Record<EnclosureFace, string> = {
  top: "顶部",
  bottom: "底板",
  front: "前壁",
  back: "后壁",
  left: "左壁",
  right: "右壁",
};

const DIRECTION_CANDIDATES: ReadonlyArray<{
  axis: PcbRailAxis;
  insertionSide: PcbInsertionSide;
}> = [
  { axis: "x", insertionSide: "left" },
  { axis: "x", insertionSide: "right" },
  { axis: "y", insertionSide: "left" },
  { axis: "y", insertionSide: "right" },
  { axis: "z", insertionSide: "left" },
  { axis: "z", insertionSide: "right" },
];

export interface PcbRailDirection {
  axis: PcbRailAxis;
  insertionSide: PcbInsertionSide;
  entryFace: EnclosureFace;
  followsRemovableFace: boolean;
}

function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function getPcbRailEntryFace(
  axis: PcbRailAxis,
  insertionSide: PcbInsertionSide,
  rotation: number = 0,
): EnclosureFace {
  const sign = insertionSide === "right" ? 1 : -1;
  const localX = axis === "x" ? sign : 0;
  const localY = axis === "y" ? sign : 0;
  const localZ = axis === "z" ? sign : 0;
  if (localY !== 0) return localY > 0 ? "top" : "bottom";
  const normalized = normalizeRotation(rotation);
  let worldX = localX;
  let worldZ = localZ;

  if (normalized === 90) {
    worldX = localZ;
    worldZ = -localX;
  } else if (normalized === 180) {
    worldX = -localX;
    worldZ = -localZ;
  } else if (normalized === 270) {
    worldX = -localZ;
    worldZ = localX;
  }

  if (Math.abs(worldX) >= Math.abs(worldZ)) {
    return worldX >= 0 ? "right" : "left";
  }
  return worldZ >= 0 ? "front" : "back";
}

export function getPcbRailDirection(
  parameters: Pick<
    DesignerParameters,
    | "lidFace"
    | "removableFaces"
    | "pcbRailAxis"
    | "pcbInsertionSide"
    | "pcbRailEntryFace"
  >,
  rotation: number = 0,
): PcbRailDirection {
  const configuredDirection = getPcbRailDirectionForEntryFace(
    parameters.pcbRailEntryFace,
    rotation,
  );
  if (configuredDirection) {
    return {
      ...configuredDirection,
      followsRemovableFace: parameters.removableFaces.includes(
        configuredDirection.entryFace,
      ),
    };
  }

  return {
    axis: parameters.pcbRailAxis,
    insertionSide: parameters.pcbInsertionSide,
    entryFace: getPcbRailEntryFace(
      parameters.pcbRailAxis,
      parameters.pcbInsertionSide,
      rotation,
    ),
    followsRemovableFace: false,
  };
}

export function getPcbRailDirectionForEntryFace(
  entryFace: EnclosureFace,
  rotation: number = 0,
): PcbRailDirection | null {
  const match = DIRECTION_CANDIDATES.find(
    (candidate) =>
      getPcbRailEntryFace(candidate.axis, candidate.insertionSide, rotation) ===
      entryFace,
  );
  if (!match) return null;
  return {
    ...match,
    entryFace,
    followsRemovableFace: false,
  };
}

export function getPcbRailDirectionForRemovableFace(
  lidFace: EnclosureFace,
  rotation: number = 0,
): PcbRailDirection | null {
  const direction = getPcbRailDirectionForEntryFace(lidFace, rotation);
  return direction ? { ...direction, followsRemovableFace: true } : null;
}

export function synchronizePcbRailDirection<
  Parameters extends Pick<
    DesignerParameters,
    | "lidFace"
    | "pcbRailAxis"
    | "pcbInsertionSide"
    | "pcbRailEntryFace"
  >,
>(parameters: Parameters): Parameters {
  const direction = getPcbRailDirectionForEntryFace(parameters.pcbRailEntryFace, 0);
  if (
    !direction ||
    (parameters.pcbRailAxis === direction.axis &&
      parameters.pcbInsertionSide === direction.insertionSide)
  ) {
    return parameters;
  }
  return {
    ...parameters,
    pcbRailAxis: direction.axis,
    pcbInsertionSide: direction.insertionSide,
  };
}

export function getPcbRailMovementAxis(
  parameters: Pick<
    DesignerParameters,
    | "pcbMountingType"
    | "lidFace"
    | "removableFaces"
    | "pcbRailAxis"
    | "pcbInsertionSide"
    | "pcbRailEntryFace"
  >,
  rotation: number = 0,
): PcbRailAxis | null {
  if (parameters.pcbMountingType === "screw") return null;
  const entryFace = getPcbRailDirection(parameters, rotation).entryFace;
  if (entryFace === "left" || entryFace === "right") return "x";
  if (entryFace === "top" || entryFace === "bottom") return "y";
  return "z";
}

export function getPcbRailEntryDescription(
  parameters: Pick<
    DesignerParameters,
    | "lidFace"
    | "removableFaces"
    | "pcbRailAxis"
    | "pcbInsertionSide"
    | "pcbRailEntryFace"
  >,
  rotation: number = 0,
): string {
  const direction = getPcbRailDirection(parameters, rotation);
  const sideLabel =
    direction.axis === "x"
      ? direction.insertionSide === "left"
        ? "从 X- 端滑入"
        : "从 X+ 端滑入"
      : direction.axis === "y"
        ? direction.insertionSide === "left"
          ? "从 Y- 端滑入"
          : "从 Y+ 端滑入"
      : direction.insertionSide === "left"
        ? "从 Z- 端滑入"
        : "从 Z+ 端滑入";
  return `${ENTRY_FACE_LABELS[direction.entryFace]}（${sideLabel}）`;
}

export function getPcbRailCavityReach(
  parameters: Pick<DesignerParameters, "boardClearance">,
): number {
  return Math.max(0, parameters.boardClearance);
}

export function getEffectivePcbRailLayout(
  parameters: DesignerParameters,
  envelope: PcbMountingEnvelope,
): PcbRailLayout {
  const direction = getPcbRailDirection(parameters, envelope.rotation);
  const travelLength =
    direction.axis === "z" ? envelope.width : envelope.length;
  const travelWidth =
    direction.axis === "z" ? envelope.length : envelope.width;
  const stopWidth = Math.max(0.8, Math.min(parameters.pcbStopWidth, travelLength / 3));
  const railLength = Math.max(4, travelLength - stopWidth);
  const ledgeThickness = Math.max(0.7, Math.min(2.2, parameters.pcbRailHeight * 0.42));
  const lipThickness = Math.max(0.7, Math.min(2.2, parameters.pcbRailHeight * 0.38));
  const ledgeOverlap = Math.max(0.8, Math.min(2.6, parameters.pcbRailWidth * 0.55));
  const lipOverlap = Math.max(0.8, Math.min(2.4, parameters.pcbRailWidth * 0.5));
  const boardBottom =
    parameters.bottomThickness + parameters.standoffHeight + envelope.elevation;
  const boardTop = boardBottom + envelope.thickness;
  const openSideSign = direction.insertionSide === "right" ? 1 : -1;
  const closedSideSign = -openSideSign;
  const openSideX = openSideSign * travelLength / 2;
  const closedSideX = closedSideSign * (travelLength / 2 - stopWidth / 2);

  return {
    travelLength,
    travelWidth,
    railLength,
    ledgeThickness,
    lipThickness,
    ledgeOverlap,
    lipOverlap,
    stopWidth,
    closedSideX,
    openSideX,
    openSideSign,
    boardBottom,
    boardTop,
  };
}
