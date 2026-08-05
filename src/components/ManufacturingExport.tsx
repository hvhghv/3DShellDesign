import { Download, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { deriveEnclosureDimensions, validateDesign } from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import { createPanelSvg } from "../exporters/panelSvg";
import { createPanelDxf } from "../exporters/panelDxf";
import { createBomCsv } from "../exporters/bomCsv";
import { exportPrintLayout, exportSolidPart } from "../geometry/manufacturingExport";
import type { SolidPart } from "../geometry/manifoldSolidFactory";
import { useDesignerStore } from "../store/designerStore";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
} from "../libraries/components";

type StaticExportChoice =
  | "layout-3mf"
  | "base-stl"
  | "lid-stl"
  | "bom-csv"
  | "manifest";
type PanelExportFormat = "stl" | "svg" | "dxf";
type ExportChoice = StaticExportChoice | `panel-${PanelExportFormat}:${string}`;

function parsePanelChoice(
  choice: ExportChoice,
): { format: PanelExportFormat; panelId: string } | null {
  const match = /^panel-(stl|svg|dxf):(.+)$/.exec(choice);
  if (!match) return null;
  return {
    format: match[1] as PanelExportFormat,
    panelId: match[2],
  };
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ManufacturingExport() {
  const projectName = useDesignerStore((state) => state.projectName);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const [choice, setChoice] = useState<ExportChoice>("base-stl");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const issues = useMemo(
    () => validateDesign(parameters, pcbReference),
    [parameters, pcbReference],
  );
  const blocked = issues.some((issue) => issue.level === "error");
  const requestedPanel = parsePanelChoice(choice);
  const effectiveChoice: ExportChoice =
    requestedPanel &&
    !parameters.panelPlacements.some((panel) => panel.id === requestedPanel.panelId)
      ? "base-stl"
      : choice;

  const runExport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const panelChoice = parsePanelChoice(effectiveChoice);
      if (effectiveChoice === "layout-3mf") {
        const exported = await exportPrintLayout(
          projectName,
          parameters,
          pcbReference,
        );
        downloadBlob(
          "3dshell-print-layout.3mf",
          new Blob([exported.buffer], { type: "model/3mf" }),
        );
        setResult(
          `${exported.summary.partCount} 个零件 · ${exported.summary.triangleCount.toLocaleString()} 三角面`,
        );
      } else if (
        effectiveChoice.endsWith("-stl") ||
        panelChoice?.format === "stl"
      ) {
        const part: SolidPart = panelChoice
          ? "panel"
          : (effectiveChoice.replace("-stl", "") as SolidPart);
        const panelIndex = panelChoice
          ? parameters.panelPlacements.findIndex(
              (panel) => panel.id === panelChoice.panelId,
            )
          : -1;
        const exported = await exportSolidPart(
          parameters,
          part,
          pcbReference,
          panelChoice?.panelId ?? null,
        );
        downloadBlob(
          panelChoice
            ? `3dshell-panel-${panelIndex + 1}.stl`
            : `3dshell-${part}.stl`,
          new Blob([exported.buffer], { type: "model/stl" }),
        );
        setResult(
          `${exported.summary.triangleCount.toLocaleString()} 三角面 · ${exported.summary.volume.toFixed(0)} mm³`,
        );
      } else if (panelChoice) {
        const isDxf = panelChoice.format === "dxf";
        const panelIndex = parameters.panelPlacements.findIndex(
          (panel) => panel.id === panelChoice.panelId,
        );
        const contents = isDxf
          ? createPanelDxf(parameters, panelChoice.panelId)
          : createPanelSvg(parameters, panelChoice.panelId);
        downloadBlob(
          `3dshell-panel-${panelIndex + 1}.${panelChoice.format}`,
          new Blob([contents], {
            type: isDxf
              ? "application/dxf;charset=utf-8"
              : "image/svg+xml;charset=utf-8",
          }),
        );
        setResult(`${isDxf ? "DXF" : "SVG"} 轮廓已生成`);
      } else if (effectiveChoice === "bom-csv") {
        downloadBlob(
          "3dshell-bom.csv",
          new Blob([createBomCsv(projectName, parameters)], {
            type: "text/csv;charset=utf-8",
          }),
        );
        setResult("BOM CSV 已生成");
      } else {
        const dimensions = deriveEnclosureDimensions(parameters);
        const manifest = {
          schemaVersion: 1,
          project: projectName,
          generatedAt: new Date().toISOString(),
          units: "mm",
          pcbReference,
          enclosure: dimensions,
          shell: {
            material: getMaterial(parameters.shellMaterialId).name,
            process: getMaterial(parameters.shellMaterialId).process,
            wallThickness: parameters.wallThickness,
          },
          panels: parameters.panelPlacements.map((panel) => ({
            id: panel.id,
            material: getMaterial(panel.materialId).name,
            process: getMaterial(panel.materialId).process,
            thickness: panel.thickness,
            size: [panel.width, panel.height],
            face: panel.face,
            offset: [panel.offsetU, panel.offsetV],
            mounting: panel.mountingType,
          })),
          closure: parameters.closureType,
          template: parameters.enclosureTemplateId,
          ventPattern: parameters.ventPattern,
          connectors: parameters.connectorPlacements.map((placement) => ({
            ...placement,
            definition: getConnectorDefinition(placement.definitionId),
          })),
          antennas: parameters.antennaPlacements.map((placement) => ({
            ...placement,
            definition: getAntennaDefinition(placement.definitionId),
          })),
          fastener:
            parameters.closureType === "screw"
              ? getFastenerDefinition(parameters.closureFastenerId)
              : null,
          checks: issues,
        };
        downloadBlob(
          "3dshell-manufacturing.json",
          new Blob([JSON.stringify(manifest, null, 2)], {
            type: "application/json;charset=utf-8",
          }),
        );
        setResult("制造清单已生成");
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="manufacturing-export">
      <h2>制造导出</h2>
      <div className="export-control">
        <select
          aria-label="制造导出格式"
          value={effectiveChoice}
          onChange={(event) => setChoice(event.currentTarget.value as ExportChoice)}
        >
          <option value="layout-3mf">3MF 打印布局</option>
          <option value="base-stl">下壳 STL</option>
          <option value="lid-stl">顶盖 STL</option>
          {parameters.panelPlacements.flatMap((panel, index) => [
            <option key={`${panel.id}-stl`} value={`panel-stl:${panel.id}`}>
              面板 {index + 1} STL
            </option>,
            <option key={`${panel.id}-svg`} value={`panel-svg:${panel.id}`}>
              面板 {index + 1} SVG
            </option>,
            <option key={`${panel.id}-dxf`} value={`panel-dxf:${panel.id}`}>
              面板 {index + 1} DXF
            </option>,
          ])}
          <option value="bom-csv">物料清单 CSV</option>
          <option value="manifest">制造清单 JSON</option>
        </select>
        <button
          type="button"
          onClick={() => void runExport()}
          disabled={busy || (blocked && effectiveChoice !== "manifest")}
          title={blocked && effectiveChoice !== "manifest" ? "请先解决阻断问题" : "生成制造文件"}
        >
          {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
          <span>{busy ? "生成中" : "导出"}</span>
        </button>
      </div>
      {result ? <p className="export-result" role="status">{result}</p> : null}
    </section>
  );
}
