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
  Menu,
  PanelLeftOpen,
  Redo2,
  Scan,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ValidationIssue } from "../domain/model";
import { useDesignerStore } from "../store/designerStore";

interface ToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  pcbInputRef: RefObject<HTMLInputElement | null>;
  manufacturingInputRef: RefObject<HTMLInputElement | null>;
  stepInputRef: RefObject<HTMLInputElement | null>;
  issues: ValidationIssue[];
  onExport: () => void;
  assemblyOpen: boolean;
  onToggleAssembly: () => void;
}

export function Toolbar({ fileInputRef, pcbInputRef, manufacturingInputRef, stepInputRef, issues, onExport, assemblyOpen, onToggleAssembly }: ToolbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const projectName = useDesignerStore((state) => state.projectName);
  const showGrid = useDesignerStore((state) => state.showGrid);
  const exploded = useDesignerStore((state) => state.exploded);
  const toggleGrid = useDesignerStore((state) => state.toggleGrid);
  const toggleExploded = useDesignerStore((state) => state.toggleExploded);
  const resetCamera = useDesignerStore((state) => state.resetCamera);
  const resetProject = useDesignerStore((state) => state.resetProject);
  const canUndo = useDesignerStore((state) => state.canUndo);
  const canRedo = useDesignerStore((state) => state.canRedo);
  const undo = useDesignerStore((state) => state.undo);
  const redo = useDesignerStore((state) => state.redo);
  const errors = issues.filter((issue) => issue.level === "error").length;

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

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

      <button
        className={`icon-button mobile-assembly-button ${assemblyOpen ? "is-active" : ""}`}
        type="button"
        onClick={onToggleAssembly}
        title={assemblyOpen ? "关闭对象树" : "打开对象树"}
        aria-label={assemblyOpen ? "关闭对象树" : "打开对象树"}
        aria-pressed={assemblyOpen}
      >
        <PanelLeftOpen size={18} />
      </button>

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

      <div className="toolbar-group toolbar-history" aria-label="编辑历史">
        <button
          className="icon-button"
          type="button"
          disabled={!canUndo}
          onClick={undo}
          title="撤销"
          aria-label="撤销"
        >
          <Undo2 size={18} />
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!canRedo}
          onClick={redo}
          title="重做"
          aria-label="重做"
        >
          <Redo2 size={18} />
        </button>
      </div>

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

      <div className="mobile-toolbar-menu" ref={mobileMenuRef}>
        <button
          className={`icon-button ${mobileMenuOpen ? "is-active" : ""}`}
          type="button"
          onClick={() => setMobileMenuOpen((current) => !current)}
          title="更多工具"
          aria-label="更多工具"
          aria-expanded={mobileMenuOpen}
        >
          <Menu size={18} />
        </button>
        {mobileMenuOpen ? (
          <div className="toolbar-overflow-menu" role="menu" aria-label="项目和视图工具">
            <button type="button" role="menuitem" onClick={() => { createNewProject(); setMobileMenuOpen(false); }}>
              <FilePlus2 size={16} /><span>新建项目</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }}>
              <FolderOpen size={16} /><span>打开项目</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { pcbInputRef.current?.click(); setMobileMenuOpen(false); }}>
              <CircuitBoard size={16} /><span>导入 PCB</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { manufacturingInputRef.current?.click(); setMobileMenuOpen(false); }}>
              <Files size={16} /><span>板框/钻孔</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { stepInputRef.current?.click(); setMobileMenuOpen(false); }}>
              <Cuboid size={16} /><span>导入 STEP</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { onExport(); setMobileMenuOpen(false); }}>
              <Download size={16} /><span>导出项目</span>
            </button>
            <div className="toolbar-overflow-separator" />
            <button type="button" role="menuitem" disabled={!canUndo} onClick={undo}>
              <Undo2 size={16} /><span>撤销</span>
            </button>
            <button type="button" role="menuitem" disabled={!canRedo} onClick={redo}>
              <Redo2 size={16} /><span>重做</span>
            </button>
            <div className="toolbar-overflow-separator" />
            <button className={showGrid ? "is-active" : ""} type="button" role="menuitemcheckbox" aria-checked={showGrid} onClick={toggleGrid}>
              <Grid3X3 size={16} /><span>显示网格</span>
            </button>
            <button className={exploded ? "is-active" : ""} type="button" role="menuitemcheckbox" aria-checked={exploded} onClick={toggleExploded}>
              <Layers3 size={16} /><span>爆炸视图</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { resetCamera(); setMobileMenuOpen(false); }}>
              <Scan size={16} /><span>适合视图</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
