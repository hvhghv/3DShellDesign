import type {
  DesignerParameters,
  EnclosureFace,
  PcbInsertionSide,
  PcbMountingType,
  PcbRailAxis,
  PcbReference,
} from "./model";

export const PARAMETRIC_PCB_FEATURE_ID = "pcb-main";

export const PCB_MOUNTING_LABELS: Record<PcbMountingType, string> = {
  screw: "纯螺丝固定",
  "rail-screw": "滑槽 + 螺丝",
  "rail-elastic": "滑槽 + 橡皮筋",
};

export const PCB_INSERTION_SIDE_LABELS: Record<PcbInsertionSide, string> = {
  left: "从左端滑入",
  right: "从右端滑入",
};

export const PCB_RAIL_AXIS_LABELS: Record<PcbRailAxis, string> = {
  x: "沿 X 轴滑动",
  y: "沿 Y 轴滑动",
  z: "沿 Z 轴滑动",
};

const PCB_RAIL_ENTRY_FACE_LABELS: Record<EnclosureFace, string> = {
  top: "顶部",
  bottom: "底板",
  front: "前壁",
  back: "后壁",
  left: "左壁",
  right: "右壁",
};

export interface PcbRailDirection {
  axis: PcbRailAxis;
  insertionSide: PcbInsertionSide;
  entryFace: EnclosureFace;
  followsRemovableFace: boolean;
}

export interface PcbMountingEnvelope {
  id: string;
  length: number;
  width: number;
  thickness: number;
  offsetX: number;
  offsetZ: number;
  elevation: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface PcbRailLayout {
  travelLength: number;
  travelWidth: number;
  railLength: number;
  ledgeThickness: number;
  lipThickness: number;
  ledgeOverlap: number;
  lipOverlap: number;
  stopWidth: number;
  closedSideX: number;
  openSideX: number;
  openSideSign: -1 | 1;
  boardBottom: number;
  boardTop: number;
}

export function getPcbInsertionSideLabel(
  axis: PcbRailAxis,
  side: PcbInsertionSide,
): string {
  if (axis === "x") return side === "left" ? "从 X- 端滑入" : "从 X+ 端滑入";
  if (axis === "y") return side === "left" ? "从 Y- 端滑入" : "从 Y+ 端滑入";
  return side === "left" ? "从 Z- 端滑入" : "从 Z+ 端滑入";
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
    "pcbRailAxis" | "pcbInsertionSide"
  >,
  rotation: number = 0,
): PcbRailDirection {
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

export function getPcbRailEntryDescription(
  parameters: Pick<
    DesignerParameters,
    "pcbRailAxis" | "pcbInsertionSide"
  >,
  rotation: number = 0,
): string {
  const direction = getPcbRailDirection(parameters, rotation);
  return `${PCB_RAIL_ENTRY_FACE_LABELS[direction.entryFace]}（${getPcbInsertionSideLabel(
    direction.axis,
    direction.insertionSide,
  )}）`;
}

export function isPcbMountingType(value: unknown): value is PcbMountingType {
  return value === "screw" || value === "rail-screw" || value === "rail-elastic";
}

export function isPcbInsertionSide(value: unknown): value is PcbInsertionSide {
  return value === "left" || value === "right";
}

export function isPcbRailAxis(value: unknown): value is PcbRailAxis {
  return value === "x" || value === "y" || value === "z";
}

export function getPcbRailMovementAxis(
  parameters: Pick<DesignerParameters, "pcbMountingType" | "pcbRailAxis">,
): PcbRailAxis | null {
  if (parameters.pcbMountingType === "screw") return null;
  return parameters.pcbRailAxis;
}

function getReferenceEnvelope(
  reference: PcbReference,
): Pick<PcbMountingEnvelope, "length" | "width" | "thickness"> {
  return {
    length: reference.bounds.maxX - reference.bounds.minX,
    width: reference.bounds.maxY - reference.bounds.minY,
    thickness: reference.thickness,
  };
}

export function getPcbMountingEnvelopes(
  parameters: DesignerParameters,
  legacyReference: PcbReference | null,
): PcbMountingEnvelope[] {
  if (parameters.pcbReferences.length > 0) {
    return parameters.pcbReferences.map((placement) => ({
      id: placement.id,
      ...getReferenceEnvelope(placement.reference),
      offsetX: placement.offsetX,
      offsetZ: placement.offsetZ,
      elevation: placement.elevation,
      rotation: placement.rotation,
    }));
  }

  if (!parameters.parametricPcbEnabled) return [];

  const envelope = legacyReference
    ? getReferenceEnvelope(legacyReference)
    : {
        length: parameters.pcbLength,
        width: parameters.pcbWidth,
        thickness: parameters.pcbThickness,
      };
  return [
    {
      id: PARAMETRIC_PCB_FEATURE_ID,
      ...envelope,
      offsetX: parameters.pcbOffsetX,
      offsetZ: parameters.pcbOffsetZ,
      elevation: parameters.pcbElevation,
      rotation: 0,
    },
  ];
}

export function getPcbRailLayout(
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
