import {
  Antenna as AntennaIcon,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  Magnet,
  PanelTop,
  Trash2,
  UnfoldVertical,
  Wrench,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { deriveEnclosureDimensions, validateDesign } from "../domain/enclosure";
import {
  getMagnetSupportOption,
  MAGNET_SUPPORT_OPTIONS,
} from "../domain/magnetSupport";
import { getMaterial, PANEL_MATERIALS, SHELL_MATERIALS } from "../domain/materials";
import type {
  EnclosureFace,
  InspectorTab,
  PlacementRotation,
  SelectablePart,
  ValidationIssue,
} from "../domain/model";
import {
  ENCLOSURE_FACE_OPTIONS,
  getFaceLabel,
  PLACEMENT_ROTATIONS,
} from "../domain/placements";
import {
  ANTENNA_DEFINITIONS,
  CONNECTOR_DEFINITIONS,
  FASTENER_DEFINITIONS,
  getAntennaDefinition,
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
  connector: "接口放置",
  antenna: "天线与射频空间",
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
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const inspectorTab = useDesignerStore((state) => state.inspectorTab);
  const setInspectorTab = useDesignerStore((state) => state.setInspectorTab);
  const setParameter = useDesignerStore((state) => state.setParameter);
  const updatePanelPlacement = useDesignerStore((state) => state.updatePanelPlacement);
  const removePanelPlacement = useDesignerStore((state) => state.removePanelPlacement);
  const updateConnectorPlacement = useDesignerStore((state) => state.updateConnectorPlacement);
  const setConnectorDefinition = useDesignerStore((state) => state.setConnectorDefinition);
  const removeConnectorPlacement = useDesignerStore((state) => state.removeConnectorPlacement);
  const updateAntennaPlacement = useDesignerStore((state) => state.updateAntennaPlacement);
  const setAntennaDefinition = useDesignerStore((state) => state.setAntennaDefinition);
  const removeAntennaPlacement = useDesignerStore((state) => state.removeAntennaPlacement);
  const setEnclosureTemplate = useDesignerStore((state) => state.setEnclosureTemplate);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const clearPcbReference = useDesignerStore((state) => state.clearPcbReference);
  const selectedPanel =
    parameters.panelPlacements.find((panel) => panel.id === selectedFeatureId) ??
    parameters.panelPlacements[0] ??
    null;
  const selectedConnector =
    parameters.connectorPlacements.find(
      (connector) => connector.id === selectedFeatureId,
    ) ?? parameters.connectorPlacements[0] ?? null;
  const selectedConnectorIndex = selectedConnector
    ? parameters.connectorPlacements.findIndex(
        (connector) => connector.id === selectedConnector.id,
      )
    : -1;
  const selectedAntenna =
    parameters.antennaPlacements.find(
      (antenna) => antenna.id === selectedFeatureId,
    ) ?? parameters.antennaPlacements[0] ?? null;
  const selectedAntennaIndex = selectedAntenna
    ? parameters.antennaPlacements.findIndex(
        (antenna) => antenna.id === selectedAntenna.id,
      )
    : -1;
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

  if (selectedPart === "connector" && selectedConnector) {
    const placement = selectedConnector;
    const definition = getConnectorDefinition(placement.definitionId);
    const surfaceValue =
      placement.surface === "panel" && placement.panelId
        ? `panel:${placement.panelId}`
        : placement.surface;
    return (
      <aside className="inspector-panel" aria-label="接口检查器">
        <div className="inspector-title">
          <span>{definition.name}</span>
          <small>接口 {selectedConnectorIndex + 1}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          <section className="inspector-section connector-placement">
            <div className="section-heading-row">
              <h2>接口参数</h2>
              <button
                className="icon-section-button"
                type="button"
                title="删除当前接口"
                aria-label="删除当前接口"
                onClick={() => removeConnectorPlacement(placement.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label className="select-field">
              <span>器件</span>
              <select
                aria-label={`接口 ${selectedConnectorIndex + 1} 器件`}
                value={placement.definitionId}
                onChange={(event) =>
                  setConnectorDefinition(placement.id, event.currentTarget.value)
                }
              >
                {CONNECTOR_DEFINITIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>安装位置</span>
              <select
                aria-label={`接口 ${selectedConnectorIndex + 1} 安装位置`}
                value={surfaceValue}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateConnectorPlacement(
                    placement.id,
                    value.startsWith("panel:")
                      ? { surface: "panel", panelId: value.slice(6) }
                      : { surface: value as EnclosureFace, panelId: null },
                  );
                }}
              >
                {ENCLOSURE_FACE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
                {parameters.panelPlacements.map((panel, panelIndex) => (
                  <option key={panel.id} value={`panel:${panel.id}`}>
                    面板 {panelIndex + 1}（{getFaceLabel(panel.face)}）
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>面内旋转</span>
              <select
                aria-label={`接口 ${selectedConnectorIndex + 1} 面内旋转`}
                value={placement.rotation}
                onChange={(event) =>
                  updateConnectorPlacement(placement.id, {
                    rotation: Number(event.currentTarget.value) as PlacementRotation,
                  })
                }
              >
                {PLACEMENT_ROTATIONS.map((rotation) => (
                  <option key={rotation} value={rotation}>{rotation}°</option>
                ))}
              </select>
            </label>
            {definition.panelCutout.shape === "circle" ? (
              <NumberField
                label="孔径"
                value={placement.cutoutWidth}
                min={1}
                max={60}
                onChange={(value) =>
                  updateConnectorPlacement(placement.id, {
                    cutoutWidth: value,
                    cutoutHeight: value,
                  })
                }
              />
            ) : (
              <>
                <NumberField label="开孔宽度" value={placement.cutoutWidth} min={1} max={60} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutWidth: value })} />
                <NumberField label="开孔高度" value={placement.cutoutHeight} min={1} max={60} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutHeight: value })} />
              </>
            )}
            <NumberField label="横向偏移" value={placement.offsetU} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetU: value })} />
            <NumberField label="纵向偏移" value={placement.offsetV} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetV: value })} />
            <p className="material-note">{definition.metadata.notes}</p>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedPart === "antenna" && selectedAntenna) {
    const placement = selectedAntenna;
    const definition = getAntennaDefinition(placement.definitionId);
    const surfaceValue =
      placement.surface === "panel" && placement.panelId
        ? `panel:${placement.panelId}`
        : placement.surface;
    return (
      <aside className="inspector-panel" aria-label="天线检查器">
        <div className="inspector-title">
          <span>{definition.name}</span>
          <small>天线 {selectedAntennaIndex + 1}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>天线参数</h2>
              <button
                className="icon-section-button"
                type="button"
                title="删除当前天线"
                aria-label="删除当前天线"
                onClick={() => removeAntennaPlacement(placement.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label className="select-field">
              <span>类型</span>
              <select
                aria-label={`天线 ${selectedAntennaIndex + 1} 类型`}
                value={placement.definitionId}
                onChange={(event) =>
                  setAntennaDefinition(placement.id, event.currentTarget.value)
                }
              >
                {ANTENNA_DEFINITIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>安装位置</span>
              <select
                aria-label={`天线 ${selectedAntennaIndex + 1} 安装位置`}
                value={surfaceValue}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateAntennaPlacement(
                    placement.id,
                    value.startsWith("panel:")
                      ? { surface: "panel", panelId: value.slice(6) }
                      : { surface: value as EnclosureFace, panelId: null },
                  );
                }}
              >
                {ENCLOSURE_FACE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
                {parameters.panelPlacements.map((panel, panelIndex) => (
                  <option key={panel.id} value={`panel:${panel.id}`}>
                    面板 {panelIndex + 1}（{getFaceLabel(panel.face)}）
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>面内旋转</span>
              <select
                aria-label={`天线 ${selectedAntennaIndex + 1} 面内旋转`}
                value={placement.rotation}
                onChange={(event) =>
                  updateAntennaPlacement(placement.id, {
                    rotation: Number(event.currentTarget.value) as PlacementRotation,
                  })
                }
              >
                {PLACEMENT_ROTATIONS.map((rotation) => (
                  <option key={rotation} value={rotation}>{rotation}°</option>
                ))}
              </select>
            </label>
            {definition.enclosureCutout ? (
              <NumberField
                label="开孔直径"
                value={placement.cutoutDiameter}
                min={1}
                max={40}
                onChange={(value) =>
                  updateAntennaPlacement(placement.id, { cutoutDiameter: value })
                }
              />
            ) : null}
            <NumberField label="横向偏移" value={placement.offsetU} min={-300} max={300} step={1} onChange={(value) => updateAntennaPlacement(placement.id, { offsetU: value })} />
            <NumberField label="纵向偏移" value={placement.offsetV} min={-300} max={300} step={1} onChange={(value) => updateAntennaPlacement(placement.id, { offsetV: value })} />
            <div className="material-summary">
              <AntennaIcon className="antenna-summary-icon" size={18} />
              <span>
                <strong>{definition.metadata.frequencyBand}</strong>
                <small>
                  {definition.enclosureCutout?.description ?? "内置安装，不生成外壳开孔"}
                </small>
              </span>
            </div>
            <p className="material-note">{definition.metadata.notes}</p>
          </section>
        </div>
      </aside>
    );
  }

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
              {parameters.closureType === "magnet" ? (
                <>
                  <label className="select-field">
                    <span>磁铁承托</span>
                    <select
                      aria-label="磁铁承托方式"
                      value={parameters.magnetSupportType}
                      onChange={(event) =>
                        setParameter(
                          "magnetSupportType",
                          event.currentTarget.value as typeof parameters.magnetSupportType,
                        )
                      }
                    >
                      {MAGNET_SUPPORT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                  <p className="material-note">
                    {getMagnetSupportOption(parameters.magnetSupportType).description}
                  </p>
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <div className="section-heading-row">
                <h2>面板参数</h2>
                {selectedPanel ? (
                  <button
                    className="icon-section-button"
                    type="button"
                    title="删除当前面板"
                    aria-label="删除当前面板"
                    onClick={() => removePanelPlacement(selectedPanel.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
              {selectedPanel ? (
                <>
                  <label className="select-field">
                    <span>所在面</span>
                    <select
                      aria-label="面板所在面"
                      value={selectedPanel.face}
                      onChange={(event) =>
                        updatePanelPlacement(selectedPanel.id, {
                          face: event.currentTarget.value as EnclosureFace,
                        })
                      }
                    >
                      {ENCLOSURE_FACE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                  <NumberField label="宽度" value={selectedPanel.width} min={6} max={300} step={1} onChange={(value) => updatePanelPlacement(selectedPanel.id, { width: value })} />
                  <NumberField label="高度" value={selectedPanel.height} min={6} max={300} step={1} onChange={(value) => updatePanelPlacement(selectedPanel.id, { height: value })} />
                  <NumberField label="横向偏移" value={selectedPanel.offsetU} min={-300} max={300} step={1} onChange={(value) => updatePanelPlacement(selectedPanel.id, { offsetU: value })} />
                  <NumberField label="纵向偏移" value={selectedPanel.offsetV} min={-300} max={300} step={1} onChange={(value) => updatePanelPlacement(selectedPanel.id, { offsetV: value })} />
                  <label className="select-field">
                    <span>固定方式</span>
                    <select
                      aria-label="面板固定方式"
                      value={selectedPanel.mountingType}
                      onChange={(event) => updatePanelPlacement(selectedPanel.id, { mountingType: event.currentTarget.value as typeof selectedPanel.mountingType })}
                    >
                      <option value="screw">四角螺丝</option>
                      <option value="magnet">四角磁吸</option>
                      <option value="slide">侧边滑轨</option>
                    </select>
                  </label>
                  <NumberField label="面板厚度" value={selectedPanel.thickness} min={0.5} max={10} onChange={(value) => updatePanelPlacement(selectedPanel.id, { thickness: value })} />
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <div className="section-heading-row">
                <h2>接口参数</h2>
                {selectedConnector ? (
                  <button
                    className="icon-section-button"
                    type="button"
                    title="删除当前接口"
                    aria-label="删除当前接口"
                    onClick={() => removeConnectorPlacement(selectedConnector.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
              {selectedConnector ? (() => {
                const placement = selectedConnector;
                const index = selectedConnectorIndex;
                const definition = getConnectorDefinition(placement.definitionId);
                const surfaceValue =
                  placement.surface === "panel" && placement.panelId
                    ? `panel:${placement.panelId}`
                    : placement.surface;
                return (
                  <div className="connector-placement" key={placement.id}>
                  <label className="select-field">
                    <span>器件</span>
                    <select
                      aria-label={`接口 ${index + 1} 器件`}
                      value={placement.definitionId}
                      onChange={(event) =>
                        setConnectorDefinition(placement.id, event.currentTarget.value)
                      }
                    >
                      {CONNECTOR_DEFINITIONS.map((definition) => (
                        <option key={definition.id} value={definition.id}>{definition.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="select-field">
                    <span>安装位置</span>
                    <select
                      aria-label={`接口 ${index + 1} 安装位置`}
                      value={surfaceValue}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateConnectorPlacement(
                          placement.id,
                          value.startsWith("panel:")
                            ? { surface: "panel", panelId: value.slice(6) }
                            : { surface: value as EnclosureFace, panelId: null },
                        );
                      }}
                    >
                      {ENCLOSURE_FACE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                      {parameters.panelPlacements.map((panel, panelIndex) => (
                        <option key={panel.id} value={`panel:${panel.id}`}>
                          面板 {panelIndex + 1}（{getFaceLabel(panel.face)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-field">
                    <span>面内旋转</span>
                    <select
                      aria-label={`接口 ${index + 1} 面内旋转`}
                      value={placement.rotation}
                      onChange={(event) =>
                        updateConnectorPlacement(placement.id, {
                          rotation: Number(event.currentTarget.value) as PlacementRotation,
                        })
                      }
                    >
                      {PLACEMENT_ROTATIONS.map((rotation) => (
                        <option key={rotation} value={rotation}>{rotation}°</option>
                      ))}
                    </select>
                  </label>
                  {definition.panelCutout.shape === "circle" ? (
                    <NumberField
                      label="孔径"
                      value={placement.cutoutWidth}
                      min={1}
                      max={60}
                      onChange={(value) => {
                        updateConnectorPlacement(placement.id, {
                          cutoutWidth: value,
                          cutoutHeight: value,
                        });
                      }}
                    />
                  ) : (
                    <>
                      <NumberField label="开孔宽度" value={placement.cutoutWidth} min={1} max={60} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutWidth: value })} />
                      <NumberField label="开孔高度" value={placement.cutoutHeight} min={1} max={60} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutHeight: value })} />
                    </>
                  )}
                  <NumberField label="横向偏移" value={placement.offsetU} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetU: value })} />
                  <NumberField label="纵向偏移" value={placement.offsetV} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetV: value })} />
                  <p className="material-note">{definition.metadata.notes}</p>
                  </div>
                );
              })() : null}
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
            {selectedPanel ? (
              <section className="inspector-section">
                <h2>面板材料</h2>
                <label className="select-field">
                  <span>材料</span>
                  <select value={selectedPanel.materialId} onChange={(event) => updatePanelPlacement(selectedPanel.id, { materialId: event.currentTarget.value })}>
                    {PANEL_MATERIALS.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                  </select>
                </label>
                <MaterialBadge materialId={selectedPanel.materialId} />
                <p className="material-note">{getMaterial(selectedPanel.materialId).notes}</p>
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
