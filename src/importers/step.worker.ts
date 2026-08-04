import createOcctModule from "occt-import-js";
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import type { PcbReference, StepPreview, StepPreviewMesh } from "../domain/model";

interface StepImportRequest {
  id: number;
  sourceName: string;
  buffer: ArrayBuffer;
  boardThickness: number;
}

type StepImportResponse =
  | { id: number; ok: true; reference: PcbReference; preview: StepPreview }
  | { id: number; ok: false; error: string };

let modulePromise: ReturnType<typeof createOcctModule> | null = null;

function getModule() {
  if (!modulePromise) {
    modulePromise = createOcctModule({
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    });
  }
  return modulePromise;
}

const workerScope = self as unknown as {
  postMessage: (message: StepImportResponse, transfer?: Transferable[]) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<StepImportRequest>) => void,
  ) => void;
};

workerScope.addEventListener("message", (event) => {
  void (async () => {
    const request = event.data;
    try {
      const occt = await getModule();
      const result = occt.ReadStepFile(new Uint8Array(request.buffer), {
        linearUnit: "millimeter",
        linearDeflectionType: "bounding_box_ratio",
        linearDeflection: 0.001,
        angularDeflection: 0.5,
      });
      if (!result.success || result.meshes.length === 0) {
        throw new Error("OpenCascade 未能从 STEP 中生成实体网格");
      }

      const minimum = [Infinity, Infinity, Infinity];
      const maximum = [-Infinity, -Infinity, -Infinity];
      for (const mesh of result.meshes) {
        const source = mesh.attributes.position.array;
        for (let offset = 0; offset < source.length; offset += 3) {
          for (let axis = 0; axis < 3; axis += 1) {
            const value = source[offset + axis];
            if (!Number.isFinite(value)) throw new Error("STEP 网格包含无效坐标");
            minimum[axis] = Math.min(minimum[axis], value);
            maximum[axis] = Math.max(maximum[axis], value);
          }
        }
      }
      const size = [
        maximum[0] - minimum[0],
        maximum[1] - minimum[1],
        maximum[2] - minimum[2],
      ] as const;
      if (size.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error("STEP 包围盒无效");
      }
      const centerX = (minimum[0] + maximum[0]) / 2;
      const centerY = (minimum[1] + maximum[1]) / 2;
      const previewMeshes: StepPreviewMesh[] = [];
      const transfer: Transferable[] = [];
      let triangleCount = 0;

      for (const mesh of result.meshes) {
        const sourcePositions = mesh.attributes.position.array;
        const positions = new Float32Array(sourcePositions.length);
        for (let offset = 0; offset < sourcePositions.length; offset += 3) {
          positions[offset] = sourcePositions[offset] - centerX;
          positions[offset + 1] = sourcePositions[offset + 2] - minimum[2];
          positions[offset + 2] = centerY - sourcePositions[offset + 1];
        }
        const sourceNormals = mesh.attributes.normal?.array;
        const normals = sourceNormals ? new Float32Array(sourceNormals.length) : null;
        if (sourceNormals && normals) {
          for (let offset = 0; offset < sourceNormals.length; offset += 3) {
            normals[offset] = sourceNormals[offset];
            normals[offset + 1] = sourceNormals[offset + 2];
            normals[offset + 2] = -sourceNormals[offset + 1];
          }
        }
        const indices = new Uint32Array(mesh.index.array);
        triangleCount += indices.length / 3;
        previewMeshes.push({
          name: mesh.name || `STEP 实体 ${previewMeshes.length + 1}`,
          color: mesh.color ?? [0.2, 0.45, 0.32],
          positions,
          normals,
          indices,
        });
        transfer.push(positions.buffer, indices.buffer);
        if (normals) transfer.push(normals.buffer);
      }

      const response: StepImportResponse = {
        id: request.id,
        ok: true,
        reference: {
          format: "step",
          sourceName: request.sourceName,
          version: null,
          thickness: request.boardThickness,
          bounds: {
            minX: minimum[0],
            minY: minimum[1],
            maxX: maximum[0],
            maxY: maximum[1],
          },
          outlineElements: result.meshes.length,
          unsupportedOutlineElements: 0,
          mountingHoles: [],
          overallHeight: size[2],
          triangleCount,
        },
        preview: { meshes: previewMeshes, size },
      };
      workerScope.postMessage(response, transfer);
    } catch (error) {
      workerScope.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "STEP 解析失败",
      });
    }
  })();
});
