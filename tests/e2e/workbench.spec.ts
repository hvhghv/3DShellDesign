import { expect, test, type Locator, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "node:fs/promises";

async function readScreenshotPixels(page: Page, canvas: Locator) {
  const screenshot = await canvas.screenshot({ type: "png" });
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;

  return page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = image.naturalWidth;
    sampleCanvas.height = image.naturalHeight;
    const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas is unavailable");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height,
    ).data;
    const colors = new Set<number>();
    let minLuminance = 255;
    let maxLuminance = 0;

    for (let index = 0; index < pixels.length; index += 64) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const quantized =
        (Math.round(red / 16) << 8) |
        (Math.round(green / 16) << 4) |
        Math.round(blue / 16);
      colors.add(quantized);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
    }

    return {
      width: sampleCanvas.width,
      height: sampleCanvas.height,
      colorCount: colors.size,
      luminanceRange: maxLuminance - minLuminance,
    };
  }, dataUrl);
}

function readStlDimensions(stl: Uint8Array): {
  triangleCount: number;
  dimensions: [number, number, number];
} {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const triangleCount = view.getUint32(80, true);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const triangleOffset = 84 + triangle * 50;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = triangleOffset + 12 + vertex * 12;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(vertexOffset + axis * 4, true);
        minimum[axis] = Math.min(minimum[axis], value);
        maximum[axis] = Math.max(maximum[axis], value);
      }
    }
  }

  return {
    triangleCount,
    dimensions: [
      maximum[0] - minimum[0],
      maximum[1] - minimum[1],
      maximum[2] - minimum[2],
    ],
  };
}

test("desktop workbench renders a nonblank interactive enclosure", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.getByText("3DShellDesigner", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "尺寸" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const canvas = page.locator(".viewport-canvas canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(700);

  const pixels = await readScreenshotPixels(page, canvas);
  expect(pixels.width).toBeGreaterThan(600);
  expect(pixels.height).toBeGreaterThan(500);
  expect(pixels.colorCount).toBeGreaterThan(20);
  expect(pixels.luminanceRange).toBeGreaterThan(35);

  await page.locator(".tree-nav").getByRole("button", { name: /顶盖/ }).click();
  await page.getByRole("button", { name: "聚焦选中零件" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "lid",
  );
  expect(await page.locator(".tree-item.is-context-hidden").count()).toBeGreaterThan(3);
  await page.locator(".tree-nav").getByRole("button", { name: /下壳/ }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "base",
  );
  await page.getByRole("button", { name: "显示全部零件" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "all",
  );
  await expect(page.locator(".tree-item.is-context-hidden")).toHaveCount(0);

  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("button", { name: "磁吸", exact: true }).click();
  await expect(page.getByText("磁吸固定", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "装配或爆炸视图" }).click();
  await page.waitForTimeout(300);

  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });
  await exportSelect.selectOption("layout-3mf");
  const layoutDownloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.locator(".manufacturing-export button").click();
  const layoutDownload = await layoutDownloadPromise;
  expect(layoutDownload.suggestedFilename()).toBe("3dshell-print-layout.3mf");
  const layoutPath = await layoutDownload.path();
  expect(layoutPath).not.toBeNull();
  const layoutFiles = unzipSync(await readFile(layoutPath!));
  expect(Object.keys(layoutFiles).sort()).toEqual([
    "3D/3dmodel.model",
    "[Content_Types].xml",
    "_rels/.rels",
  ]);
  const layoutModel = strFromU8(layoutFiles["3D/3dmodel.model"]);
  expect(layoutModel).toContain('<model unit="millimeter"');
  expect(layoutModel.match(/<object /g)).toHaveLength(3);
  expect(layoutModel.match(/<item /g)).toHaveLength(3);
  expect(layoutModel).toContain("PETG 韧性打印");
  expect(layoutModel).toContain("透明亚克力板");

  const exportCases = [
    { option: "base-stl", filename: "3dshell-base.stl", size: [108, 78, 24] },
    { option: "lid-stl", filename: "3dshell-lid.stl", size: [108, 78, 4.2] },
    { option: "panel-stl", filename: "3dshell-panel.stl", size: [62.64, 40.56, 2] },
  ] as const;
  for (const exportCase of exportCases) {
    await exportSelect.selectOption(exportCase.option);
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.locator(".manufacturing-export button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(exportCase.filename);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const stl = await readFile(downloadPath!);
    const parsed = readStlDimensions(stl);
    expect(parsed.triangleCount).toBeGreaterThan(100);
    expect(stl.byteLength).toBe(84 + parsed.triangleCount * 50);
    parsed.dimensions.forEach((dimension, axis) => {
      expect(dimension).toBeCloseTo(exportCase.size[axis], 1);
    });
  }
  await expect(page.getByText(/三角面/)).toBeVisible();

  await page.getByRole("checkbox", { name: /启用天线/ }).check();
  await page.getByRole("combobox", { name: "天线类型" }).selectOption(
    "sma-bulkhead-whip",
  );
  await expect(
    page.getByRole("button", { name: /SMA 穿板棒状天线.*2\.4 GHz/ }),
  ).toBeVisible();

  await exportSelect.selectOption("panel-dxf");
  const dxfDownloadPromise = page.waitForEvent("download");
  await page.locator(".manufacturing-export button").click();
  const dxfDownload = await dxfDownloadPromise;
  expect(dxfDownload.suggestedFilename()).toBe("3dshell-panel.dxf");
  const dxfPath = await dxfDownload.path();
  expect(dxfPath).not.toBeNull();
  const dxf = (await readFile(dxfPath!)).toString("utf8");
  expect(dxf).toContain("LWPOLYLINE");
  expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(4);

  await exportSelect.selectOption("bom-csv");
  const bomDownloadPromise = page.waitForEvent("download");
  await page.locator(".manufacturing-export button").click();
  const bomDownload = await bomDownloadPromise;
  expect(bomDownload.suggestedFilename()).toBe("3dshell-bom.csv");
  const bomPath = await bomDownload.path();
  expect(bomPath).not.toBeNull();
  const bom = (await readFile(bomPath!)).toString("utf8");
  expect(bom).toContain("USB Type-C 母座");
  expect(bom).toContain("圆形磁铁,8,直径 6 mm");
  expect(bom).toContain("SMA 穿板棒状天线");

  await page.getByRole("button", { name: "螺丝", exact: true }).click();
  await page.getByRole("combobox", { name: "紧固件规格" }).selectOption(
    "m3-heat-set",
  );
  await page.getByRole("combobox", { name: "接口器件" }).selectOption(
    "dc-5521-jack",
  );
  await expect(
    page.getByRole("button", { name: "DC 5.5/2.1 母座 前侧接口" }),
  ).toBeVisible();
  await exportSelect.selectOption("base-stl");
  const libraryDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const libraryDownload = await libraryDownloadPromise;
  const libraryPath = await libraryDownload.path();
  expect(libraryPath).not.toBeNull();
  const libraryStl = readStlDimensions(await readFile(libraryPath!));
  expect(libraryStl.triangleCount).toBeGreaterThan(100);
  expect(libraryStl.dimensions[0]).toBeCloseTo(108, 1);
  expect(libraryStl.dimensions[1]).toBeCloseTo(78, 1);

  await page.getByRole("combobox", { name: "镂空阵列类型" }).selectOption(
    "honeycomb",
  );
  await page.getByRole("button", { name: "翻盖", exact: true }).click();
  await exportSelect.selectOption("base-stl");
  const hingeDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const hingePath = await (await hingeDownloadPromise).path();
  expect(hingePath).not.toBeNull();
  const hingeStl = readStlDimensions(await readFile(hingePath!));
  expect(hingeStl.triangleCount).toBeGreaterThan(libraryStl.triangleCount);
  expect(hingeStl.dimensions[1]).toBeGreaterThan(78);

  await page.getByRole("button", { name: "滑盖", exact: true }).click();
  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption(
    "slide",
  );
  await exportSelect.selectOption("lid-stl");
  const slideDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const slidePath = await (await slideDownloadPromise).path();
  expect(slidePath).not.toBeNull();
  expect(readStlDimensions(await readFile(slidePath!)).triangleCount).toBeGreaterThan(100);

  await page.getByRole("button", { name: "螺丝", exact: true }).click();
  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption(
    "screw",
  );
  await page.getByRole("combobox", { name: "镂空阵列类型" }).selectOption("none");

  await page.getByRole("tab", { name: "尺寸" }).click();
  await page.locator('input[type="file"][accept=".kicad_pcb"]').setInputFiles(
    "tests/fixtures/controller.kicad_pcb",
  );
  await expect(page.getByText("controller.kicad_pcb", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 个安装孔/)).toBeVisible();
  await expect(page.locator(".field-row").filter({ hasText: "长度" }).locator("input")).toHaveValue("80");
  await expect(page.locator(".field-row").filter({ hasText: "宽度" }).locator("input")).toHaveValue("50");

  await exportSelect.selectOption("base-stl");
  const importedDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const importedDownload = await importedDownloadPromise;
  const importedPath = await importedDownload.path();
  expect(importedPath).not.toBeNull();
  const importedStl = readStlDimensions(await readFile(importedPath!));
  [88, 58, 24].forEach((dimension, axis) => {
    expect(importedStl.dimensions[axis]).toBeCloseTo(dimension, 1);
  });

  await page.locator('input[type="file"][accept*=".gbr"]').setInputFiles([
    "tests/fixtures/controller-Edge_Cuts.gbr",
    "tests/fixtures/controller-PTH.drl",
  ]);
  await expect(
    page.getByText("controller-Edge_Cuts.gbr", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/5 个钻孔 · 4 个安装孔候选/)).toBeVisible();
  await expect(
    page.locator(".field-row").filter({ hasText: "长度" }).locator("input"),
  ).toHaveValue("80");
  await expect(
    page.locator(".field-row").filter({ hasText: "宽度" }).locator("input"),
  ).toHaveValue("50");

  await page.locator('input[type="file"][accept*=".step"]').setInputFiles(
    "tests/fixtures/occt-cube-mm.step",
  );
  await expect(page.getByText("occt-cube-mm.step", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    page.getByText(/STEP 1 个实体 · 12 三角面 · 高 10\.0 mm/),
  ).toBeVisible();
  await expect(
    page.locator(".field-row").filter({ hasText: "长度" }).locator("input"),
  ).toHaveValue("10");
  await expect(
    page.locator(".field-row").filter({ hasText: "宽度" }).locator("input"),
  ).toHaveValue("10");
  const stepPixels = await readScreenshotPixels(page, canvas);
  expect(stepPixels.colorCount).toBeGreaterThan(20);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-reference-kind",
    "step",
  );
  await expect(page.locator(".status-bar")).toContainText("已缓存");

  await page.reload();
  await expect(page.getByText("occt-cube-mm.step", { exact: true })).toBeVisible();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-reference-kind",
    "step",
  );
  await expect(
    page.locator(".tree-nav").getByRole("button", { name: /SMA 穿板棒状天线/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "移除 PCB 文件关联" }).click();
  await page.getByRole("combobox", { name: "外壳模板" }).selectOption(
    "wall-mount",
  );
  await exportSelect.selectOption("base-stl");
  const wallMountDownloadPromise = page.waitForEvent("download", {
    timeout: 60_000,
  });
  await page.locator(".manufacturing-export button").click();
  const wallMountPath = await (await wallMountDownloadPromise).path();
  expect(wallMountPath).not.toBeNull();
  const wallMountStl = readStlDimensions(await readFile(wallMountPath!));
  [122, 68, 26].forEach((dimension, axis) => {
    expect(wallMountStl.dimensions[axis]).toBeCloseTo(dimension, 1);
  });

  await page.screenshot({
    path: testInfo.outputPath("desktop-workbench.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("project parameters survive an immediate page reload", async ({ page }) => {
  await page.goto("/");
  const lengthInput = page.locator(".field-row").filter({ hasText: "长度" }).locator("input");
  await lengthInput.fill("123");
  await expect(lengthInput).toHaveValue("123");
  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("checkbox", { name: /启用天线/ }).check();

  await page.reload();

  await expect(
    page.locator(".field-row").filter({ hasText: "长度" }).locator("input"),
  ).toHaveValue("123");
  await expect(
    page.locator(".tree-nav").getByRole("button", { name: /SMA 穿板棒状天线/ }),
  ).toBeVisible();
});

test("narrow workbench stays framed and keeps the 3D canvas visible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const viewport = page.locator(".viewport-panel");
  const inspector = page.locator(".inspector-panel");
  const canvas = page.locator(".viewport-canvas canvas");
  await expect(viewport).toBeVisible();
  await expect(inspector).toBeVisible();
  await page.waitForTimeout(700);

  const viewportBox = await viewport.boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(viewportBox).not.toBeNull();
  expect(inspectorBox).not.toBeNull();
  expect(viewportBox!.y + viewportBox!.height).toBeLessThanOrEqual(
    inspectorBox!.y + 1,
  );

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  const pixels = await readScreenshotPixels(page, canvas);
  expect(pixels.colorCount).toBeGreaterThan(16);
  expect(pixels.luminanceRange).toBeGreaterThan(30);

  await page.screenshot({
    path: testInfo.outputPath("narrow-workbench.png"),
    fullPage: true,
  });
});
