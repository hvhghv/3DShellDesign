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
import { getConnectorDefinition } from "../libraries/components";
import { getEnclosureTemplate } from "../libraries/templates";

const STORAGE_KEY = "3dshell-designer.project.v1";

interface DesignerState {
  projectName: string;
  parameters: DesignerParameters;
  pcbReference: PcbReference | null;
  stepPreview: StepPreview | null;
  selectedPart: SelectablePart;
  inspectorTab: InspectorTab;
  showGrid: boolean;
  exploded: boolean;
  cameraResetToken: number;
  savedAt: string | null;
  setParameter: <Key extends keyof DesignerParameters>(
    key: Key,
    value: DesignerParameters[Key],
  ) => void;
  setConnectorDefinition: (id: string) => void;
  setEnclosureTemplate: (id: string) => void;
  setSelectedPart: (part: SelectablePart) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleGrid: () => void;
  toggleExploded: () => void;
  resetCamera: () => void;
  resetProject: () => void;
  setPcbReference: (reference: PcbReference) => void;
  setStepReference: (reference: PcbReference, preview: StepPreview) => void;
  clearPcbReference: () => void;
  loadProject: (snapshot: ProjectSnapshot) => void;
  markSaved: (savedAt: string) => void;
}

function loadPersistedProject(): Pick<
  DesignerState,
  "projectName" | "parameters" | "pcbReference"
> {
  const fallback = {
    projectName: "PCB 控制器外壳",
    parameters: DEFAULT_PARAMETERS,
    pcbReference: null,
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
    };
  } catch {
    return fallback;
  }
}

function persistSnapshot(
  projectName: string,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): void {
  if (typeof window === "undefined") return;
  const snapshot: ProjectSnapshot = {
    schemaVersion: 1,
    name: projectName,
    updatedAt: new Date().toISOString(),
    parameters,
    pcbReference,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

const persistedProject = loadPersistedProject();

export const useDesignerStore = create<DesignerState>((set) => ({
  projectName: persistedProject.projectName,
  parameters: persistedProject.parameters,
  pcbReference: persistedProject.pcbReference,
  stepPreview: null,
  selectedPart: "project",
  inspectorTab: "dimensions",
  showGrid: true,
  exploded: false,
  cameraResetToken: 0,
  savedAt: null,
  setParameter: (key, value) =>
    set((state) => {
      const nextParameters = {
        ...state.parameters,
        [key]: clampParameter(key, value) as DesignerParameters[typeof key],
      };
      persistSnapshot(state.projectName, nextParameters, state.pcbReference);
      return { parameters: nextParameters, savedAt: null };
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
      persistSnapshot(state.projectName, parameters, state.pcbReference);
      return { parameters, selectedPart: "connector", savedAt: null };
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
      persistSnapshot(state.projectName, parameters, state.pcbReference);
      return { parameters, selectedPart: "project", savedAt: null };
    }),
  setSelectedPart: (selectedPart) => set({ selectedPart }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleExploded: () => set((state) => ({ exploded: !state.exploded })),
  resetCamera: () =>
    set((state) => ({ cameraResetToken: state.cameraResetToken + 1 })),
  resetProject: () => {
    persistSnapshot("PCB 控制器外壳", DEFAULT_PARAMETERS, null);
    set({
      projectName: "PCB 控制器外壳",
      parameters: DEFAULT_PARAMETERS,
      pcbReference: null,
      stepPreview: null,
      selectedPart: "project",
      inspectorTab: "dimensions",
      exploded: false,
      savedAt: null,
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
      persistSnapshot(state.projectName, parameters, pcbReference);
      return {
        parameters,
        pcbReference,
        stepPreview: null,
        selectedPart: "pcb",
        savedAt: null,
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
      persistSnapshot(state.projectName, parameters, pcbReference);
      return {
        parameters,
        pcbReference,
        stepPreview,
        selectedPart: "pcb",
        savedAt: null,
      };
    }),
  clearPcbReference: () =>
    set((state) => {
      persistSnapshot(state.projectName, state.parameters, null);
      return { pcbReference: null, stepPreview: null, savedAt: null };
    }),
  loadProject: (snapshot) => {
    const parameters = { ...DEFAULT_PARAMETERS, ...snapshot.parameters };
    const pcbReference = snapshot.pcbReference ?? null;
    persistSnapshot(snapshot.name, parameters, pcbReference);
    set({
      projectName: snapshot.name,
      parameters,
      pcbReference,
      stepPreview: null,
      selectedPart: "project",
      savedAt: snapshot.updatedAt,
    });
  },
  markSaved: (savedAt) => set({ savedAt }),
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
