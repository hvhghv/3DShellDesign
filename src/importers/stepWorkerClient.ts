import type { PcbReference, StepPreview } from "../domain/model";

type StepImportResponse =
  | { id: number; ok: true; reference: PcbReference; preview: StepPreview }
  | { id: number; ok: false; error: string };

interface StepImportResult {
  reference: PcbReference;
  preview: StepPreview;
}

interface PendingImport {
  resolve: (result: StepImportResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingImport>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./step.worker.ts", import.meta.url), {
    type: "module",
    name: "3dshell-step-import",
  });
  worker.addEventListener("message", (event: MessageEvent<StepImportResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    window.clearTimeout(request.timeout);
    if (response.ok) {
      request.resolve({ reference: response.reference, preview: response.preview });
    } else request.reject(new Error(response.error));
  });
  worker.addEventListener("error", (event) => {
    for (const request of pending.values()) {
      window.clearTimeout(request.timeout);
      request.reject(new Error(event.message || "STEP 导入 Worker 发生错误"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function importStepReference(
  buffer: ArrayBuffer,
  sourceName: string,
  boardThickness: number,
): Promise<StepImportResult> {
  const id = nextRequestId;
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("STEP 解析超时"));
    }, 120_000);
    pending.set(id, { resolve, reject, timeout });
    getWorker().postMessage({ id, buffer, sourceName, boardThickness }, [buffer]);
  });
}
