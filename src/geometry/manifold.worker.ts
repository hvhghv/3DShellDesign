import ManifoldModule, { type ManifoldToplevel } from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { getMaterial } from "../domain/materials";
import { createThreeMfArchive, type ThreeMfPart } from "../exporters/threeMf";
import { serializeBinaryStl } from "./binaryStl";
import type {
  GeometryExportRequest,
  PrintLayoutExportSuccess,
  SolidExportFailure,
  SolidExportSummary,
  SolidExportSuccess,
} from "./exportProtocol";
import { buildSolidPart, type SolidPart } from "./manifoldSolidFactory";

let modulePromise: Promise<ManifoldToplevel> | null = null;

function getModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = ManifoldModule({ locateFile: () => wasmUrl }).then((module) => {
      module.setup();
      module.setCircularSegments(32);
      return module;
    });
  }
  return modulePromise;
}

const workerScope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<GeometryExportRequest>) => void,
  ) => void;
};

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    try {
      const module = await getModule();
      if (request.format === "3mf") {
        const parts: SolidPart[] = request.parameters.panelEnabled
          ? ["base", "lid", "panel"]
          : ["base", "lid"];
        const meshes: ThreeMfPart[] = [];
        const summaries: SolidExportSummary[] = [];
        const solids: ReturnType<typeof buildSolidPart>[] = [];
        try {
          for (const part of parts) {
            const solid = buildSolidPart(
              module,
              request.parameters,
              part,
              request.pcbReference,
            );
            solids.push(solid);
            const status = solid.status();
            if (status !== "NoError") throw new Error(`实体内核返回 ${status}`);
            if (solid.isEmpty()) throw new Error(`${part} 实体为空`);
            const mesh = solid.getMesh();
            const bounds = solid.boundingBox();
            const material = getMaterial(
              part === "panel"
                ? request.parameters.panelMaterialId
                : request.parameters.shellMaterialId,
            );
            meshes.push({
              name: part === "base" ? "下壳" : part === "lid" ? "顶盖" : "可更换面板",
              materialName: material.name,
              color: material.color,
              mesh,
            });
            summaries.push({
              part,
              triangleCount: mesh.numTri,
              volume: solid.volume(),
              bounds,
            });
          }
          const buffer = createThreeMfArchive(request.projectName, meshes);
          const response: PrintLayoutExportSuccess = {
            id: request.id,
            ok: true,
            buffer,
            summary: {
              partCount: summaries.length,
              triangleCount: summaries.reduce(
                (total, summary) => total + summary.triangleCount,
                0,
              ),
              volume: summaries.reduce((total, summary) => total + summary.volume, 0),
              parts: summaries,
            },
          };
          workerScope.postMessage(response, [buffer]);
        } finally {
          for (const solid of solids) solid.delete();
        }
        return;
      }
      const solid = buildSolidPart(
        module,
        request.parameters,
        request.part,
        request.pcbReference,
      );
      try {
        const status = solid.status();
        if (status !== "NoError") {
          throw new Error(`实体内核返回 ${status}`);
        }
        if (solid.isEmpty()) throw new Error("生成的实体为空");
        const bounds = solid.boundingBox();
        const mesh = solid.getMesh();
        const buffer = serializeBinaryStl(mesh, request.part);
        const response: SolidExportSuccess = {
          id: request.id,
          ok: true,
          buffer,
          summary: {
            part: request.part,
            triangleCount: mesh.numTri,
            volume: solid.volume(),
            bounds,
          },
        };
        workerScope.postMessage(response, [buffer]);
      } finally {
        solid.delete();
      }
    } catch (error) {
      const response: SolidExportFailure = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "实体导出失败",
      };
      workerScope.postMessage(response);
    }
  })();
});
