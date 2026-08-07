import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { CircleAlert, CircleCheck, Ruler, Save } from "lucide-react";
import { AssemblyTree } from "./components/AssemblyTree";
import { Inspector } from "./components/Inspector";
import { Toolbar } from "./components/Toolbar";
import { Viewport } from "./components/Viewport";
import { deriveEnclosureDimensions, validateDesign } from "./domain/enclosure";
import { getMaterial } from "./domain/materials";
import { SELECTABLE_PART_LABELS } from "./domain/parts";
import { importKicadPcb } from "./importers/kicadWorkerClient";
import { importGerberExcellon } from "./importers/gerberWorkerClient";
import { importStepReference } from "./importers/stepWorkerClient";
import {
  createProjectSnapshot,
  isProjectSnapshot,
  useDesignerStore,
} from "./store/designerStore";

type ResizablePane = "assembly" | "inspector";

interface PaneWidths {
  assembly: number;
  inspector: number;
}

const PANE_WIDTH_STORAGE_KEY = "3dshelldesigner:pane-widths";
const DEFAULT_PANE_WIDTHS: PaneWidths = {
  assembly: 224,
  inspector: 320,
};
const PANE_WIDTH_LIMITS = {
  assembly: { min: 170, max: 460 },
  inspector: { min: 260, max: 560 },
} as const;
const MIN_VIEWPORT_WIDTH = 320;

function clampNumber(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  return Math.min(safeMax, Math.max(min, value));
}

function fitPaneWidthsToWorkbench(
  widths: PaneWidths,
  workbenchWidth: number | null,
): PaneWidths {
  let assembly = clampNumber(
    widths.assembly,
    PANE_WIDTH_LIMITS.assembly.min,
    PANE_WIDTH_LIMITS.assembly.max,
  );
  let inspector = clampNumber(
    widths.inspector,
    PANE_WIDTH_LIMITS.inspector.min,
    PANE_WIDTH_LIMITS.inspector.max,
  );

  if (workbenchWidth && workbenchWidth > 0) {
    const availableForPanes = workbenchWidth - MIN_VIEWPORT_WIDTH - 16;
    const minimumPanes =
      PANE_WIDTH_LIMITS.assembly.min + PANE_WIDTH_LIMITS.inspector.min;
    const maxPaneTotal = Math.max(minimumPanes, availableForPanes);
    const paneTotal = assembly + inspector;

    if (paneTotal > maxPaneTotal) {
      const overflow = paneTotal - maxPaneTotal;
      const assemblyFlex = assembly - PANE_WIDTH_LIMITS.assembly.min;
      const inspectorFlex = inspector - PANE_WIDTH_LIMITS.inspector.min;
      const totalFlex = assemblyFlex + inspectorFlex;
      if (totalFlex > 0) {
        assembly -= overflow * (assemblyFlex / totalFlex);
        inspector -= overflow * (inspectorFlex / totalFlex);
      }
    }
  }

  return {
    assembly: Math.round(
      clampNumber(
        assembly,
        PANE_WIDTH_LIMITS.assembly.min,
        PANE_WIDTH_LIMITS.assembly.max,
      ),
    ),
    inspector: Math.round(
      clampNumber(
        inspector,
        PANE_WIDTH_LIMITS.inspector.min,
        PANE_WIDTH_LIMITS.inspector.max,
      ),
    ),
  };
}

function loadPaneWidths(): PaneWidths {
  try {
    const raw = window.localStorage.getItem(PANE_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_PANE_WIDTHS;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Partial<PaneWidths>).assembly === "number" &&
      typeof (parsed as Partial<PaneWidths>).inspector === "number"
    ) {
      return fitPaneWidthsToWorkbench(parsed as PaneWidths, null);
    }
  } catch {
    // Ignore corrupted local layout preferences.
  }
  return DEFAULT_PANE_WIDTHS;
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    ),
  );
}

export default function App() {
  const [mobileAssemblyOpen, setMobileAssemblyOpen] = useState(false);
  const [paneWidths, setPaneWidths] = useState<PaneWidths>(() => loadPaneWidths());
  const [resizingPane, setResizingPane] = useState<ResizablePane | null>(null);
  const [workbenchWidth, setWorkbenchWidth] = useState<number | null>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pcbInputRef = useRef<HTMLInputElement>(null);
  const manufacturingInputRef = useRef<HTMLInputElement>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);
  const projectName = useDesignerStore((state) => state.projectName);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const lockedFeatureIds = useDesignerStore((state) => state.lockedFeatureIds);
  const cachedAt = useDesignerStore((state) => state.cachedAt);
  const cacheStatus = useDesignerStore((state) => state.cacheStatus);
  const loadProject = useDesignerStore((state) => state.loadProject);
  const setPcbReference = useDesignerStore((state) => state.setPcbReference);
  const setStepReference = useDesignerStore((state) => state.setStepReference);
  const restoreCachedProject = useDesignerStore((state) => state.restoreCachedProject);
  const removePanelPlacement = useDesignerStore((state) => state.removePanelPlacement);
  const removeConnectorPlacement = useDesignerStore(
    (state) => state.removeConnectorPlacement,
  );
  const removeAntennaPlacement = useDesignerStore(
    (state) => state.removeAntennaPlacement,
  );
  const removeCustomComponent = useDesignerStore(
    (state) => state.removeCustomComponent,
  );
  const removeBatteryCompartment = useDesignerStore(
    (state) => state.removeBatteryCompartment,
  );
  const clearPcbReference = useDesignerStore((state) => state.clearPcbReference);
  const duplicateFeature = useDesignerStore((state) => state.duplicateFeature);
  const undo = useDesignerStore((state) => state.undo);
  const redo = useDesignerStore((state) => state.redo);
  const dimensions = useMemo(() => deriveEnclosureDimensions(parameters), [parameters]);
  const issues = useMemo(
    () => validateDesign(parameters, pcbReference),
    [parameters, pcbReference],
  );
  const errorCount = issues.filter((issue) => issue.level === "error").length;

  useEffect(() => {
    void restoreCachedProject();
  }, [restoreCachedProject]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PANE_WIDTH_STORAGE_KEY,
        JSON.stringify(paneWidths),
      );
    } catch {
      // Layout preferences are optional and should not block the editor.
    }
  }, [paneWidths]);

  useEffect(() => {
    const workbench = workbenchRef.current;
    if (!workbench) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? workbench.clientWidth;
      setWorkbenchWidth(width);
      setPaneWidths((current) => {
        const fitted = fitPaneWidthsToWorkbench(current, width);
        return fitted.assembly === current.assembly &&
          fitted.inspector === current.inspector
          ? current
          : fitted;
      });
    });
    observer.observe(workbench);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleEditingShortcuts = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        isEditingText(event.target) ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }

      const key = event.key.toLocaleLowerCase();
      if (key === "z") {
        if (event.shiftKey) redo();
        else undo();
        event.preventDefault();
        return;
      }
      if (key === "y") {
        redo();
        event.preventDefault();
        return;
      }
      if (
        key === "d" &&
        selectedFeatureId &&
        (selectedPart === "pcb" ||
          selectedPart === "panel" ||
          selectedPart === "connector" ||
          selectedPart === "antenna" ||
          selectedPart === "custom" ||
          selectedPart === "battery")
      ) {
        duplicateFeature(selectedPart, selectedFeatureId);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleEditingShortcuts);
    return () => window.removeEventListener("keydown", handleEditingShortcuts);
  }, [duplicateFeature, redo, selectedFeatureId, selectedPart, undo]);

  useEffect(() => {
    const deleteSelectedFeature = (event: KeyboardEvent) => {
      if (
        event.key !== "Delete" ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditingText(event.target) ||
        !selectedFeatureId ||
        lockedFeatureIds.includes(selectedFeatureId)
      ) {
        return;
      }

      if (selectedPart === "panel") removePanelPlacement(selectedFeatureId);
      else if (selectedPart === "connector") {
        removeConnectorPlacement(selectedFeatureId);
      } else if (selectedPart === "antenna") {
        removeAntennaPlacement(selectedFeatureId);
      } else if (selectedPart === "custom") {
        removeCustomComponent(selectedFeatureId);
      } else if (selectedPart === "battery") {
        removeBatteryCompartment(selectedFeatureId);
      } else if (selectedPart === "pcb") {
        clearPcbReference(selectedFeatureId);
      } else {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("keydown", deleteSelectedFeature);
    return () => window.removeEventListener("keydown", deleteSelectedFeature);
  }, [
    removeAntennaPlacement,
    removeCustomComponent,
    removeBatteryCompartment,
    clearPcbReference,
    lockedFeatureIds,
    removeConnectorPlacement,
    removePanelPlacement,
    selectedFeatureId,
    selectedPart,
  ]);

  const exportProject = () => {
    const snapshot = createProjectSnapshot(projectName, parameters, pcbReference);
    downloadJson("3dshelldesigner-project.json", snapshot);
  };

  const resizePane = (pane: ResizablePane, clientX: number, startX: number, startWidths: PaneWidths) => {
    const currentWorkbenchWidth = workbenchWidth ?? window.innerWidth;
    setPaneWidths(() => {
      const next: PaneWidths = { ...startWidths };
      if (pane === "assembly") {
        const maxWidth = Math.min(
          PANE_WIDTH_LIMITS.assembly.max,
          currentWorkbenchWidth -
            MIN_VIEWPORT_WIDTH -
            startWidths.inspector -
            16,
        );
        next.assembly = clampNumber(
          startWidths.assembly + clientX - startX,
          PANE_WIDTH_LIMITS.assembly.min,
          maxWidth,
        );
      } else {
        const maxWidth = Math.min(
          PANE_WIDTH_LIMITS.inspector.max,
          currentWorkbenchWidth -
            MIN_VIEWPORT_WIDTH -
            startWidths.assembly -
            16,
        );
        next.inspector = clampNumber(
          startWidths.inspector - (clientX - startX),
          PANE_WIDTH_LIMITS.inspector.min,
          maxWidth,
        );
      }
      return fitPaneWidthsToWorkbench(next, currentWorkbenchWidth);
    });
  };

  const beginPaneResize =
    (pane: ResizablePane) =>
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidths = paneWidths;
      setResizingPane(pane);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        resizePane(pane, moveEvent.clientX, startX, startWidths);
      };
      const handlePointerUp = () => {
        setResizingPane(null);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    };

  const nudgePaneWidth = (pane: ResizablePane, delta: number) => {
    const currentWorkbenchWidth = workbenchWidth ?? window.innerWidth;
    setPaneWidths((current) => {
      const next: PaneWidths =
        pane === "assembly"
          ? { ...current, assembly: current.assembly + delta }
          : { ...current, inspector: current.inspector + delta };
      return fitPaneWidthsToWorkbench(next, currentWorkbenchWidth);
    });
  };

  const resetPaneWidth = (pane: ResizablePane) => {
    const currentWorkbenchWidth = workbenchWidth ?? window.innerWidth;
    setPaneWidths((current) =>
      fitPaneWidthsToWorkbench(
        pane === "assembly"
          ? { ...current, assembly: DEFAULT_PANE_WIDTHS.assembly }
          : { ...current, inspector: DEFAULT_PANE_WIDTHS.inspector },
        currentWorkbenchWidth,
      ),
    );
  };

  const handlePaneResizeKeyDown =
    (pane: ResizablePane) =>
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowLeft") {
        nudgePaneWidth(pane, pane === "assembly" ? -16 : 16);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        nudgePaneWidth(pane, pane === "assembly" ? 16 : -16);
        event.preventDefault();
      } else if (event.key === "Home") {
        nudgePaneWidth(
          pane,
          pane === "assembly"
            ? PANE_WIDTH_LIMITS.assembly.min - paneWidths.assembly
            : PANE_WIDTH_LIMITS.inspector.min - paneWidths.inspector,
        );
        event.preventDefault();
      } else if (event.key === "End") {
        nudgePaneWidth(
          pane,
          pane === "assembly"
            ? PANE_WIDTH_LIMITS.assembly.max - paneWidths.assembly
            : PANE_WIDTH_LIMITS.inspector.max - paneWidths.inspector,
        );
        event.preventDefault();
      }
    };

  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isProjectSnapshot(parsed)) throw new Error("项目格式或版本不受支持");
      loadProject(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取项目文件";
      window.alert(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importPcb = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) {
          throw new Error("KiCad PCB 文件不能超过 15 MiB");
        }
        setPcbReference(await importKicadPcb(await file.arrayBuffer(), file.name));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取 KiCad PCB";
      window.alert(message);
    } finally {
      if (pcbInputRef.current) pcbInputRef.current.value = "";
    }
  };

  const importManufacturingReference = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const selected = Array.from(files);
      if (selected.length > 2) throw new Error("请只选择一个板框 Gerber 和一个可选钻孔文件");
      if (selected.some((file) => file.size > 15 * 1024 * 1024)) {
        throw new Error("单个制造文件不能超过 15 MiB");
      }
      const drillFiles = selected.filter((file) => /\.(drl|xln|exc|drill)$/i.test(file.name));
      const outlineFiles = selected.filter((file) => !drillFiles.includes(file));
      if (outlineFiles.length !== 1 || drillFiles.length > 1) {
        throw new Error("需要明确选择一个板框 Gerber，可附加一个 Excellon 钻孔文件");
      }
      const outline = outlineFiles[0];
      const drill = drillFiles[0] ?? null;
      setPcbReference(
        await importGerberExcellon(
          await outline.arrayBuffer(),
          outline.name,
          drill ? await drill.arrayBuffer() : null,
          drill?.name ?? null,
          parameters.pcbThickness,
        ),
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法读取板框/钻孔文件");
    } finally {
      if (manufacturingInputRef.current) manufacturingInputRef.current.value = "";
    }
  };

  const importStep = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          throw new Error("STEP 文件不能超过 50 MiB");
        }
        const result = await importStepReference(
          await file.arrayBuffer(),
          file.name,
          parameters.pcbThickness,
        );
        setStepReference(result.reference, result.preview);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法读取 STEP 文件");
    } finally {
      if (stepInputRef.current) stepInputRef.current.value = "";
    }
  };

  const workbenchStyle = {
    "--assembly-pane-width": `${paneWidths.assembly}px`,
    "--inspector-pane-width": `${paneWidths.inspector}px`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <Toolbar
        fileInputRef={fileInputRef}
        pcbInputRef={pcbInputRef}
        manufacturingInputRef={manufacturingInputRef}
        stepInputRef={stepInputRef}
        issues={issues}
        onExport={exportProject}
        assemblyOpen={mobileAssemblyOpen}
        onToggleAssembly={() => setMobileAssemblyOpen((current) => !current)}
      />
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        onChange={(event) => void importProject(event.currentTarget.files?.[0])}
      />
      <input
        ref={pcbInputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".kicad_pcb"
        onChange={(event) => void importPcb(event.currentTarget.files)}
      />
      <input
        ref={manufacturingInputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".gbr,.ger,.gko,.gm1,.gml,.drl,.xln,.exc,.drill"
        onChange={(event) => void importManufacturingReference(event.currentTarget.files)}
      />
      <input
        ref={stepInputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".step,.stp,model/step"
        onChange={(event) => void importStep(event.currentTarget.files)}
      />

      <div
        ref={workbenchRef}
        className={`workbench ${mobileAssemblyOpen ? "is-assembly-open" : ""} ${resizingPane ? "is-pane-resizing" : ""}`}
        style={workbenchStyle}
      >
        <AssemblyTree
          onRequestClose={() => setMobileAssemblyOpen(false)}
          onImportPcb={() => pcbInputRef.current?.click()}
        />
        <button
          className={`pane-resizer pane-resizer-left ${resizingPane === "assembly" ? "is-active" : ""}`}
          type="button"
          aria-label="调整左栏宽度"
          aria-orientation="vertical"
          title="拖动调整左栏宽度，双击恢复默认"
          onPointerDown={beginPaneResize("assembly")}
          onDoubleClick={() => resetPaneWidth("assembly")}
          onKeyDown={handlePaneResizeKeyDown("assembly")}
        />
        <main className="viewport-panel">
          <Viewport />
          <div className="viewport-metrics" aria-label="外壳尺寸">
            <Ruler size={15} />
            <span>{dimensions.outsideLength.toFixed(1)} × {dimensions.outsideWidth.toFixed(1)} × {dimensions.totalHeight.toFixed(1)} mm</span>
          </div>
          <div className="viewport-axis" aria-hidden="true">
            <span className="axis-z">Z</span>
            <span className="axis-y">Y</span>
            <span className="axis-x">X</span>
          </div>
        </main>
        <button
          className={`pane-resizer pane-resizer-right ${resizingPane === "inspector" ? "is-active" : ""}`}
          type="button"
          aria-label="调整右栏宽度"
          aria-orientation="vertical"
          title="拖动调整右栏宽度，双击恢复默认"
          onPointerDown={beginPaneResize("inspector")}
          onDoubleClick={() => resetPaneWidth("inspector")}
          onKeyDown={handlePaneResizeKeyDown("inspector")}
        />
        <Inspector />
        {mobileAssemblyOpen ? (
          <button
            className="mobile-pane-backdrop"
            type="button"
            aria-label="关闭对象树"
            onClick={() => setMobileAssemblyOpen(false)}
          />
        ) : null}
      </div>

      <footer className="status-bar">
        <span className="status-item" title="项目参数和 STEP 预览保存在当前浏览器中">
          <Save size={13} />
          {cacheStatus === "restoring"
            ? "正在恢复项目"
            : cacheStatus === "saving"
              ? "正在缓存"
              : cacheStatus === "error"
                ? "参数已缓存，STEP 缓存受限"
                : cachedAt
                  ? `已缓存 ${new Date(cachedAt).toLocaleTimeString("zh-CN", { hour12: false })}`
                  : "缓存已就绪"}
        </span>
        <span className="status-divider" />
        <span className="status-item">选择：{SELECTABLE_PART_LABELS[selectedPart]}</span>
        <span className="status-divider" />
        <span className="status-item">材料：{getMaterial(parameters.shellMaterialId).shortName}</span>
        <span className="status-spacer" />
        <span className={`status-item ${errorCount > 0 ? "status-error" : "status-ok"}`}>
          {errorCount > 0 ? <CircleAlert size={13} /> : <CircleCheck size={13} />}
          {errorCount > 0 ? `${errorCount} 项阻断问题` : "模型状态正常"}
        </span>
      </footer>
    </div>
  );
}
