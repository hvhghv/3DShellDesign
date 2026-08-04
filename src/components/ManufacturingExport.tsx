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

type ExportChoice =
  | "layout-3mf"
  | "base-stl"
  | "lid-stl"
  | "panel-stl"
  | "panel-svg"
  | "panel-dxf"
  | "bom-csv"
  | "manifest";

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
  const effectiveChoice =
    !parameters.panelEnabled && choice.startsWith("panel-")
      ? "base-stl"
      : choice;

  const runExport = async () => {
    setBusy(true);
    setResult(null);
    try {
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
      } else if (effectiveChoice.endsWith("-stl")) {
        const part = effectiveChoice.replace("-stl", "") as SolidPart;
        const exported = await exportSolidPart(parameters, part, pcbReference);
        downloadBlob(
          `3dshell-${part}.stl`,
          new Blob([exported.buffer], { type: "model/stl" }),
        );
        setResult(
          `${exported.summary.triangleCount.toLocaleString()} 三角面 · ${exported.summary.volume.toFixed(0)} mm³`,
        );
      } else if (effectiveChoice === "panel-svg" || effectiveChoice === "panel-dxf") {
        const isDxf = effectiveChoice === "panel-dxf";
        const contents = isDxf ? createPanelDxf(parameters) : createPanelSvg(parameters);
        downloadBlob(
          isDxf ? "3dshell-panel.dxf" : "3dshell-panel.svg",
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
          panel: parameters.panelEnabled
            ? {
                material: getMaterial(parameters.panelMaterialId).name,
                process: getMaterial(parameters.panelMaterialId).process,
                thickness: parameters.panelThickness,
                size: [dimensions.panelLength, dimensions.panelWidth],
              }
            : null,
          closure: parameters.closureType,
          template: parameters.enclosureTemplateId,
          panelMounting: parameters.panelMountingType,
          ventPattern: parameters.ventPattern,
          connector: parameters.typeCPortEnabled
            ? {
                definition: getConnectorDefinition(parameters.connectorDefinitionId),
                cutoutSize: [parameters.typeCPortWidth, parameters.typeCPortHeight],
                offset: parameters.typeCPortOffset,
              }
            : null,
          antenna: parameters.antennaEnabled
            ? {
                definition: getAntennaDefinition(parameters.antennaDefinitionId),
                offset: parameters.antennaOffset,
              }
            : null,
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
          {parameters.panelEnabled ? <option value="panel-stl">面板 STL</option> : null}
          {parameters.panelEnabled ? <option value="panel-svg">面板 SVG</option> : null}
          {parameters.panelEnabled ? <option value="panel-dxf">面板 DXF</option> : null}
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
