import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  Magnet,
  PanelTop,
  UnfoldVertical,
  Wrench,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { deriveEnclosureDimensions, validateDesign } from "../domain/enclosure";
import { getMaterial, PANEL_MATERIALS, SHELL_MATERIALS } from "../domain/materials";
import type { InspectorTab, SelectablePart, ValidationIssue } from "../domain/model";
import {
  CONNECTOR_DEFINITIONS,
  FASTENER_DEFINITIONS,
  getConnectorDefinition,
  getFastenerDefinition,
} from "../libraries/components";
import { ENCLOSURE_TEMPLATES, getEnclosureTemplate } from "../libraries/templates";
import { useDesignerStore } from "../store/designerStore";
import { ManufacturingExport } from "./ManufacturingExport";

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "mm",
  onChange,
}: NumberFieldProps) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="number-control">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, detail, checked, onChange }: ToggleRowProps) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function MaterialBadge({ materialId }: { materialId: string }) {
  const material = getMaterial(materialId);
  return (
    <div className="material-summary">
      <span className="material-swatch" style={{ backgroundColor: material.color }} />
      <span>
        <strong>{material.name}</strong>
        <small>{material.process} · 建议壁厚 {material.minWall.toFixed(1)} mm · {material.maxServiceTemp}°C</small>
      </span>
    </div>
  );
}

const PART_LABELS: Record<SelectablePart, string> = {
  project: "项目参数",
  pcb: "PCB 与包络",
  base: "下壳参数",
  lid: "顶盖参数",
  panel: "面板参数",
  connector: "面板接口",
};

function IssueIcon({ issue }: { issue: ValidationIssue }) {
  if (issue.level === "error") return <AlertTriangle size={15} />;
  if (issue.level === "warning") return <AlertTriangle size={15} />;
  if (issue.level === "info") return <CheckCircle2 size={15} />;
  return <Info size={15} />;
}

export function Inspector() {
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const inspectorTab = useDesignerStore((state) => state.inspectorTab);
  const setInspectorTab = useDesignerStore((state) => state.setInspectorTab);
  const setParameter = useDesignerStore((state) => state.setParameter);
  const setConnectorDefinition = useDesignerStore((state) => state.setConnectorDefinition);
  const setEnclosureTemplate = useDesignerStore((state) => state.setEnclosureTemplate);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const clearPcbReference = useDesignerStore((state) => state.clearPcbReference);
  const dimensions = useMemo(() => deriveEnclosureDimensions(parameters), [parameters]);
  const issues = useMemo(
    () => validateDesign(parameters, pcbReference),
    [parameters, pcbReference],
  );

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "dimensions", label: "尺寸" },
    { id: "structure", label: "结构" },
    { id: "materials", label: "材料" },
  ];

  return (
    <aside className="inspector-panel" aria-label="参数检查器">
      <div className="inspector-title">
        <span>{PART_LABELS[selectedPart]}</span>
        <small>{dimensions.outsideLength.toFixed(1)} × {dimensions.outsideWidth.toFixed(1)} × {dimensions.totalHeight.toFixed(1)} mm</small>
      </div>

      <div className="segmented-tabs" role="tablist" aria-label="参数类别">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={inspectorTab === tab.id}
            className={inspectorTab === tab.id ? "is-active" : ""}
            onClick={() => setInspectorTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-scroll">
        {inspectorTab === "dimensions" ? (
          <>
            <section className="inspector-section">
              <h2>外壳模板</h2>
              <label className="select-field">
                <span>模板</span>
                <select
                  aria-label="外壳模板"
                  value={parameters.enclosureTemplateId}
                  onChange={(event) => setEnclosureTemplate(event.currentTarget.value)}
                >
                  {ENCLOSURE_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <p className="material-note">{getEnclosureTemplate(parameters.enclosureTemplateId).description}</p>
            </section>
            <section className="inspector-section">
              <h2>PCB</h2>
              {pcbReference ? (
                <div className="reference-summary">
                  <span>
                    <strong>{pcbReference.sourceName}</strong>
                    <small>
                      {pcbReference.format === "kicad_pcb"
                        ? `KiCad ${pcbReference.version ?? "未知版本"} · ${pcbReference.outlineElements} 段板框 · ${pcbReference.mountingHoles.length} 个安装孔`
                        : pcbReference.format === "gerber-excellon"
                          ? `Gerber ${pcbReference.outlineElements} 段 · ${pcbReference.drillHoleCount ?? 0} 个钻孔 · ${pcbReference.mountingHoles.length} 个安装孔候选`
                          : `STEP ${pcbReference.outlineElements} 个实体 · ${(pcbReference.triangleCount ?? 0).toLocaleString()} 三角面 · 高 ${(pcbReference.overallHeight ?? 0).toFixed(1)} mm`}
                    </small>
                  </span>
                  <button type="button" onClick={clearPcbReference} title="移除 PCB 文件关联" aria-label="移除 PCB 文件关联">
                    <X size={15} />
                  </button>
                </div>
              ) : null}
              <NumberField label="长度" value={parameters.pcbLength} min={20} max={300} step={1} onChange={(value) => setParameter("pcbLength", value)} />
              <NumberField label="宽度" value={parameters.pcbWidth} min={20} max={220} step={1} onChange={(value) => setParameter("pcbWidth", value)} />
              <NumberField label="板厚" value={parameters.pcbThickness} min={0.6} max={5} onChange={(value) => setParameter("pcbThickness", value)} />
              <NumberField label="最高元件" value={parameters.componentHeight} min={0} max={80} step={0.5} onChange={(value) => setParameter("componentHeight", value)} />
              <NumberField label="板边间隙" value={parameters.boardClearance} min={0} max={15} onChange={(value) => setParameter("boardClearance", value)} />
            </section>
            <section className="inspector-section">
              <h2>壳体</h2>
              <NumberField label="壁厚" value={parameters.wallThickness} min={0.8} max={8} onChange={(value) => setParameter("wallThickness", value)} />
              <NumberField label="底厚" value={parameters.bottomThickness} min={0.8} max={8} onChange={(value) => setParameter("bottomThickness", value)} />
              <NumberField label="下壳高度" value={parameters.baseHeight} min={8} max={120} step={1} onChange={(value) => setParameter("baseHeight", value)} />
              <NumberField label="外圆角" value={parameters.cornerRadius} min={0.5} max={30} onChange={(value) => setParameter("cornerRadius", value)} />
              <NumberField label="PCB 离底" value={parameters.standoffHeight} min={0} max={30} onChange={(value) => setParameter("standoffHeight", value)} />
              <NumberField label="顶盖厚度" value={parameters.lidThickness} min={0.8} max={8} onChange={(value) => setParameter("lidThickness", value)} />
            </section>
          </>
        ) : null}

        {inspectorTab === "structure" ? (
          <>
            <section className="inspector-section">
              <h2>顶盖固定</h2>
              <div className="closure-control" role="group" aria-label="顶盖固定方式">
                <button className={parameters.closureType === "screw" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "screw")}>
                  <Wrench size={17} />
                  <span>螺丝</span>
                </button>
                <button className={parameters.closureType === "magnet" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "magnet")}>
                  <Magnet size={17} />
                  <span>磁吸</span>
                </button>
                <button className={parameters.closureType === "snap" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "snap")}>
                  <UnfoldVertical size={17} />
                  <span>卡扣</span>
                </button>
                <button className={parameters.closureType === "slide" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "slide")}>
                  <ArrowRightLeft size={17} />
                  <span>滑盖</span>
                </button>
                <button className={parameters.closureType === "hinge" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "hinge")}>
                  <PanelTop size={17} />
                  <span>翻盖</span>
                </button>
              </div>
              {parameters.closureType === "screw" ? (
                <>
                  <label className="select-field">
                    <span>紧固件</span>
                    <select
                      aria-label="紧固件规格"
                      value={parameters.closureFastenerId}
                      onChange={(event) => setParameter("closureFastenerId", event.currentTarget.value)}
                    >
                      {FASTENER_DEFINITIONS.map((definition) => (
                        <option key={definition.id} value={definition.id}>{definition.name}</option>
                      ))}
                    </select>
                  </label>
                  <p className="material-note">{getFastenerDefinition(parameters.closureFastenerId).metadata.notes}</p>
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <h2>可更换面板</h2>
              <ToggleRow label="启用独立面板" detail="顶盖开窗并生成板材零件" checked={parameters.panelEnabled} onChange={(checked) => setParameter("panelEnabled", checked)} />
              {parameters.panelEnabled ? (
                <>
                  <label className="select-field">
                    <span>固定方式</span>
                    <select
                      aria-label="面板固定方式"
                      value={parameters.panelMountingType}
                      onChange={(event) => setParameter("panelMountingType", event.currentTarget.value as typeof parameters.panelMountingType)}
                    >
                      <option value="screw">四角螺丝</option>
                      <option value="magnet">四角磁吸</option>
                      <option value="slide">侧边滑轨</option>
                    </select>
                  </label>
                  <NumberField label="面板厚度" value={parameters.panelThickness} min={0.5} max={10} onChange={(value) => setParameter("panelThickness", value)} />
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <h2>接口</h2>
              <ToggleRow label="启用面板接口" detail="前侧开孔及插拔安全空间" checked={parameters.typeCPortEnabled} onChange={(checked) => setParameter("typeCPortEnabled", checked)} />
              {parameters.typeCPortEnabled ? (
                <>
                  <label className="select-field">
                    <span>器件</span>
                    <select
                      aria-label="接口器件"
                      value={parameters.connectorDefinitionId}
                      onChange={(event) => setConnectorDefinition(event.currentTarget.value)}
                    >
                      {CONNECTOR_DEFINITIONS.map((definition) => (
                        <option key={definition.id} value={definition.id}>{definition.name}</option>
                      ))}
                    </select>
                  </label>
                  {getConnectorDefinition(parameters.connectorDefinitionId).panelCutout.shape === "circle" ? (
                    <NumberField
                      label="孔径"
                      value={parameters.typeCPortWidth}
                      min={6}
                      max={30}
                      onChange={(value) => {
                        setParameter("typeCPortWidth", value);
                        setParameter("typeCPortHeight", value);
                      }}
                    />
                  ) : (
                    <>
                      <NumberField label="开孔宽度" value={parameters.typeCPortWidth} min={6} max={30} onChange={(value) => setParameter("typeCPortWidth", value)} />
                      <NumberField label="开孔高度" value={parameters.typeCPortHeight} min={3} max={20} onChange={(value) => setParameter("typeCPortHeight", value)} />
                    </>
                  )}
                  <NumberField label="水平偏移" value={parameters.typeCPortOffset} min={-120} max={120} step={1} onChange={(value) => setParameter("typeCPortOffset", value)} />
                  <p className="material-note">{getConnectorDefinition(parameters.connectorDefinitionId).metadata.notes}</p>
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <h2>镂空阵列</h2>
              <label className="select-field">
                <span>类型</span>
                <select
                  aria-label="镂空阵列类型"
                  value={parameters.ventPattern}
                  onChange={(event) => setParameter("ventPattern", event.currentTarget.value as typeof parameters.ventPattern)}
                >
                  <option value="none">无</option>
                  <option value="circle">圆孔阵列</option>
                  <option value="slot">长槽阵列</option>
                  <option value="honeycomb">蜂窝阵列</option>
                </select>
              </label>
              {parameters.ventPattern !== "none" ? (
                <>
                  <NumberField label="行数" value={parameters.ventRows} min={1} max={12} step={1} unit="" onChange={(value) => setParameter("ventRows", value)} />
                  <NumberField label="列数" value={parameters.ventColumns} min={1} max={16} step={1} unit="" onChange={(value) => setParameter("ventColumns", value)} />
                  <NumberField label="孔径" value={parameters.ventHoleSize} min={1.5} max={12} onChange={(value) => setParameter("ventHoleSize", value)} />
                  <NumberField label="筋宽" value={parameters.ventSpacing} min={0.8} max={12} onChange={(value) => setParameter("ventSpacing", value)} />
                </>
              ) : null}
            </section>
          </>
        ) : null}

        {inspectorTab === "materials" ? (
          <>
            <section className="inspector-section">
              <h2>壳体材料</h2>
              <label className="select-field">
                <span>材料</span>
                <select value={parameters.shellMaterialId} onChange={(event) => setParameter("shellMaterialId", event.currentTarget.value)}>
                  {SHELL_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                </select>
              </label>
              <MaterialBadge materialId={parameters.shellMaterialId} />
              <p className="material-note">{getMaterial(parameters.shellMaterialId).notes}</p>
            </section>
            {parameters.panelEnabled ? (
              <section className="inspector-section">
                <h2>面板材料</h2>
                <label className="select-field">
                  <span>材料</span>
                  <select value={parameters.panelMaterialId} onChange={(event) => setParameter("panelMaterialId", event.currentTarget.value)}>
                    {PANEL_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                  </select>
                </label>
                <MaterialBadge materialId={parameters.panelMaterialId} />
                <p className="material-note">{getMaterial(parameters.panelMaterialId).notes}</p>
              </section>
            ) : null}
          </>
        ) : null}

        <section className="validation-section">
          <div className="section-heading-row">
            <h2>设计检查</h2>
            <span>{issues.length}</span>
          </div>
          <div className="issue-list">
            {issues.map((issue) => (
              <button key={issue.id} type="button" className={`issue-row is-${issue.level}`} onClick={() => setSelectedPart(issue.part)}>
                <IssueIcon issue={issue} />
                <span>
                  <strong>{issue.title}</strong>
                  <small>{issue.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
        <ManufacturingExport />
      </div>
    </aside>
  );
}
