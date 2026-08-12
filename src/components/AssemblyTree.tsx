import {
  Antenna as AntennaIcon,
  BatteryMedium,
  Box,
  Cable,
  ChevronDown,
  ChevronUp,
  CircuitBoard,
  Copy,
  Cuboid,
  Cylinder,
  Eye,
  EyeOff,
  FolderKanban,
  Lock,
  LockOpen,
  PanelTop,
  Plus,
  Search,
  SquareStack,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ClosureType,
  ConnectorSurface,
  EnclosureFace,
  SelectablePart,
} from "../domain/model";
import type { BatteryPreset } from "../domain/model";
import {
  BATTERY_MOUNT_FACE_LABELS,
  BATTERY_PRESETS,
  BATTERY_RETENTION_LABELS,
  getBatteryPreset,
} from "../domain/batteries";
import { PARAMETRIC_PCB_FEATURE_ID } from "../domain/pcbMounting";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import {
  ENCLOSURE_FACE_OPTIONS,
  getConnectorSurfaceLabel,
  getAntennaSurfaceLabel,
  getFaceLabel,
  getPanelLabel,
} from "../domain/placements";
import { formatRemovableFaces, getRemovableFaces } from "../domain/removableFaces";
import { useDesignerStore } from "../store/designerStore";
import { importCustomModel } from "../importers/customModel";
import {
  ANTENNA_DEFINITIONS,
  CONNECTOR_DEFINITIONS,
  getAntennaDefinition,
  getConnectorDefinition,
} from "../libraries/components";

const CLOSURE_LABELS: Record<ClosureType, string> = {
  screw: "螺丝固定",
  magnet: "磁吸固定",
  snap: "卡扣固定",
  latch: "按压快拆扣",
  "spring-latch": "弹簧旋转卡扣",
  slide: "滑盖导轨",
  hinge: "转轴翻盖",
  pin: "双侧快拆销",
};

const PANEL_MOUNTING_LABELS = {
  screw: "螺丝",
  magnet: "磁吸",
  snap: "卡扣",
  slide: "滑轨",
} as const;

const CONNECTOR_CATEGORY_LABELS = {
  usb: "USB",
  power: "电源",
  network: "网络",
  terminal: "端子",
  fpc: "FPC",
  display: "显示屏",
} as const;

interface PickerItem {
  id: string;
  name: string;
  group: string;
  detail: string;
  icon: ReactNode;
  terminalPitch?: number;
  terminalPositions?: number;
}

interface DevicePickerProps {
  title: string;
  items: PickerItem[];
  surfaceOptions: ReadonlyArray<{ value: string; label: string }>;
  defaultSurface: string;
  onSelect: (id: string, surface: string) => void;
  onClose: () => void;
}

function DevicePicker({
  title,
  items,
  surfaceOptions,
  defaultSurface,
  onSelect,
  onClose,
}: DevicePickerProps) {
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState(defaultSurface);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [fpcPitch, setFpcPitch] = useState(0.5);
  const [fpcPositions, setFpcPositions] = useState(5);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) =>
            `${item.name} ${item.group} ${item.detail}`
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : items,
    [items, normalizedQuery],
  );
  const fpcItems = items.filter(
    (item) => item.group === "FPC" && item.terminalPitch !== undefined,
  );
  const groups = [
    ...new Set(
      visibleItems
        .filter((item) => normalizedQuery || item.group !== "FPC")
        .map((item) => item.group),
    ),
  ];
  const fpcPitches = [
    ...new Set(fpcItems.map((item) => item.terminalPitch as number)),
  ];
  const fpcPositionOptions = [
    ...new Set(
      fpcItems
        .filter((item) => item.terminalPitch === fpcPitch)
        .map((item) => item.terminalPositions as number),
    ),
  ];
  const selectedFpc = fpcItems.find(
    (item) =>
      item.terminalPitch === fpcPitch &&
      item.terminalPositions === fpcPositions,
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="device-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="device-picker"
        role="dialog"
        aria-modal="true"
        aria-label={`${title}选择器`}
      >
      <div className="device-picker-header">
        <strong>{title}</strong>
        <button type="button" onClick={onClose} title="关闭选择器" aria-label="关闭选择器">
          <X size={15} />
        </button>
      </div>
      <label className="device-picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索型号或规格"
          aria-label={`搜索${title}`}
        />
      </label>
      <label className="device-picker-surface">
        <span>安装位置</span>
        <select
          aria-label="安装位置"
          value={surface}
          onChange={(event) => setSurface(event.currentTarget.value)}
        >
          {surfaceOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="device-picker-results">
        {!normalizedQuery && fpcItems.length > 0 ? (
          <section className="device-picker-group device-picker-fpc-group">
            <h3><span>FPC</span><small>2 种间距 · 5P–40P</small></h3>
            <div className="device-picker-fpc-config">
              <label>
                <span>间距</span>
                <select
                  aria-label="FPC 间距"
                  value={fpcPitch}
                  onChange={(event) => {
                    const pitch = Number(event.currentTarget.value);
                    setFpcPitch(pitch);
                    const firstPosition = fpcItems.find(
                      (item) => item.terminalPitch === pitch,
                    )?.terminalPositions;
                    if (firstPosition !== undefined) setFpcPositions(firstPosition);
                  }}
                >
                  {fpcPitches.map((pitch) => (
                    <option key={pitch} value={pitch}>{pitch.toFixed(1)} mm</option>
                  ))}
                </select>
              </label>
              <label>
                <span>针数</span>
                <select
                  aria-label="FPC 针数"
                  value={fpcPositions}
                  onChange={(event) => setFpcPositions(Number(event.currentTarget.value))}
                >
                  {fpcPositionOptions.map((positions) => (
                    <option key={positions} value={positions}>{positions}P</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!selectedFpc}
                onClick={() => {
                  if (selectedFpc) onSelect(selectedFpc.id, surface);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                <span>添加</span>
              </button>
            </div>
          </section>
        ) : null}
        {groups.map((group) => {
          const groupItems = visibleItems.filter((item) => item.group === group);
          const canCollapse = !normalizedQuery && groupItems.length > 8;
          const expanded = expandedGroups.has(group);
          const displayedItems = canCollapse && !expanded
            ? groupItems.slice(0, 8)
            : groupItems;
          return (
          <section key={group} className="device-picker-group">
            <h3>{group}<small>{groupItems.length} 项</small></h3>
            {displayedItems.map((item) => (
                <button
                  key={item.id}
                  className="device-picker-item"
                  type="button"
                  onClick={() => onSelect(item.id, surface)}
                >
                  <span className="device-picker-icon" aria-hidden="true">{item.icon}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))}
            {canCollapse ? (
              <button
                type="button"
                className="device-picker-more"
                aria-expanded={expanded}
                onClick={() =>
                  setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group);
                    else next.add(group);
                    return next;
                  })
                }
              >
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                <span>
                  {expanded
                    ? `收起${group}`
                    : `展开其余 ${groupItems.length - displayedItems.length} 项`}
                </span>
              </button>
            ) : null}
          </section>
          );
        })}
        {visibleItems.length === 0 ? (
          <p className="device-picker-empty">没有匹配的器件</p>
        ) : null}
      </div>
      </div>
    </div>
  );
}

function parsePlacementSurface(value: string): {
  surface: ConnectorSurface;
  panelId: string | null;
} {
  return value.startsWith("panel:")
    ? { surface: "panel", panelId: value.slice(6) }
    : { surface: value as ConnectorSurface, panelId: null };
}

interface TreeItemProps {
  id: SelectablePart;
  icon: ReactNode;
  label: string;
  detail?: string;
  depth?: number;
  featureId?: string;
  onOpenContextMenu?: (x: number, y: number) => void;
}

function TreeItem({
  id,
  icon,
  label,
  detail,
  depth = 0,
  featureId,
  onOpenContextMenu,
}: TreeItemProps) {
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const focusedPart = useDesignerStore((state) => state.focusedPart);
  const featureHidden = useDesignerStore(
    (state) => Boolean(featureId && state.hiddenFeatureIds.includes(featureId)),
  );
  const featureLocked = useDesignerStore(
    (state) => Boolean(featureId && state.lockedFeatureIds.includes(featureId)),
  );
  const pcbBodyHidden = useDesignerStore((state) =>
    Boolean(id === "pcb" && featureId && state.hiddenPcbBodyIds.includes(featureId)),
  );
  const transparencyId =
    featureId ?? (id === "base" || id === "lid" ? id : null);
  const objectTransparent = useDesignerStore((state) =>
    Boolean(transparencyId && state.transparentObjectIds.includes(transparencyId)),
  );
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const setSelectedFeature = useDesignerStore((state) => state.setSelectedFeature);
  const selected =
    selectedPart === id && (!featureId || selectedFeatureId === featureId);

  useEffect(() => {
    if (selected) buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <button
      ref={buttonRef}
      className={`tree-item ${selected ? "is-selected" : ""} ${focusedPart && focusedPart !== id ? "is-context-hidden" : ""} ${featureHidden ? "is-feature-hidden" : ""} ${featureLocked ? "is-feature-locked" : ""} ${objectTransparent ? "is-object-transparent" : ""} ${pcbBodyHidden ? "is-pcb-body-hidden" : ""}`}
      style={{ paddingLeft: 12 + depth * 15 }}
      type="button"
      onClick={() =>
        featureId &&
        (id === "pcb" ||
          id === "panel" ||
          id === "connector" ||
          id === "antenna" ||
          id === "custom" ||
          id === "battery")
          ? setSelectedFeature(id, featureId)
          : setSelectedPart(id)
      }
      onContextMenu={(event) => {
        if (!featureId || !onOpenContextMenu) return;
        event.preventDefault();
        setSelectedFeature(
          id as
            | "pcb"
            | "panel"
            | "connector"
            | "antenna"
            | "custom"
            | "battery",
          featureId,
        );
        onOpenContextMenu(event.clientX, event.clientY);
      }}
      aria-pressed={selected}
    >
      <span className="tree-icon" aria-hidden="true">{icon}</span>
      <span className="tree-label">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
      {(objectTransparent || pcbBodyHidden || (featureId && (featureHidden || featureLocked))) ? (
        <span className="tree-item-state" aria-hidden="true">
          {objectTransparent ? <Eye size={12} /> : null}
          {pcbBodyHidden ? <CircuitBoard size={12} /> : null}
          {featureHidden ? <EyeOff size={12} /> : null}
          {featureLocked ? <Lock size={12} /> : null}
        </span>
      ) : null}
    </button>
  );
}

interface AssemblyTreeProps {
  onRequestClose?: () => void;
  onImportPcb?: () => void;
}

export function AssemblyTree({ onRequestClose, onImportPcb }: AssemblyTreeProps) {
  const [treeQuery, setTreeQuery] = useState("");
  const [openPicker, setOpenPicker] = useState<"connector" | "antenna" | null>(
    null,
  );
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [batteryPickerOpen, setBatteryPickerOpen] = useState(false);
  const customModelInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    part: "pcb" | "panel" | "connector" | "antenna" | "custom" | "battery";
    featureId: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const ignoreNextTreeScrollRef = useRef(false);
  const parameters = useDesignerStore((state) => state.parameters);
  const setParameter = useDesignerStore((state) => state.setParameter);
  const addPanelPlacement = useDesignerStore((state) => state.addPanelPlacement);
  const addConnectorPlacement = useDesignerStore((state) => state.addConnectorPlacement);
  const addAntennaPlacement = useDesignerStore((state) => state.addAntennaPlacement);
  const removePanelPlacement = useDesignerStore((state) => state.removePanelPlacement);
  const removeConnectorPlacement = useDesignerStore(
    (state) => state.removeConnectorPlacement,
  );
  const removeAntennaPlacement = useDesignerStore(
    (state) => state.removeAntennaPlacement,
  );
  const addCustomComponent = useDesignerStore((state) => state.addCustomComponent);
  const removeCustomComponent = useDesignerStore(
    (state) => state.removeCustomComponent,
  );
  const clearPcbReference = useDesignerStore((state) => state.clearPcbReference);
  const addParametricPcb = useDesignerStore((state) => state.addParametricPcb);
  const addBatteryCompartment = useDesignerStore(
    (state) => state.addBatteryCompartment,
  );
  const removeBatteryCompartment = useDesignerStore(
    (state) => state.removeBatteryCompartment,
  );
  const transparentObjectIds = useDesignerStore(
    (state) => state.transparentObjectIds,
  );
  const toggleObjectTransparency = useDesignerStore(
    (state) => state.toggleObjectTransparency,
  );
  const showAllOpaque = useDesignerStore((state) => state.showAllOpaque);
  const hiddenFaces = useDesignerStore((state) => state.hiddenFaces);
  const toggleFaceVisibility = useDesignerStore(
    (state) => state.toggleFaceVisibility,
  );
  const showAllFaces = useDesignerStore((state) => state.showAllFaces);
  const hiddenFeatureIds = useDesignerStore((state) => state.hiddenFeatureIds);
  const hiddenPcbBodyIds = useDesignerStore((state) => state.hiddenPcbBodyIds);
  const lockedFeatureIds = useDesignerStore((state) => state.lockedFeatureIds);
  const toggleFeatureVisibility = useDesignerStore(
    (state) => state.toggleFeatureVisibility,
  );
  const showAllFeatures = useDesignerStore((state) => state.showAllFeatures);
  const togglePcbBodyVisibility = useDesignerStore(
    (state) => state.togglePcbBodyVisibility,
  );
  const toggleFeatureLock = useDesignerStore((state) => state.toggleFeatureLock);
  const duplicateFeature = useDesignerStore((state) => state.duplicateFeature);
  const removableFaces = getRemovableFaces(parameters);
  const updateRemovableFace = (face: EnclosureFace, enabled: boolean) => {
    if (!enabled && face === parameters.lidFace) return;
    const nextFaces = enabled
      ? Array.from(new Set([...removableFaces, face]))
      : removableFaces.filter((item) => item !== face);
    setParameter(
      "removableFaces",
      nextFaces.length > 0 ? nextFaces : [parameters.lidFace],
    );
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => {
      ignoreNextTreeScrollRef.current = false;
      setContextMenu(null);
    };
    const closeOnScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".tree-nav") &&
        ignoreNextTreeScrollRef.current
      ) {
        ignoreNextTreeScrollRef.current = false;
        return;
      }
      close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const openFeatureContextMenu = (
    part: "pcb" | "panel" | "connector" | "antenna" | "custom" | "battery",
    featureId: string,
    label: string,
    x: number,
    y: number,
  ) => {
    ignoreNextTreeScrollRef.current = true;
    setContextMenu({
      part,
      featureId,
      label,
      x: Math.min(x, window.innerWidth - 154),
      y: Math.min(y, window.innerHeight - 238),
    });
  };

  const duplicateContextFeature = () => {
    if (!contextMenu) return;
    duplicateFeature(contextMenu.part, contextMenu.featureId);
    setContextMenu(null);
  };

  const toggleContextFeatureVisibility = () => {
    if (!contextMenu) return;
    toggleFeatureVisibility(contextMenu.featureId);
    setContextMenu(null);
  };

  const toggleContextPcbBodyVisibility = () => {
    if (!contextMenu || contextMenu.part !== "pcb") return;
    togglePcbBodyVisibility(contextMenu.featureId);
    setContextMenu(null);
  };

  const toggleContextFeatureLock = () => {
    if (!contextMenu) return;
    toggleFeatureLock(contextMenu.featureId);
    setContextMenu(null);
  };

  const toggleContextFeatureTransparency = () => {
    if (!contextMenu) return;
    toggleObjectTransparency(contextMenu.featureId);
    setContextMenu(null);
  };

  const deleteContextFeature = () => {
    if (!contextMenu) return;
    if (contextMenu.part === "pcb") clearPcbReference(contextMenu.featureId);
    else if (contextMenu.part === "panel") removePanelPlacement(contextMenu.featureId);
    else if (contextMenu.part === "connector") {
      removeConnectorPlacement(contextMenu.featureId);
    } else if (contextMenu.part === "antenna") {
      removeAntennaPlacement(contextMenu.featureId);
    } else if (contextMenu.part === "custom") {
      removeCustomComponent(contextMenu.featureId);
    } else removeBatteryCompartment(contextMenu.featureId);
    setContextMenu(null);
  };
  const objectCount =
    3 +
    parameters.pcbReferences.length +
    (parameters.parametricPcbEnabled && parameters.pcbReferences.length === 0 ? 1 : 0) +
    parameters.panelPlacements.length +
    parameters.connectorPlacements.length +
    parameters.antennaPlacements.length +
    parameters.customComponents.length +
    parameters.batteryCompartments.length;
  const normalizedTreeQuery = treeQuery.trim().toLocaleLowerCase();
  const matchesTreeQuery = (...values: Array<string | number>) =>
    !normalizedTreeQuery ||
    values
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedTreeQuery);
  const filteredPcbItems =
    parameters.pcbReferences.length === 0
      ? parameters.parametricPcbEnabled &&
        matchesTreeQuery("PCB", "参数 PCB")
        ? [
            {
              id: PARAMETRIC_PCB_FEATURE_ID,
              label: "参数 PCB",
              detail: `${parameters.pcbLength} x ${parameters.pcbWidth} mm · X ${parameters.pcbOffsetX.toFixed(1)} / Y ${parameters.pcbElevation.toFixed(1)} / Z ${parameters.pcbOffsetZ.toFixed(1)} mm`,
            },
          ]
        : []
      : parameters.pcbReferences
          .map((placement, index) => ({
            id: placement.id,
            label: `PCB ${index + 1}`,
            detail: `${placement.reference.sourceName} · X ${placement.offsetX.toFixed(1)} / Y ${placement.elevation.toFixed(1)} / Z ${placement.offsetZ.toFixed(1)} mm`,
            sourceName: placement.reference.sourceName,
            format: placement.reference.format,
          }))
          .filter((item) =>
            matchesTreeQuery("PCB", item.sourceName, item.format),
          );
  const visibleFeatureCount =
    filteredPcbItems.length +
    parameters.panelPlacements.filter((panel) =>
      matchesTreeQuery(
        getPanelLabel(panel, parameters),
        getFaceLabel(panel.face),
        PANEL_MOUNTING_LABELS[panel.mountingType],
      ),
    ).length +
    parameters.customComponents.filter((component) =>
      matchesTreeQuery(component.name, component.shape),
    ).length +
    parameters.batteryCompartments.filter((compartment) =>
      matchesTreeQuery("电池仓", getBatteryPreset(compartment.preset).name),
    ).length +
    parameters.connectorPlacements.filter((placement) =>
      matchesTreeQuery(
        getConnectorDefinition(placement.definitionId).name,
        getConnectorSurfaceLabel(placement, parameters),
      ),
    ).length +
    parameters.antennaPlacements.filter((placement) =>
      matchesTreeQuery(
        getAntennaDefinition(placement.definitionId).name,
        getAntennaSurfaceLabel(placement, parameters),
      ),
    ).length;

  const importCustomComponent = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error("自定义模型不能超过 50 MiB");
      }
      const preview = await importCustomModel(await file.arrayBuffer(), file.name);
      addCustomComponent("model", file.name, preview);
      setCustomPickerOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法导入自定义模型");
    } finally {
      if (customModelInputRef.current) customModelInputRef.current.value = "";
    }
  };
  const connectorPickerItems = useMemo<PickerItem[]>(
    () =>
      CONNECTOR_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        group: CONNECTOR_CATEGORY_LABELS[definition.category],
        detail: definition.terminalSpec
          ? `${definition.terminalSpec.pitch.toFixed(2)} mm · ${definition.terminalSpec.positions}P · 开孔 ${definition.panelCutout.width.toFixed(1)} × ${definition.panelCutout.height.toFixed(1)} mm`
          : definition.displaySpec
            ? `${definition.displaySpec.resolution} · ${definition.displaySpec.touch === "resistive" ? "电阻触摸" : "无触摸"} · PCB ${definition.displaySpec.pcbWidth.toFixed(1)} × ${definition.displaySpec.pcbHeight.toFixed(1)} mm · 开窗 ${definition.panelCutout.width.toFixed(1)} × ${definition.panelCutout.height.toFixed(1)} mm`
          : `开孔 ${definition.panelCutout.width.toFixed(1)} × ${definition.panelCutout.height.toFixed(1)} mm`,
        icon:
          definition.category === "display" ? (
            <PanelTop size={15} />
          ) : (
            <Cable size={15} />
          ),
        terminalPitch: definition.terminalSpec?.pitch,
        terminalPositions: definition.terminalSpec?.positions,
      })),
    [],
  );
  const antennaPickerItems = useMemo<PickerItem[]>(
    () =>
      ANTENNA_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        group: definition.enclosureCutout ? "穿板天线" : "内置天线",
        detail: `${definition.metadata.frequencyBand} · ${definition.enclosureCutout ? `${definition.enclosureCutout.diameter} mm 开孔` : "无外壳开孔"}`,
        icon: <AntennaIcon size={15} />,
      })),
    [],
  );
  const surfacePickerOptions = useMemo(
    () => [
      ...ENCLOSURE_FACE_OPTIONS.map((option) => ({
        value: option.id,
        label: option.name,
      })),
      ...parameters.panelPlacements.map((panel, index) => ({
        value: `panel:${panel.id}`,
        label: `面板 ${index + 1}（${getFaceLabel(panel.face)}）`,
      })),
    ],
    [parameters.panelPlacements],
  );
  const filteredPanels = parameters.panelPlacements.filter((panel) =>
    matchesTreeQuery(
      getPanelLabel(panel, parameters),
      getFaceLabel(panel.face),
      PANEL_MOUNTING_LABELS[panel.mountingType],
    ),
  );
  const filteredBatteryCompartments = parameters.batteryCompartments.filter(
    (compartment) =>
      matchesTreeQuery("电池仓", getBatteryPreset(compartment.preset).name),
  );
  const filteredConnectorPlacements = parameters.connectorPlacements.filter(
    (placement) =>
      matchesTreeQuery(
        getConnectorDefinition(placement.definitionId).name,
        getConnectorSurfaceLabel(placement, parameters),
      ),
  );
  const hiddenPanelIds = parameters.panelPlacements
    .filter((panel) => hiddenFeatureIds.includes(panel.id))
    .map((panel) => panel.id);
  const hiddenBatteryCompartmentIds = parameters.batteryCompartments
    .filter((compartment) => hiddenFeatureIds.includes(compartment.id))
    .map((compartment) => compartment.id);
  const hiddenConnectorIds = parameters.connectorPlacements
    .filter((placement) => hiddenFeatureIds.includes(placement.id))
    .map((placement) => placement.id);
  const showAllPanels = () => {
    hiddenPanelIds.forEach((id) => toggleFeatureVisibility(id));
  };
  const showAllBatteryCompartments = () => {
    hiddenBatteryCompartmentIds.forEach((id) => toggleFeatureVisibility(id));
  };
  const showAllConnectors = () => {
    hiddenConnectorIds.forEach((id) => toggleFeatureVisibility(id));
  };
  const contextFeatureHidden = Boolean(
    contextMenu && hiddenFeatureIds.includes(contextMenu.featureId),
  );
  const contextPcbBodyHidden = Boolean(
    contextMenu?.part === "pcb" &&
      hiddenPcbBodyIds.includes(contextMenu.featureId),
  );

  return (
    <aside className="assembly-panel" aria-label="装配体和特征树">
      <div className="panel-heading">
        <span>装配体</span>
        <div className="panel-heading-actions">
          <small>
            {normalizedTreeQuery ? `${visibleFeatureCount} 个匹配` : `${objectCount} 个对象`}
          </small>
          {hiddenFeatureIds.length > 0 || hiddenPcbBodyIds.length > 0 ? (
            <button
              className="panel-heading-icon"
              type="button"
              onClick={showAllFeatures}
              title="显示全部对象"
              aria-label="显示全部对象"
            >
              <Eye size={14} />
            </button>
          ) : null}
          {transparentObjectIds.length > 0 ? (
            <button
              className="panel-heading-icon"
              type="button"
              onClick={showAllOpaque}
              title="全部恢复不透明"
              aria-label="全部恢复不透明"
            >
              <EyeOff size={14} />
            </button>
          ) : null}
          <button
            className="mobile-panel-close"
            type="button"
            title="关闭对象树"
            aria-label="关闭对象树"
            onClick={onRequestClose}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <label className="tree-search">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          value={treeQuery}
          onChange={(event) => setTreeQuery(event.currentTarget.value)}
          placeholder="筛选对象"
          aria-label="筛选对象"
        />
        {treeQuery ? (
          <button
            type="button"
            onClick={() => setTreeQuery("")}
            title="清除对象筛选"
            aria-label="清除对象筛选"
          >
            <X size={13} />
          </button>
        ) : null}
      </label>
      <nav className={`tree-nav ${normalizedTreeQuery ? "is-filtering" : ""}`}>
        <TreeItem id="project" icon={<FolderKanban size={16} />} label="PCB 控制器外壳" detail="项目" />
        <div className="tree-section-heading">
          <span>PCB</span>
          <span className="tree-section-actions">
            {parameters.pcbReferences.length === 0 && !parameters.parametricPcbEnabled ? (
              <button
                type="button"
                title="添加参数 PCB"
                aria-label="添加参数 PCB"
                onClick={addParametricPcb}
              >
                <CircuitBoard size={14} />
              </button>
            ) : null}
            <button
              type="button"
              title="导入 KiCad PCB，支持多选追加多块"
              aria-label="导入 PCB"
              onClick={onImportPcb}
            >
              <Upload size={14} />
            </button>
          </span>
        </div>
        {parameters.pcbReferences.length === 0 && !parameters.parametricPcbEnabled ? (
          <div className="tree-empty-state">
            <CircuitBoard size={15} />
            <span>当前没有 PCB</span>
            <button type="button" onClick={onImportPcb}>导入 PCB</button>
            <button type="button" onClick={addParametricPcb}>添加参数 PCB</button>
          </div>
        ) : (
          <>
            {filteredPcbItems.map((item) => (
              <TreeItem
                key={item.id}
                id="pcb"
                featureId={item.id}
                icon={<CircuitBoard size={16} />}
                label={item.label}
                detail={item.detail}
                depth={1}
                onOpenContextMenu={(x, y) =>
                  openFeatureContextMenu("pcb", item.id, item.label, x, y)
                }
              />
            ))}
            {filteredPcbItems.length > 0 ? (
              <div className="tree-feature-visibility" role="group" aria-label="PCB显示">
                {filteredPcbItems.flatMap((item) => {
                  const fullVisible = !hiddenFeatureIds.includes(item.id);
                  const bodyVisible =
                    fullVisible && !hiddenPcbBodyIds.includes(item.id);
                  return [
                    <label
                      key={`${item.id}-full`}
                      className={fullVisible ? "" : "is-hidden"}
                      title="隐藏/显示 PCB、滑槽、螺丝柱等全部结构"
                    >
                      {fullVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span>{item.label} 全部</span>
                      <input
                        type="checkbox"
                        checked={fullVisible}
                        onChange={() => toggleFeatureVisibility(item.id)}
                        aria-label={`${item.label}全部显示`}
                      />
                    </label>,
                    <label
                      key={`${item.id}-body`}
                      className={bodyVisible ? "" : "is-hidden"}
                      title="仅隐藏/显示 PCB 板体，保留滑槽、螺丝柱等固定结构"
                    >
                      <CircuitBoard size={13} />
                      <span>{item.label} 主体</span>
                      <input
                        type="checkbox"
                        checked={bodyVisible}
                        disabled={!fullVisible}
                        onChange={() => togglePcbBodyVisibility(item.id)}
                        aria-label={`${item.label}主体显示`}
                      />
                    </label>,
                  ];
                })}
              </div>
            ) : null}
          </>
        )}
        <TreeItem
          id="base"
          icon={<Box size={16} />}
          label="壳体主体"
          detail={
            parameters.closureType === "magnet"
              ? getMagnetSupportOption(parameters.magnetSupportType).name
              : "参数零件"
          }
          depth={1}
        />
        <TreeItem
          id="lid"
          icon={<SquareStack size={16} />}
          label={`可拆面（${formatRemovableFaces(parameters)}）`}
          detail={`${removableFaces.length} 面 / ${CLOSURE_LABELS[parameters.closureType]}`}
          depth={1}
        />
        <fieldset className="tree-removable-faces">
          <legend>
            <span><SquareStack size={14} />可拆面设置</span>
          </legend>
          <label className="tree-removable-primary">
            <span>主可拆面</span>
            <select
              aria-label="主可拆面位置"
              value={parameters.lidFace}
              onChange={(event) =>
                setParameter("lidFace", event.currentTarget.value as EnclosureFace)
              }
            >
              {ENCLOSURE_FACE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <div className="tree-removable-grid" role="group" aria-label="可拆面选择">
            {ENCLOSURE_FACE_OPTIONS.map((option) => {
              const checked = removableFaces.includes(option.id);
              const primary = option.id === parameters.lidFace;
              return (
                <label
                  key={option.id}
                  className={`${checked ? "is-active" : ""} ${primary ? "is-primary" : ""}`.trim()}
                >
                  <span>{option.name}{primary ? "（主）" : ""}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={primary}
                    onChange={(event) =>
                      updateRemovableFace(option.id, event.currentTarget.checked)
                    }
                    aria-label={`${option.name}可拆卸`}
                  />
                </label>
              );
            })}
          </div>
          <p>
            主可拆面决定默认可拆面 STL；其余选中面参与预览、显示隐藏、BOM 与主体避让。
          </p>
        </fieldset>
        <div className="tree-transparency-controls" role="group" aria-label="对象半透明">
          <label className="tree-view-toggle">
            <span><Eye size={14} />壳体主体半透明</span>
            <input
              type="checkbox"
              checked={transparentObjectIds.includes("base")}
              onChange={() => toggleObjectTransparency("base")}
            />
          </label>
          <label className="tree-view-toggle">
            <span><Eye size={14} />可拆面半透明</span>
            <input
              type="checkbox"
              checked={transparentObjectIds.includes("lid")}
              onChange={() => toggleObjectTransparency("lid")}
            />
          </label>
        </div>
        <fieldset className="tree-face-visibility">
          <legend>
            <span><Eye size={14} />壳体面显示</span>
            <button
              type="button"
              disabled={hiddenFaces.length === 0}
              onClick={showAllFaces}
              title="显示全部壳体面"
              aria-label="显示全部壳体面"
            >
              <Eye size={14} />
            </button>
          </legend>
          <div>
            {ENCLOSURE_FACE_OPTIONS.map((option) => {
              const visible = !hiddenFaces.includes(option.id);
              return (
                <label key={option.id} className={visible ? "" : "is-hidden"}>
                  {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{option.name}</span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleFaceVisibility(option.id)}
                    aria-label={`${option.name}显示`}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="tree-section-heading">
          <span>面板</span>
          <span className="tree-section-actions">
            {hiddenPanelIds.length > 0 ? (
              <button
                type="button"
                onClick={showAllPanels}
                title="显示全部面板"
                aria-label="显示全部面板"
              >
                <Eye size={15} />
              </button>
            ) : null}
            <button type="button" onClick={addPanelPlacement} title="添加面板" aria-label="添加面板">
              <Plus size={15} />
            </button>
          </span>
        </div>
        {filteredPanels.length > 0 ? (
          <div className="tree-feature-visibility" role="group" aria-label="面板显示">
            {filteredPanels.map((panel) => {
              const visible = !hiddenFeatureIds.includes(panel.id);
              return (
                <label key={panel.id} className={visible ? "" : "is-hidden"}>
                  {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{getPanelLabel(panel, parameters)}</span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleFeatureVisibility(panel.id)}
                    aria-label={`${getPanelLabel(panel, parameters)}显示`}
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        {filteredPanels.map((panel) => (
          <TreeItem
            key={panel.id}
            id="panel"
            featureId={panel.id}
            icon={<PanelTop size={16} />}
            label={getPanelLabel(panel, parameters)}
            detail={`${getFaceLabel(panel.face)} · ${panel.width.toFixed(1)} × ${panel.height.toFixed(1)} mm · ${PANEL_MOUNTING_LABELS[panel.mountingType]}`}
            depth={1}
            onOpenContextMenu={(x, y) =>
              openFeatureContextMenu(
                "panel",
                panel.id,
                getPanelLabel(panel, parameters),
                x,
                y,
              )
            }
          />
        ))}
        <div className="tree-section-heading">
          <span>自定义组件</span>
          <button
            type="button"
            onClick={() => setCustomPickerOpen((current) => !current)}
            title="添加自定义组件"
            aria-label="添加自定义组件"
            aria-expanded={customPickerOpen}
          >
            <Plus size={15} />
          </button>
        </div>
        {customPickerOpen ? (
          <div className="custom-component-picker" role="dialog" aria-label="添加自定义组件选择器">
            <button
              type="button"
              onClick={() => {
                addCustomComponent("box");
                setCustomPickerOpen(false);
              }}
            >
              <Cuboid size={16} />
              <span>长方体</span>
            </button>
            <button
              type="button"
              onClick={() => {
                addCustomComponent("cylinder");
                setCustomPickerOpen(false);
              }}
            >
              <Cylinder size={16} />
              <span>圆柱体</span>
            </button>
            <button type="button" onClick={() => customModelInputRef.current?.click()}>
              <Upload size={16} />
              <span>导入 STEP/STL/OBJ</span>
            </button>
            <input
              ref={customModelInputRef}
              className="visually-hidden"
              type="file"
              accept=".step,.stp,.stl,.obj"
              onChange={(event) =>
                void importCustomComponent(event.currentTarget.files?.[0])
              }
            />
          </div>
        ) : null}
        {parameters.customComponents.filter((component) =>
          matchesTreeQuery(component.name, component.shape),
        ).map((component) => (
          <TreeItem
            key={component.id}
            id="custom"
            featureId={component.id}
            icon={component.shape === "cylinder" ? <Cylinder size={16} /> : <Cuboid size={16} />}
            label={component.name}
            detail={`${component.width.toFixed(1)} × ${component.height.toFixed(1)} × ${component.depth.toFixed(1)} mm`}
            depth={1}
            onOpenContextMenu={(x, y) =>
              openFeatureContextMenu(
                "custom",
                component.id,
                component.name,
                x,
                y,
              )
            }
          />
        ))}
        <div className="tree-section-heading">
          <span>电池仓</span>
          <span className="tree-section-actions">
            {hiddenBatteryCompartmentIds.length > 0 ? (
              <button
                type="button"
                onClick={showAllBatteryCompartments}
                title="显示全部电池仓"
                aria-label="显示全部电池仓"
              >
                <Eye size={15} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setBatteryPickerOpen((current) => !current)}
              title="添加电池仓"
              aria-label="添加电池仓"
              aria-expanded={batteryPickerOpen}
            >
              <Plus size={15} />
            </button>
          </span>
        </div>
        {batteryPickerOpen ? (
          <div className="custom-component-picker" role="dialog" aria-label="添加电池仓选择器">
            {BATTERY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  addBatteryCompartment(preset.id as BatteryPreset);
                  setBatteryPickerOpen(false);
                }}
              >
                <BatteryMedium size={16} />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {filteredBatteryCompartments.length > 0 ? (
          <div className="tree-feature-visibility" role="group" aria-label="电池仓显示">
            {filteredBatteryCompartments.map((compartment) => {
              const index = parameters.batteryCompartments.findIndex(
                (item) => item.id === compartment.id,
              );
              const visible = !hiddenFeatureIds.includes(compartment.id);
              return (
                <label key={compartment.id} className={visible ? "" : "is-hidden"}>
                  {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{`电池仓 ${index + 1}`}</span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleFeatureVisibility(compartment.id)}
                    aria-label={`电池仓 ${index + 1}显示`}
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        {filteredBatteryCompartments.map((compartment) => {
          const index = parameters.batteryCompartments.findIndex(
            (item) => item.id === compartment.id,
          );
          return (
          <TreeItem
            key={compartment.id}
            id="battery"
            featureId={compartment.id}
            icon={<BatteryMedium size={16} />}
            label={`电池仓 ${index + 1}`}
            detail={`${BATTERY_MOUNT_FACE_LABELS[compartment.face]} · ${getBatteryPreset(compartment.preset).name} · ${compartment.cellCount} 槽 · ${BATTERY_RETENTION_LABELS[compartment.retentionType]}`}
            depth={1}
            onOpenContextMenu={(x, y) =>
              openFeatureContextMenu(
                "battery",
                compartment.id,
                `电池仓 ${index + 1}`,
                x,
                y,
              )
            }
          />
          );
        })}
        <div className="tree-section-heading">
          <span>接口/器件</span>
          <span className="tree-section-actions">
            {hiddenConnectorIds.length > 0 ? (
              <button
                type="button"
                onClick={showAllConnectors}
                title="显示全部接口/器件"
                aria-label="显示全部接口/器件"
              >
                <Eye size={15} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                setOpenPicker((current) =>
                  current === "connector" ? null : "connector",
                )
              }
              title="选择并添加接口或器件"
              aria-label="添加接口或器件"
              aria-expanded={openPicker === "connector"}
            >
              <Plus size={15} />
            </button>
          </span>
        </div>
        {openPicker === "connector" ? (
          <DevicePicker
            title="添加接口/器件"
            items={connectorPickerItems}
            surfaceOptions={surfacePickerOptions}
            defaultSurface="front"
            onClose={() => setOpenPicker(null)}
            onSelect={(id, surfaceValue) => {
              const target = parsePlacementSurface(surfaceValue);
              addConnectorPlacement(id, target.surface, target.panelId);
              setOpenPicker(null);
            }}
          />
        ) : null}
        {filteredConnectorPlacements.length > 0 ? (
          <div className="tree-feature-visibility" role="group" aria-label="接口/器件显示">
            {filteredConnectorPlacements.map((placement) => {
              const index = parameters.connectorPlacements.findIndex(
                (item) => item.id === placement.id,
              );
              const visible = !hiddenFeatureIds.includes(placement.id);
              return (
                <label key={placement.id} className={visible ? "" : "is-hidden"}>
                  {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{getConnectorDefinition(placement.definitionId).name}</span>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleFeatureVisibility(placement.id)}
                    aria-label={`接口/器件 ${index + 1}显示`}
                  />
                </label>
              );
            })}
          </div>
        ) : null}
        {filteredConnectorPlacements.map((placement) => (
          <TreeItem
            key={placement.id}
            id="connector"
            featureId={placement.id}
            icon={<Cable size={16} />}
            label={getConnectorDefinition(placement.definitionId).name}
            detail={getConnectorSurfaceLabel(placement, parameters)}
            depth={2}
            onOpenContextMenu={(x, y) =>
              openFeatureContextMenu(
                "connector",
                placement.id,
                getConnectorDefinition(placement.definitionId).name,
                x,
                y,
              )
            }
          />
        ))}
        <div className="tree-section-heading">
          <span>天线</span>
          <button
            type="button"
            onClick={() =>
              setOpenPicker((current) =>
                current === "antenna" ? null : "antenna",
              )
            }
            title="选择并添加天线"
            aria-label="添加天线"
            aria-expanded={openPicker === "antenna"}
          >
            <Plus size={15} />
          </button>
        </div>
        {openPicker === "antenna" ? (
          <DevicePicker
            title="添加天线"
            items={antennaPickerItems}
            surfaceOptions={surfacePickerOptions}
            defaultSurface="back"
            onClose={() => setOpenPicker(null)}
            onSelect={(id, surfaceValue) => {
              const target = parsePlacementSurface(surfaceValue);
              addAntennaPlacement(id, target.surface, target.panelId);
              setOpenPicker(null);
            }}
          />
        ) : null}
        {parameters.antennaPlacements.filter((placement) =>
          matchesTreeQuery(
            getAntennaDefinition(placement.definitionId).name,
            getAntennaSurfaceLabel(placement, parameters),
          ),
        ).map((placement) => (
          <TreeItem
            key={placement.id}
            id="antenna"
            featureId={placement.id}
            icon={<AntennaIcon size={16} />}
            label={getAntennaDefinition(placement.definitionId).name}
            detail={`${getAntennaSurfaceLabel(placement, parameters)} · ${getAntennaDefinition(placement.definitionId).metadata.frequencyBand}`}
            depth={2}
            onOpenContextMenu={(x, y) =>
              openFeatureContextMenu(
                "antenna",
                placement.id,
                getAntennaDefinition(placement.definitionId).name,
                x,
                y,
              )
            }
          />
        ))}
      </nav>
      {contextMenu ? (
        <div
          className="tree-context-menu"
          role="menu"
          aria-label={`${contextMenu.label} 操作菜单`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" role="menuitem" onClick={toggleContextFeatureVisibility}>
            {contextFeatureHidden ? (
              <Eye size={15} />
            ) : (
              <EyeOff size={15} />
            )}
            <span>
              {contextMenu.part === "pcb"
                ? contextFeatureHidden
                  ? "显示PCB全部"
                  : "全隐藏PCB"
                : contextFeatureHidden
                  ? "显示"
                  : "隐藏"}
            </span>
          </button>
          {contextMenu.part === "pcb" ? (
            <button type="button" role="menuitem" onClick={toggleContextPcbBodyVisibility}>
              <CircuitBoard size={15} />
              <span>
                {contextPcbBodyHidden ? "显示PCB主体" : "隐藏PCB主体"}
              </span>
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={toggleContextFeatureTransparency}>
            {transparentObjectIds.includes(contextMenu.featureId) ? (
              <EyeOff size={15} />
            ) : (
              <Eye size={15} />
            )}
            <span>
              {transparentObjectIds.includes(contextMenu.featureId)
                ? "恢复不透明"
                : "半透明"}
            </span>
          </button>
          <button type="button" role="menuitem" onClick={toggleContextFeatureLock}>
            {lockedFeatureIds.includes(contextMenu.featureId) ? (
              <LockOpen size={15} />
            ) : (
              <Lock size={15} />
            )}
            <span>
              {lockedFeatureIds.includes(contextMenu.featureId) ? "解锁" : "锁定"}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={
              contextMenu.part === "pcb" &&
              contextMenu.featureId === PARAMETRIC_PCB_FEATURE_ID
            }
            onClick={duplicateContextFeature}
          >
            <Copy size={15} />
            <span>复制</span>
          </button>
          <button
            className="is-danger"
            type="button"
            role="menuitem"
            disabled={lockedFeatureIds.includes(contextMenu.featureId)}
            onClick={deleteContextFeature}
          >
            <Trash2 size={15} />
            <span>删除</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
