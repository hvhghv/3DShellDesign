import { create } from "zustand";
import {
  clampParameter,
  DEFAULT_PARAMETERS,
  deriveEnclosureDimensions,
  normalizeDesignerParameters,
} from "../domain/enclosure";
import type {
  AntennaPlacement,
  ConnectorPlacement,
  DesignerParameters,
  InspectorTab,
  PcbReference,
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
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getEnclosureTemplate } from "../libraries/templates";
import { queueProjectCache, readProjectCache } from "./projectCache";

const STORAGE_KEY = "3dshell-designer.project.v1";
type CacheStatus = "restoring" | "saving" | "saved" | "error";
export type TransformMode = "move" | "scale";

interface DesignerState {
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  stepPreview: StepPreview | null;
  selectedPart: SelectablePart;
  selectedFeatureId: string | null;
  focusedPart: SelectablePart | null;
  inspectorTab: InspectorTab;
  showGrid: boolean;
  exploded: boolean;
  cameraResetToken: number;
  cachedAt: string | null;
  cacheStatus: CacheStatus;
  transformMode: TransformMode;
  setParameter: <Key extends keyof DesignerParameters>(
    key: Key,
    value: DesignerParameters[Key],
  ) => void;
  addConnectorPlacement: (definitionId?: string) => void;
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
  addAntennaPlacement: (definitionId?: string) => void;
  updateAntennaPlacement: (
    id: string,
    changes: Partial<Omit<AntennaPlacement, "id">>,
  ) => void;
  setAntennaDefinition: (placementId: string, definitionId: string) => void;
  removeAntennaPlacement: (id: string) => void;
  setEnclosureTemplate: (id: string) => void;
  setSelectedPart: (part: SelectablePart) => void;
  setSelectedFeature: (part: "panel" | "connector" | "antenna", id: string) => void;
  setTransformMode: (mode: TransformMode) => void;
  focusSelectedPart: () => void;
  showAllParts: () => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleGrid: () => void;
  toggleExploded: () => void;
  resetCamera: () => void;
  resetProject: () => void;
  setPcbReference: (reference: PcbReference) => void;
  setStepReference: (reference: PcbReference, preview: StepPreview) => void;
  clearPcbReference: () => void;
  loadProject: (snapshot: ProjectSnapshot) => void;
  restoreCachedProject: () => Promise<void>;
}

function isPartAvailable(part: SelectablePart, parameters: DesignerParameters): boolean {
  if (part === "panel") return parameters.panelPlacements.length > 0;
  if (part === "connector") return parameters.connectorPlacements.length > 0;
  if (part === "antenna") return parameters.antennaPlacements.length > 0;
  return true;
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
      parameters: normalizeDesignerParameters(snapshot.parameters),
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
    void queueProjectCache(snapshot, stepPreview)
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

function constrainParameters(parameters: DesignerParameters): DesignerParameters {
  return constrainSurfacePlacements(
    parameters,
    deriveEnclosureDimensions(parameters),
  );
}

export const useDesignerStore = create<DesignerState>((set) => ({
  projectName: persistedProject.projectName,
  parameters: persistedProject.parameters,
  pcbReference: persistedProject.pcbReference,
  stepPreview: null,
  selectedPart: "project",
  selectedFeatureId: null,
  focusedPart: null,
  inspectorTab: "dimensions",
  showGrid: true,
  exploded: false,
  cameraResetToken: 0,
  cachedAt: persistedProject.cachedAt,
  cacheStatus: "restoring",
  transformMode: "move",
  setParameter: (key, value) =>
    set((state) => {
      const nextParameters = constrainParameters({
        ...state.parameters,
        [key]: clampParameter(key, value) as DesignerParameters[typeof key],
      });
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
  addConnectorPlacement: (definitionId = "usb-c-receptacle") =>
    set((state) => {
      const id = `connector-${Date.now().toString(36)}-${state.parameters.connectorPlacements.length + 1}`;
      const parameters = constrainParameters({
        ...state.parameters,
        connectorPlacements: [
          ...state.parameters.connectorPlacements,
          createConnectorPlacement(definitionId, id),
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
  addAntennaPlacement: (definitionId = "sma-bulkhead-whip") =>
    set((state) => {
      const id = `antenna-${Date.now().toString(36)}-${state.parameters.antennaPlacements.length + 1}`;
      const placement = createAntennaPlacement(
        state.parameters,
        definitionId,
        id,
      );
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
    set((state) => ({
      selectedPart,
      selectedFeatureId:
        selectedPart === "panel"
          ? state.parameters.panelPlacements[0]?.id ?? null
          : selectedPart === "connector"
            ? state.parameters.connectorPlacements[0]?.id ?? null
            : selectedPart === "antenna"
              ? state.parameters.antennaPlacements[0]?.id ?? null
            : null,
      focusedPart:
        selectedPart === "project" ? null : state.focusedPart ? selectedPart : null,
    })),
  setSelectedFeature: (selectedPart, selectedFeatureId) =>
    set((state) => ({
      selectedPart,
      selectedFeatureId,
      inspectorTab: "structure",
      focusedPart: state.focusedPart ? selectedPart : null,
    })),
  setTransformMode: (transformMode) => set({ transformMode }),
  focusSelectedPart: () =>
    set((state) => ({
      focusedPart: state.selectedPart === "project" ? null : state.selectedPart,
    })),
  showAllParts: () => set({ focusedPart: null }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleExploded: () => set((state) => ({ exploded: !state.exploded })),
  resetCamera: () =>
    set((state) => ({ cameraResetToken: state.cameraResetToken + 1 })),
  resetProject: () => {
    const snapshot = persistSnapshot("PCB 控制器外壳", DEFAULT_PARAMETERS, null, null);
    set({
      projectName: "PCB 控制器外壳",
      parameters: DEFAULT_PARAMETERS,
      pcbReference: null,
      stepPreview: null,
      selectedPart: "project",
      selectedFeatureId: null,
      focusedPart: null,
      inspectorTab: "dimensions",
      exploded: false,
      cachedAt: snapshot.updatedAt,
      cacheStatus: "saving",
    });
  },
  setPcbReference: (pcbReference) =>
    set((state) => {
      const parameters = constrainParameters({
        ...state.parameters,
        pcbLength: Number(
          (pcbReference.bounds.maxX - pcbReference.bounds.minX).toFixed(3),
        ),
        pcbWidth: Number(
          (pcbReference.bounds.maxY - pcbReference.bounds.minY).toFixed(3),
        ),
        pcbThickness: pcbReference.thickness,
      });
      const snapshot = persistSnapshot(state.projectName, parameters, pcbReference, null);
      return {
        parameters,
        pcbReference,
        stepPreview: null,
        selectedPart: "pcb",
        selectedFeatureId: null,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setStepReference: (pcbReference, stepPreview) =>
    set((state) => {
      const parameters = constrainParameters({
        ...state.parameters,
        pcbLength: Number(
          (pcbReference.bounds.maxX - pcbReference.bounds.minX).toFixed(3),
        ),
        pcbWidth: Number(
          (pcbReference.bounds.maxY - pcbReference.bounds.minY).toFixed(3),
        ),
        componentHeight: Math.max(
          state.parameters.componentHeight,
          Number((pcbReference.overallHeight ?? 0).toFixed(3)),
        ),
      });
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
        selectedPart: "pcb",
        selectedFeatureId: null,
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  clearPcbReference: () =>
    set((state) => {
      const snapshot = persistSnapshot(state.projectName, state.parameters, null, null);
      return {
        pcbReference: null,
        stepPreview: null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  loadProject: (snapshot) => {
    const parameters = normalizeDesignerParameters(snapshot.parameters);
    const pcbReference = snapshot.pcbReference ?? null;
    const persisted = persistSnapshot(snapshot.name, parameters, pcbReference, null);
    set({
      projectName: snapshot.name,
      parameters,
      pcbReference,
      stepPreview: null,
      selectedPart: "project",
      selectedFeatureId: null,
      focusedPart: null,
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
        return {
          projectName: cached.snapshot.name,
          parameters: normalizeDesignerParameters(cached.snapshot.parameters),
          pcbReference: cached.snapshot.pcbReference ?? null,
          stepPreview: cached.stepPreview,
          selectedFeatureId: null,
          focusedPart: null,
          cachedAt: cached.snapshot.updatedAt,
          cacheStatus: "saved",
        };
      });
    } catch {
      set({ cacheStatus: "error" });
    }
  },
}));

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
