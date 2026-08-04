import type { DesignerParameters, PcbReference } from "../domain/model";
import type { SolidPart } from "./manifoldSolidFactory";

export interface SolidExportRequest {
  id: number;
  format?: "stl";
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  part: SolidPart;
  panelId?: string | null;
}

export interface PrintLayoutExportRequest {
  id: number;
  format: "3mf";
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
}

export interface SolidExportSummary {
  part: SolidPart;
  featureId?: string;
  triangleCount: number;
  volume: number;
  bounds: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };
}

export interface SolidExportSuccess {
  id: number;
  ok: true;
  buffer: ArrayBuffer;
  summary: SolidExportSummary;
}

export interface SolidExportFailure {
  id: number;
  ok: false;
  error: string;
}

export interface PrintLayoutExportSuccess {
  id: number;
  ok: true;
  buffer: ArrayBuffer;
  summary: {
    partCount: number;
    triangleCount: number;
    volume: number;
    parts: SolidExportSummary[];
  };
}

export type GeometryExportRequest = SolidExportRequest | PrintLayoutExportRequest;
export type GeometryExportSuccess = SolidExportSuccess | PrintLayoutExportSuccess;
export type GeometryExportResponse = GeometryExportSuccess | SolidExportFailure;
