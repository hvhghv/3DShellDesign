import { create } from "zustand";
import {
  clampParameter,
  DEFAULT_PARAMETERS,
  deriveEnclosureDimensions,
  normalizeDesignerParameters,
} from "../domain/enclosure";
import {
  constrainCustomComponent,
  createCustomComponent,
} from "../domain/customComponents";
import {
  applyBatteryPreset,
  constrainBatteryCompartment,
  createBatteryCompartment,
} from "../domain/batteries";
import { PARAMETRIC_PCB_FEATURE_ID } from "../domain/pcbMounting";
import {
  getPcbRailDirection,
  getPcbRailEntryFace,
  getPcbRailMovementAxis,
  synchronizePcbRailDirection,
} from "../domain/pcbRailDirection";
import type {
  AntennaPlacement,
  BatteryCompartmentPlacement,
  BatteryPreset,
  ConnectorPlacement,
  ConnectorSurface,
  CustomComponentPlacement,
  CustomComponentShape,
  DesignerParameters,
  EnclosureFace,
  InspectorTab,
  PcbReference,
  PcbReferencePlacement,
  PanelPlacement,
  ProjectSnapshot,
  SelectablePart,
  StepPreview,
} from "../domain/model";
import {
  createAntennaPlacement,
  createConnectorPlacement,
  createPanelPlacement,
  constrainSurfacePlacements,
  ENCLOSURE_FACE_OPTIONS,
  getDefaultPanelSize,
} from "../domain/placements";
import { normalizeRemovableFaces } from "../domain/removableFaces";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getEnclosureTemplate } from "../libraries/templates";
import { queueProjectCache, readProjectCache } from "./projectCache";

const STORAGE_KEY = "3dshell-designer.project.v1";
type CacheStatus = "restoring" | "saving" | "saved" | "error";
export type TransformMode = "move" | "scale";
export type TransformAxisConstraint = "all" | "x" | "y" | "z";
export type EditableFeaturePart =
  | "pcb"
  | "panel"
  | "connector"
  | "antenna"
  | "custom"
  | "battery";

interface DesignerState {
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  stepPreview: StepPreview | null;
  pcbPreviews: Record<string, StepPreview>;
  customComponentPreviews: Record<string, StepPreview>;
  selectedPart: SelectablePart;
  selectedFeatureId: string | null;
  focusedPart: SelectablePart | null;
  inspectorTab: InspectorTab;
  showGrid: boolean;
  exploded: boolean;
  lidTransparent: boolean;
  transparentObjectIds: string[];
  hiddenFaces: EnclosureFace[];
  hiddenFeatureIds: string[];
  hiddenPcbBodyIds: string[];
  lockedFeatureIds: string[];
  cameraResetToken: number;
  cachedAt: string | null;
  cacheStatus: CacheStatus;
  transformMode: TransformMode;
  transformEditMode: boolean;
  transformAxisConstraint: TransformAxisConstraint;
  canUndo: boolean;
  canRedo: boolean;
  setParameter: <Key extends keyof DesignerParameters>(
    key: Key,
    value: DesignerParameters[Key],
  ) => void;
  addConnectorPlacement: (
    definitionId?: string,
    surface?: ConnectorSurface,
    panelId?: string | null,
  ) => void;
  updateConnectorPlacement: (
    id: string,
    changes: Partial<Omit<ConnectorPlacement, "id">>,
  ) => void;
  setConnectorDefinition: (placementId: string, definitionId: string) => void;
  removeConnectorPlacement: (id: string) => void;
  addPanelPlacement: () => void;
  updatePanelPlacement: (
    id: string,
    changes: Partial<Omit<PanelPlacement, "id">>,
  ) => void;
  removePanelPlacement: (id: string) => void;
  addAntennaPlacement: (
    definitionId?: string,
    surface?: ConnectorSurface,
    panelId?: string | null,
  ) => void;
  updateAntennaPlacement: (
    id: string,
    changes: Partial<Omit<AntennaPlacement, "id">>,
  ) => void;
  setAntennaDefinition: (placementId: string, definitionId: string) => void;
  removeAntennaPlacement: (id: string) => void;
  addCustomComponent: (
    shape: CustomComponentShape,
    name?: string,
    preview?: StepPreview,
  ) => void;
  updateCustomComponent: (
    id: string,
    changes: Partial<Omit<CustomComponentPlacement, "id">>,
  ) => void;
  removeCustomComponent: (id: string) => void;
  addBatteryCompartment: (preset?: BatteryPreset) => void;
  updateBatteryCompartment: (
    id: string,
    changes: Partial<Omit<BatteryCompartmentPlacement, "id">>,
  ) => void;
  setBatteryPreset: (id: string, preset: BatteryPreset) => void;
  removeBatteryCompartment: (id: string) => void;
  duplicateFeature: (part: EditableFeaturePart, id: string) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  setEnclosureTemplate: (id: string) => void;
  setSelectedPart: (part: SelectablePart) => void;
  setSelectedFeature: (
    part: EditableFeaturePart,
    id: string,
  ) => void;
  setTransformMode: (mode: TransformMode) => void;
  setTransformEditMode: (enabled: boolean) => void;
  toggleTransformEditMode: () => void;
  setTransformAxisConstraint: (axis: TransformAxisConstraint) => void;
  focusSelectedPart: () => void;
  showAllParts: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleGrid: () => void;
  toggleExploded: () => void;
  toggleLidTransparency: () => void;
  toggleObjectTransparency: (id: string) => void;
  showAllOpaque: () => void;
  toggleFaceVisibility: (face: EnclosureFace) => void;
  showAllFaces: () => void;
  toggleFeatureVisibility: (id: string) => void;
  togglePcbBodyVisibility: (id: string) => void;
  showAllFeatures: () => void;
  toggleFeatureLock: (id: string) => void;
  resetCamera: () => void;
  resetProject: () => void;
  addParametricPcb: () => void;
  setPcbReference: (reference: PcbReference) => void;
  setStepReference: (reference: PcbReference, preview: StepPreview) => void;
  updatePcbReferencePlacement: (
    id: string,
    changes: Partial<Omit<PcbReferencePlacement, "id" | "reference">>,
  ) => void;
  clearPcbReference: (id?: string) => void;
  loadProject: (snapshot: ProjectSnapshot) => void;
  restoreCachedProject: () => Promise<void>;
}

interface DesignerHistorySnapshot {
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  stepPreview: StepPreview | null;
  pcbPreviews: Record<string, StepPreview>;
  customComponentPreviews: Record<string, StepPreview>;
  selectedPart: SelectablePart;
  selectedFeatureId: string | null;
  focusedPart: SelectablePart | null;
  inspectorTab: InspectorTab;
}

interface DesignerHistoryEntry {
  snapshot: DesignerHistorySnapshot;
  scope: string;
  timestamp: number;
}

const HISTORY_LIMIT = 60;
const HISTORY_COALESCE_MS = 650;
const historyPast: DesignerHistoryEntry[] = [];
const historyFuture: DesignerHistoryEntry[] = [];
let historyApplying = false;

function captureHistorySnapshot(state: DesignerState): DesignerHistorySnapshot {
  return {
    projectName: state.projectName,
    parameters: state.parameters,
    pcbReference: state.pcbReference,
    stepPreview: state.stepPreview,
    pcbPreviews: state.pcbPreviews,
    customComponentPreviews: state.customComponentPreviews,
    selectedPart: state.selectedPart,
    selectedFeatureId: state.selectedFeatureId,
    focusedPart: state.focusedPart,
    inspectorTab: state.inspectorTab,
  };
}

function getHistoryShape(parameters: DesignerParameters): string {
  return [
    parameters.parametricPcbEnabled ? 1 : 0,
    parameters.pcbReferences.length,
    parameters.panelPlacements.length,
    parameters.connectorPlacements.length,
    parameters.antennaPlacements.length,
    parameters.customComponents.length,
    parameters.batteryCompartments.length,
  ].join(":");
}

function getValidFeatureIds(parameters: DesignerParameters): Set<string> {
  return new Set([
    ...(parameters.parametricPcbEnabled ? [PARAMETRIC_PCB_FEATURE_ID] : []),
    ...parameters.pcbReferences.map((item) => item.id),
    ...parameters.panelPlacements.map((item) => item.id),
    ...parameters.connectorPlacements.map((item) => item.id),
    ...parameters.antennaPlacements.map((item) => item.id),
    ...parameters.customComponents.map((item) => item.id),
    ...parameters.batteryCompartments.map((item) => item.id),
  ]);
}

function getValidObjectIds(parameters: DesignerParameters): Set<string> {
  return new Set(["base", "lid", ...getValidFeatureIds(parameters)]);
}

function getHistoryScope(previous: DesignerState, next: DesignerState): string {
  return `${previous.selectedPart}:${previous.selectedFeatureId ?? "none"}:${getHistoryShape(previous.parameters)}>${getHistoryShape(next.parameters)}`;
}

function isPartAvailable(part: SelectablePart, parameters: DesignerParameters): boolean {
  if (part === "pcb") {
    return parameters.parametricPcbEnabled || parameters.pcbReferences.length > 0;
  }
  if (part === "panel") return parameters.panelPlacements.length > 0;
  if (part === "connector") return parameters.connectorPlacements.length > 0;
  if (part === "antenna") return parameters.antennaPlacements.length > 0;
  if (part === "custom") return parameters.customComponents.length > 0;
  if (part === "battery") return parameters.batteryCompartments.length > 0;
  return true;
}

function createPcbReferencePlacement(
  reference: PcbReference,
  id: string,
  index = 0,
): PcbReferencePlacement {
  return {
    id,
    reference,
    offsetX: 0,
    offsetZ: 0,
    elevation: index * 5,
    rotation: 0,
  };
}

function getPrimaryPreview(
  references: readonly PcbReferencePlacement[],
  previews: Record<string, StepPreview>,
): StepPreview | null {
  const id = references[0]?.id;
  return id ? previews[id] ?? null : null;
}

function withLegacyPcbReference(
  parameters: DesignerParameters,
  reference: PcbReference | null | undefined,
): DesignerParameters {
  if (!reference || parameters.pcbReferences.length > 0) return parameters;
  return {
    ...parameters,
    parametricPcbEnabled: false,
    pcbReferences: [createPcbReferencePlacement(reference, "pcb-1")],
  };
}

function loadPersistedProject(): Pick<
  DesignerState,
  "projectName" | "parameters" | "pcbReference" | "cachedAt"
> {
  const fallback = {
    projectName: "PCB 控制器外壳",
    parameters: DEFAULT_PARAMETERS,
    pcbReference: null,
    cachedAt: null,
  };
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const snapshot = JSON.parse(raw) as Partial<ProjectSnapshot>;
    if (snapshot.schemaVersion !== 1 || !snapshot.parameters) {
      return fallback;
    }
    return {
      projectName:
        typeof snapshot.name === "string" ? snapshot.name : fallback.projectName,
      parameters: withLegacyPcbReference(
        normalizeDesignerParameters(snapshot.parameters),
        snapshot.pcbReference,
      ),
      pcbReference: snapshot.pcbReference ?? null,
      cachedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null,
    };
  } catch {
    return fallback;
  }
}

function persistSnapshot(
  projectName: string,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
  stepPreview: StepPreview | null,
): ProjectSnapshot {
  const snapshot: ProjectSnapshot = {
    schemaVersion: 1,
    name: projectName,
    updatedAt: new Date().toISOString(),
    parameters,
    pcbReference,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // IndexedDB remains available as the larger, asynchronous fallback.
    }
    void queueProjectCache(
      snapshot,
      stepPreview,
      cachedPcbPreviews,
      cachedCustomComponentPreviews,
    )
      .then(() => {
        if (useDesignerStore.getState().cachedAt === snapshot.updatedAt) {
          useDesignerStore.setState({ cacheStatus: "saved" });
        }
      })
      .catch(() => {
        if (useDesignerStore.getState().cachedAt === snapshot.updatedAt) {
          useDesignerStore.setState({ cacheStatus: "error" });
        }
      });
  }
  return snapshot;
}

const persistedProject = loadPersistedProject();
let cachedPcbPreviews: Record<string, StepPreview> = {};
let cachedCustomComponentPreviews: Record<string, StepPreview> = {};

function constrainParameters(parameters: DesignerParameters): DesignerParameters {
  return constrainSurfacePlacements(
    parameters,
    deriveEnclosureDimensions(parameters),
  );
}

function clampPcbPlanarOffset(value: number): number {
  return Math.min(500, Math.max(-500, value));
}

function shouldRehomePcbRailPlacements(
  previous: DesignerParameters,
  next: DesignerParameters,
): boolean {
  const previousRailMounted = previous.pcbMountingType !== "screw";
  const nextRailMounted = next.pcbMountingType !== "screw";
  if (!nextRailMounted) return false;
  if (!previousRailMounted) return true;

  const previousDirection = getPcbRailDirection(previous, 0);
  const nextDirection = getPcbRailDirection(next, 0);
  return (
    previousDirection.axis !== nextDirection.axis ||
    previousDirection.insertionSide !== nextDirection.insertionSide ||
    previousDirection.entryFace !== nextDirection.entryFace
  );
}

function rehomePcbRailPlacements(parameters: DesignerParameters): DesignerParameters {
  if (parameters.pcbMountingType === "screw") return parameters;
  let changed = parameters.pcbOffsetX !== 0 || parameters.pcbOffsetZ !== 0;
  const pcbReferences = parameters.pcbReferences.map((placement) =>
    placement.offsetX === 0 && placement.offsetZ === 0
      ? placement
      : (() => {
          changed = true;
          return { ...placement, offsetX: 0, offsetZ: 0 };
        })(),
  );
  if (!changed) return parameters;
  return {
    ...parameters,
    pcbOffsetX: 0,
    pcbOffsetZ: 0,
    pcbReferences,
  };
}

function resolvePlacementTarget(
  panels: readonly PanelPlacement[],
  surface: ConnectorSurface,
  panelId: string | null,
  fallbackSurface: EnclosureFace,
): { surface: ConnectorSurface; panelId: string | null } {
  if (surface !== "panel") return { surface, panelId: null };
  const panel =
    panels.find((candidate) => candidate.id === panelId) ?? panels[0] ?? null;
  return panel
    ? { surface: "panel", panelId: panel.id }
    : { surface: fallbackSurface, panelId: null };
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  projectName: persistedProject.projectName,
  parameters: persistedProject.parameters,
  pcbReference: persistedProject.pcbReference,
  stepPreview: null,
  pcbPreviews: {},
  customComponentPreviews: {},
  selectedPart: "project",
  selectedFeatureId: null,
  focusedPart: null,
  inspectorTab: "dimensions",
  showGrid: true,
  exploded: false,
  lidTransparent: false,
  transparentObjectIds: [],
  hiddenFaces: [],
  hiddenFeatureIds: [],
  hiddenPcbBodyIds: [],
  lockedFeatureIds: [],
  cameraResetToken: 0,
  cachedAt: persistedProject.cachedAt,
  cacheStatus: "restoring",
  transformMode: "move",
  transformEditMode: false,
  transformAxisConstraint: "all",
  canUndo: false,
  canRedo: false,
  setParameter: (key, value) =>
    set((state) => {
      const railMovementAxis = getPcbRailMovementAxis(state.parameters);
      if (
        railMovementAxis !== null &&
        ((key === "pcbElevation" && railMovementAxis !== "y") ||
          (key === "pcbOffsetX" && railMovementAxis !== "x") ||
          (key === "pcbOffsetZ" && railMovementAxis !== "z"))
      ) {
        return {};
      }
      const clampedValue =
        key === "pcbElevation" && typeof value === "number"
          ? Math.min(300, Math.max(-state.parameters.standoffHeight, value))
          : clampParameter(key, value);
      const parameterPatch = {
        [key]: clampedValue as DesignerParameters[typeof key],
      } as Pick<DesignerParameters, typeof key> & Partial<DesignerParameters>;
      if (key === "lidFace") {
        const nextPrimaryFace = clampedValue as EnclosureFace;
        const currentRemovableFaces = normalizeRemovableFaces(
          state.parameters.removableFaces,
          state.parameters.lidFace,
        );
        const currentWithoutPrimary = currentRemovableFaces.filter(
          (face) => face !== state.parameters.lidFace,
        );
        parameterPatch.removableFaces =
          currentRemovableFaces.length === 1 &&
          currentRemovableFaces[0] === state.parameters.lidFace
            ? [nextPrimaryFace]
            : normalizeRemovableFaces(
                [nextPrimaryFace, ...currentWithoutPrimary],
                nextPrimaryFace,
              );
      } else if (key === "removableFaces") {
        parameterPatch.removableFaces = normalizeRemovableFaces(
          clampedValue,
          state.parameters.lidFace,
        );
      }
      if (key === "pcbRailEntryFace") {
        parameterPatch.pcbRailEntryFace = clampedValue as EnclosureFace;
      } else if (key === "pcbRailAxis" || key === "pcbInsertionSide") {
        const axis =
          key === "pcbRailAxis"
            ? (clampedValue as DesignerParameters["pcbRailAxis"])
            : state.parameters.pcbRailAxis;
        const insertionSide =
          key === "pcbInsertionSide"
            ? (clampedValue as DesignerParameters["pcbInsertionSide"])
            : state.parameters.pcbInsertionSide;
        parameterPatch.pcbRailEntryFace = getPcbRailEntryFace(
          axis,
          insertionSide,
        );
      }
      if (
        key === "standoffHeight" &&
        typeof clampedValue === "number" &&
        state.parameters.pcbElevation < -clampedValue
      ) {
        parameterPatch.pcbElevation = -clampedValue;
      }
      const synchronizedParameters = synchronizePcbRailDirection({
        ...state.parameters,
        ...parameterPatch,
      });
      const nextParameters = constrainParameters(
        shouldRehomePcbRailPlacements(state.parameters, synchronizedParameters)
          ? rehomePcbRailPlacements(synchronizedParameters)
          : synchronizedParameters,
      );
      const snapshot = persistSnapshot(
        state.projectName,
        nextParameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters: nextParameters,
        selectedPart: isPartAvailable(state.selectedPart, nextParameters)
          ? state.selectedPart
          : "project",
        focusedPart:
          state.focusedPart && isPartAvailable(state.focusedPart, nextParameters)
            ? state.focusedPart
            : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  addPanelPlacement: () =>
    set((state) => {
      const usedFaces = new Set(
        state.parameters.panelPlacements.map((panel) => panel.face),
      );
      const face =
        ENCLOSURE_FACE_OPTIONS.find((option) => !usedFaces.has(option.id))?.id ??
        "top";
      const id = `panel-${Date.now().toString(36)}-${state.parameters.panelPlacements.length + 1}`;
      const panel = createPanelPlacement(state.parameters, id, face);
      const parameters = constrainParameters({
        ...state.parameters,
        panelPlacements: [...state.parameters.panelPlacements, panel],
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "panel",
        selectedFeatureId: id,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? "panel" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updatePanelPlacement: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = constrainParameters({
        ...state.parameters,
        panelPlacements: state.parameters.panelPlacements.map((panel) =>
          panel.id === id
            ? (() => {
                const nextFace = changes.face ?? panel.face;
                const faceChanged = nextFace !== panel.face;
                const [faceWidth, faceHeight] = faceChanged
                  ? getDefaultPanelSize(state.parameters, nextFace)
                  : [panel.width, panel.height];
                return {
                  ...panel,
                  ...changes,
                  offsetU: Math.min(
                    300,
                    Math.max(
                      -300,
                      changes.offsetU ?? (faceChanged ? 0 : panel.offsetU),
                    ),
                  ),
                  offsetV: Math.min(
                    300,
                    Math.max(
                      -300,
                      changes.offsetV ?? (faceChanged ? 0 : panel.offsetV),
                    ),
                  ),
                  width: Math.min(300, Math.max(6, changes.width ?? faceWidth)),
                  height: Math.min(300, Math.max(6, changes.height ?? faceHeight)),
                  thickness: Math.min(
                    10,
                    Math.max(0.5, changes.thickness ?? panel.thickness),
                  ),
                  insetDepth: Math.min(
                    9.5,
                    Math.max(0, changes.insetDepth ?? panel.insetDepth),
                  ),
                };
              })()
            : panel,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "panel",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "panel" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  removePanelPlacement: (id) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const removed = state.parameters.panelPlacements.find((panel) => panel.id === id);
      const panelPlacements = state.parameters.panelPlacements.filter(
        (panel) => panel.id !== id,
      );
      const parameters = constrainParameters({
        ...state.parameters,
        panelPlacements,
        connectorPlacements: state.parameters.connectorPlacements.map((connector) =>
          connector.surface === "panel" && connector.panelId === id && removed
            ? {
                ...connector,
                surface: removed.face,
                panelId: null,
                offsetU: connector.offsetU + removed.offsetU,
                offsetV: connector.offsetV + removed.offsetV,
              }
            : connector,
        ),
        antennaPlacements: state.parameters.antennaPlacements.map((antenna) =>
          antenna.surface === "panel" && antenna.panelId === id && removed
            ? {
                ...antenna,
                surface: removed.face,
                panelId: null,
                offsetU: antenna.offsetU + removed.offsetU,
                offsetV: antenna.offsetV + removed.offsetV,
              }
            : antenna,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      const nextPanel = panelPlacements[0] ?? null;
      return {
        parameters,
        selectedPart:
          state.selectedPart === "panel" && !nextPanel ? "project" : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "panel" && state.selectedFeatureId === id
            ? nextPanel?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "panel" && !nextPanel ? null : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  addConnectorPlacement: (
    definitionId = "usb-c-receptacle",
    requestedSurface = "front",
    requestedPanelId = null,
  ) =>
    set((state) => {
      const id = `connector-${Date.now().toString(36)}-${state.parameters.connectorPlacements.length + 1}`;
      const target = resolvePlacementTarget(
        state.parameters.panelPlacements,
        requestedSurface,
        requestedPanelId,
        "front",
      );
      const placement = createConnectorPlacement(
        definitionId,
        id,
        target.surface,
      );
      placement.panelId = target.panelId;
      const parameters = constrainParameters({
        ...state.parameters,
        connectorPlacements: [
          ...state.parameters.connectorPlacements,
          placement,
        ],
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "connector",
        selectedFeatureId: id,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? "connector" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updateConnectorPlacement: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = constrainParameters({
        ...state.parameters,
        connectorPlacements: state.parameters.connectorPlacements.map((placement) =>
          placement.id === id
            ? {
                ...placement,
                ...changes,
                offsetU: Math.min(
                  300,
                  Math.max(-300, changes.offsetU ?? placement.offsetU),
                ),
                offsetV: Math.min(
                  300,
                  Math.max(-300, changes.offsetV ?? placement.offsetV),
                ),
                cutoutWidth: Math.min(
                  60,
                  Math.max(1, changes.cutoutWidth ?? placement.cutoutWidth),
                ),
                cutoutHeight: Math.min(
                  60,
                  Math.max(1, changes.cutoutHeight ?? placement.cutoutHeight),
                ),
              }
            : placement,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "connector",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "connector" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setConnectorDefinition: (placementId, connectorDefinitionId) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(placementId)) return {};
      const definition = getConnectorDefinition(connectorDefinitionId);
      const parameters = constrainParameters({
        ...state.parameters,
        connectorPlacements: state.parameters.connectorPlacements.map((placement) =>
          placement.id === placementId
            ? {
                ...placement,
                definitionId: definition.id,
                cutoutWidth: definition.panelCutout.width,
                cutoutHeight: definition.panelCutout.height,
                displayMountingType: definition.displaySpec
                  ? placement.displayMountingType ?? "none"
                  : undefined,
              }
            : placement,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "connector",
        selectedFeatureId: placementId,
        focusedPart: state.focusedPart ? "connector" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  removeConnectorPlacement: (id) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = constrainParameters({
        ...state.parameters,
        connectorPlacements: state.parameters.connectorPlacements.filter(
          (placement) => placement.id !== id,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      const hasConnectors = parameters.connectorPlacements.length > 0;
      return {
        parameters,
        selectedPart:
          state.selectedPart === "connector" && !hasConnectors
            ? "project"
            : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "connector" && state.selectedFeatureId === id
            ? parameters.connectorPlacements[0]?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "connector" && !hasConnectors
            ? null
            : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  addAntennaPlacement: (
    definitionId = "sma-bulkhead-whip",
    requestedSurface = "back",
    requestedPanelId = null,
  ) =>
    set((state) => {
      const id = `antenna-${Date.now().toString(36)}-${state.parameters.antennaPlacements.length + 1}`;
      const target = resolvePlacementTarget(
        state.parameters.panelPlacements,
        requestedSurface,
        requestedPanelId,
        "back",
      );
      const placement = createAntennaPlacement(
        state.parameters,
        definitionId,
        id,
        target.surface,
      );
      placement.panelId = target.panelId;
      const parameters = constrainParameters({
        ...state.parameters,
        antennaPlacements: [...state.parameters.antennaPlacements, placement],
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "antenna",
        selectedFeatureId: id,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? "antenna" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updateAntennaPlacement: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = constrainParameters({
        ...state.parameters,
        antennaPlacements: state.parameters.antennaPlacements.map((placement) =>
          placement.id === id
            ? {
                ...placement,
                ...changes,
                offsetU: Math.min(
                  300,
                  Math.max(-300, changes.offsetU ?? placement.offsetU),
                ),
                offsetV: Math.min(
                  300,
                  Math.max(-300, changes.offsetV ?? placement.offsetV),
                ),
                cutoutDiameter: Math.min(
                  40,
                  Math.max(
                    0,
                    changes.cutoutDiameter ?? placement.cutoutDiameter,
                  ),
                ),
              }
            : placement,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "antenna",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "antenna" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setAntennaDefinition: (placementId, antennaDefinitionId) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(placementId)) return {};
      const antenna = getAntennaDefinition(antennaDefinitionId);
      const parameters = constrainParameters({
        ...state.parameters,
        antennaPlacements: state.parameters.antennaPlacements.map((placement) =>
          placement.id === placementId
            ? {
                ...placement,
                definitionId: antenna.id,
                cutoutDiameter: antenna.enclosureCutout?.diameter ?? 0,
              }
            : placement,
        ),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "antenna",
        selectedFeatureId: placementId,
        focusedPart: state.focusedPart ? "antenna" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  removeAntennaPlacement: (id) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const antennaPlacements = state.parameters.antennaPlacements.filter(
        (placement) => placement.id !== id,
      );
      const parameters = constrainParameters({
        ...state.parameters,
        antennaPlacements,
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      const nextAntenna = antennaPlacements[0] ?? null;
      return {
        parameters,
        selectedPart:
          state.selectedPart === "antenna" && !nextAntenna
            ? "project"
            : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "antenna" && state.selectedFeatureId === id
            ? nextAntenna?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "antenna" && !nextAntenna
            ? null
            : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  addCustomComponent: (shape, name, preview) =>
    set((state) => {
      const id = `custom-${Date.now().toString(36)}-${state.parameters.customComponents.length + 1}`;
      const component = createCustomComponent(
        state.parameters,
        id,
        shape,
        name,
        preview,
      );
      if (preview) {
        cachedCustomComponentPreviews = {
          ...cachedCustomComponentPreviews,
          [id]: preview,
        };
      }
      const parameters = {
        ...state.parameters,
        customComponents: [...state.parameters.customComponents, component],
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        customComponentPreviews: cachedCustomComponentPreviews,
        selectedPart: "custom",
        selectedFeatureId: id,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? "custom" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updateCustomComponent: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = {
        ...state.parameters,
        customComponents: state.parameters.customComponents.map((component) => {
          if (component.id !== id) return component;
          const next = { ...component, ...changes };
          if (
            next.shape === "cylinder" &&
            (changes.width !== undefined || changes.depth !== undefined)
          ) {
            const diameter = changes.width ?? changes.depth ?? component.width;
            next.width = diameter;
            next.depth = diameter;
          }
          return constrainCustomComponent(next);
        }),
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "custom",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "custom" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  removeCustomComponent: (id) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const customComponents = state.parameters.customComponents.filter(
        (component) => component.id !== id,
      );
      cachedCustomComponentPreviews = { ...cachedCustomComponentPreviews };
      delete cachedCustomComponentPreviews[id];
      const parameters = { ...state.parameters, customComponents };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      const nextComponent = customComponents[0] ?? null;
      return {
        parameters,
        customComponentPreviews: cachedCustomComponentPreviews,
        selectedPart:
          state.selectedPart === "custom" && !nextComponent
            ? "project"
            : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "custom" && state.selectedFeatureId === id
            ? nextComponent?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "custom" && !nextComponent
            ? null
            : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  addBatteryCompartment: (preset = "aa") =>
    set((state) => {
      const id = `battery-${Date.now().toString(36)}-${state.parameters.batteryCompartments.length + 1}`;
      const compartment = createBatteryCompartment(id, preset);
      const parameters = {
        ...state.parameters,
        batteryCompartments: [
          ...state.parameters.batteryCompartments,
          compartment,
        ],
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "battery",
        selectedFeatureId: id,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? "battery" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updateBatteryCompartment: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = {
        ...state.parameters,
        batteryCompartments: state.parameters.batteryCompartments.map(
          (compartment) => {
            if (compartment.id !== id) return compartment;
            let next = constrainBatteryCompartment({
              ...compartment,
              ...changes,
            });
            if (
              next.preset !== "custom" &&
              (changes.cellCount !== undefined ||
                changes.wallThickness !== undefined ||
                changes.clearance !== undefined)
            ) {
              next = applyBatteryPreset(next, next.preset, next.cellCount);
            }
            return next;
          },
        ),
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "battery",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "battery" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setBatteryPreset: (id, preset) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const parameters = {
        ...state.parameters,
        batteryCompartments: state.parameters.batteryCompartments.map(
          (compartment) =>
            compartment.id === id
              ? applyBatteryPreset(compartment, preset)
              : compartment,
        ),
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "battery",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "battery" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  removeBatteryCompartment: (id) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      const batteryCompartments = state.parameters.batteryCompartments.filter(
        (compartment) => compartment.id !== id,
      );
      const parameters = { ...state.parameters, batteryCompartments };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      const nextCompartment = batteryCompartments[0] ?? null;
      return {
        parameters,
        selectedPart:
          state.selectedPart === "battery" && !nextCompartment
            ? "project"
            : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "battery" && state.selectedFeatureId === id
            ? nextCompartment?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "battery" && !nextCompartment
            ? null
            : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  duplicateFeature: (part, id) =>
    set((state) => {
      const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
      const nextId = `${part}-${suffix}`;
      let nextParameters: DesignerParameters;
      let pcbPreviews = state.pcbPreviews;
      let customComponentPreviews = state.customComponentPreviews;

      if (part === "panel") {
        const source = state.parameters.panelPlacements.find((item) => item.id === id);
        if (!source) return {};
        nextParameters = {
          ...state.parameters,
          panelPlacements: [
            ...state.parameters.panelPlacements,
            { ...source, id: nextId, offsetU: source.offsetU + 3, offsetV: source.offsetV + 3 },
          ],
        };
      } else if (part === "connector") {
        const source = state.parameters.connectorPlacements.find((item) => item.id === id);
        if (!source) return {};
        const quarterTurn = source.rotation === 90 || source.rotation === 270;
        const duplicateOffset =
          (quarterTurn ? source.cutoutHeight : source.cutoutWidth) + 3;
        nextParameters = {
          ...state.parameters,
          connectorPlacements: [
            ...state.parameters.connectorPlacements,
            { ...source, id: nextId, offsetU: source.offsetU + duplicateOffset },
          ],
        };
      } else if (part === "antenna") {
        const source = state.parameters.antennaPlacements.find((item) => item.id === id);
        if (!source) return {};
        nextParameters = {
          ...state.parameters,
          antennaPlacements: [
            ...state.parameters.antennaPlacements,
            { ...source, id: nextId, offsetU: source.offsetU + 3, offsetV: source.offsetV + 3 },
          ],
        };
      } else if (part === "custom") {
        const source = state.parameters.customComponents.find((item) => item.id === id);
        if (!source) return {};
        nextParameters = {
          ...state.parameters,
          customComponents: [
            ...state.parameters.customComponents,
            {
              ...source,
              id: nextId,
              name: `${source.name} 副本`,
              positionX: source.positionX + 5,
              positionZ: source.positionZ + 5,
            },
          ],
        };
        if (state.customComponentPreviews[id]) {
          customComponentPreviews = {
            ...state.customComponentPreviews,
            [nextId]: state.customComponentPreviews[id],
          };
        }
      } else if (part === "battery") {
        const source = state.parameters.batteryCompartments.find((item) => item.id === id);
        if (!source) return {};
        nextParameters = {
          ...state.parameters,
          batteryCompartments: [
            ...state.parameters.batteryCompartments,
            { ...source, id: nextId, offsetX: source.offsetX + 5, offsetZ: source.offsetZ + 5 },
          ],
        };
      } else {
        const source = state.parameters.pcbReferences.find((item) => item.id === id);
        if (!source) return {};
        nextParameters = {
          ...state.parameters,
          pcbReferences: [
            ...state.parameters.pcbReferences,
            { ...source, id: nextId, offsetX: source.offsetX + 5, offsetZ: source.offsetZ + 5 },
          ],
        };
        if (state.pcbPreviews[id]) {
          pcbPreviews = { ...state.pcbPreviews, [nextId]: state.pcbPreviews[id] };
        }
      }

      const parameters = constrainParameters(nextParameters);
      cachedPcbPreviews = pcbPreviews;
      cachedCustomComponentPreviews = customComponentPreviews;
      const pcbReference = parameters.pcbReferences[0]?.reference ?? state.pcbReference;
      const stepPreview = getPrimaryPreview(parameters.pcbReferences, pcbPreviews);
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        pcbReference,
        stepPreview,
      );
      return {
        parameters,
        pcbReference,
        stepPreview,
        pcbPreviews,
        customComponentPreviews,
        selectedPart: part,
        selectedFeatureId: nextId,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? part : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  undo: () => {
    const target = historyPast.pop();
    if (!target) return;
    const current = get();
    historyFuture.push({
      snapshot: captureHistorySnapshot(current),
      scope: "redo",
      timestamp: Date.now(),
    });
    historyApplying = true;
    try {
      cachedPcbPreviews = target.snapshot.pcbPreviews;
      cachedCustomComponentPreviews = target.snapshot.customComponentPreviews;
      const persisted = persistSnapshot(
        target.snapshot.projectName,
        target.snapshot.parameters,
        target.snapshot.pcbReference,
        target.snapshot.stepPreview,
      );
      const validFeatureIds = getValidFeatureIds(target.snapshot.parameters);
      const transparentObjectIds = current.transparentObjectIds.filter((id) =>
        getValidObjectIds(target.snapshot.parameters).has(id),
      );
      set({
        ...target.snapshot,
        hiddenFeatureIds: current.hiddenFeatureIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        hiddenPcbBodyIds: current.hiddenPcbBodyIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        lockedFeatureIds: current.lockedFeatureIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        transparentObjectIds,
        lidTransparent: transparentObjectIds.includes("lid"),
        canUndo: historyPast.length > 0,
        canRedo: true,
        cachedAt: persisted.updatedAt,
        cacheStatus: "saving",
      });
    } finally {
      historyApplying = false;
    }
  },
  redo: () => {
    const target = historyFuture.pop();
    if (!target) return;
    const current = get();
    historyPast.push({
      snapshot: captureHistorySnapshot(current),
      scope: "undo",
      timestamp: Date.now(),
    });
    historyApplying = true;
    try {
      cachedPcbPreviews = target.snapshot.pcbPreviews;
      cachedCustomComponentPreviews = target.snapshot.customComponentPreviews;
      const persisted = persistSnapshot(
        target.snapshot.projectName,
        target.snapshot.parameters,
        target.snapshot.pcbReference,
        target.snapshot.stepPreview,
      );
      const validFeatureIds = getValidFeatureIds(target.snapshot.parameters);
      const transparentObjectIds = current.transparentObjectIds.filter((id) =>
        getValidObjectIds(target.snapshot.parameters).has(id),
      );
      set({
        ...target.snapshot,
        hiddenFeatureIds: current.hiddenFeatureIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        hiddenPcbBodyIds: current.hiddenPcbBodyIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        lockedFeatureIds: current.lockedFeatureIds.filter((id) =>
          validFeatureIds.has(id),
        ),
        transparentObjectIds,
        lidTransparent: transparentObjectIds.includes("lid"),
        canUndo: true,
        canRedo: historyFuture.length > 0,
        cachedAt: persisted.updatedAt,
        cacheStatus: "saving",
      });
    } finally {
      historyApplying = false;
    }
  },
  clearHistory: () => {
    historyPast.length = 0;
    historyFuture.length = 0;
    set({ canUndo: false, canRedo: false });
  },
  setEnclosureTemplate: (enclosureTemplateId) =>
    set((state) => {
      const template = getEnclosureTemplate(enclosureTemplateId);
      const parameters = constrainParameters({
        ...state.parameters,
        ...template.parameterOverrides,
        enclosureTemplateId: template.id,
        ...(state.pcbReference
          ? {
              pcbLength: state.parameters.pcbLength,
              pcbWidth: state.parameters.pcbWidth,
              pcbThickness: state.parameters.pcbThickness,
            }
          : {}),
      });
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "project",
        focusedPart: null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setSelectedPart: (selectedPart) =>
    set((state) => {
      const selectedFeatureId =
        selectedPart === "pcb"
          ? state.parameters.pcbReferences[0]?.id ??
            (state.parameters.parametricPcbEnabled
              ? PARAMETRIC_PCB_FEATURE_ID
              : null)
          : selectedPart === "panel"
            ? state.parameters.panelPlacements[0]?.id ?? null
            : selectedPart === "connector"
              ? state.parameters.connectorPlacements[0]?.id ?? null
              : selectedPart === "antenna"
                ? state.parameters.antennaPlacements[0]?.id ?? null
                : selectedPart === "custom"
                  ? state.parameters.customComponents[0]?.id ?? null
                  : selectedPart === "battery"
                    ? state.parameters.batteryCompartments[0]?.id ?? null
                    : null;
      const selectionChanged =
        state.selectedPart !== selectedPart ||
        state.selectedFeatureId !== selectedFeatureId;
      return {
        selectedPart,
        selectedFeatureId,
        focusedPart:
          selectedPart === "project" ? null : state.focusedPart ? selectedPart : null,
        transformEditMode: selectionChanged ? false : state.transformEditMode,
        transformAxisConstraint: selectionChanged
          ? "all"
          : state.transformAxisConstraint,
      };
    }),
  setSelectedFeature: (selectedPart, selectedFeatureId) =>
    set((state) => {
      const selectionChanged =
        state.selectedPart !== selectedPart ||
        state.selectedFeatureId !== selectedFeatureId;
      return {
        selectedPart,
        selectedFeatureId,
        inspectorTab: "structure",
        focusedPart: state.focusedPart ? selectedPart : null,
        transformEditMode: selectionChanged ? false : state.transformEditMode,
        transformAxisConstraint: selectionChanged
          ? "all"
          : state.transformAxisConstraint,
      };
    }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setTransformEditMode: (transformEditMode) =>
    set((state) => ({
      transformEditMode,
      transformAxisConstraint: transformEditMode
        ? state.transformAxisConstraint
        : "all",
    })),
  toggleTransformEditMode: () =>
    set((state) => ({
      transformEditMode: !state.transformEditMode,
      transformAxisConstraint: state.transformEditMode
        ? "all"
        : state.transformAxisConstraint,
    })),
  setTransformAxisConstraint: (transformAxisConstraint) =>
    set({ transformAxisConstraint }),
  focusSelectedPart: () =>
    set((state) => ({
      focusedPart: state.selectedPart === "project" ? null : state.selectedPart,
    })),
  showAllParts: () => set({ focusedPart: null }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleExploded: () => set((state) => ({ exploded: !state.exploded })),
  toggleLidTransparency: () =>
    set((state) => {
      const nextTransparent = state.transparentObjectIds.includes("lid")
        ? state.transparentObjectIds.filter((id) => id !== "lid")
        : [...state.transparentObjectIds, "lid"];
      return {
        lidTransparent: nextTransparent.includes("lid"),
        transparentObjectIds: nextTransparent,
      };
    }),
  toggleObjectTransparency: (id) =>
    set((state) => {
      const transparentObjectIds = state.transparentObjectIds.includes(id)
        ? state.transparentObjectIds.filter((candidate) => candidate !== id)
        : [...state.transparentObjectIds, id];
      return {
        transparentObjectIds,
        lidTransparent: transparentObjectIds.includes("lid"),
      };
    }),
  showAllOpaque: () =>
    set({
      lidTransparent: false,
      transparentObjectIds: [],
    }),
  toggleFaceVisibility: (face) =>
    set((state) => ({
      hiddenFaces: state.hiddenFaces.includes(face)
        ? state.hiddenFaces.filter((candidate) => candidate !== face)
        : [...state.hiddenFaces, face],
    })),
  showAllFaces: () => set({ hiddenFaces: [] }),
  toggleFeatureVisibility: (id) =>
    set((state) => {
      const currentlyHidden = state.hiddenFeatureIds.includes(id);
      return {
        hiddenFeatureIds: currentlyHidden
          ? state.hiddenFeatureIds.filter((candidate) => candidate !== id)
          : [...state.hiddenFeatureIds, id],
        hiddenPcbBodyIds: currentlyHidden
          ? state.hiddenPcbBodyIds.filter((candidate) => candidate !== id)
          : state.hiddenPcbBodyIds,
      };
    }),
  togglePcbBodyVisibility: (id) =>
    set((state) => ({
      hiddenPcbBodyIds: state.hiddenPcbBodyIds.includes(id)
        ? state.hiddenPcbBodyIds.filter((candidate) => candidate !== id)
        : [...state.hiddenPcbBodyIds, id],
    })),
  showAllFeatures: () => set({ hiddenFeatureIds: [], hiddenPcbBodyIds: [] }),
  toggleFeatureLock: (id) =>
    set((state) => ({
      lockedFeatureIds: state.lockedFeatureIds.includes(id)
        ? state.lockedFeatureIds.filter((candidate) => candidate !== id)
        : [...state.lockedFeatureIds, id],
    })),
  resetCamera: () =>
    set((state) => ({ cameraResetToken: state.cameraResetToken + 1 })),
  resetProject: () => {
    cachedPcbPreviews = {};
    cachedCustomComponentPreviews = {};
    const snapshot = persistSnapshot("PCB 控制器外壳", DEFAULT_PARAMETERS, null, null);
    set({
      projectName: "PCB 控制器外壳",
      parameters: DEFAULT_PARAMETERS,
      pcbReference: null,
      stepPreview: null,
      pcbPreviews: {},
      customComponentPreviews: {},
      selectedPart: "project",
      selectedFeatureId: null,
      focusedPart: null,
      inspectorTab: "dimensions",
      exploded: false,
      lidTransparent: false,
      transparentObjectIds: [],
      hiddenFaces: [],
      hiddenFeatureIds: [],
      hiddenPcbBodyIds: [],
      lockedFeatureIds: [],
      cachedAt: snapshot.updatedAt,
      cacheStatus: "saving",
      transformEditMode: false,
      transformAxisConstraint: "all",
    });
  },
  addParametricPcb: () =>
    set((state) => {
      const parameters = constrainParameters({
        ...state.parameters,
        parametricPcbEnabled: true,
      });
      const primaryReference = parameters.pcbReferences[0]?.reference ?? null;
      const primaryPreview = getPrimaryPreview(parameters.pcbReferences, cachedPcbPreviews);
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        primaryReference,
        primaryPreview,
      );
      return {
        parameters,
        pcbReference: primaryReference,
        stepPreview: primaryPreview,
        selectedPart: "pcb",
        selectedFeatureId:
          parameters.pcbReferences.length === 0
            ? PARAMETRIC_PCB_FEATURE_ID
            : parameters.pcbReferences[0]?.id ?? null,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setPcbReference: (pcbReference) =>
    set((state) => {
      const firstReference = state.parameters.pcbReferences.length === 0;
      const id = `pcb-${Date.now().toString(36)}-${state.parameters.pcbReferences.length + 1}`;
      const pcbReferences = [
        ...state.parameters.pcbReferences,
        createPcbReferencePlacement(
          pcbReference,
          id,
          state.parameters.pcbReferences.length,
        ),
      ];
      const parameters = constrainParameters({
        ...state.parameters,
        parametricPcbEnabled: false,
        pcbReferences,
        ...(firstReference
          ? {
              pcbLength: Number(
                (pcbReference.bounds.maxX - pcbReference.bounds.minX).toFixed(3),
              ),
              pcbWidth: Number(
                (pcbReference.bounds.maxY - pcbReference.bounds.minY).toFixed(3),
              ),
              pcbThickness: pcbReference.thickness,
            }
          : {}),
      });
      const primaryReference = pcbReferences[0]?.reference ?? null;
      const primaryPreview = getPrimaryPreview(pcbReferences, cachedPcbPreviews);
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        primaryReference,
        primaryPreview,
      );
      return {
        parameters,
        pcbReference: primaryReference,
        stepPreview: primaryPreview,
        pcbPreviews: cachedPcbPreviews,
        selectedPart: "pcb",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setStepReference: (pcbReference, stepPreview) =>
    set((state) => {
      const firstReference = state.parameters.pcbReferences.length === 0;
      const id = `pcb-${Date.now().toString(36)}-${state.parameters.pcbReferences.length + 1}`;
      const pcbReferences = [
        ...state.parameters.pcbReferences,
        createPcbReferencePlacement(
          pcbReference,
          id,
          state.parameters.pcbReferences.length,
        ),
      ];
      cachedPcbPreviews = { ...cachedPcbPreviews, [id]: stepPreview };
      const parameters = constrainParameters({
        ...state.parameters,
        parametricPcbEnabled: false,
        pcbReferences,
        ...(firstReference
          ? {
              pcbLength: Number(
                (pcbReference.bounds.maxX - pcbReference.bounds.minX).toFixed(3),
              ),
              pcbWidth: Number(
                (pcbReference.bounds.maxY - pcbReference.bounds.minY).toFixed(3),
              ),
              pcbThickness: pcbReference.thickness,
            }
          : {}),
        componentHeight: Math.max(
          state.parameters.componentHeight,
          Number((pcbReference.overallHeight ?? 0).toFixed(3)),
        ),
      });
      const primaryReference = pcbReferences[0]?.reference ?? null;
      const primaryPreview = getPrimaryPreview(pcbReferences, cachedPcbPreviews);
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        primaryReference,
        primaryPreview,
      );
      return {
        parameters,
        pcbReference: primaryReference,
        stepPreview: primaryPreview,
        pcbPreviews: cachedPcbPreviews,
        selectedPart: "pcb",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  updatePcbReferencePlacement: (id, changes) =>
    set((state) => {
      if (state.lockedFeatureIds.includes(id)) return {};
      if (id === PARAMETRIC_PCB_FEATURE_ID) {
        if (!state.parameters.parametricPcbEnabled) return {};
        const railMovementAxis = getPcbRailMovementAxis(state.parameters);
        const parameters = constrainParameters({
          ...state.parameters,
          pcbOffsetX: railMovementAxis !== null && railMovementAxis !== "x"
            ? state.parameters.pcbOffsetX
            : clampPcbPlanarOffset(changes.offsetX ?? state.parameters.pcbOffsetX),
          pcbOffsetZ: railMovementAxis !== null && railMovementAxis !== "z"
            ? state.parameters.pcbOffsetZ
            : clampPcbPlanarOffset(changes.offsetZ ?? state.parameters.pcbOffsetZ),
          pcbElevation: railMovementAxis !== null && railMovementAxis !== "y"
            ? state.parameters.pcbElevation
            : Math.min(
                300,
                Math.max(
                  -state.parameters.standoffHeight,
                  changes.elevation ?? state.parameters.pcbElevation,
                ),
              ),
        });
        const snapshot = persistSnapshot(
          state.projectName,
          parameters,
          parameters.pcbReferences[0]?.reference ?? null,
          getPrimaryPreview(parameters.pcbReferences, cachedPcbPreviews),
        );
        return {
          parameters,
          selectedPart: "pcb",
          selectedFeatureId: id,
          focusedPart: state.focusedPart ? "pcb" : null,
          cachedAt: snapshot.updatedAt,
          cacheStatus: "saving",
        };
      }
      const parameters = {
        ...state.parameters,
        pcbReferences: state.parameters.pcbReferences.map((placement) =>
          placement.id === id
            ? (() => {
                const nextRotation = changes.rotation ?? placement.rotation;
                const railMovementAxis = getPcbRailMovementAxis(
                  state.parameters,
                  nextRotation,
                );
                const rotationChanged =
                  changes.rotation !== undefined &&
                  changes.rotation !== placement.rotation;
                const hasPlanarOffsetChange =
                  changes.offsetX !== undefined || changes.offsetZ !== undefined;
                const rehomeForRailRotation =
                  railMovementAxis !== null &&
                  rotationChanged &&
                  !hasPlanarOffsetChange;
                return {
                  ...placement,
                  ...changes,
                  offsetX: rehomeForRailRotation
                    ? 0
                    : railMovementAxis !== null && railMovementAxis !== "x"
                    ? placement.offsetX
                    : clampPcbPlanarOffset(changes.offsetX ?? placement.offsetX),
                  offsetZ: rehomeForRailRotation
                    ? 0
                    : railMovementAxis !== null && railMovementAxis !== "z"
                    ? placement.offsetZ
                    : clampPcbPlanarOffset(changes.offsetZ ?? placement.offsetZ),
                  elevation: railMovementAxis !== null && railMovementAxis !== "y"
                    ? placement.elevation
                    : Math.min(
                        300,
                        Math.max(
                          -state.parameters.standoffHeight,
                          changes.elevation ?? placement.elevation,
                        ),
                      ),
                };
              })()
            : placement,
        ),
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        parameters.pcbReferences[0]?.reference ?? null,
        getPrimaryPreview(parameters.pcbReferences, cachedPcbPreviews),
      );
      return {
        parameters,
        selectedPart: "pcb",
        selectedFeatureId: id,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  clearPcbReference: (requestedId) =>
    set((state) => {
      const id = requestedId ?? state.parameters.pcbReferences[0]?.id;
      if (requestedId === PARAMETRIC_PCB_FEATURE_ID) {
        if (state.lockedFeatureIds.includes(PARAMETRIC_PCB_FEATURE_ID)) return {};
        const parameters = constrainParameters({
          ...state.parameters,
          parametricPcbEnabled: false,
        });
        const primaryReference = parameters.pcbReferences[0]?.reference ?? null;
        const primaryPreview = getPrimaryPreview(parameters.pcbReferences, cachedPcbPreviews);
        const snapshot = persistSnapshot(
          state.projectName,
          parameters,
          primaryReference,
          primaryPreview,
        );
        const hasPcb = parameters.pcbReferences.length > 0;
        return {
          parameters,
          pcbReference: primaryReference,
          stepPreview: primaryPreview,
          selectedPart:
            state.selectedPart === "pcb" && !hasPcb ? "project" : state.selectedPart,
          selectedFeatureId:
            state.selectedFeatureId === PARAMETRIC_PCB_FEATURE_ID
              ? parameters.pcbReferences[0]?.id ?? null
              : state.selectedFeatureId,
          focusedPart:
            state.focusedPart === "pcb" && !hasPcb ? null : state.focusedPart,
          hiddenFeatureIds: state.hiddenFeatureIds.filter(
            (candidate) => candidate !== PARAMETRIC_PCB_FEATURE_ID,
          ),
          hiddenPcbBodyIds: state.hiddenPcbBodyIds.filter(
            (candidate) => candidate !== PARAMETRIC_PCB_FEATURE_ID,
          ),
          lockedFeatureIds: state.lockedFeatureIds.filter(
            (candidate) => candidate !== PARAMETRIC_PCB_FEATURE_ID,
          ),
          transparentObjectIds: state.transparentObjectIds.filter(
            (candidate) => candidate !== PARAMETRIC_PCB_FEATURE_ID,
          ),
          cachedAt: snapshot.updatedAt,
          cacheStatus: "saving",
        };
      }
      if (!id) return {};
      if (state.lockedFeatureIds.includes(id)) return {};
      const pcbReferences = state.parameters.pcbReferences.filter(
        (placement) => placement.id !== id,
      );
      cachedPcbPreviews = { ...cachedPcbPreviews };
      delete cachedPcbPreviews[id];
      const parameters = { ...state.parameters, pcbReferences };
      const primaryReference = pcbReferences[0]?.reference ?? null;
      const primaryPreview = getPrimaryPreview(pcbReferences, cachedPcbPreviews);
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        primaryReference,
        primaryPreview,
      );
      return {
        parameters,
        pcbReference: primaryReference,
        stepPreview: primaryPreview,
        pcbPreviews: cachedPcbPreviews,
        selectedPart:
          state.selectedPart === "pcb" && pcbReferences.length === 0
            ? "project"
            : state.selectedPart,
        selectedFeatureId:
          state.selectedPart === "pcb" && state.selectedFeatureId === id
            ? pcbReferences[0]?.id ?? null
            : state.selectedFeatureId,
        focusedPart:
          state.focusedPart === "pcb" && pcbReferences.length === 0
            ? null
            : state.focusedPart,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  loadProject: (snapshot) => {
    cachedPcbPreviews = {};
    cachedCustomComponentPreviews = {};
    const parameters = withLegacyPcbReference(
      normalizeDesignerParameters(snapshot.parameters),
      snapshot.pcbReference,
    );
    const pcbReference = parameters.pcbReferences[0]?.reference ?? null;
    const persisted = persistSnapshot(snapshot.name, parameters, pcbReference, null);
    set({
      projectName: snapshot.name,
      parameters,
      pcbReference,
      stepPreview: null,
      pcbPreviews: {},
      customComponentPreviews: {},
      hiddenFaces: [],
      hiddenFeatureIds: [],
      hiddenPcbBodyIds: [],
      lockedFeatureIds: [],
      transparentObjectIds: [],
      lidTransparent: false,
      selectedPart: "project",
      selectedFeatureId: null,
      focusedPart: null,
      transformEditMode: false,
      transformAxisConstraint: "all",
      cachedAt: persisted.updatedAt,
      cacheStatus: "saving",
    });
  },
  restoreCachedProject: async () => {
    try {
      const cached = await readProjectCache();
      set((state) => {
        if (!cached || !isProjectSnapshot(cached.snapshot)) {
          return { cacheStatus: "saved" };
        }
        const cachedTime = Date.parse(cached.snapshot.updatedAt);
        const currentTime = state.cachedAt ? Date.parse(state.cachedAt) : 0;
        if (!Number.isFinite(cachedTime) || cachedTime < currentTime) {
          return { cacheStatus: "saved" };
        }
        const parameters = withLegacyPcbReference(
          normalizeDesignerParameters(cached.snapshot.parameters),
          cached.snapshot.pcbReference,
        );
        cachedPcbPreviews = cached.pcbPreviews ?? {};
        if (
          Object.keys(cachedPcbPreviews).length === 0 &&
          cached.stepPreview &&
          parameters.pcbReferences[0]
        ) {
          cachedPcbPreviews = {
            [parameters.pcbReferences[0].id]: cached.stepPreview,
          };
        }
        cachedCustomComponentPreviews = cached.customComponentPreviews ?? {};
        return {
          projectName: cached.snapshot.name,
          parameters,
          pcbReference: parameters.pcbReferences[0]?.reference ?? null,
          stepPreview: getPrimaryPreview(parameters.pcbReferences, cachedPcbPreviews),
          pcbPreviews: cachedPcbPreviews,
          customComponentPreviews: cachedCustomComponentPreviews,
          hiddenFeatureIds: [],
          hiddenPcbBodyIds: [],
          lockedFeatureIds: [],
          transparentObjectIds: [],
          lidTransparent: false,
          selectedFeatureId: null,
          focusedPart: null,
          transformEditMode: false,
          transformAxisConstraint: "all",
          cachedAt: cached.snapshot.updatedAt,
          cacheStatus: "saved",
        };
      });
    } catch {
      set({ cacheStatus: "error" });
    }
  },
}));

useDesignerStore.subscribe((state, previous) => {
  if (
    historyApplying ||
    previous.cacheStatus === "restoring" ||
    (state.parameters === previous.parameters &&
      state.projectName === previous.projectName &&
      state.pcbReference === previous.pcbReference &&
      state.stepPreview === previous.stepPreview &&
      state.pcbPreviews === previous.pcbPreviews &&
      state.customComponentPreviews === previous.customComponentPreviews)
  ) {
    return;
  }

  const timestamp = Date.now();
  const scope = getHistoryScope(previous, state);
  const last = historyPast[historyPast.length - 1];
  if (
    !last ||
    last.scope !== scope ||
    timestamp - last.timestamp > HISTORY_COALESCE_MS
  ) {
    historyPast.push({
      snapshot: captureHistorySnapshot(previous),
      scope,
      timestamp,
    });
    if (historyPast.length > HISTORY_LIMIT) historyPast.shift();
  } else {
    last.timestamp = timestamp;
  }
  historyFuture.length = 0;
  const validFeatureIds = getValidFeatureIds(state.parameters);
  const validObjectIds = getValidObjectIds(state.parameters);
  const transparentObjectIds = state.transparentObjectIds.filter((id) =>
    validObjectIds.has(id),
  );
  useDesignerStore.setState({
    canUndo: historyPast.length > 0,
    canRedo: false,
    hiddenFeatureIds: state.hiddenFeatureIds.filter((id) => validFeatureIds.has(id)),
    hiddenPcbBodyIds: state.hiddenPcbBodyIds.filter((id) =>
      validFeatureIds.has(id),
    ),
    lockedFeatureIds: state.lockedFeatureIds.filter((id) => validFeatureIds.has(id)),
    transparentObjectIds,
    lidTransparent: transparentObjectIds.includes("lid"),
  });
});

export function createProjectSnapshot(
  name: string,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): ProjectSnapshot {
  return {
    schemaVersion: 1,
    name,
    updatedAt: new Date().toISOString(),
    parameters,
    pcbReference,
  };
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectSnapshot>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.name === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.parameters === "object" &&
    candidate.parameters !== null
  );
}
