import type { PcbReference } from "../domain/model";
import { parseKicadPcb } from "./kicadPcb";

interface KicadImportRequest {
  id: number;
  sourceName: string;
  buffer: ArrayBuffer;
}

interface KicadImportSuccess {
  id: number;
  ok: true;
  reference: PcbReference;
}

interface KicadImportFailure {
  id: number;
  ok: false;
  error: string;
}

const workerScope = self as unknown as {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<KicadImportRequest>) => void,
  ) => void;
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(request.buffer);
    const response: KicadImportSuccess = {
      id: request.id,
      ok: true,
      reference: parseKicadPcb(source, request.sourceName),
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: KicadImportFailure = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "KiCad PCB 解析失败",
    };
    workerScope.postMessage(response);
  }
});

