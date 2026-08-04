import {
  Antenna as AntennaIcon,
  Box,
  Cable,
  CircuitBoard,
  FolderKanban,
  PanelTop,
  Plus,
  SquareStack,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ClosureType, SelectablePart } from "../domain/model";
import { getMagnetSupportOption } from "../domain/magnetSupport";
import {
  getConnectorSurfaceLabel,
  getFaceLabel,
  getPanelLabel,
} from "../domain/placements";
import { useDesignerStore } from "../store/designerStore";
import { getAntennaDefinition, getConnectorDefinition } from "../libraries/components";

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

interface TreeItemProps {
  id: SelectablePart;
  icon: ReactNode;
  label: string;
  detail?: string;
  depth?: number;
  featureId?: string;
}

function TreeItem({ id, icon, label, detail, depth = 0, featureId }: TreeItemProps) {
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
        featureId && (id === "panel" || id === "connector")
          ? setSelectedFeature(id, featureId)
          : setSelectedPart(id)
      }
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
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const addPanelPlacement = useDesignerStore((state) => state.addPanelPlacement);
  const addConnectorPlacement = useDesignerStore((state) => state.addConnectorPlacement);
  const objectCount =
    4 +
    parameters.panelPlacements.length +
    parameters.connectorPlacements.length +
    Number(parameters.antennaEnabled);

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
          />
        ))}
        <div className="tree-section-heading">
          <span>接口</span>
          <button type="button" onClick={addConnectorPlacement} title="添加接口" aria-label="添加接口">
            <Plus size={15} />
          </button>
        </div>
        {parameters.connectorPlacements.map((placement) => (
          <TreeItem
            key={placement.id}
            id="connector"
            featureId={placement.id}
            icon={<Cable size={16} />}
            label={getConnectorDefinition(placement.definitionId).name}
            detail={getConnectorSurfaceLabel(placement, parameters)}
            depth={2}
          />
        ))}
        {parameters.antennaEnabled ? (
          <TreeItem
            id="antenna"
            icon={<AntennaIcon size={16} />}
            label={getAntennaDefinition(parameters.antennaDefinitionId).name}
            detail={getAntennaDefinition(parameters.antennaDefinitionId).metadata.frequencyBand}
            depth={2}
          />
        ) : null}
      </nav>
    </aside>
  );
}
