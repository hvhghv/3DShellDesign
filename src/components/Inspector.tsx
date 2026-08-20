import {
  Antenna as AntennaIcon,
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  CheckCircle2,
  CircuitBoard,
  Eye,
  EyeOff,
  Info,
  Lock,
  LockOpen,
  Magnet,
  PanelTop,
  RotateCw,
  Trash2,
  Unplug,
  UnfoldVertical,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deriveEnclosureDimensions, validateDesign } from "../domain/enclosure";
import {
  BATTERY_PRESETS,
  BATTERY_INSERTION_SIDE_LABELS,
  BATTERY_MOUNT_FACE_LABELS,
  BATTERY_RETENTION_LABELS,
  getBatteryMaxRailHeight,
  getBatteryPreset,
} from "../domain/batteries";
import {
  getMagnetSupportOption,
  MAGNET_SUPPORT_OPTIONS,
} from "../domain/magnetSupport";
import { getMaterial, PANEL_MATERIALS, SHELL_MATERIALS } from "../domain/materials";
import type {
  BatteryInsertionSide,
  BatteryMountFace,
  BatteryRetentionType,
  ConnectorSurface,
  DisplayMountingType,
  EnclosureFace,
  InspectorTab,
  PcbMountingType,
  PlacementRotation,
  SelectablePart,
  ValidationIssue,
} from "../domain/model";
import {
  getPcbRailEntryDescription,
  getPcbRailMovementAxis,
} from "../domain/pcbRailDirection";
import {
  PARAMETRIC_PCB_FEATURE_ID,
  PCB_MOUNTING_LABELS,
} from "../domain/pcbMounting";
import {
  ENCLOSURE_FACE_OPTIONS,
  getFaceLabel,
  getPanelMaxInsetDepth,
  PLACEMENT_ROTATIONS,
} from "../domain/placements";
import {
  ANTENNA_DEFINITIONS,
  CONNECTOR_DEFINITIONS,
  FASTENER_DEFINITIONS,
  type ConnectorDefinition,
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
  hasThroughPanelCutout,
  supportsDisplayScrewMounting,
} from "../libraries/components";
import { ENCLOSURE_TEMPLATES, getEnclosureTemplate } from "../libraries/templates";
import { useDesignerStore } from "../store/designerStore";
import { ManufacturingExport } from "./ManufacturingExport";
import { getMaxScrewHeadRecessDepth } from "../domain/screwRecess";

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "mm",
  disabled = false,
  onChange,
}: NumberFieldProps) {
  const [draftValue, setDraftValue] = useState(String(value));
  const editingRef = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
    if (!editingRef.current) setDraftValue(String(value));
  }, [value]);

  const commitDraft = () => {
    editingRef.current = false;
    const parsed = Number(draftValue);
    if (!Number.isFinite(parsed)) {
      setDraftValue(String(value));
      return;
    }
    const constrained = Math.min(max, Math.max(min, parsed));
    setDraftValue(String(constrained));
    onChange(constrained);
    window.requestAnimationFrame(() => {
      if (!editingRef.current) setDraftValue(String(valueRef.current));
    });
  };

  return (
    <label className="field-row">
      <span>{label}</span>
      <span className="number-control">
        <input
          type="number"
          value={draftValue}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          readOnly={disabled}
          aria-disabled={disabled}
          onFocus={() => {
            editingRef.current = true;
          }}
          onChange={(event) => {
            if (disabled) return;
            setDraftValue(event.currentTarget.value);
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onChange(next);
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraftValue(String(value));
              event.currentTarget.select();
            }
          }}
        />
        <small>{unit}</small>
      </span>
    </label>
  );
}

interface ScrewHeadRecessControlsProps {
  scope: "可拆面" | "面板";
  enabled: boolean;
  depth: number;
  thickness: number;
  onEnabledChange: (enabled: boolean) => void;
  onDepthChange: (depth: number) => void;
}

function ScrewHeadRecessControls({
  scope,
  enabled,
  depth,
  thickness,
  onEnabledChange,
  onDepthChange,
}: ScrewHeadRecessControlsProps) {
  return (
    <>
      <label className="toggle-row">
        <span>
          <strong>螺丝头嵌入</strong>
          <small>生成平底沉孔，使低头螺丝与外表面齐平。</small>
        </span>
        <input
          type="checkbox"
          aria-label={`${scope}螺丝头嵌入`}
          checked={enabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
        />
      </label>
      {enabled ? (
        <NumberField
          label="螺丝沉孔深度"
          value={depth}
          min={0.1}
          max={getMaxScrewHeadRecessDepth(thickness)}
          step={0.1}
          onChange={onDepthChange}
        />
      ) : null}
    </>
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

function FeatureStateBanner({
  hidden,
  locked,
  transparent,
  bodyHidden,
  onShow,
  onUnlock,
  onToggleTransparency,
  onShowBody,
}: {
  hidden: boolean;
  locked: boolean;
  transparent: boolean;
  bodyHidden: boolean;
  onShow: () => void;
  onUnlock: () => void;
  onToggleTransparency: () => void;
  onShowBody: () => void;
}) {
  if (!hidden && !locked && !transparent && !bodyHidden) return null;
  const stateLabels = [
    hidden ? "隐藏" : null,
    bodyHidden ? "PCB主体隐藏" : null,
    locked ? "锁定" : null,
    transparent ? "半透明" : null,
  ].filter(Boolean);
  return (
    <div className="feature-state-banner" role="status">
      <span>
        {hidden ? (
          <EyeOff size={14} />
        ) : bodyHidden ? (
          <CircuitBoard size={14} />
        ) : locked ? (
          <Lock size={14} />
        ) : (
          <Eye size={14} />
        )}
        对象已{stateLabels.join("、")}
      </span>
      <span className="feature-state-actions">
        {hidden ? (
          <button type="button" onClick={onShow} title="显示对象" aria-label="显示对象">
            <Eye size={14} />
          </button>
        ) : null}
        {bodyHidden ? (
          <button
            type="button"
            onClick={onShowBody}
            title="显示PCB主体"
            aria-label="显示PCB主体"
          >
            <CircuitBoard size={14} />
          </button>
        ) : null}
        {locked ? (
          <button type="button" onClick={onUnlock} title="解锁对象" aria-label="解锁对象">
            <LockOpen size={14} />
          </button>
        ) : null}
        {transparent ? (
          <button
            type="button"
            onClick={onToggleTransparency}
            title="恢复不透明"
            aria-label="恢复不透明"
          >
            <Eye size={14} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

const PART_LABELS: Record<SelectablePart, string> = {
  project: "项目参数",
  pcb: "PCB 与包络",
  base: "壳体主体",
  lid: "可拆面",
  panel: "面板参数",
  connector: "接口放置",
  antenna: "天线与射频空间",
  custom: "自定义组件",
  battery: "电池仓",
};

const CONNECTOR_CATEGORY_LABELS = {
  usb: "USB",
  power: "电源",
  network: "网络",
  terminal: "端子",
  fpc: "FPC",
  display: "显示屏",
  keypad: "薄膜按键",
  switch: "按键开关",
  indicator: "指示灯",
  sensor: "传感器",
  speaker: "扬声器",
} as const;

const DISPLAY_MOUNTING_OPTIONS: ReadonlyArray<{
  id: DisplayMountingType;
  name: string;
}> = [
  { id: "none", name: "无" },
  { id: "screw", name: "螺丝" },
];

function getDisplayMountingOptions(
  definition: ConnectorDefinition,
  placement: { surface: ConnectorSurface; panelId: string | null },
): ReadonlyArray<{
  id: DisplayMountingType;
  name: string;
}> {
  if (
    placement.surface === "panel" &&
    placement.panelId &&
    supportsDisplayScrewMounting(definition)
  ) {
    return DISPLAY_MOUNTING_OPTIONS;
  }
  return DISPLAY_MOUNTING_OPTIONS.filter((option) => option.id === "none");
}

function getDisplayMountingNotice(
  definition: ConnectorDefinition,
  placement: { surface: ConnectorSurface; panelId: string | null },
): string | null {
  if (!definition.displaySpec) return null;
  if (!supportsDisplayScrewMounting(definition)) {
    return "当前显示屏规格未提供安装孔，固定方式保持为无；建议使用压框、背胶、胶垫或自定义固定件。";
  }
  if (placement.surface !== "panel" || !placement.panelId) {
    return "显示屏螺丝固定目前只对可更换面板生成制造结构；壳体面直装请先放到面板或使用自定义固定件。";
  }
  return null;
}

function ConnectorDefinitionOptions() {
  return Object.entries(CONNECTOR_CATEGORY_LABELS).map(([category, label]) => {
    const definitions = CONNECTOR_DEFINITIONS.filter(
      (definition) => definition.category === category,
    );
    if (definitions.length === 0) return null;
    return (
      <optgroup key={category} label={label}>
        {definitions.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </optgroup>
    );
  });
}

function getConnectorDimensionLabels(definition: ConnectorDefinition): {
  diameter: string;
  width: string;
  height: string;
} {
  if (definition.displaySpec) {
    return { diameter: "开窗直径", width: "开窗宽度", height: "开窗高度" };
  }
  if (!hasThroughPanelCutout(definition)) {
    return { diameter: "贴装直径", width: "贴装宽度", height: "贴装高度" };
  }
  return { diameter: "孔径", width: "开孔宽度", height: "开孔高度" };
}

function getShortDrawingSource(source: string): string {
  return source.split(/[\\/]/).pop() || source;
}

function formatDisplayInch(value: number): string {
  return value < 1
    ? value.toFixed(2).replace(/0$/, "")
    : value.toFixed(1);
}

function getConnectorInspectorTitle(definition: ConnectorDefinition): string {
  if (definition.displaySpec) return "显示屏参数";
  if (definition.microphoneSpec) return "传感器参数";
  if (definition.speakerSpec) return "扬声器参数";
  return "接口参数";
}

function DisplaySpecSummary({
  definition,
}: {
  definition: ConnectorDefinition;
}) {
  const spec = definition.displaySpec;
  const microphoneSpec = definition.microphoneSpec;
  const speakerSpec = definition.speakerSpec;
  if (speakerSpec) {
    return (
      <div className="display-spec-card" aria-label="扬声器规格摘要">
        <div className="display-spec-card-heading">
          <strong>方形腔体扬声器</strong>
          <span>{speakerSpec.bodyWidth.toFixed(0)} × {speakerSpec.bodyHeight.toFixed(0)} × {speakerSpec.bodyDepth.toFixed(1)} mm · {speakerSpec.impedanceOhms} Ω · {speakerSpec.ratedPowerWatts} W</span>
        </div>
        <div className="display-spec-grid">
          <span>
            <small>本体</small>
            <strong>{speakerSpec.bodyWidth.toFixed(0)} × {speakerSpec.bodyHeight.toFixed(0)}</strong>
          </span>
          <span>
            <small>厚度</small>
            <strong>{speakerSpec.bodyDepth.toFixed(1)} mm</strong>
          </span>
          <span>
            <small>线束</small>
            <strong>{speakerSpec.cableLength.toFixed(0)} mm</strong>
          </span>
          <span>
            <small>端子</small>
            <strong>{speakerSpec.connectorPitch.toFixed(2)} mm {speakerSpec.connectorPins}P</strong>
          </span>
        </div>
        <p>
          {speakerSpec.impedanceOhms} Ω / {speakerSpec.ratedPowerWatts} W · {getShortDrawingSource(speakerSpec.sourceDrawing)}
        </p>
      </div>
    );
  }
  if (microphoneSpec) {
    return (
      <div className="display-spec-card" aria-label="麦克风规格摘要">
        <div className="display-spec-card-heading">
          <strong>防水驻极体麦克风</strong>
          <span>{microphoneSpec.frequencyRange} · {microphoneSpec.sensitivity} · {microphoneSpec.signalToNoiseRatio}</span>
        </div>
        <div className="display-spec-grid">
          <span>
            <small>咪头</small>
            <strong>Φ{microphoneSpec.capsuleDiameter.toFixed(1)} × {microphoneSpec.capsuleHeight.toFixed(2)}</strong>
          </span>
          <span>
            <small>胶套</small>
            <strong>Φ{microphoneSpec.sealDiameter.toFixed(1)} mm</strong>
          </span>
          <span>
            <small>线束</small>
            <strong>{microphoneSpec.cableLength.toFixed(0)} mm · {microphoneSpec.connectorPins}P</strong>
          </span>
          <span>
            <small>端子</small>
            <strong>{microphoneSpec.connectorPitch.toFixed(2)} mm</strong>
          </span>
        </div>
        <p>
          {microphoneSpec.operatingVoltage} · {microphoneSpec.standardPowerSupply.toFixed(1)} V 标准供电 · {getShortDrawingSource(microphoneSpec.sourceDrawing)}
        </p>
      </div>
    );
  }
  if (!spec) {
    return <p className="material-note">{definition.metadata.notes}</p>;
  }

  const displayKind = spec.panelKind === "oled" ? "OLED" : "TFT";
  const interfaceMode = spec.interfaceMode ?? "SPI";
  const bodyLabel = spec.packageStyle === "bare-oled" ? "外形" : "PCB";

  return (
    <div className="display-spec-card" aria-label="显示屏规格摘要">
      <div className="display-spec-card-heading">
        <strong>{formatDisplayInch(spec.diagonalInch)}寸 {displayKind}</strong>
        <span>{spec.resolution} · {interfaceMode} · {spec.touch === "resistive" ? "电阻触摸" : "无触摸"}</span>
      </div>
      <div className="display-spec-grid">
        <span>
          <small>{bodyLabel}</small>
          <strong>{spec.pcbWidth.toFixed(2)} × {spec.pcbHeight.toFixed(2)}</strong>
        </span>
        <span>
          <small>AA</small>
          <strong>{spec.activeAreaWidth.toFixed(2)} × {spec.activeAreaHeight.toFixed(2)}</strong>
        </span>
        <span>
          <small>开窗</small>
          <strong>{spec.windowWidth.toFixed(2)} × {spec.windowHeight.toFixed(2)}</strong>
        </span>
        <span>
          <small>厚度</small>
          <strong>{spec.totalThicknessWithHeader.toFixed(2)} mm</strong>
        </span>
      </div>
      <p>
        驱动 {spec.driveIc} · {spec.headerPins}Pin · 资料 {getShortDrawingSource(spec.sourceDrawing)}
      </p>
    </div>
  );
}

function IssueIcon({ issue }: { issue: ValidationIssue }) {
  if (issue.level === "error") return <AlertTriangle size={15} />;
  if (issue.level === "warning") return <AlertTriangle size={15} />;
  if (issue.level === "info") return <CheckCircle2 size={15} />;
  return <Info size={15} />;
}

export function Inspector() {
  const inspectorRef = useRef<HTMLElement>(null);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const hiddenFeatureIds = useDesignerStore((state) => state.hiddenFeatureIds);
  const hiddenPcbBodyIds = useDesignerStore((state) => state.hiddenPcbBodyIds);
  const lockedFeatureIds = useDesignerStore((state) => state.lockedFeatureIds);
  const transparentObjectIds = useDesignerStore(
    (state) => state.transparentObjectIds,
  );
  const toggleFeatureVisibility = useDesignerStore(
    (state) => state.toggleFeatureVisibility,
  );
  const togglePcbBodyVisibility = useDesignerStore(
    (state) => state.togglePcbBodyVisibility,
  );
  const toggleFeatureLock = useDesignerStore((state) => state.toggleFeatureLock);
  const toggleObjectTransparency = useDesignerStore(
    (state) => state.toggleObjectTransparency,
  );
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
  const updatePcbReferencePlacement = useDesignerStore(
    (state) => state.updatePcbReferencePlacement,
  );
  const updateCustomComponent = useDesignerStore(
    (state) => state.updateCustomComponent,
  );
  const removeCustomComponent = useDesignerStore(
    (state) => state.removeCustomComponent,
  );
  const updateBatteryCompartment = useDesignerStore(
    (state) => state.updateBatteryCompartment,
  );
  const setBatteryPreset = useDesignerStore((state) => state.setBatteryPreset);
  const removeBatteryCompartment = useDesignerStore(
    (state) => state.removeBatteryCompartment,
  );

  useEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0 });
  }, [inspectorTab, selectedFeatureId, selectedPart]);
  const selectedFeatureHidden = Boolean(
    selectedFeatureId && hiddenFeatureIds.includes(selectedFeatureId),
  );
  const selectedFeatureLocked = Boolean(
    selectedFeatureId && lockedFeatureIds.includes(selectedFeatureId),
  );
  const selectedFeatureTransparent = Boolean(
    selectedFeatureId && transparentObjectIds.includes(selectedFeatureId),
  );
  const selectedFeatureBodyHidden = Boolean(
    selectedPart === "pcb" &&
      selectedFeatureId &&
      hiddenPcbBodyIds.includes(selectedFeatureId),
  );
  const pcbRailMounted = parameters.pcbMountingType !== "screw";
  const parametricPcbRailMovementAxis = getPcbRailMovementAxis(parameters);
  const parametricPcbXLocked =
    pcbRailMounted && parametricPcbRailMovementAxis !== "x";
  const parametricPcbYLocked =
    pcbRailMounted && parametricPcbRailMovementAxis !== "y";
  const parametricPcbZLocked =
    pcbRailMounted && parametricPcbRailMovementAxis !== "z";
  const isObjectTransparent = (id: string) => transparentObjectIds.includes(id);
  const isPcbBodyHidden = (id: string) => hiddenPcbBodyIds.includes(id);
  useEffect(() => {
    inspectorRef.current
      ?.querySelectorAll<HTMLElement>(".contextual-inspector .inspector-section")
      .forEach((section) => {
        if (selectedFeatureLocked) section.setAttribute("inert", "");
        else section.removeAttribute("inert");
        section
          .querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
          >("input, select, textarea, button")
          .forEach((control) => {
            control.disabled = selectedFeatureLocked;
          });
      });
  }, [selectedFeatureLocked, selectedFeatureId, selectedPart]);
  const featureStateBanner = selectedFeatureId ? (
    <FeatureStateBanner
      hidden={selectedFeatureHidden}
      locked={selectedFeatureLocked}
      transparent={selectedFeatureTransparent}
      bodyHidden={selectedFeatureBodyHidden}
      onShow={() => toggleFeatureVisibility(selectedFeatureId)}
      onUnlock={() => toggleFeatureLock(selectedFeatureId)}
      onToggleTransparency={() => toggleObjectTransparency(selectedFeatureId)}
      onShowBody={() => togglePcbBodyVisibility(selectedFeatureId)}
    />
  ) : null;
  const selectedPcbReference =
    parameters.pcbReferences.find(
      (placement) => placement.id === selectedFeatureId,
    ) ?? parameters.pcbReferences[0] ?? null;
  const selectedPcbReferenceIndex = selectedPcbReference
    ? parameters.pcbReferences.findIndex(
        (placement) => placement.id === selectedPcbReference.id,
      )
    : -1;
  const selectedPanel =
    parameters.panelPlacements.find((panel) => panel.id === selectedFeatureId) ??
    parameters.panelPlacements[0] ??
    null;
  const selectedPanelIndex = selectedPanel
    ? parameters.panelPlacements.findIndex((panel) => panel.id === selectedPanel.id)
    : -1;
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
  const selectedCustomComponent =
    parameters.customComponents.find(
      (component) => component.id === selectedFeatureId,
    ) ?? parameters.customComponents[0] ?? null;
  const selectedCustomComponentIndex = selectedCustomComponent
    ? parameters.customComponents.findIndex(
        (component) => component.id === selectedCustomComponent.id,
      )
    : -1;
  const selectedBatteryCompartment =
    parameters.batteryCompartments.find(
      (compartment) => compartment.id === selectedFeatureId,
    ) ?? parameters.batteryCompartments[0] ?? null;
  const selectedBatteryCompartmentIndex = selectedBatteryCompartment
    ? parameters.batteryCompartments.findIndex(
        (compartment) => compartment.id === selectedBatteryCompartment.id,
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
  const pcbMountingControls = (
    <section className="inspector-section">
      <h2>PCB 固定方式</h2>
      <label className="select-field">
        <span>固定结构</span>
        <select
          aria-label="PCB 固定结构"
          value={parameters.pcbMountingType}
          onChange={(event) =>
            setParameter("pcbMountingType", event.currentTarget.value as PcbMountingType)
          }
        >
          {Object.entries(PCB_MOUNTING_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </label>
      {parameters.pcbMountingType !== "screw" ? (
        <>
          <label className="select-field">
            <span>滑槽入口</span>
            <select
              aria-label="PCB 滑槽入口"
              value={parameters.pcbRailEntryFace}
              onChange={(event) =>
                setParameter("pcbRailEntryFace", event.currentTarget.value as EnclosureFace)
              }
            >
              {ENCLOSURE_FACE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <p className="material-note">
            滑入方向：从 {getPcbRailEntryDescription(parameters, 0)}；可在 6 个面中任意选择。左/右限制 X 轴，前/后限制 Z 轴，上/下限制 Y 轴。
          </p>
          <NumberField label="导轨宽度" value={parameters.pcbRailWidth} min={1.2} max={8} step={0.1} onChange={(value) => setParameter("pcbRailWidth", value)} />
          <NumberField label="压边高度" value={parameters.pcbRailHeight} min={1} max={6} step={0.1} onChange={(value) => setParameter("pcbRailHeight", value)} />
          <NumberField label="滑槽余量" value={parameters.pcbRailClearance} min={0.1} max={2} step={0.1} onChange={(value) => setParameter("pcbRailClearance", value)} />
          <NumberField label="闭口挡块" value={parameters.pcbStopWidth} min={0.8} max={20} step={0.5} onChange={(value) => setParameter("pcbStopWidth", value)} />
          {parameters.pcbMountingType === "rail-elastic" ? (
            <NumberField label="橡皮筋宽度" value={parameters.pcbElasticBandWidth} min={1} max={8} step={0.5} onChange={(value) => setParameter("pcbElasticBandWidth", value)} />
          ) : null}
          <p className="material-note">
            两侧导轨会从所选入口方向引出，形成下托边、上压边和外侧背筋组成的 C 型槽，不再生成底部支撑墙；橡皮筋模式会在闭口端生成挂点，让橡皮筋沿 PCB 长度方向从上下两面绕过，防止 PCB 顺着滑槽弹出。
          </p>
        </>
      ) : (
        <p className="material-note">
          使用 PCB 安装孔生成螺丝柱；适合需要长期固定、不频繁拆装的结构。
        </p>
      )}
    </section>
  );

  if (selectedPart === "pcb" && selectedPcbReference) {
    const placement = selectedPcbReference;
    const reference = placement.reference;
    const pcbRailMovementAxis = getPcbRailMovementAxis(
      parameters,
      placement.rotation,
    );
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="PCB 检查器">
        <div className="inspector-title">
          <span>PCB {selectedPcbReferenceIndex + 1}</span>
          <small>{reference.sourceName}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>PCB 参考位置</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={selectedFeatureHidden ? "显示当前 PCB 全部" : "全隐藏当前 PCB"}
                  aria-label={selectedFeatureHidden ? "显示当前 PCB 全部" : "全隐藏当前 PCB"}
                  onClick={() => toggleFeatureVisibility(placement.id)}
                >
                  {selectedFeatureHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={
                    isPcbBodyHidden(placement.id)
                      ? "显示当前 PCB 主体"
                      : "隐藏当前 PCB 主体"
                  }
                  aria-label={
                    isPcbBodyHidden(placement.id)
                      ? "显示当前 PCB 主体"
                      : "隐藏当前 PCB 主体"
                  }
                  onClick={() => togglePcbBodyVisibility(placement.id)}
                >
                  <CircuitBoard size={14} />
                </button>
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(placement.id)
                      ? "恢复当前 PCB 不透明"
                      : "当前 PCB 半透明"
                  }
                  aria-label={
                    isObjectTransparent(placement.id)
                      ? "恢复当前 PCB 不透明"
                      : "当前 PCB 半透明"
                  }
                  onClick={() => toggleObjectTransparency(placement.id)}
                >
                  {isObjectTransparent(placement.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="移除当前 PCB 参考"
                  aria-label="移除当前 PCB 参考"
                  onClick={() => clearPcbReference(placement.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <NumberField label="X 偏移" value={placement.offsetX} min={-500} max={500} step={1} disabled={pcbRailMounted && pcbRailMovementAxis !== "x"} onChange={(value) => updatePcbReferencePlacement(placement.id, { offsetX: value })} />
            <NumberField label="Z 偏移" value={placement.offsetZ} min={-500} max={500} step={1} disabled={pcbRailMounted && pcbRailMovementAxis !== "z"} onChange={(value) => updatePcbReferencePlacement(placement.id, { offsetZ: value })} />
            <NumberField label="Y 偏移" value={placement.elevation} min={-parameters.standoffHeight} max={300} step={1} disabled={pcbRailMounted && pcbRailMovementAxis !== "y"} onChange={(value) => updatePcbReferencePlacement(placement.id, { elevation: value })} />
            <label className="select-field">
              <span>平面旋转</span>
              <select
                aria-label={`PCB ${selectedPcbReferenceIndex + 1} 平面旋转`}
                value={placement.rotation}
                onChange={(event) =>
                  updatePcbReferencePlacement(placement.id, {
                    rotation: Number(event.currentTarget.value) as PlacementRotation,
                  })
                }
              >
                {PLACEMENT_ROTATIONS.map((rotation) => (
                  <option key={rotation} value={rotation}>{rotation}°</option>
                ))}
              </select>
            </label>
            <p className="material-note">
              {(reference.bounds.maxX - reference.bounds.minX).toFixed(1)} × {(reference.bounds.maxY - reference.bounds.minY).toFixed(1)} × {reference.thickness.toFixed(1)} mm
            </p>
            {pcbRailMounted ? (
              <p className="material-note">
                当前 PCB 使用滑槽固定，入口从 {getPcbRailEntryDescription(parameters, placement.rotation)}；只允许沿 {pcbRailMovementAxis?.toUpperCase() ?? "当前滑槽"} 轴调整位置，其他轴会由滑槽结构约束。
              </p>
            ) : null}
            <p className="material-note">
              {reference.format === "kicad_pcb"
                ? `KiCad ${reference.version ?? "未知版本"} · ${reference.outlineElements} 段板框 · ${reference.mountingHoles.length} 个安装孔`
                : reference.format === "gerber-excellon"
                  ? `Gerber ${reference.outlineElements} 段 · ${reference.drillHoleCount ?? 0} 个钻孔 · ${reference.mountingHoles.length} 个安装孔候选`
                  : `STEP ${reference.outlineElements} 个实体 · ${(reference.triangleCount ?? 0).toLocaleString()} 三角面 · 高 ${(reference.overallHeight ?? 0).toFixed(1)} mm`}
            </p>
          </section>
          {pcbMountingControls}
        </div>
      </aside>
    );
  }

  if (selectedPart === "pcb" && parameters.parametricPcbEnabled) {
    const pcbHidden = hiddenFeatureIds.includes(PARAMETRIC_PCB_FEATURE_ID);
    const pcbLocked = lockedFeatureIds.includes(PARAMETRIC_PCB_FEATURE_ID);
    const pcbTransparent = isObjectTransparent(PARAMETRIC_PCB_FEATURE_ID);
    const pcbBodyHidden = isPcbBodyHidden(PARAMETRIC_PCB_FEATURE_ID);
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="参数 PCB 检查器">
        <div className="inspector-title">
          <span>参数 PCB</span>
          <small>{parameters.pcbLength.toFixed(1)} × {parameters.pcbWidth.toFixed(1)} × {parameters.pcbThickness.toFixed(1)} mm</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          <FeatureStateBanner
            hidden={pcbHidden}
            locked={pcbLocked}
            transparent={pcbTransparent}
            bodyHidden={pcbBodyHidden}
            onShow={() => toggleFeatureVisibility(PARAMETRIC_PCB_FEATURE_ID)}
            onUnlock={() => toggleFeatureLock(PARAMETRIC_PCB_FEATURE_ID)}
            onToggleTransparency={() =>
              toggleObjectTransparency(PARAMETRIC_PCB_FEATURE_ID)
            }
            onShowBody={() => togglePcbBodyVisibility(PARAMETRIC_PCB_FEATURE_ID)}
          />
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>PCB 位置</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={pcbHidden ? "显示参数 PCB 全部" : "全隐藏参数 PCB"}
                  aria-label={pcbHidden ? "显示参数 PCB 全部" : "全隐藏参数 PCB"}
                  onClick={() => toggleFeatureVisibility(PARAMETRIC_PCB_FEATURE_ID)}
                >
                  {pcbHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={pcbBodyHidden ? "显示参数 PCB 主体" : "隐藏参数 PCB 主体"}
                  aria-label={pcbBodyHidden ? "显示参数 PCB 主体" : "隐藏参数 PCB 主体"}
                  onClick={() => togglePcbBodyVisibility(PARAMETRIC_PCB_FEATURE_ID)}
                >
                  <CircuitBoard size={14} />
                </button>
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={pcbTransparent ? "恢复参数 PCB 不透明" : "参数 PCB 半透明"}
                  aria-label={pcbTransparent ? "恢复参数 PCB 不透明" : "参数 PCB 半透明"}
                  onClick={() => toggleObjectTransparency(PARAMETRIC_PCB_FEATURE_ID)}
                >
                  {pcbTransparent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </div>
            <NumberField label="X 位置" value={parameters.pcbOffsetX} min={-500} max={500} step={1} disabled={parametricPcbXLocked} onChange={(value) => setParameter("pcbOffsetX", value)} />
            <NumberField label="Y 偏移" value={parameters.pcbElevation} min={-parameters.standoffHeight} max={300} step={1} disabled={parametricPcbYLocked} onChange={(value) => setParameter("pcbElevation", value)} />
            <NumberField label="Z 位置" value={parameters.pcbOffsetZ} min={-500} max={500} step={1} disabled={parametricPcbZLocked} onChange={(value) => setParameter("pcbOffsetZ", value)} />
            <p className="material-note">
              {pcbRailMounted
                ? `当前 PCB 使用滑槽固定，入口从 ${getPcbRailEntryDescription(parameters, 0)}；只允许沿 ${parametricPcbRailMovementAxis?.toUpperCase() ?? "当前滑槽"} 轴调整位置，其他轴会由滑槽结构约束。`
                : "Y 偏移是相对“PCB 基准高度”的附加高度；可输入负值下移，但最低不会穿过底板。"}
            </p>
          </section>
          <section className="inspector-section">
            <h2>PCB 尺寸</h2>
            <NumberField label="长度" value={parameters.pcbLength} min={20} max={300} step={1} onChange={(value) => setParameter("pcbLength", value)} />
            <NumberField label="宽度" value={parameters.pcbWidth} min={20} max={220} step={1} onChange={(value) => setParameter("pcbWidth", value)} />
            <NumberField label="板厚" value={parameters.pcbThickness} min={0.6} max={5} onChange={(value) => setParameter("pcbThickness", value)} />
            <NumberField label="最高元件" value={parameters.componentHeight} min={0} max={80} step={0.5} onChange={(value) => setParameter("componentHeight", value)} />
          </section>
          {pcbMountingControls}
        </div>
      </aside>
    );
  }

  if (selectedPart === "custom" && selectedCustomComponent) {
    const component = selectedCustomComponent;
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="自定义组件检查器">
        <div className="inspector-title">
          <span>{component.name}</span>
          <small>自定义组件 {selectedCustomComponentIndex + 1}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>自定义组件参数</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(component.id)
                      ? "恢复当前自定义组件不透明"
                      : "当前自定义组件半透明"
                  }
                  aria-label={
                    isObjectTransparent(component.id)
                      ? "恢复当前自定义组件不透明"
                      : "当前自定义组件半透明"
                  }
                  onClick={() => toggleObjectTransparency(component.id)}
                >
                  {isObjectTransparent(component.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="删除当前自定义组件"
                  aria-label="删除当前自定义组件"
                  onClick={() => removeCustomComponent(component.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <label className="select-field">
              <span>名称</span>
              <input
                className="text-control"
                type="text"
                value={component.name}
                onChange={(event) =>
                  updateCustomComponent(component.id, {
                    name: event.currentTarget.value,
                  })
                }
              />
            </label>
            <label className="select-field">
              <span>几何类型</span>
              <select
                aria-label="自定义组件几何类型"
                value={component.shape}
                onChange={(event) =>
                  updateCustomComponent(component.id, {
                    shape: event.currentTarget.value as typeof component.shape,
                  })
                }
              >
                <option value="box">长方体</option>
                <option value="cylinder">圆柱体</option>
                {component.sourceName ? <option value="model">导入模型</option> : null}
              </select>
            </label>
            {component.shape === "cylinder" ? (
              <NumberField label="直径" value={component.width} min={0.5} max={300} step={1} onChange={(value) => updateCustomComponent(component.id, { width: value, depth: value })} />
            ) : (
              <>
                <NumberField label="宽度" value={component.width} min={0.5} max={300} step={1} onChange={(value) => updateCustomComponent(component.id, { width: value })} />
                <NumberField label="深度" value={component.depth} min={0.5} max={300} step={1} onChange={(value) => updateCustomComponent(component.id, { depth: value })} />
              </>
            )}
            <NumberField label="高度" value={component.height} min={0.5} max={300} step={1} onChange={(value) => updateCustomComponent(component.id, { height: value })} />
            <NumberField label="X 位置" value={component.positionX} min={-500} max={500} step={1} onChange={(value) => updateCustomComponent(component.id, { positionX: value })} />
            <NumberField label="Y 位置" value={component.positionY} min={-500} max={500} step={1} onChange={(value) => updateCustomComponent(component.id, { positionY: value })} />
            <NumberField label="Z 位置" value={component.positionZ} min={-500} max={500} step={1} onChange={(value) => updateCustomComponent(component.id, { positionZ: value })} />
            <NumberField label="X 旋转" value={component.rotationX} min={0} max={359} step={1} unit="°" onChange={(value) => updateCustomComponent(component.id, { rotationX: value })} />
            <NumberField label="Y 旋转" value={component.rotationY} min={0} max={359} step={1} unit="°" onChange={(value) => updateCustomComponent(component.id, { rotationY: value })} />
            <NumberField label="Z 旋转" value={component.rotationZ} min={0} max={359} step={1} unit="°" onChange={(value) => updateCustomComponent(component.id, { rotationZ: value })} />
            <label className="select-field">
              <span>颜色</span>
              <input
                className="color-control"
                type="color"
                value={component.color}
                onChange={(event) =>
                  updateCustomComponent(component.id, {
                    color: event.currentTarget.value,
                  })
                }
              />
            </label>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedPart === "battery" && selectedBatteryCompartment) {
    const compartment = selectedBatteryCompartment;
    const preset = getBatteryPreset(compartment.preset);
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="电池仓检查器">
        <div className="inspector-title">
          <span>电池仓 {selectedBatteryCompartmentIndex + 1}</span>
          <small>{preset.name} · {compartment.cellCount} 槽</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>电池仓参数</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={
                    selectedFeatureHidden
                      ? "显示当前电池仓"
                      : "隐藏当前电池仓"
                  }
                  aria-label={
                    selectedFeatureHidden
                      ? "显示当前电池仓"
                      : "隐藏当前电池仓"
                  }
                  onClick={() => toggleFeatureVisibility(compartment.id)}
                >
                  {selectedFeatureHidden ? (
                    <Eye size={14} />
                  ) : (
                    <EyeOff size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(compartment.id)
                      ? "恢复当前电池仓不透明"
                      : "当前电池仓半透明"
                  }
                  aria-label={
                    isObjectTransparent(compartment.id)
                      ? "恢复当前电池仓不透明"
                      : "当前电池仓半透明"
                  }
                  onClick={() => toggleObjectTransparency(compartment.id)}
                >
                  {isObjectTransparent(compartment.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="删除当前电池仓"
                  aria-label="删除当前电池仓"
                  onClick={() => removeBatteryCompartment(compartment.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <label className="select-field">
              <span>电池规格</span>
              <select
                aria-label={`电池仓 ${selectedBatteryCompartmentIndex + 1} 电池规格`}
                value={compartment.preset}
                onChange={(event) =>
                  setBatteryPreset(
                    compartment.id,
                    event.currentTarget.value as typeof compartment.preset,
                  )
                }
              >
                {BATTERY_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>安装位置</span>
              <select
                aria-label={`电池仓 ${selectedBatteryCompartmentIndex + 1} 安装位置`}
                value={compartment.face}
                onChange={(event) =>
                  updateBatteryCompartment(compartment.id, {
                    face: event.currentTarget.value as BatteryMountFace,
                  })
                }
              >
                {Object.entries(BATTERY_MOUNT_FACE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>固定方式</span>
              <select
                aria-label={`电池仓 ${selectedBatteryCompartmentIndex + 1} 固定方式`}
                value={compartment.retentionType}
                onChange={(event) =>
                  updateBatteryCompartment(compartment.id, {
                    retentionType: event.currentTarget.value as BatteryRetentionType,
                  })
                }
              >
                {Object.entries(BATTERY_RETENTION_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>滑入方向</span>
              <select
                aria-label={`电池仓 ${selectedBatteryCompartmentIndex + 1} 滑入方向`}
                value={compartment.insertionSide}
                onChange={(event) =>
                  updateBatteryCompartment(compartment.id, {
                    insertionSide: event.currentTarget.value as BatteryInsertionSide,
                  })
                }
              >
                {Object.entries(BATTERY_INSERTION_SIDE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <p className="material-note">
              入口端只生成低矮导向块，另一端保留止挡；橡皮筋模式会生成挂耳，电池从滑入端推入后用橡皮筋封口。
            </p>
            <NumberField label="槽位数量" value={compartment.cellCount} min={1} max={6} step={1} unit="槽" onChange={(value) => updateBatteryCompartment(compartment.id, { cellCount: value })} />
            <NumberField label="仓体长度" value={compartment.width} min={4} max={300} step={1} onChange={(value) => updateBatteryCompartment(compartment.id, { width: value })} />
            <NumberField label="仓体宽度" value={compartment.depth} min={4} max={300} step={1} onChange={(value) => updateBatteryCompartment(compartment.id, { depth: value })} />
            <NumberField label="挡边高度" value={compartment.height} min={4} max={getBatteryMaxRailHeight(preset)} step={0.5} onChange={(value) => updateBatteryCompartment(compartment.id, { height: value })} />
            <NumberField label="仓壁厚度" value={compartment.wallThickness} min={0.8} max={5} step={0.1} onChange={(value) => updateBatteryCompartment(compartment.id, { wallThickness: value })} />
            <NumberField label="电池间隙" value={compartment.clearance} min={0.2} max={5} step={0.1} onChange={(value) => updateBatteryCompartment(compartment.id, { clearance: value })} />
            <NumberField label="面内横向" value={compartment.offsetX} min={-500} max={500} step={1} onChange={(value) => updateBatteryCompartment(compartment.id, { offsetX: value })} />
            <NumberField label="面内纵向" value={compartment.offsetZ} min={-500} max={500} step={1} onChange={(value) => updateBatteryCompartment(compartment.id, { offsetZ: value })} />
            <label className="select-field">
              <span>平面旋转</span>
              <select
                aria-label={`电池仓 ${selectedBatteryCompartmentIndex + 1} 平面旋转`}
                value={compartment.rotation}
                onChange={(event) =>
                  updateBatteryCompartment(compartment.id, {
                    rotation: Number(event.currentTarget.value) as PlacementRotation,
                  })
                }
              >
                {PLACEMENT_ROTATIONS.map((rotation) => (
                  <option key={rotation} value={rotation}>{rotation}°</option>
                ))}
              </select>
            </label>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedPart === "panel" && selectedPanel) {
    const panel = selectedPanel;
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="面板检查器">
        <div className="inspector-title">
          <span>面板 {selectedPanelIndex + 1}</span>
          <small>
            {getFaceLabel(panel.face)} · {panel.width.toFixed(1)} × {panel.height.toFixed(1)} mm
          </small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>面板参数</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={selectedFeatureHidden ? "显示当前面板" : "隐藏当前面板"}
                  aria-label={selectedFeatureHidden ? "显示当前面板" : "隐藏当前面板"}
                  onClick={() => toggleFeatureVisibility(panel.id)}
                >
                  {selectedFeatureHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(panel.id)
                      ? "恢复当前面板不透明"
                      : "当前面板半透明"
                  }
                  aria-label={
                    isObjectTransparent(panel.id)
                      ? "恢复当前面板不透明"
                      : "当前面板半透明"
                  }
                  onClick={() => toggleObjectTransparency(panel.id)}
                >
                  {isObjectTransparent(panel.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="删除当前面板"
                  aria-label="删除当前面板"
                  onClick={() => removePanelPlacement(panel.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            <label className="select-field">
              <span>所在面</span>
              <select
                aria-label="面板所在面"
                value={panel.face}
                onChange={(event) =>
                  updatePanelPlacement(panel.id, {
                    face: event.currentTarget.value as EnclosureFace,
                  })
                }
              >
                {ENCLOSURE_FACE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </label>
            <NumberField label="宽度" value={panel.width} min={6} max={300} step={1} onChange={(value) => updatePanelPlacement(panel.id, { width: value })} />
            <NumberField label="高度" value={panel.height} min={6} max={300} step={1} onChange={(value) => updatePanelPlacement(panel.id, { height: value })} />
            <NumberField label="横向偏移" value={panel.offsetU} min={-300} max={300} step={1} onChange={(value) => updatePanelPlacement(panel.id, { offsetU: value })} />
            <NumberField label="纵向偏移" value={panel.offsetV} min={-300} max={300} step={1} onChange={(value) => updatePanelPlacement(panel.id, { offsetV: value })} />
            <label className="select-field">
              <span>固定方式</span>
              <select
                aria-label="面板固定方式"
                value={panel.mountingType}
                onChange={(event) =>
                  updatePanelPlacement(panel.id, {
                    mountingType: event.currentTarget.value as typeof panel.mountingType,
                  })
                }
              >
                <option value="screw">四角螺丝</option>
                <option value="magnet">四角磁吸</option>
                <option value="snap">弹性柱卡扣</option>
                <option value="slide">侧边滑轨</option>
              </select>
            </label>
            <NumberField label="面板厚度" value={panel.thickness} min={0.5} max={10} onChange={(value) => updatePanelPlacement(panel.id, { thickness: value })} />
            <NumberField label="嵌入深度" value={panel.insetDepth} min={0} max={getPanelMaxInsetDepth(panel, parameters)} step={0.1} onChange={(value) => updatePanelPlacement(panel.id, { insetDepth: value })} />
            <NumberField label="圆角半径" value={panel.cornerRadius} min={0} max={Math.max(0, Math.min(panel.width, panel.height) / 2 - 0.2)} step={0.5} onChange={(value) => updatePanelPlacement(panel.id, { cornerRadius: value })} />
            <NumberField label="嵌入边框宽度" value={panel.borderWidth} min={0.8} max={Math.max(0.8, Math.min(panel.width, panel.height) / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(panel.id, { borderWidth: value })} />
            {panel.mountingType === "screw" ? (
              <>
                <NumberField label="螺丝横向边距" value={panel.mountingInsetX} min={2} max={Math.max(2, panel.width / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(panel.id, { mountingInsetX: value })} />
                <NumberField label="螺丝纵向边距" value={panel.mountingInsetY} min={2} max={Math.max(2, panel.height / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(panel.id, { mountingInsetY: value })} />
                <ScrewHeadRecessControls
                  scope="面板"
                  enabled={panel.screwHeadRecessEnabled}
                  depth={panel.screwHeadRecessDepth}
                  thickness={panel.thickness}
                  onEnabledChange={(enabled) =>
                    updatePanelPlacement(panel.id, {
                      screwHeadRecessEnabled: enabled,
                    })
                  }
                  onDepthChange={(depth) =>
                    updatePanelPlacement(panel.id, {
                      screwHeadRecessDepth: depth,
                    })
                  }
                />
              </>
            ) : null}
          </section>
          <section className="inspector-section">
            <h2>面板材料</h2>
            <label className="select-field">
              <span>材料</span>
              <select
                aria-label={`面板 ${selectedPanelIndex + 1} 材料`}
                value={panel.materialId}
                onChange={(event) =>
                  updatePanelPlacement(panel.id, {
                    materialId: event.currentTarget.value,
                  })
                }
              >
                {PANEL_MATERIALS.map((material) => (
                  <option key={material.id} value={material.id}>{material.name}</option>
                ))}
              </select>
            </label>
            <MaterialBadge materialId={panel.materialId} />
            <p className="material-note">{getMaterial(panel.materialId).notes}</p>
          </section>
        </div>
      </aside>
    );
  }

  if (selectedPart === "connector" && selectedConnector) {
    const placement = selectedConnector;
    const definition = getConnectorDefinition(placement.definitionId);
    const dimensionLabels = getConnectorDimensionLabels(definition);
    const displayMountingOptions = getDisplayMountingOptions(
      definition,
      placement,
    );
    const displayMountingNotice = getDisplayMountingNotice(
      definition,
      placement,
    );
    const surfaceValue =
      placement.surface === "panel" && placement.panelId
        ? `panel:${placement.panelId}`
        : placement.surface;
    return (
      <aside ref={inspectorRef} className="inspector-panel" aria-label="接口检查器">
        <div className="inspector-title">
          <span>{definition.name}</span>
          <small>接口 {selectedConnectorIndex + 1}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section connector-placement">
            <div className="section-heading-row">
              <h2>{getConnectorInspectorTitle(definition)}</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-visibility"
                  type="button"
                  title={selectedFeatureHidden ? "显示当前接口" : "隐藏当前接口"}
                  aria-label={selectedFeatureHidden ? "显示当前接口" : "隐藏当前接口"}
                  onClick={() => toggleFeatureVisibility(placement.id)}
                >
                  {selectedFeatureHidden ? (
                    <Eye size={14} />
                  ) : (
                    <EyeOff size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(placement.id)
                      ? "恢复当前接口不透明"
                      : "当前接口半透明"
                  }
                  aria-label={
                    isObjectTransparent(placement.id)
                      ? "恢复当前接口不透明"
                      : "当前接口半透明"
                  }
                  onClick={() => toggleObjectTransparency(placement.id)}
                >
                  {isObjectTransparent(placement.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="删除当前接口"
                  aria-label="删除当前接口"
                  onClick={() => removeConnectorPlacement(placement.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
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
                <ConnectorDefinitionOptions />
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
                label={dimensionLabels.diameter}
                value={placement.cutoutWidth}
                min={1}
                max={120}
                onChange={(value) =>
                  updateConnectorPlacement(placement.id, {
                    cutoutWidth: value,
                    cutoutHeight: value,
                  })
                }
              />
            ) : (
              <>
                <NumberField label={dimensionLabels.width} value={placement.cutoutWidth} min={1} max={220} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutWidth: value })} />
                <NumberField label={dimensionLabels.height} value={placement.cutoutHeight} min={1} max={220} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutHeight: value })} />
              </>
            )}
            <NumberField label="横向偏移" value={placement.offsetU} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetU: value })} />
            <NumberField label="纵向偏移" value={placement.offsetV} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetV: value })} />
            {definition.displaySpec ? (
              <label className="select-field">
                <span>固定方式</span>
                <select
                  aria-label={`接口 ${selectedConnectorIndex + 1} 显示屏固定`}
                  value={placement.displayMountingType ?? "none"}
                  onChange={(event) =>
                    updateConnectorPlacement(placement.id, {
                      displayMountingType: event.currentTarget.value as DisplayMountingType,
                    })
                  }
                >
                  {displayMountingOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
                {displayMountingNotice ? (
                  <small>{displayMountingNotice}</small>
                ) : null}
              </label>
            ) : null}
            <DisplaySpecSummary definition={definition} />
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
      <aside ref={inspectorRef} className="inspector-panel" aria-label="天线检查器">
        <div className="inspector-title">
          <span>{definition.name}</span>
          <small>天线 {selectedAntennaIndex + 1}</small>
        </div>
        <div className="inspector-scroll contextual-inspector">
          {featureStateBanner}
          <section className="inspector-section">
            <div className="section-heading-row">
              <h2>天线参数</h2>
              <span className="section-heading-actions">
                <button
                  className="icon-section-button is-transparency"
                  type="button"
                  title={
                    isObjectTransparent(placement.id)
                      ? "恢复当前天线不透明"
                      : "当前天线半透明"
                  }
                  aria-label={
                    isObjectTransparent(placement.id)
                      ? "恢复当前天线不透明"
                      : "当前天线半透明"
                  }
                  onClick={() => toggleObjectTransparency(placement.id)}
                >
                  {isObjectTransparent(placement.id) ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  className="icon-section-button"
                  type="button"
                  title="删除当前天线"
                  aria-label="删除当前天线"
                  onClick={() => removeAntennaPlacement(placement.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
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
    <aside ref={inspectorRef} className="inspector-panel" aria-label="参数检查器">
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
                  <button type="button" onClick={() => clearPcbReference()} title="移除 PCB 文件关联" aria-label="移除 PCB 文件关联">
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
            {pcbMountingControls}
            <section className="inspector-section">
              <h2>壳体</h2>
              <NumberField label="壁厚" value={parameters.wallThickness} min={0.8} max={8} onChange={(value) => setParameter("wallThickness", value)} />
              <NumberField label="底面厚度" value={parameters.bottomThickness} min={0.8} max={8} onChange={(value) => setParameter("bottomThickness", value)} />
              <NumberField label="内部深度" value={parameters.baseHeight} min={8} max={120} step={1} onChange={(value) => setParameter("baseHeight", value)} />
              <NumberField label="外圆角" value={parameters.cornerRadius} min={0.5} max={30} onChange={(value) => setParameter("cornerRadius", value)} />
              <NumberField label="PCB 基准高度" value={parameters.standoffHeight} min={0} max={30} onChange={(value) => setParameter("standoffHeight", value)} />
              <NumberField label="可拆面厚度" value={parameters.lidThickness} min={0.8} max={8} onChange={(value) => setParameter("lidThickness", value)} />
            </section>
          </>
        ) : null}

        {inspectorTab === "structure" ? (
          <>
            <section className="inspector-section">
              <h2>可拆面固定</h2>
              <div className="closure-control" role="group" aria-label="可拆面固定方式">
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
                <button className={parameters.closureType === "latch" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "latch")}>
                  <BadgeCheck size={17} />
                  <span>快拆扣</span>
                </button>
                <button className={parameters.closureType === "spring-latch" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "spring-latch")}>
                  <RotateCw size={17} />
                  <span>弹簧卡扣</span>
                </button>
                <button className={parameters.closureType === "slide" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "slide")}>
                  <ArrowRightLeft size={17} />
                  <span>滑盖</span>
                </button>
                <button className={parameters.closureType === "hinge" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "hinge")}>
                  <PanelTop size={17} />
                  <span>翻盖</span>
                </button>
                <button className={parameters.closureType === "pin" ? "is-active" : ""} type="button" onClick={() => setParameter("closureType", "pin")}>
                  <Unplug size={17} />
                  <span>快拆销</span>
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
                  <ScrewHeadRecessControls
                    scope="可拆面"
                    enabled={parameters.closureScrewHeadRecessEnabled}
                    depth={parameters.closureScrewHeadRecessDepth}
                    thickness={parameters.lidThickness}
                    onEnabledChange={(enabled) =>
                      setParameter("closureScrewHeadRecessEnabled", enabled)
                    }
                    onDepthChange={(depth) =>
                      setParameter("closureScrewHeadRecessDepth", depth)
                    }
                  />
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
              {parameters.closureType === "spring-latch" ? (
                <p className="material-note">
                  自动在固定点生成弹簧杯、导向柱、旋转锁舌和卡扣挡块；装配时先下压压缩弹簧，再旋转到卡扣挡块下方锁住。
                </p>
              ) : null}
            </section>
            <section className="inspector-section">
              <div className="section-heading-row">
                <h2>面板参数</h2>
                {selectedPanel ? (
                  <span className="section-heading-actions">
                    <button
                      className="icon-section-button is-transparency"
                      type="button"
                      title={
                        isObjectTransparent(selectedPanel.id)
                          ? "恢复当前面板不透明"
                          : "当前面板半透明"
                      }
                      aria-label={
                        isObjectTransparent(selectedPanel.id)
                          ? "恢复当前面板不透明"
                          : "当前面板半透明"
                      }
                      onClick={() => toggleObjectTransparency(selectedPanel.id)}
                    >
                      {isObjectTransparent(selectedPanel.id) ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </button>
                    <button
                      className="icon-section-button"
                      type="button"
                      title="删除当前面板"
                      aria-label="删除当前面板"
                      onClick={() => removePanelPlacement(selectedPanel.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
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
                      <option value="snap">弹性柱卡扣</option>
                      <option value="slide">侧边滑轨</option>
                    </select>
                  </label>
                  <NumberField label="面板厚度" value={selectedPanel.thickness} min={0.5} max={10} onChange={(value) => updatePanelPlacement(selectedPanel.id, { thickness: value })} />
                  <NumberField label="嵌入深度" value={selectedPanel.insetDepth} min={0} max={getPanelMaxInsetDepth(selectedPanel, parameters)} step={0.1} onChange={(value) => updatePanelPlacement(selectedPanel.id, { insetDepth: value })} />
                  <NumberField label="圆角半径" value={selectedPanel.cornerRadius} min={0} max={Math.max(0, Math.min(selectedPanel.width, selectedPanel.height) / 2 - 0.2)} step={0.5} onChange={(value) => updatePanelPlacement(selectedPanel.id, { cornerRadius: value })} />
                  <NumberField label="嵌入边框宽度" value={selectedPanel.borderWidth} min={0.8} max={Math.max(0.8, Math.min(selectedPanel.width, selectedPanel.height) / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(selectedPanel.id, { borderWidth: value })} />
                  {selectedPanel.mountingType === "screw" ? (
                    <>
                      <NumberField label="螺丝横向边距" value={selectedPanel.mountingInsetX} min={2} max={Math.max(2, selectedPanel.width / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(selectedPanel.id, { mountingInsetX: value })} />
                      <NumberField label="螺丝纵向边距" value={selectedPanel.mountingInsetY} min={2} max={Math.max(2, selectedPanel.height / 2 - 2)} step={0.5} onChange={(value) => updatePanelPlacement(selectedPanel.id, { mountingInsetY: value })} />
                      <ScrewHeadRecessControls
                        scope="面板"
                        enabled={selectedPanel.screwHeadRecessEnabled}
                        depth={selectedPanel.screwHeadRecessDepth}
                        thickness={selectedPanel.thickness}
                        onEnabledChange={(enabled) =>
                          updatePanelPlacement(selectedPanel.id, {
                            screwHeadRecessEnabled: enabled,
                          })
                        }
                        onDepthChange={(depth) =>
                          updatePanelPlacement(selectedPanel.id, {
                            screwHeadRecessDepth: depth,
                          })
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </section>
            <section className="inspector-section">
              <div className="section-heading-row">
                <h2>
                  {selectedConnector
                    ? getConnectorInspectorTitle(
                        getConnectorDefinition(selectedConnector.definitionId),
                      )
                    : "接口参数"}
                </h2>
                {selectedConnector ? (
                  <span className="section-heading-actions">
                    <button
                      className="icon-section-button is-transparency"
                      type="button"
                      title={
                        isObjectTransparent(selectedConnector.id)
                          ? "恢复当前接口不透明"
                          : "当前接口半透明"
                      }
                      aria-label={
                        isObjectTransparent(selectedConnector.id)
                          ? "恢复当前接口不透明"
                          : "当前接口半透明"
                      }
                      onClick={() => toggleObjectTransparency(selectedConnector.id)}
                    >
                      {isObjectTransparent(selectedConnector.id) ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </button>
                    <button
                      className="icon-section-button"
                      type="button"
                      title="删除当前接口"
                      aria-label="删除当前接口"
                      onClick={() => removeConnectorPlacement(selectedConnector.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                ) : null}
              </div>
              {selectedConnector ? (() => {
                const placement = selectedConnector;
                const index = selectedConnectorIndex;
                const definition = getConnectorDefinition(placement.definitionId);
                const dimensionLabels = getConnectorDimensionLabels(definition);
                const displayMountingOptions = getDisplayMountingOptions(
                  definition,
                  placement,
                );
                const displayMountingNotice = getDisplayMountingNotice(
                  definition,
                  placement,
                );
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
                      <ConnectorDefinitionOptions />
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
                      label={dimensionLabels.diameter}
                      value={placement.cutoutWidth}
                      min={1}
                      max={120}
                      onChange={(value) => {
                        updateConnectorPlacement(placement.id, {
                          cutoutWidth: value,
                          cutoutHeight: value,
                        });
                      }}
                    />
                  ) : (
                    <>
                      <NumberField label={dimensionLabels.width} value={placement.cutoutWidth} min={1} max={220} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutWidth: value })} />
                      <NumberField label={dimensionLabels.height} value={placement.cutoutHeight} min={1} max={220} onChange={(value) => updateConnectorPlacement(placement.id, { cutoutHeight: value })} />
                    </>
                  )}
                  <NumberField label="横向偏移" value={placement.offsetU} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetU: value })} />
                  <NumberField label="纵向偏移" value={placement.offsetV} min={-300} max={300} step={1} onChange={(value) => updateConnectorPlacement(placement.id, { offsetV: value })} />
                  {definition.displaySpec ? (
                    <label className="select-field">
                      <span>固定方式</span>
                      <select
                        aria-label={`接口 ${index + 1} 显示屏固定`}
                        value={placement.displayMountingType ?? "none"}
                        onChange={(event) =>
                          updateConnectorPlacement(placement.id, {
                            displayMountingType: event.currentTarget.value as DisplayMountingType,
                          })
                        }
                      >
                        {displayMountingOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                      {displayMountingNotice ? (
                        <small>{displayMountingNotice}</small>
                      ) : null}
                    </label>
                  ) : null}
                  <DisplaySpecSummary definition={definition} />
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
