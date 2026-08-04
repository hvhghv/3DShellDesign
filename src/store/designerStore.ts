import { create } from "zustand";
import { clampParameter, DEFAULT_PARAMETERS } from "../domain/enclosure";
import type {
  DesignerParameters,
  InspectorTab,
  PcbReference,
  ProjectSnapshot,
  SelectablePart,
  StepPreview,
} from "../domain/model";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";
import { getEnclosureTemplate } from "../libraries/templates";
import { queueProjectCache, readProjectCache } from "./projectCache";

const STORAGE_KEY = "3dshell-designer.project.v1";
type CacheStatus = "restoring" | "saving" | "saved" | "error";

interface DesignerState {
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  stepPreview: StepPreview | null;
  selectedPart: SelectablePart;
  focusedPart: SelectablePart | null;
  inspectorTab: InspectorTab;
  showGrid: boolean;
  exploded: boolean;
  cameraResetToken: number;
  cachedAt: string | null;
  cacheStatus: CacheStatus;
  setParameter: <Key extends keyof DesignerParameters>(
    key: Key,
    value: DesignerParameters[Key],
  ) => void;
  setConnectorDefinition: (id: string) => void;
  setAntennaDefinition: (id: string) => void;
  setEnclosureTemplate: (id: string) => void;
  setSelectedPart: (part: SelectablePart) => void;
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
  if (part === "panel") return parameters.panelEnabled;
  if (part === "connector") return parameters.typeCPortEnabled;
  if (part === "antenna") return parameters.antennaEnabled;
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
      parameters: { ...DEFAULT_PARAMETERS, ...snapshot.parameters },
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

export const useDesignerStore = create<DesignerState>((set) => ({
  projectName: persistedProject.projectName,
  parameters: persistedProject.parameters,
  pcbReference: persistedProject.pcbReference,
  stepPreview: null,
  selectedPart: "project",
  focusedPart: null,
  inspectorTab: "dimensions",
  showGrid: true,
  exploded: false,
  cameraResetToken: 0,
  cachedAt: persistedProject.cachedAt,
  cacheStatus: "restoring",
  setParameter: (key, value) =>
    set((state) => {
      const nextParameters = {
        ...state.parameters,
        [key]: clampParameter(key, value) as DesignerParameters[typeof key],
      };
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
  setConnectorDefinition: (connectorDefinitionId) =>
    set((state) => {
      const definition = getConnectorDefinition(connectorDefinitionId);
      const parameters = {
        ...state.parameters,
        connectorDefinitionId: definition.id,
        typeCPortWidth: definition.panelCutout.width,
        typeCPortHeight: definition.panelCutout.height,
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "connector",
        focusedPart: state.focusedPart ? "connector" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setAntennaDefinition: (antennaDefinitionId) =>
    set((state) => {
      const antenna = getAntennaDefinition(antennaDefinitionId);
      const parameters = {
        ...state.parameters,
        antennaDefinitionId: antenna.id,
      };
      const snapshot = persistSnapshot(
        state.projectName,
        parameters,
        state.pcbReference,
        state.stepPreview,
      );
      return {
        parameters,
        selectedPart: "antenna",
        focusedPart: state.focusedPart ? "antenna" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setEnclosureTemplate: (enclosureTemplateId) =>
    set((state) => {
      const template = getEnclosureTemplate(enclosureTemplateId);
      const parameters = {
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
      };
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
      focusedPart:
        selectedPart === "project" ? null : state.focusedPart ? selectedPart : null,
    })),
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
      focusedPart: null,
      inspectorTab: "dimensions",
      exploded: false,
      cachedAt: snapshot.updatedAt,
      cacheStatus: "saving",
    });
  },
  setPcbReference: (pcbReference) =>
    set((state) => {
      const parameters = {
        ...state.parameters,
        pcbLength: Number(
          (pcbReference.bounds.maxX - pcbReference.bounds.minX).toFixed(3),
        ),
        pcbWidth: Number(
          (pcbReference.bounds.maxY - pcbReference.bounds.minY).toFixed(3),
        ),
        pcbThickness: pcbReference.thickness,
      };
      const snapshot = persistSnapshot(state.projectName, parameters, pcbReference, null);
      return {
        parameters,
        pcbReference,
        stepPreview: null,
        selectedPart: "pcb",
        focusedPart: state.focusedPart ? "pcb" : null,
        cachedAt: snapshot.updatedAt,
        cacheStatus: "saving",
      };
    }),
  setStepReference: (pcbReference, stepPreview) =>
    set((state) => {
      const parameters = {
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
      };
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
    const parameters = { ...DEFAULT_PARAMETERS, ...snapshot.parameters };
    const pcbReference = snapshot.pcbReference ?? null;
    const persisted = persistSnapshot(snapshot.name, parameters, pcbReference, null);
    set({
      projectName: snapshot.name,
      parameters,
      pcbReference,
      stepPreview: null,
      selectedPart: "project",
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
          parameters: { ...DEFAULT_PARAMETERS, ...cached.snapshot.parameters },
          pcbReference: cached.snapshot.pcbReference ?? null,
          stepPreview: cached.stepPreview,
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
