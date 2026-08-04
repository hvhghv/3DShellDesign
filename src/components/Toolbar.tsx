import {
  Box,
  CircuitBoard,
  Cuboid,
  Download,
  FilePlus2,
  Files,
  FolderOpen,
  Grid3X3,
  Layers3,
  Scan,
  ShieldCheck,
} from "lucide-react";
import type { RefObject } from "react";
import type { ValidationIssue } from "../domain/model";
import { useDesignerStore } from "../store/designerStore";

interface ToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  pcbInputRef: RefObject<HTMLInputElement | null>;
  manufacturingInputRef: RefObject<HTMLInputElement | null>;
  stepInputRef: RefObject<HTMLInputElement | null>;
  issues: ValidationIssue[];
  onExport: () => void;
}

export function Toolbar({ fileInputRef, pcbInputRef, manufacturingInputRef, stepInputRef, issues, onExport }: ToolbarProps) {
  const projectName = useDesignerStore((state) => state.projectName);
  const showGrid = useDesignerStore((state) => state.showGrid);
  const exploded = useDesignerStore((state) => state.exploded);
  const toggleGrid = useDesignerStore((state) => state.toggleGrid);
  const toggleExploded = useDesignerStore((state) => state.toggleExploded);
  const resetCamera = useDesignerStore((state) => state.resetCamera);
  const resetProject = useDesignerStore((state) => state.resetProject);
  const errors = issues.filter((issue) => issue.level === "error").length;

  const createNewProject = () => {
    if (window.confirm("重置当前设计并创建新项目？")) resetProject();
  };

  return (
    <header className="toolbar">
      <div className="brand-block" title={projectName}>
        <span className="brand-mark" aria-hidden="true">
          <Box size={20} strokeWidth={2.2} />
        </span>
        <div className="brand-copy">
          <strong>3DShellDesigner</strong>
          <span>{projectName}</span>
        </div>
      </div>

      <div className="toolbar-group" aria-label="项目工具">
        <button className="icon-button" type="button" onClick={createNewProject} title="新建项目" aria-label="新建项目">
          <FilePlus2 size={18} />
        </button>
        <button
          className="icon-button optional-mobile"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="打开项目"
          aria-label="打开项目"
        >
          <FolderOpen size={18} />
        </button>
        <button
          className="command-button"
          type="button"
          onClick={() => pcbInputRef.current?.click()}
          title="导入 KiCad PCB"
        >
          <CircuitBoard size={17} />
          <span>导入 PCB</span>
        </button>
        <button
          className="command-button"
          type="button"
          onClick={() => manufacturingInputRef.current?.click()}
          title="明确选择一个板框 Gerber，可同时选择一个 Excellon 钻孔文件"
        >
          <Files size={17} />
          <span>板框/钻孔</span>
        </button>
        <button
          className="command-button"
          type="button"
          onClick={() => stepInputRef.current?.click()}
          title="导入 STEP 只读机械参考"
        >
          <Cuboid size={17} />
          <span>STEP</span>
        </button>
        <button className="command-button" type="button" onClick={onExport} title="导出项目 JSON">
          <Download size={17} />
          <span>导出项目</span>
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group" aria-label="视图工具">
        <button
          className={`icon-button ${showGrid ? "is-active" : ""}`}
          type="button"
          onClick={toggleGrid}
          title="显示或隐藏网格"
          aria-label="显示或隐藏网格"
          aria-pressed={showGrid}
        >
          <Grid3X3 size={18} />
        </button>
        <button
          className={`icon-button ${exploded ? "is-active" : ""}`}
          type="button"
          onClick={toggleExploded}
          title="装配或爆炸视图"
          aria-label="装配或爆炸视图"
          aria-pressed={exploded}
        >
          <Layers3 size={18} />
        </button>
        <button className="icon-button" type="button" onClick={resetCamera} title="适合视图" aria-label="适合视图">
          <Scan size={18} />
        </button>
      </div>

      <div className={`check-indicator ${errors > 0 ? "has-error" : ""}`} title="设计检查状态">
        <ShieldCheck size={17} />
        <span>{errors > 0 ? `${errors} 项错误` : "检查通过"}</span>
      </div>
    </header>
  );
}
