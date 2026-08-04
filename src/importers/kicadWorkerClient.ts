import type { PcbReference } from "../domain/model";

type KicadImportResponse =
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

function rejectAll(error: Error): void {
  for (const request of pending.values()) {
    window.clearTimeout(request.timeout);
    request.reject(error);
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./kicad.worker.ts", import.meta.url), {
    type: "module",
    name: "3dshell-kicad-import",
  });
  worker.addEventListener("message", (event: MessageEvent<KicadImportResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    window.clearTimeout(request.timeout);
    if (response.ok) request.resolve(response.reference);
    else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", (event) => {
    rejectAll(new Error(event.message || "KiCad 导入 Worker 发生错误"));
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function importKicadPcb(
  buffer: ArrayBuffer,
  sourceName: string,
): Promise<PcbReference> {
  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("KiCad PCB 解析超时"));
    }, 30_000);
    pending.set(id, { resolve, reject, timeout });
    getWorker().postMessage({ id, sourceName, buffer }, [buffer]);
  });
}

