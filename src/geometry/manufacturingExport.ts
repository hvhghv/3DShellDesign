import type { DesignerParameters, PcbReference } from "../domain/model";
import type {
  GeometryExportRequest,
  GeometryExportResponse,
  GeometryExportSuccess,
  PrintLayoutExportSuccess,
  SolidExportSuccess,
} from "./exportProtocol";
import type { SolidPart } from "./manifoldSolidFactory";

interface PendingRequest {
  resolve: (value: GeometryExportSuccess) => void;
  reject: (error: Error) => void;
  timeout: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function isPrintLayoutSuccess(
  response: GeometryExportSuccess,
): response is PrintLayoutExportSuccess {
  return "parts" in response.summary;
}

function rejectAll(error: Error): void {
  for (const request of pending.values()) {
    window.clearTimeout(request.timeout);
    request.reject(error);
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./manifold.worker.ts", import.meta.url), {
    type: "module",
    name: "3dshell-manifold-export",
  });
  worker.addEventListener("message", (event: MessageEvent<GeometryExportResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    window.clearTimeout(request.timeout);
    if (response.ok) request.resolve(response);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", (event) => {
    rejectAll(new Error(event.message || "实体导出 Worker 发生错误"));
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function exportSolidPart(
  parameters: DesignerParameters,
  part: SolidPart,
  pcbReference: PcbReference | null,
): Promise<SolidExportSuccess> {
  const id = nextRequestId;
  nextRequestId += 1;
  const request: GeometryExportRequest = { id, parameters, pcbReference, part };

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("实体生成超时"));
    }, 60_000);
    pending.set(id, {
      resolve: (response) => {
        if (isPrintLayoutSuccess(response)) {
          reject(new Error("实体导出响应类型不匹配"));
          return;
        }
        resolve(response);
      },
      reject,
      timeout,
    });
    getWorker().postMessage(request);
  });
}

export function exportPrintLayout(
  projectName: string,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): Promise<PrintLayoutExportSuccess> {
  const id = nextRequestId;
  nextRequestId += 1;
  const request: GeometryExportRequest = {
    id,
    format: "3mf",
    projectName,
    parameters,
    pcbReference,
  };
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("3MF 打印布局生成超时"));
    }, 90_000);
    pending.set(id, {
      resolve: (response) => {
        if (!isPrintLayoutSuccess(response)) {
          reject(new Error("3MF 导出响应类型不匹配"));
          return;
        }
        resolve(response);
      },
      reject,
      timeout,
    });
    getWorker().postMessage(request);
  });
}
