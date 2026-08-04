import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import { createBomCsv } from "./bomCsv";

describe("BOM CSV exporter", () => {
  it("includes current materials, connector and fastener quantities", () => {
    const csv = createBomCsv("控制器,样机", DEFAULT_PARAMETERS);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"控制器,样机",下壳,1,PETG 韧性打印,FDM');
    expect(csv).toContain("USB Type-C 母座,1,USB-C receptacle");
    expect(csv).toContain("顶盖紧固件,4,M3 self-tapping screw");
    expect(csv).toContain("面板固定件,4,screw");
  });
});
