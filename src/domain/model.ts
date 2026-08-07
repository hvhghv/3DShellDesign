export type ClosureType =
  | "screw"
  | "magnet"
  | "snap"
  | "latch"
  | "slide"
  | "hinge"
  | "pin";
export type MagnetSupportType =
  | "corner-shelf"
  | "wall-bracket"
  | "perimeter-flange"
  | "floor-column";
export type VentPattern = "none" | "circle" | "slot" | "honeycomb";
export type PanelMountingType = "screw" | "magnet" | "snap" | "slide";
export type EnclosureFace = "top" | "bottom" | "front" | "back" | "left" | "right";
export type ConnectorSurface = EnclosureFace | "panel";
export type PlacementRotation = 0 | 90 | 180 | 270;
export type BatteryMountFace = EnclosureFace;
export type BatteryRetentionType = "open" | "elastic" | "clip";
export type BatteryInsertionSide = "left" | "right";
export type PcbMountingType = "screw" | "rail-screw" | "rail-elastic";
export type PcbRailAxis = "x" | "y" | "z";
export type PcbInsertionSide = "left" | "right";
export type DisplayMountingType = "none" | "screw";

export interface ConnectorPlacement {
  id: string;
  definitionId: string;
  surface: ConnectorSurface;
  panelId: string | null;
  offsetU: number;
  offsetV: number;
  rotation: PlacementRotation;
  cutoutWidth: number;
  cutoutHeight: number;
  displayMountingType?: DisplayMountingType;
}

export interface AntennaPlacement {
  id: string;
  definitionId: string;
  surface: ConnectorSurface;
  panelId: string | null;
  offsetU: number;
  offsetV: number;
  rotation: PlacementRotation;
  cutoutDiameter: number;
}

export interface PanelPlacement {
  id: string;
  face: EnclosureFace;
  offsetU: number;
  offsetV: number;
  width: number;
  height: number;
  thickness: number;
  insetDepth: number;
  cornerRadius: number;
  borderWidth: number;
  mountingInsetX: number;
  mountingInsetY: number;
  screwHeadRecessEnabled: boolean;
  screwHeadRecessDepth: number;
  mountingType: PanelMountingType;
  materialId: string;
}

export type CustomComponentShape = "box" | "cylinder" | "model";

export interface CustomComponentPlacement {
  id: string;
  name: string;
  shape: CustomComponentShape;
  width: number;
  height: number;
  depth: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  color: string;
  sourceName: string | null;
}

export type BatteryPreset = "aaa" | "aa" | "18650" | "lipo" | "custom";

export interface BatteryCompartmentPlacement {
  id: string;
  preset: BatteryPreset;
  face: BatteryMountFace;
  retentionType: BatteryRetentionType;
  insertionSide: BatteryInsertionSide;
  cellCount: number;
  width: number;
  depth: number;
  height: number;
  wallThickness: number;
  clearance: number;
  offsetX: number;
  offsetZ: number;
  rotation: PlacementRotation;
}

export type InspectorTab = "dimensions" | "structure" | "materials";

export type SelectablePart =
  | "project"
  | "pcb"
  | "base"
  | "lid"
  | "panel"
  | "connector"
  | "antenna"
  | "custom"
  | "battery";

export interface DesignerParameters {
  enclosureTemplateId: string;
  parametricPcbEnabled: boolean;
  pcbLength: number;
  pcbWidth: number;
  pcbThickness: number;
  componentHeight: number;
  boardClearance: number;
  wallThickness: number;
  bottomThickness: number;
  baseHeight: number;
  cornerRadius: number;
  standoffHeight: number;
  pcbOffsetX: number;
  pcbOffsetZ: number;
  pcbElevation: number;
  pcbMountingType: PcbMountingType;
  pcbRailClearance: number;
  pcbRailWidth: number;
  pcbRailHeight: number;
  pcbStopWidth: number;
  pcbElasticBandWidth: number;
  pcbRailAxis: PcbRailAxis;
  pcbInsertionSide: PcbInsertionSide;
  pcbRailEntryFace: EnclosureFace;
  lidFace: EnclosureFace;
  removableFaces: EnclosureFace[];
  lidThickness: number;
  closureType: ClosureType;
  magnetSupportType: MagnetSupportType;
  shellMaterialId: string;
  panelPlacements: PanelPlacement[];
  connectorPlacements: ConnectorPlacement[];
  antennaPlacements: AntennaPlacement[];
  customComponents: CustomComponentPlacement[];
  batteryCompartments: BatteryCompartmentPlacement[];
  pcbReferences: PcbReferencePlacement[];
  closureFastenerId: string;
  closureScrewHeadRecessEnabled: boolean;
  closureScrewHeadRecessDepth: number;
  ventPattern: VentPattern;
  ventRows: number;
  ventColumns: number;
  ventHoleSize: number;
  ventSpacing: number;
}

export interface EnclosureDimensions {
  outsideLength: number;
  outsideWidth: number;
  totalHeight: number;
  insideLength: number;
  insideWidth: number;
  availableComponentHeight: number;
  mountingInset: number;
}

export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  level: ValidationLevel;
  title: string;
  detail: string;
  part: SelectablePart;
}

export interface PcbMountingHole {
  x: number;
  y: number;
  diameter: number;
}

export interface PcbReference {
  format: "kicad_pcb" | "gerber-excellon" | "step";
  sourceName: string;
  auxiliarySourceName?: string | null;
  version: string | null;
  thickness: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  outlineElements: number;
  unsupportedOutlineElements: number;
  mountingHoles: PcbMountingHole[];
  drillHoleCount?: number;
  overallHeight?: number;
  triangleCount?: number;
}

export interface PcbReferencePlacement {
  id: string;
  reference: PcbReference;
  offsetX: number;
  offsetZ: number;
  elevation: number;
  rotation: PlacementRotation;
}

export interface StepPreviewMesh {
  name: string;
  color: readonly [number, number, number];
  positions: Float32Array;
  normals: Float32Array | null;
  indices: Uint32Array;
}

export interface StepPreview {
  meshes: StepPreviewMesh[];
  size: readonly [number, number, number];
}

export interface ProjectSnapshot {
  schemaVersion: 1;
  name: string;
  updatedAt: string;
  parameters: DesignerParameters;
  pcbReference?: PcbReference | null;
}
