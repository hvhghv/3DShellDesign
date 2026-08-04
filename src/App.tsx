import { useEffect, useMemo, useRef } from "react";
import { CircleAlert, CircleCheck, Ruler, Save } from "lucide-react";
import { AssemblyTree } from "./components/AssemblyTree";
import { Inspector } from "./components/Inspector";
import { Toolbar } from "./components/Toolbar";
import { Viewport } from "./components/Viewport";
import { deriveEnclosureDimensions, validateDesign } from "./domain/enclosure";
import { getMaterial } from "./domain/materials";
import { importKicadPcb } from "./importers/kicadWorkerClient";
import { importGerberExcellon } from "./importers/gerberWorkerClient";
import { importStepReference } from "./importers/stepWorkerClient";
import {
  createProjectSnapshot,
  isProjectSnapshot,
  useDesignerStore,
} from "./store/designerStore";

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

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pcbInputRef = useRef<HTMLInputElement>(null);
  const manufacturingInputRef = useRef<HTMLInputElement>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);
  const projectName = useDesignerStore((state) => state.projectName);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const cachedAt = useDesignerStore((state) => state.cachedAt);
  const cacheStatus = useDesignerStore((state) => state.cacheStatus);
  const loadProject = useDesignerStore((state) => state.loadProject);
  const setPcbReference = useDesignerStore((state) => state.setPcbReference);
  const setStepReference = useDesignerStore((state) => state.setStepReference);
  const restoreCachedProject = useDesignerStore((state) => state.restoreCachedProject);
  const dimensions = useMemo(() => deriveEnclosureDimensions(parameters), [parameters]);
  const issues = useMemo(
    () => validateDesign(parameters, pcbReference),
    [parameters, pcbReference],
  );
  const errorCount = issues.filter((issue) => issue.level === "error").length;

  useEffect(() => {
    void restoreCachedProject();
  }, [restoreCachedProject]);

  const exportProject = () => {
    const snapshot = createProjectSnapshot(projectName, parameters, pcbReference);
    downloadJson("3dshelldesigner-project.json", snapshot);
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

  const importPcb = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) {
        throw new Error("KiCad PCB 文件不能超过 15 MiB");
      }
      setPcbReference(await importKicadPcb(await file.arrayBuffer(), file.name));
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

  const importStep = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("STEP 文件不能超过 50 MiB");
      const result = await importStepReference(
        await file.arrayBuffer(),
        file.name,
        parameters.pcbThickness,
      );
      setStepReference(result.reference, result.preview);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法读取 STEP 文件");
    } finally {
      if (stepInputRef.current) stepInputRef.current.value = "";
    }
  };

  return (
    <div className="app-shell">
      <Toolbar
        fileInputRef={fileInputRef}
        pcbInputRef={pcbInputRef}
        manufacturingInputRef={manufacturingInputRef}
        stepInputRef={stepInputRef}
        issues={issues}
        onExport={exportProject}
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
        accept=".kicad_pcb"
        onChange={(event) => void importPcb(event.currentTarget.files?.[0])}
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
        accept=".step,.stp,model/step"
        onChange={(event) => void importStep(event.currentTarget.files?.[0])}
      />

      <div className="workbench">
        <AssemblyTree />
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
        <Inspector />
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
        <span className="status-item">选择：{selectedPart}</span>
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
