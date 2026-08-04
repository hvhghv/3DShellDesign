export type ClosureType = "screw" | "magnet" | "snap" | "slide" | "hinge";
export type MagnetSupportType =
  | "corner-shelf"
  | "wall-bracket"
  | "perimeter-flange"
  | "floor-column";
export type VentPattern = "none" | "circle" | "slot" | "honeycomb";
export type PanelMountingType = "screw" | "magnet" | "slide";
export type EnclosureFace = "top" | "bottom" | "front" | "back" | "left" | "right";
export type ConnectorSurface = EnclosureFace | "panel";
export type PlacementRotation = 0 | 90 | 180 | 270;

export interface ConnectorPlacement {
  id: string;
  definitionId: string;
  surface: ConnectorSurface;
  offsetU: number;
  offsetV: number;
  rotation: PlacementRotation;
  cutoutWidth: number;
  cutoutHeight: number;
}

export type InspectorTab = "dimensions" | "structure" | "materials";

export type SelectablePart =
  | "project"
  | "pcb"
  | "base"
  | "lid"
  | "panel"
  | "connector"
  | "antenna";

export interface DesignerParameters {
  enclosureTemplateId: string;
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
  lidThickness: number;
  closureType: ClosureType;
  magnetSupportType: MagnetSupportType;
  shellMaterialId: string;
  panelEnabled: boolean;
  panelMaterialId: string;
  panelThickness: number;
  panelMountingType: PanelMountingType;
  panelFace: EnclosureFace;
  panelOffsetU: number;
  panelOffsetV: number;
  connectorPlacements: ConnectorPlacement[];
  antennaEnabled: boolean;
  antennaDefinitionId: string;
  antennaOffset: number;
  closureFastenerId: string;
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
  panelLength: number;
  panelWidth: number;
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
