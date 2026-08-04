import type { PcbReference } from "../domain/model";
import { parseGerberExcellon } from "./gerberExcellon";

interface GerberImportRequest {
  id: number;
  outlineName: string;
  outlineBuffer: ArrayBuffer;
  drillName: string | null;
  drillBuffer: ArrayBuffer | null;
  thickness: number;
}

type GerberImportResponse =
  | { id: number; ok: true; reference: PcbReference }
  | { id: number; ok: false; error: string };

const workerScope = self as unknown as {
  postMessage: (message: GerberImportResponse) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<GerberImportRequest>) => void,
  ) => void;
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const outline = decoder.decode(request.outlineBuffer);
    const drill = request.drillBuffer ? decoder.decode(request.drillBuffer) : null;
    workerScope.postMessage({
      id: request.id,
      ok: true,
      reference: parseGerberExcellon(
        outline,
        request.outlineName,
        drill,
        request.drillName,
        request.thickness,
      ),
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Gerber/Excellon 解析失败",
    });
  }
});
