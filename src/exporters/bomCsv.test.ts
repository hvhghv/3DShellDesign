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
    expect(csv).toContain("面板 1 固定件,4,screw");
  });

  it("includes the selected antenna and frequency band", () => {
    const csv = createBomCsv("射频控制器", {
      ...DEFAULT_PARAMETERS,
      antennaPlacements: [
        {
          id: "antenna-1",
          definitionId: "sma-bulkhead-whip",
          surface: "back",
          panelId: null,
          offsetU: 0,
          offsetV: 0,
          rotation: 0,
          cutoutDiameter: 6.8,
        },
      ],
    });

    expect(csv).toContain("SMA 穿板棒状天线,1,SMA female bulkhead + whip antenna");
    expect(csv).toContain("2.4 GHz / 5.8 GHz");
  });

  it("records the selected magnet support structure", () => {
    const csv = createBomCsv("磁吸外壳", {
      ...DEFAULT_PARAMETERS,
      closureType: "magnet",
      magnetSupportType: "perimeter-flange",
    });

    expect(csv).toContain("圆形磁铁,8,直径 6 x 1.8 mm");
    expect(csv).toContain("四周内翻边；装配前确认磁极");
  });

  it("records panel magnets and removable lid pins", () => {
    const csv = createBomCsv("快拆外壳", {
      ...DEFAULT_PARAMETERS,
      closureType: "pin",
      panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
        ...panel,
        mountingType: "magnet",
      })),
    });

    expect(csv).toContain("面板 1 固定件,8,直径 4.3 mm 圆形磁铁");
    expect(csv).toContain("快拆销轴,2,直径 2.5 mm 带拉环销");
  });
});
