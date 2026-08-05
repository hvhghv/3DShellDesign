import {
  Antenna as AntennaIcon,
  Box,
  Cable,
  CircuitBoard,
  FolderKanban,
  PanelTop,
  Plus,
  Search,
  SquareStack,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ClosureType, SelectablePart } from "../domain/model";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import {
  getConnectorSurfaceLabel,
  getAntennaSurfaceLabel,
  getFaceLabel,
  getPanelLabel,
} from "../domain/placements";
import { useDesignerStore } from "../store/designerStore";
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
  slide: "滑盖导轨",
  hinge: "转轴翻盖",
};

const PANEL_MOUNTING_LABELS = {
  screw: "螺丝",
  magnet: "磁吸",
  slide: "滑轨",
} as const;

const CONNECTOR_CATEGORY_LABELS = {
  usb: "USB",
  power: "电源",
  network: "网络",
  terminal: "端子",
  fpc: "FPC",
} as const;

interface PickerItem {
  id: string;
  name: string;
  group: string;
  detail: string;
  icon: ReactNode;
}

interface DevicePickerProps {
  title: string;
  items: PickerItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

function DevicePicker({ title, items, onSelect, onClose }: DevicePickerProps) {
  const [query, setQuery] = useState("");
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
  const groups = [...new Set(visibleItems.map((item) => item.group))];

  return (
    <div className="device-picker" role="dialog" aria-label={`${title}选择器`}>
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
      <div className="device-picker-results">
        {groups.map((group) => (
          <section key={group} className="device-picker-group">
            <h3>{group}</h3>
            {visibleItems
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  className="device-picker-item"
                  type="button"
                  onClick={() => onSelect(item.id)}
                >
                  <span className="device-picker-icon" aria-hidden="true">{item.icon}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))}
          </section>
        ))}
        {visibleItems.length === 0 ? (
          <p className="device-picker-empty">没有匹配的器件</p>
        ) : null}
      </div>
    </div>
  );
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
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const focusedPart = useDesignerStore((state) => state.focusedPart);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const setSelectedFeature = useDesignerStore((state) => state.setSelectedFeature);
  const selected =
    selectedPart === id && (!featureId || selectedFeatureId === featureId);

  return (
    <button
      className={`tree-item ${selected ? "is-selected" : ""} ${focusedPart && focusedPart !== id ? "is-context-hidden" : ""}`}
      style={{ paddingLeft: 12 + depth * 15 }}
      type="button"
      onClick={() =>
        featureId && (id === "panel" || id === "connector" || id === "antenna")
          ? setSelectedFeature(id, featureId)
          : setSelectedPart(id)
      }
      onContextMenu={(event) => {
        if (!featureId || !onOpenContextMenu) return;
        event.preventDefault();
        setSelectedFeature(id as "panel" | "connector" | "antenna", featureId);
        onOpenContextMenu(event.clientX, event.clientY);
      }}
      aria-pressed={selected}
    >
      <span className="tree-icon" aria-hidden="true">{icon}</span>
      <span className="tree-label">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </span>
    </button>
  );
}

export function AssemblyTree() {
  const [openPicker, setOpenPicker] = useState<"connector" | "antenna" | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<{
    part: "panel" | "connector" | "antenna";
    featureId: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  const openFeatureContextMenu = (
    part: "panel" | "connector" | "antenna",
    featureId: string,
    label: string,
    x: number,
    y: number,
  ) => {
    setContextMenu({
      part,
      featureId,
      label,
      x: Math.min(x, window.innerWidth - 154),
      y: Math.min(y, window.innerHeight - 58),
    });
  };

  const deleteContextFeature = () => {
    if (!contextMenu) return;
    if (contextMenu.part === "panel") removePanelPlacement(contextMenu.featureId);
    else if (contextMenu.part === "connector") {
      removeConnectorPlacement(contextMenu.featureId);
    } else removeAntennaPlacement(contextMenu.featureId);
    setContextMenu(null);
  };
  const objectCount =
    4 +
    parameters.panelPlacements.length +
    parameters.connectorPlacements.length +
    parameters.antennaPlacements.length;
  const connectorPickerItems = useMemo<PickerItem[]>(
    () =>
      CONNECTOR_DEFINITIONS.map((definition) => ({
        id: definition.id,
        name: definition.name,
        group: CONNECTOR_CATEGORY_LABELS[definition.category],
        detail: definition.terminalSpec
          ? `${definition.terminalSpec.pitch.toFixed(2)} mm · ${definition.terminalSpec.positions}P · 开孔 ${definition.panelCutout.width.toFixed(1)} × ${definition.panelCutout.height.toFixed(1)} mm`
          : `开孔 ${definition.panelCutout.width.toFixed(1)} × ${definition.panelCutout.height.toFixed(1)} mm`,
        icon: <Cable size={15} />,
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

  return (
    <aside className="assembly-panel" aria-label="装配体和特征树">
      <div className="panel-heading">
        <span>装配体</span>
        <small>{objectCount} 个对象</small>
      </div>
      <nav className="tree-nav">
        <TreeItem id="project" icon={<FolderKanban size={16} />} label="PCB 控制器外壳" detail="项目" />
        <TreeItem
          id="pcb"
          icon={<CircuitBoard size={16} />}
          label="参考 PCB"
          detail={
            pcbReference
              ? `${pcbReference.sourceName} · ${pcbReference.mountingHoles.length} 孔`
              : `${parameters.pcbLength} x ${parameters.pcbWidth} mm`
          }
          depth={1}
        />
        <TreeItem
          id="base"
          icon={<Box size={16} />}
          label="下壳"
          detail={
            parameters.closureType === "magnet"
              ? getMagnetSupportOption(parameters.magnetSupportType).name
              : "参数零件"
          }
          depth={1}
        />
        <TreeItem id="lid" icon={<SquareStack size={16} />} label="顶盖" detail={CLOSURE_LABELS[parameters.closureType]} depth={1} />
        <div className="tree-section-heading">
          <span>面板</span>
          <button type="button" onClick={addPanelPlacement} title="添加面板" aria-label="添加面板">
            <Plus size={15} />
          </button>
        </div>
        {parameters.panelPlacements.map((panel) => (
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
          <span>接口</span>
          <button
            type="button"
            onClick={() =>
              setOpenPicker((current) =>
                current === "connector" ? null : "connector",
              )
            }
            title="选择并添加接口"
            aria-label="添加接口"
            aria-expanded={openPicker === "connector"}
          >
            <Plus size={15} />
          </button>
        </div>
        {openPicker === "connector" ? (
          <DevicePicker
            title="添加接口器件"
            items={connectorPickerItems}
            onClose={() => setOpenPicker(null)}
            onSelect={(id) => {
              addConnectorPlacement(id);
              setOpenPicker(null);
            }}
          />
        ) : null}
        {parameters.connectorPlacements.map((placement) => (
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
            onClose={() => setOpenPicker(null)}
            onSelect={(id) => {
              addAntennaPlacement(id);
              setOpenPicker(null);
            }}
          />
        ) : null}
        {parameters.antennaPlacements.map((placement) => (
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
          <button type="button" role="menuitem" onClick={deleteContextFeature}>
            <Trash2 size={15} />
            <span>删除</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
