import type { PcbReference } from "../domain/model";

type GerberImportResponse =
  | { id: number; ok: true; reference: PcbReference }
  | { id: number; ok: false; error: string };

interface PendingImport {
  resolve: (reference: PcbReference) => void;
  reject: (error: Error) => void;
  timeout: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingImport>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./gerber.worker.ts", import.meta.url), {
    type: "module",
    name: "3dshell-gerber-import",
  });
  worker.addEventListener("message", (event: MessageEvent<GerberImportResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    window.clearTimeout(request.timeout);
    if (response.ok) request.resolve(response.reference);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", (event) => {
    for (const request of pending.values()) {
      window.clearTimeout(request.timeout);
      request.reject(new Error(event.message || "Gerber 导入 Worker 发生错误"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function importGerberExcellon(
  outlineBuffer: ArrayBuffer,
  outlineName: string,
  drillBuffer: ArrayBuffer | null,
  drillName: string | null,
  thickness: number,
): Promise<PcbReference> {
  const id = nextRequestId;
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("Gerber/Excellon 解析超时"));
    }, 30_000);
    pending.set(id, { resolve, reject, timeout });
    const transfer: Transferable[] = [outlineBuffer];
    if (drillBuffer) transfer.push(drillBuffer);
    getWorker().postMessage(
      { id, outlineName, outlineBuffer, drillName, drillBuffer, thickness },
      transfer,
    );
  });
}
