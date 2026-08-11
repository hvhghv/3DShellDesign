import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

const captureCheckpoints = process.env.CI !== "true";

async function captureVisualCheckpoint(
  page: Page,
  testInfo: TestInfo,
  filename: string,
): Promise<void> {
  if (!captureCheckpoints) return;
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}

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
  connectedComponents: number;
} {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const triangleCount = view.getUint32(80, true);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const parents = Array.from({ length: triangleCount }, (_, index) => index);
  const owners = new Map<string, number>();
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };
  const union = (first: number, second: number): void => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
  };

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const triangleOffset = 84 + triangle * 50;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = triangleOffset + 12 + vertex * 12;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(vertexOffset + axis * 4, true);
        minimum[axis] = Math.min(minimum[axis], value);
        maximum[axis] = Math.max(maximum[axis], value);
      }
      const key = [0, 1, 2]
        .map((axis) => view.getFloat32(vertexOffset + axis * 4, true).toFixed(5))
        .join(",");
      const owner = owners.get(key);
      if (owner === undefined) owners.set(key, triangle);
      else union(triangle, owner);
    }
  }

  return {
    triangleCount,
    dimensions: [
      maximum[0] - minimum[0],
      maximum[1] - minimum[1],
      maximum[2] - minimum[2],
    ],
    connectedComponents: new Set(
      Array.from({ length: triangleCount }, (_, index) => find(index)),
    ).size,
  };
}

async function chooseDevice(
  page: Page,
  kind: "接口" | "天线",
  name: string,
  surface?: string,
): Promise<void> {
  await page
    .getByRole("button", {
      name: kind === "接口" ? "添加接口或器件" : `添加${kind}`,
    })
    .click();
  const picker = page.getByRole("dialog", {
    name: kind === "接口" ? "添加接口/器件选择器" : "添加天线选择器",
  });
  await expect(picker).toBeVisible();
  if (surface) {
    await picker.getByRole("combobox", { name: "安装位置" }).selectOption(surface);
  }
  await picker.getByText(name, { exact: true }).click();
  await expect(picker).toHaveCount(0);
}

async function addConnector(
  page: Page,
  name = "USB Type-C 母座",
  surface?: string,
) {
  await chooseDevice(page, "接口", name, surface);
}

async function addAntenna(
  page: Page,
  name = "SMA 穿板棒状天线",
  surface?: string,
) {
  await chooseDevice(page, "天线", name, surface);
}

async function selectBasePart(page: Page) {
  await page
    .locator(".tree-nav")
    .getByRole("button", { name: /^壳体主体/ })
    .click();
}

async function enterViewportEditMode(page: Page) {
  const viewport = page.locator(".viewport-canvas");
  await expect(viewport).toHaveAttribute("data-transform-edit-mode", "false");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Tab");
  await expect(viewport).toHaveAttribute("data-transform-edit-mode", "true");
}

async function exportManufacturingStl(page: Page, option: string) {
  await page
    .locator(".tree-item")
    .filter({ hasText: "PCB 控制器外壳" })
    .click();
  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });
  await exportSelect.selectOption(option);
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.locator(".manufacturing-export button").click();
  const path = await (await downloadPromise).path();
  expect(path).not.toBeNull();
  const mesh = readStlDimensions(await readFile(path!));
  expect(mesh.connectedComponents).toBe(1);
  return mesh;
}

test("camera orbit reaches the enclosure underside @smoke", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const viewport = page.locator(".viewport-canvas");
  const canvas = viewport.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width * 0.12, box!.y + box!.height * 0.84);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * 0.12,
    box!.y + box!.height * 0.14,
    { steps: 16 },
  );
  await page.mouse.up();

  await expect.poll(async () =>
    Number(await viewport.getAttribute("data-camera-polar-angle")),
  ).toBeGreaterThan(Math.PI / 2 + 0.1);
  await expect(viewport).toHaveAttribute("data-camera-below-work-plane", "true");
  await captureVisualCheckpoint(page, testInfo, "underside-orbit.png");
});

test("independently hides and restores enclosure faces", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const canvas = page.locator(".viewport-canvas canvas");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot({ type: "png" });
  const frontToggle = page.getByRole("checkbox", { name: "前壁显示" });
  const topToggle = page.getByRole("checkbox", { name: "顶部显示" });
  const bottomToggle = page.getByRole("checkbox", { name: "底板显示" });
  await expect(frontToggle).toBeChecked();
  await frontToggle.uncheck();
  await expect(frontToggle).not.toBeChecked();
  await expect(topToggle).toBeChecked();
  await expect(bottomToggle).toBeChecked();
  const frontHidden = await canvas.screenshot({ type: "png" });
  expect(frontHidden.equals(before)).toBe(false);

  await topToggle.uncheck();
  await bottomToggle.uncheck();
  await expect(topToggle).not.toBeChecked();
  await expect(bottomToggle).not.toBeChecked();
  await captureVisualCheckpoint(
    page,
    testInfo,
    "independent-face-visibility.png",
  );

  await page.getByRole("button", { name: "显示全部壳体面" }).click();
  await expect(frontToggle).toBeChecked();
  await expect(topToggle).toBeChecked();
  await expect(bottomToggle).toBeChecked();
});

test("configures primary and extra removable faces from the left sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const tree = page.locator(".tree-nav");
  const primaryFaceSelect = tree.getByRole("combobox", {
    name: "主可拆面位置",
  });
  await expect(primaryFaceSelect).toBeVisible();
  await expect(
    page.locator(".inspector-panel").getByRole("combobox", {
      name: "主可拆面位置",
    }),
  ).toHaveCount(0);

  await primaryFaceSelect.selectOption("bottom");
  const bottomRemovable = tree.getByRole("checkbox", { name: "底板可拆卸" });
  const frontRemovable = tree.getByRole("checkbox", { name: "前壁可拆卸" });
  await expect(bottomRemovable).toBeChecked();
  await expect(bottomRemovable).toBeDisabled();
  await frontRemovable.check();
  await expect(frontRemovable).toBeChecked();
  await expect(
    tree.getByRole("button", { name: /可拆面（底板、前壁）/ }),
  ).toBeVisible();

  await selectBasePart(page);
  await page.getByRole("tab", { name: "尺寸" }).click();
  await expect(
    page.locator(".inspector-panel").getByRole("combobox", {
      name: "主可拆面位置",
    }),
  ).toHaveCount(0);
});

test("renders and exports the default enclosure @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
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

  await page
    .locator(".tree-nav")
    .getByRole("button", { name: /^可拆面/ })
    .click();
  await page.getByRole("button", { name: "聚焦选中零件" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "lid",
  );
  expect(await page.locator(".tree-item.is-context-hidden").count()).toBeGreaterThan(3);
  await selectBasePart(page);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "base",
  );
  await page.getByRole("button", { name: "显示全部零件", exact: true }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-focused-part",
    "all",
  );
  await expect(page.locator(".tree-item.is-context-hidden")).toHaveCount(0);

  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("button", { name: "磁吸", exact: true }).click();
  const magnetSupportSelect = page.getByRole("combobox", { name: "磁铁承托方式" });
  await expect(magnetSupportSelect).toBeVisible();
  await expect(magnetSupportSelect).toHaveValue("corner-shelf");
  await magnetSupportSelect.selectOption("perimeter-flange");
  await expect(
    page.locator(".tree-nav").getByText("四周内翻边", { exact: true }),
  ).toBeVisible();
  await magnetSupportSelect.selectOption("corner-shelf");
  await page.getByRole("button", { name: "装配或爆炸视图" }).click();
  await page.waitForTimeout(300);
  await captureVisualCheckpoint(page, testInfo, "magnet-corner-shelf.png");

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
    { option: "lid-stl", filename: "3dshell-lid.stl", size: [108, 78, 4.25] },
    { option: "panel-stl:panel-1", filename: "3dshell-panel-1.stl", size: [62.64, 40.56, 2] },
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
    if (exportCase.option === "base-stl") {
      expect(parsed.connectedComponents).toBe(1);
    }
  }

  for (const supportType of ["wall-bracket", "perimeter-flange"] as const) {
    await magnetSupportSelect.selectOption(supportType);
    await exportSelect.selectOption("base-stl");
    const supportDownloadPromise = page.waitForEvent("download", {
      timeout: 60_000,
    });
    await page.locator(".manufacturing-export button").click();
    const supportPath = await (await supportDownloadPromise).path();
    expect(supportPath).not.toBeNull();
    expect(
      readStlDimensions(await readFile(supportPath!)).connectedComponents,
    ).toBe(1);
  }

  await page.getByRole("tab", { name: "尺寸" }).click();
  const boardClearanceInput = page
    .locator(".field-row")
    .filter({ hasText: "板边间隙" })
    .locator("input");
  await boardClearanceInput.fill("10");
  await page.getByRole("tab", { name: "结构" }).click();
  await magnetSupportSelect.selectOption("floor-column");
  await exportSelect.selectOption("base-stl");
  const columnDownloadPromise = page.waitForEvent("download", {
    timeout: 60_000,
  });
  await page.locator(".manufacturing-export button").click();
  const columnPath = await (await columnDownloadPromise).path();
  expect(columnPath).not.toBeNull();
  expect(
    readStlDimensions(await readFile(columnPath!)).connectedComponents,
  ).toBe(1);
  await magnetSupportSelect.selectOption("corner-shelf");
  await page.getByRole("tab", { name: "尺寸" }).click();
  await boardClearanceInput.fill("2");
  await page.getByRole("tab", { name: "结构" }).click();

  await expect(page.getByText(/三角面/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("exports antenna cutouts and BOM data @manufacturing", async ({ page }) => {
  test.setTimeout(420_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("button", { name: "磁吸", exact: true }).click();
  const baseTriangleCount = (
    await exportManufacturingStl(page, "base-stl")
  ).triangleCount;
  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });

  await addAntenna(page);
  await page.getByRole("combobox", { name: "天线 1 安装位置" }).selectOption(
    "left",
  );
  await page
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input")
    .fill("30");
  await expect(
    page.getByRole("button", { name: /SMA 穿板棒状天线.*2\.4 GHz/ }),
  ).toBeVisible();
  await addAntenna(page);
  await page
    .getByRole("combobox", { name: "天线 2 安装位置" })
    .selectOption("panel:panel-1");
  const panelAntennaInspector = page.getByRole("complementary", {
    name: "天线检查器",
  });
  await panelAntennaInspector
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input")
    .fill("20");
  await panelAntennaInspector
    .locator(".field-row")
    .filter({ hasText: "纵向偏移" })
    .locator("input")
    .fill("0");
  await selectBasePart(page);

  await exportSelect.selectOption("base-stl");
  const antennaBasePromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const antennaBasePath = await (await antennaBasePromise).path();
  expect(antennaBasePath).not.toBeNull();
  const antennaBase = readStlDimensions(await readFile(antennaBasePath!));
  expect(antennaBase.connectedComponents).toBe(1);
  expect(antennaBase.triangleCount).not.toBe(baseTriangleCount);

  await exportSelect.selectOption("panel-dxf:panel-1");
  const dxfDownloadPromise = page.waitForEvent("download");
  await page.locator(".manufacturing-export button").click();
  const dxfDownload = await dxfDownloadPromise;
  expect(dxfDownload.suggestedFilename()).toBe("3dshell-panel-1.dxf");
  const dxfPath = await dxfDownload.path();
  expect(dxfPath).not.toBeNull();
  const dxf = (await readFile(dxfPath!)).toString("utf8");
  expect(dxf).toContain("LWPOLYLINE");
  expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(5);
  await page
    .locator(".tree-nav")
    .getByRole("button", { name: /SMA 穿板棒状天线.*面板/ })
    .click();
  await page.getByRole("button", { name: "删除当前天线" }).click();
  await selectBasePart(page);

  await exportSelect.selectOption("bom-csv");
  const bomDownloadPromise = page.waitForEvent("download");
  await page.locator(".manufacturing-export button").click();
  const bomDownload = await bomDownloadPromise;
  expect(bomDownload.suggestedFilename()).toBe("3dshell-bom.csv");
  const bomPath = await bomDownload.path();
  expect(bomPath).not.toBeNull();
  const bom = (await readFile(bomPath!)).toString("utf8");
  expect(bom).toContain("USB Type-C 母座");
  expect(bom).toContain("圆形磁铁,8,直径 6 x 1.8 mm");
  expect(bom).toContain("双壁角托；装配前确认磁极");
  expect(bom).toContain("SMA 穿板棒状天线");
  await page
    .locator(".tree-item")
    .filter({ hasText: "SMA 穿板棒状天线" })
    .click();
  await page.getByRole("button", { name: "删除当前天线" }).click();
  expect(pageErrors).toEqual([]);
});

test("exports connector and surface placement geometry @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();
  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });

  await page.getByRole("button", { name: "螺丝", exact: true }).click();
  await page.getByRole("combobox", { name: "紧固件规格" }).selectOption(
    "m3-heat-set",
  );
  await page.getByRole("combobox", { name: "接口 1 器件" }).selectOption(
    "dc-5521-jack",
  );
  await expect(
    page.getByRole("button", { name: "DC 5.5/2.1 母座 前壁" }),
  ).toBeVisible();
  await selectBasePart(page);
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

  await addConnector(page);
  const secondConnector = page.locator(".connector-placement");
  await page
    .getByRole("combobox", { name: "接口 2 安装位置" })
    .selectOption("right");
  await page
    .getByRole("combobox", { name: "接口 2 面内旋转" })
    .selectOption("90");
  await secondConnector
    .locator(".field-row")
    .filter({ hasText: "纵向偏移" })
    .locator("input")
    .fill("0");
  await expect(
    page.getByRole("button", { name: "USB Type-C 母座 右壁" }),
  ).toBeVisible();
  await selectBasePart(page);
  await exportSelect.selectOption("base-stl");
  const multiConnectorDownloadPromise = page.waitForEvent("download", {
    timeout: 60_000,
  });
  await page.locator(".manufacturing-export button").click();
  const multiConnectorPath = await (await multiConnectorDownloadPromise).path();
  expect(multiConnectorPath).not.toBeNull();
  const multiConnectorStl = readStlDimensions(
    await readFile(multiConnectorPath!),
  );
  expect(multiConnectorStl.connectedComponents).toBe(1);
  expect(multiConnectorStl.triangleCount).toBeGreaterThan(libraryStl.triangleCount);

  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("back");
  await expect(page.locator(".tree-nav").getByText(/后壁 · .* mm/)).toBeVisible();
  await selectBasePart(page);
  await exportSelect.selectOption("base-stl");
  const sidePanelBasePromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const sidePanelBasePath = await (await sidePanelBasePromise).path();
  expect(sidePanelBasePath).not.toBeNull();
  expect(
    readStlDimensions(await readFile(sidePanelBasePath!)).connectedComponents,
  ).toBe(1);

  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  await page
    .getByRole("combobox", { name: "接口 2 安装位置" })
    .selectOption("panel:panel-1");
  await page
    .getByRole("combobox", { name: "接口 2 面内旋转" })
    .selectOption("0");
  await secondConnector
    .locator(".field-row")
    .filter({ hasText: "纵向偏移" })
    .locator("input")
    .fill("0");
  await selectBasePart(page);
  await exportSelect.selectOption("panel-stl:panel-1");
  const panelConnectorPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const panelConnectorPath = await (await panelConnectorPromise).path();
  expect(panelConnectorPath).not.toBeNull();
  expect(
    readStlDimensions(await readFile(panelConnectorPath!)).connectedComponents,
  ).toBe(1);
  await exportSelect.selectOption("panel-dxf:panel-1");
  const panelConnectorDxfPromise = page.waitForEvent("download");
  await page.locator(".manufacturing-export button").click();
  const panelConnectorDxfPath = await (await panelConnectorDxfPromise).path();
  expect(panelConnectorDxfPath).not.toBeNull();
  const panelConnectorDxf = (await readFile(panelConnectorDxfPath!)).toString(
    "utf8",
  );
  expect(panelConnectorDxf.match(/\r\nLWPOLYLINE\r\n/g)).toHaveLength(2);

  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  await page
    .getByRole("combobox", { name: "接口 2 安装位置" })
    .selectOption("top");
  await selectBasePart(page);
  await exportSelect.selectOption("lid-stl");
  const topConnectorPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const topConnectorPath = await (await topConnectorPromise).path();
  expect(topConnectorPath).not.toBeNull();
  expect(
    readStlDimensions(await readFile(topConnectorPath!)).connectedComponents,
  ).toBe(1);

  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("right");
  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  for (const connectorFace of ["back", "left", "bottom"] as const) {
    await page
      .locator(".tree-item")
      .filter({ hasText: "USB Type-C 母座" })
      .click();
    await page
      .getByRole("combobox", { name: "接口 2 安装位置" })
      .selectOption(connectorFace);
    await selectBasePart(page);
    await exportSelect.selectOption("base-stl");
    const faceConnectorPromise = page.waitForEvent("download", {
      timeout: 60_000,
    });
    await page.locator(".manufacturing-export button").click();
    const faceConnectorPath = await (await faceConnectorPromise).path();
    expect(faceConnectorPath).not.toBeNull();
    expect(
      readStlDimensions(await readFile(faceConnectorPath!)).connectedComponents,
    ).toBe(1);
  }

  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  await page.getByRole("button", { name: "删除当前接口" }).click();
  await page
    .getByRole("combobox", { name: "接口 1 安装位置" })
    .selectOption("top");
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await page
    .getByRole("complementary", { name: "面板检查器" })
    .locator(".field-row")
    .filter({ hasText: "嵌入深度" })
    .locator("input")
    .fill("1.2");
  for (const panelFace of ["front", "back", "left", "right", "bottom"] as const) {
    await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
    await page.getByRole("combobox", { name: "面板所在面" }).selectOption(panelFace);
    await selectBasePart(page);
    await exportSelect.selectOption("base-stl");
    const facePanelPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.locator(".manufacturing-export button").click();
    const facePanelPath = await (await facePanelPromise).path();
    expect(facePanelPath).not.toBeNull();
    expect(
      readStlDimensions(await readFile(facePanelPath!)).connectedComponents,
    ).toBe(1);
  }
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("front");
  await captureVisualCheckpoint(page, testInfo, "surface-placement.png");
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("back");
  expect(pageErrors).toEqual([]);
});

test("exports closures, patterns, imports and templates @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const canvas = page.locator(".viewport-canvas canvas");
  await expect(canvas).toBeVisible();
  const defaultBase = await exportManufacturingStl(page, "base-stl");
  await page.getByRole("tab", { name: "结构" }).click();
  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });
  await selectBasePart(page);

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
  expect(hingeStl.triangleCount).toBeGreaterThan(defaultBase.triangleCount);
  expect(hingeStl.dimensions[1]).toBeGreaterThan(78);

  await page.getByRole("button", { name: "滑盖", exact: true }).click();
  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption(
    "slide",
  );
  await selectBasePart(page);
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
  await selectBasePart(page);
  await page.getByRole("combobox", { name: "镂空阵列类型" }).selectOption("none");

  await page.getByRole("tab", { name: "尺寸" }).click();
  await page.locator('input[type="file"][accept=".kicad_pcb"]').setInputFiles(
    "tests/fixtures/controller.kicad_pcb",
  );
  await expect(page.getByText("controller.kicad_pcb", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 个安装孔/)).toBeVisible();
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
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
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
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
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
  await expect(
    page.locator(".field-row").filter({ hasText: "长度" }).locator("input"),
  ).toHaveValue("80");
  await expect(
    page.locator(".field-row").filter({ hasText: "宽度" }).locator("input"),
  ).toHaveValue("50");
  const stepPixels = await readScreenshotPixels(page, canvas);
  expect(stepPixels.colorCount).toBeGreaterThan(20);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-reference-kind",
    "multiple",
  );
  await expect(page.locator(".status-bar")).toContainText(/缓存已就绪|已缓存/);

  await page.reload();
  await expect(
    page.locator(".tree-item").filter({ hasText: "occt-cube-mm.step" }),
  ).toBeVisible();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-reference-kind",
    "multiple",
  );
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "移除 PCB 文件关联" }).click();
  }
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

  await captureVisualCheckpoint(page, testInfo, "desktop-workbench.png");
  expect(pageErrors).toEqual([]);
});

test("device pickers create only the selected connector and antenna @smoke", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const tree = page.locator(".tree-nav");
  await expect(tree.locator(".tree-item").filter({ hasText: "USB Type-C 母座" })).toHaveCount(1);

  await page.getByRole("button", { name: "添加接口或器件" }).click();
  const connectorPicker = page.getByRole("dialog", {
    name: "添加接口/器件选择器",
  });
  await expect(connectorPicker).toBeVisible();
  const compactFpcPicker = connectorPicker.locator(".device-picker-fpc-group");
  await expect(compactFpcPicker.getByRole("combobox", { name: "FPC 间距" })).toHaveValue(
    "0.5",
  );
  await expect(compactFpcPicker.getByRole("combobox", { name: "FPC 针数" })).toHaveValue(
    "5",
  );
  await expect(compactFpcPicker.locator(".device-picker-item")).toHaveCount(0);
  await captureVisualCheckpoint(page, testInfo, "compact-fpc-picker.png");
  await page.keyboard.press("Escape");
  await expect(connectorPicker).toHaveCount(0);
  await page.getByRole("button", { name: "添加接口或器件" }).click();
  await expect(connectorPicker).toBeVisible();
  await expect(tree.locator(".tree-item").filter({ hasText: "USB Type-C 母座" })).toHaveCount(1);
  await connectorPicker
    .getByRole("searchbox", { name: "搜索添加接口/器件" })
    .fill("1.0 mm 40P FPC");
  await connectorPicker
    .locator(".device-picker-item")
    .filter({ hasText: "1.0 mm 40P FPC 端子" })
    .click();
  await expect(
    tree.locator(".tree-item").filter({ hasText: "1.0 mm 40P FPC 端子" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "接口 2 器件" })).toHaveValue(
    "fpc-40p-10",
  );

  await page.getByRole("button", { name: "添加接口或器件" }).click();
  await expect(connectorPicker).toBeVisible();
  await connectorPicker
    .getByRole("searchbox", { name: "搜索添加接口/器件" })
    .fill("1.25");
  await expect(connectorPicker.locator(".device-picker-item")).toHaveCount(3);
  await expect(connectorPicker.getByText("1.25 mm 2P 线对板端子", { exact: true })).toBeVisible();
  await expect(connectorPicker.getByText("1.25 mm 4P 线对板端子", { exact: true })).toBeVisible();
  await expect(connectorPicker.getByText("1.25 mm 5P 线对板端子", { exact: true })).toBeVisible();
  expect(
    await connectorPicker.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await captureVisualCheckpoint(page, testInfo, "connector-picker-surface.png");
  await connectorPicker
    .locator(".device-picker-item")
    .filter({ hasText: "1.25 mm 4P 线对板端子" })
    .click();
  await expect(connectorPicker).toHaveCount(0);
  await expect(tree.locator(".tree-item").filter({ hasText: "1.25 mm 4P 线对板端子" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "接口 3 器件" })).toHaveValue(
    "terminal-125-4p",
  );

  await page.getByRole("button", { name: "添加接口或器件" }).click();
  await expect(connectorPicker).toBeVisible();
  await expect(connectorPicker.getByText("显示屏")).toBeVisible();
  await expect(
    connectorPicker
      .locator(".device-picker-group")
      .filter({ hasText: "显示屏" })
      .locator(".device-picker-item"),
  ).toHaveCount(7);
  await connectorPicker
    .getByRole("searchbox", { name: "搜索添加接口/器件" })
    .fill("MSP4021");
  await connectorPicker
    .locator(".device-picker-item")
    .filter({ hasText: "LCDWIKI 4.0寸 SPI 屏 MSP4021" })
    .click();
  await expect(connectorPicker).toHaveCount(0);
  await expect(
    tree.locator(".tree-item").filter({ hasText: "LCDWIKI 4.0寸 SPI 屏 MSP4021" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "接口 4 器件" })).toHaveValue(
    "lcdwiki-msp4021",
  );
  const displayInspector = page.getByRole("complementary", {
    name: "接口检查器",
  });
  await expect(displayInspector).toContainText("显示屏参数");
  await expect(displayInspector).toContainText("4.0寸 SPI 屏");
  await expect(displayInspector).toContainText("320x480 · 电阻触摸");
  await expect(displayInspector).toContainText("固定方式");

  await page.getByRole("button", { name: "添加天线" }).click();
  const antennaPicker = page.getByRole("dialog", { name: "添加天线选择器" });
  await expect(antennaPicker).toBeVisible();
  await antennaPicker
    .locator(".device-picker-item")
    .filter({ hasText: "RP-SMA 穿板棒状天线" })
    .click();
  await expect(antennaPicker).toHaveCount(0);
  await expect(tree.locator(".tree-item").filter({ hasText: "RP-SMA 穿板棒状天线" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "天线 1 类型" })).toHaveValue(
    "rp-sma-bulkhead-whip",
  );
});

test("searches, duplicates, undoes and redoes assembly features", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator(".status-bar")).toContainText(/缓存已就绪|已缓存/);

  const tree = page.locator(".tree-nav");
  const connectorItems = tree.locator(".tree-item").filter({ hasText: "USB Type-C 母座" });
  await expect(connectorItems).toHaveCount(1);
  await connectorItems.first().click({ button: "right" });
  const menu = page.getByRole("menu", { name: /USB Type-C 母座.*操作菜单/ });
  await menu.getByRole("menuitem", { name: "复制" }).click();
  await expect(connectorItems).toHaveCount(2);

  const undoButton = page.getByRole("button", { name: "撤销", exact: true });
  const redoButton = page.getByRole("button", { name: "重做", exact: true });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(connectorItems).toHaveCount(1);
  await expect(redoButton).toBeEnabled();
  await redoButton.click();
  await expect(connectorItems).toHaveCount(2);

  await connectorItems.last().click();
  await page.keyboard.press("Control+d");
  await expect(connectorItems).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(connectorItems).toHaveCount(2);

  const search = page.getByRole("searchbox", { name: "筛选对象" });
  await search.fill("USB Type-C");
  await expect(connectorItems).toHaveCount(2);
  await expect(page.getByText("2 个匹配", { exact: true })).toBeVisible();
  await search.fill("不存在的对象");
  await expect(connectorItems).toHaveCount(0);
  await expect(page.getByText("0 个匹配", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除对象筛选" }).click();
  await expect(connectorItems).toHaveCount(2);

  await captureVisualCheckpoint(page, testInfo, "assembly-search-history.png");
});

test("hides, locks and restores individual assembly features", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const connectorItem = page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .first();
  await connectorItem.click({ button: "right" });
  let menu = page.getByRole("menu", { name: /USB Type-C 母座.*操作菜单/ });
  await menu.getByRole("menuitem", { name: "隐藏" }).click();
  await expect(connectorItem).toHaveClass(/is-feature-hidden/);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-selected-feature-readonly",
    "true",
  );
  const stateBanner = page.locator(".feature-state-banner");
  await expect(stateBanner).toContainText("对象已隐藏");
  await stateBanner.getByRole("button", { name: "显示对象" }).click();
  await expect(connectorItem).not.toHaveClass(/is-feature-hidden/);

  await connectorItem.click({ button: "right" });
  menu = page.getByRole("menu", { name: /USB Type-C 母座.*操作菜单/ });
  await menu.getByRole("menuitem", { name: "锁定" }).click();
  await expect(connectorItem).toHaveClass(/is-feature-locked/);
  await expect(stateBanner).toContainText("对象已锁定");
  await expect(
    page.getByRole("complementary", { name: "接口检查器" })
      .locator("input")
      .first(),
  ).not.toBeEditable();
  await page.keyboard.press("Delete");
  await expect(connectorItem).toHaveCount(1);
  await captureVisualCheckpoint(page, testInfo, "feature-visibility-locking.png");
  await stateBanner.getByRole("button", { name: "解锁对象" }).click();
  await expect(connectorItem).not.toHaveClass(/is-feature-locked/);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-selected-feature-readonly",
    "false",
  );
});

test("hides and restores battery compartments from the tree and inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "添加电池仓" }).click();
  const batteryPicker = page.getByRole("dialog", { name: "添加电池仓选择器" });
  await batteryPicker.getByRole("button", { name: "AA 电池仓", exact: true }).click();

  const batteryItem = page
    .locator(".tree-item")
    .filter({ hasText: "电池仓 1" })
    .first();
  const batteryVisibility = page.getByRole("group", { name: "电池仓显示" });
  const batteryToggle = batteryVisibility.getByRole("checkbox", {
    name: "电池仓 1显示",
  });
  await expect(batteryToggle).toBeChecked();

  const batteryInspector = page.getByRole("complementary", {
    name: "电池仓检查器",
  });
  await batteryInspector.getByRole("button", { name: "隐藏当前电池仓" }).click();
  await expect(batteryToggle).not.toBeChecked();
  await expect(batteryItem).toHaveClass(/is-feature-hidden/);
  await expect(page.locator(".feature-state-banner")).toContainText("对象已隐藏");

  await page.getByRole("button", { name: "显示全部电池仓" }).click();
  await expect(batteryToggle).toBeChecked();
  await expect(batteryItem).not.toHaveClass(/is-feature-hidden/);

  await batteryToggle.uncheck();
  await expect(batteryItem).toHaveClass(/is-feature-hidden/);
  await batteryToggle.check();
  await expect(batteryItem).not.toHaveClass(/is-feature-hidden/);
});

test("hides and restores interface devices from the tree and inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const connectorItem = page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .first();
  await connectorItem.click();
  const connectorVisibility = page.getByRole("group", { name: "接口/器件显示" });
  const connectorToggle = connectorVisibility.getByRole("checkbox", {
    name: "接口/器件 1显示",
  });
  await expect(connectorToggle).toBeChecked();

  const connectorInspector = page.getByRole("complementary", {
    name: "接口检查器",
  });
  await connectorInspector.getByRole("button", { name: "隐藏当前接口" }).click();
  await expect(connectorToggle).not.toBeChecked();
  await expect(connectorItem).toHaveClass(/is-feature-hidden/);
  await expect(page.locator(".feature-state-banner")).toContainText("对象已隐藏");

  await page.getByRole("button", { name: "显示全部接口/器件" }).click();
  await expect(connectorToggle).toBeChecked();
  await expect(connectorItem).not.toHaveClass(/is-feature-hidden/);

  await connectorToggle.uncheck();
  await expect(connectorItem).toHaveClass(/is-feature-hidden/);
  await connectorToggle.check();
  await expect(connectorItem).not.toHaveClass(/is-feature-hidden/);
});

test("panel editor clamps placement and supports context deletion", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "添加面板" }).click();
  const panelItem = page.getByRole("button", { name: /^面板 2 / });
  await expect(panelItem).toBeVisible();
  await panelItem.click();

  const panelInspector = page.getByRole("complementary", { name: "面板检查器" });
  await expect(panelInspector).toBeVisible();
  await expect(page.getByRole("tablist", { name: "参数类别" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "面板参数" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "接口参数" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "制造导出" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "面板所在面" })).toHaveValue(
    "bottom",
  );

  const horizontalOffset = panelInspector
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input");
  await horizontalOffset.fill("41.5");
  await horizontalOffset.press("Enter");
  await expect(horizontalOffset).toHaveValue("20.68");
  expect(
    await panelInspector.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "装配或爆炸视图" }).click();
  await panelItem.click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "面板 2 操作菜单" });
  await expect(contextMenu).toBeVisible();
  const menuBox = await contextMenu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1440);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(900);
  await captureVisualCheckpoint(page, testInfo, "panel-context-menu.png");
  await contextMenu.getByRole("menuitem", { name: "删除" }).click();
  await expect(panelItem).toHaveCount(0);
});

test("device pickers choose the target surface and Delete removes selections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const connectorName = "1.25 mm 4P 线对板端子";
  await addConnector(page, connectorName, "bottom");
  const connectorItem = page.locator(".tree-item").filter({
    hasText: connectorName,
  });
  await expect(connectorItem).toContainText("底板");
  await expect(
    page.getByRole("combobox", { name: "接口 2 安装位置" }),
  ).toHaveValue("bottom");
  await page.keyboard.press("Delete");
  await expect(connectorItem).toHaveCount(0);

  const antennaName = "RP-SMA 穿板棒状天线";
  await addAntenna(page, antennaName, "left");
  const antennaItem = page.locator(".tree-item").filter({ hasText: antennaName });
  await expect(antennaItem).toContainText("左壁");
  await expect(
    page.getByRole("combobox", { name: "天线 1 安装位置" }),
  ).toHaveValue("left");

  const offsetInput = page
    .getByRole("complementary", { name: "天线检查器" })
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input");
  await offsetInput.focus();
  await page.keyboard.press("Delete");
  await expect(antennaItem).toHaveCount(1);

  await antennaItem.click();
  await page.keyboard.press("Delete");
  await expect(antennaItem).toHaveCount(0);

  const panelItem = page.locator(".tree-item").filter({ hasText: "面板 1" });
  await panelItem.click();
  await page.keyboard.press("Delete");
  await expect(panelItem).toHaveCount(0);
});

test("supports inset panels, custom geometry and multiple PCB references @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  const panelInspector = page.getByRole("complementary", { name: "面板检查器" });
  const insetInput = panelInspector
    .locator(".field-row")
    .filter({ hasText: "嵌入深度" })
    .locator("input");
  await insetInput.fill("1.2");
  await expect(insetInput).toHaveValue("1.2");
  await captureVisualCheckpoint(page, testInfo, "inset-panel.png");
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
  const insetLidDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page
    .getByRole("combobox", { name: "制造导出格式" })
    .selectOption("lid-stl");
  await page.locator(".manufacturing-export button").click();
  const insetLidPath = await (await insetLidDownloadPromise).path();
  expect(insetLidPath).not.toBeNull();
  expect(readStlDimensions(await readFile(insetLidPath!)).triangleCount).toBeGreaterThan(100);

  await page.getByRole("button", { name: "添加自定义组件" }).click();
  let customPicker = page.getByRole("dialog", { name: "添加自定义组件选择器" });
  await customPicker.getByRole("button", { name: "长方体" }).click();
  let customInspector = page.getByRole("complementary", {
    name: "自定义组件检查器",
  });
  await customInspector
    .locator(".field-row")
    .filter({ hasText: "宽度" })
    .locator("input")
    .fill("18");
  await expect(
    page.locator(".tree-item").filter({ hasText: "自定义长方体" }),
  ).toContainText("18.0 × 8.0 × 10.0 mm");

  await page.getByRole("button", { name: "添加自定义组件" }).click();
  customPicker = page.getByRole("dialog", { name: "添加自定义组件选择器" });
  await customPicker.getByRole("button", { name: "圆柱体" }).click();
  await expect(
    page.locator(".tree-item").filter({ hasText: "自定义圆柱体" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "添加自定义组件" }).click();
  const modelInput = page.locator('input[type="file"][accept=".step,.stp,.stl,.obj"]');
  await modelInput.setInputFiles({
    name: "sensor.obj",
    mimeType: "text/plain",
    buffer: Buffer.from([
      "v 0 0 0",
      "v 10 0 0",
      "v 0 8 0",
      "v 0 0 6",
      "f 1 2 3",
      "f 1 4 2",
      "f 1 3 4",
      "f 2 4 3",
    ].join("\n")),
  });
  await expect(
    page.locator(".tree-item").filter({ hasText: "sensor.obj" }),
  ).toBeVisible();
  customInspector = page.getByRole("complementary", {
    name: "自定义组件检查器",
  });
  await expect(
    customInspector.getByRole("combobox", { name: "自定义组件几何类型" }),
  ).toHaveValue("model");
  await page.getByRole("button", { name: "添加自定义组件" }).click();
  await page
    .locator('input[type="file"][accept=".step,.stp,.stl,.obj"]')
    .setInputFiles("tests/fixtures/occt-cube-mm.step");
  await expect(
    page.locator(".tree-item").filter({ hasText: "occt-cube-mm.step" }),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "聚焦选中零件" }).click();
  await expect(page.locator(".viewport-focus-state")).toContainText(
    "仅显示：自定义组件",
  );
  await captureVisualCheckpoint(page, testInfo, "custom-components.png");
  await page.getByRole("button", { name: "显示全部零件", exact: true }).click();

  const pcbBuffer = await readFile("tests/fixtures/controller.kicad_pcb");
  await page.locator('input[type="file"][accept=".kicad_pcb"]').setInputFiles([
    { name: "main.kicad_pcb", mimeType: "text/plain", buffer: pcbBuffer },
    { name: "aux.kicad_pcb", mimeType: "text/plain", buffer: pcbBuffer },
  ]);
  const pcbItems = page.locator(".tree-item").filter({ hasText: /^PCB [12]/ });
  await expect(pcbItems).toHaveCount(2);
  await pcbItems.nth(1).click();
  const pcbInspector = page.getByRole("complementary", { name: "PCB 检查器" });
  const elevationInput = pcbInspector
    .locator(".field-row")
    .filter({ hasText: "Y 偏移" })
    .locator("input");
  await expect(elevationInput).toHaveValue("5");
  await elevationInput.fill("8");
  await pcbInspector
    .getByRole("combobox", { name: "PCB 2 平面旋转" })
    .selectOption("180");
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-reference-kind",
    "multiple",
  );
  await page.getByRole("button", { name: "聚焦选中零件" }).click();
  await captureVisualCheckpoint(
    page,
    testInfo,
    "custom-components-multiple-pcb.png",
  );
});

test("supports battery trays and configurable panel screw mechanics @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  const panelInspector = page.getByRole("complementary", { name: "面板检查器" });
  const setPanelValue = async (label: string, value: string) => {
    const input = panelInspector
      .locator(".field-row")
      .filter({ hasText: label })
      .locator("input");
    await input.fill(value);
    await expect(input).toHaveValue(value);
  };
  await setPanelValue("嵌入深度", "0");
  await setPanelValue("圆角半径", "7");
  await setPanelValue("嵌入边框宽度", "3.5");
  await setPanelValue("螺丝横向边距", "8");
  await setPanelValue("螺丝纵向边距", "7");
  await panelInspector
    .getByRole("checkbox", { name: "面板螺丝头嵌入" })
    .check();
  await setPanelValue("螺丝沉孔深度", "1.3");

  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
  await page
    .getByRole("checkbox", { name: "可拆面螺丝头嵌入" })
    .check();
  const closureSection = page.locator(".inspector-section").filter({
    has: page.getByRole("heading", { name: "可拆面固定" }),
  });
  const closureRecessDepth = closureSection.getByRole("spinbutton", {
    name: "螺丝沉孔深度 mm",
  });
  await closureRecessDepth.fill("1.1");
  await expect(closureRecessDepth).toHaveValue("1.1");

  const lidTransparency = page.getByRole("checkbox", { name: "可拆面半透明" });
  await lidTransparency.check();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-lid-transparent",
    "true",
  );
  await captureVisualCheckpoint(page, testInfo, "flat-panel-screw-tabs.png");

  const exportSelect = page.getByRole("combobox", { name: "制造导出格式" });
  await exportSelect.selectOption("lid-stl");
  const lidDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const lidPath = await (await lidDownloadPromise).path();
  expect(lidPath).not.toBeNull();
  const lidMesh = readStlDimensions(await readFile(lidPath!));
  expect(lidMesh.connectedComponents).toBe(1);
  expect(lidMesh.dimensions[2]).toBeCloseTo(4.25, 1);

  await exportSelect.selectOption("panel-stl:panel-1");
  const panelDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const panelPath = await (await panelDownloadPromise).path();
  expect(panelPath).not.toBeNull();
  const panelMesh = readStlDimensions(await readFile(panelPath!));
  expect(panelMesh.connectedComponents).toBe(1);
  expect(panelMesh.dimensions[2]).toBeCloseTo(2, 1);

  await page.getByRole("button", { name: "添加电池仓" }).click();
  const batteryPicker = page.getByRole("dialog", { name: "添加电池仓选择器" });
  await batteryPicker
    .getByRole("button", { name: "AA 电池仓", exact: true })
    .click();
  const batteryInspector = page.getByRole("complementary", {
    name: "电池仓检查器",
  });
  const slots = batteryInspector
    .locator(".field-row")
    .filter({ hasText: "槽位数量" })
    .locator("input");
  await slots.fill("3");
  await expect(slots).toHaveValue("3");
  await batteryInspector
    .locator(".field-row")
    .filter({ hasText: "面内横向" })
    .locator("input")
    .fill("8");
  await batteryInspector
    .getByRole("combobox", { name: "电池仓 1 平面旋转" })
    .selectOption("180");
  await page.getByRole("button", { name: "聚焦选中零件" }).click();
  await captureVisualCheckpoint(page, testInfo, "battery-tray.png");
  await page.getByRole("button", { name: "显示全部零件", exact: true }).click();

  await selectBasePart(page);
  await exportSelect.selectOption("base-stl");
  const baseDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.locator(".manufacturing-export button").click();
  const basePath = await (await baseDownloadPromise).path();
  expect(basePath).not.toBeNull();
  expect(readStlDimensions(await readFile(basePath!)).connectedComponents).toBe(1);
});

test("supports paired magnetic panel pockets @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();

  const panelMounting = page.getByRole("combobox", { name: "面板固定方式" });
  await panelMounting.selectOption("magnet");
  await expect(
    page.locator(".tree-item").filter({ hasText: "面板 1" }),
  ).toContainText("磁吸");
  await captureVisualCheckpoint(page, testInfo, "magnetic-panel.png");
  await test.step("export magnetic panel", async () => {
    await exportManufacturingStl(page, "panel-stl:panel-1");
  });
  await test.step("export lid with matching magnetic pockets", async () => {
    await exportManufacturingStl(page, "lid-stl");
  });
});

test("supports integrated snap panel posts @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();

  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption("snap");
  await page
    .getByRole("combobox", { name: "面板 1 材料" })
    .selectOption("petg");
  await expect(page.getByText("面板 1 材料不适合弹性卡扣")).toHaveCount(0);
  await captureVisualCheckpoint(page, testInfo, "snap-panel.png");
  const snapPanelMesh = await test.step("export integrated snap panel", () =>
    exportManufacturingStl(page, "panel-stl:panel-1"),
  );
  expect(snapPanelMesh.dimensions[2]).toBeGreaterThan(4);
  await test.step("export lid snap receivers", async () => {
    await exportManufacturingStl(page, "lid-stl");
  });
});

test("supports press-latch quick-release lids @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption("slide");
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();

  await page.getByRole("button", { name: "快拆扣", exact: true }).click();
  await captureVisualCheckpoint(page, testInfo, "quick-latch-lid.png");
  await test.step("export press-latch base", async () => {
    await exportManufacturingStl(page, "base-stl");
  });
  await test.step("export press-latch lid", async () => {
    await exportManufacturingStl(page, "lid-stl");
  });
});

test("supports dual-pin quick-release lids @manufacturing", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "结构" }).click();
  await page.getByRole("combobox", { name: "面板固定方式" }).selectOption("slide");
  await page.locator(".tree-item").filter({ hasText: "PCB 控制器外壳" }).click();
  await page.getByRole("button", { name: "快拆销", exact: true }).click();
  await captureVisualCheckpoint(page, testInfo, "quick-pin-lid.png");
  const pinBaseMesh = await test.step("export quick-pin base", () =>
    exportManufacturingStl(page, "base-stl"),
  );
  const pinLidMesh = await test.step("export quick-pin lid", () =>
    exportManufacturingStl(page, "lid-stl"),
  );
  expect(pinBaseMesh.dimensions[1]).toBeGreaterThan(78);
  expect(pinLidMesh.dimensions[1]).toBeGreaterThan(78);
});

test("project parameters survive an immediate page reload @smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const lengthInput = page.locator(".field-row").filter({ hasText: "长度" }).locator("input");
  await lengthInput.fill("123");
  await expect(lengthInput).toHaveValue("123");
  await page.getByRole("tab", { name: "结构" }).click();
  await addAntenna(page);
  await addAntenna(page, "内贴 FPC 天线");
  await page
    .getByRole("combobox", { name: "天线 2 安装位置" })
    .selectOption("right");
  await page
    .getByRole("combobox", { name: "天线 2 面内旋转" })
    .selectOption("90");
  await addConnector(page);
  await page
    .getByRole("combobox", { name: "接口 2 安装位置" })
    .selectOption("right");
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("left");
  await page.getByRole("button", { name: "添加面板" }).click();
  await expect(
    page.locator(".tree-item").filter({ hasText: "面板 2" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "移动选中对象" })).toBeEnabled();
  await page.getByRole("button", { name: "缩放选中对象" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-transform-mode",
    "scale",
  );
  await page.getByRole("combobox", { name: "面板所在面" }).selectOption("right");

  await page.reload();

  await expect(
    page.locator(".field-row").filter({ hasText: "长度" }).locator("input"),
  ).toHaveValue("123");
  await expect(
    page.locator(".tree-nav").getByRole("button", { name: /SMA 穿板棒状天线/ }),
  ).toBeVisible();
  await expect(
    page.locator(".tree-nav").getByRole("button", { name: /内贴 FPC 天线.*右壁/ }),
  ).toBeVisible();
  await page
    .locator(".tree-nav")
    .getByRole("button", { name: /内贴 FPC 天线.*右壁/ })
    .click();
  await expect(page.getByRole("combobox", { name: "天线 2 类型" })).toHaveValue(
    "adhesive-fpc-antenna",
  );
  await expect(
    page.getByRole("combobox", { name: "天线 2 面内旋转" }),
  ).toHaveValue("90");
  await expect(page.locator(".tree-item").filter({ hasText: "面板 2" })).toBeVisible();
  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .nth(1)
    .click();
  await expect(
    page.getByRole("combobox", { name: "接口 2 安装位置" }),
  ).toHaveValue("right");
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await expect(page.getByRole("combobox", { name: "面板所在面" })).toHaveValue(
    "left",
  );
  await page.locator(".tree-item").filter({ hasText: "面板 2" }).click();
  await expect(page.getByRole("combobox", { name: "面板所在面" })).toHaveValue(
    "right",
  );
});

test("stale cached rail PCB positions are re-homed before editing @smoke", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "3dshell-designer.project.v1",
      JSON.stringify({
        schemaVersion: 1,
        name: "旧滑槽项目",
        updatedAt: "2026-08-10T00:00:00.000Z",
        pcbReference: null,
        parameters: {
          parametricPcbEnabled: true,
          pcbMountingType: "rail-elastic",
          pcbRailAxis: "z",
          pcbInsertionSide: "right",
          pcbRailEntryFace: "front",
          pcbOffsetX: 149.5,
          pcbElevation: 34.5,
          pcbOffsetZ: 10,
          pcbReferences: [],
        },
      }),
    );
  });

  await page.goto("/");
  await page
    .locator(".tree-nav .tree-item")
    .filter({ hasText: "参数 PCB" })
    .first()
    .click();

  const pcbInspector = page.getByRole("complementary", {
    name: "参数 PCB 检查器",
  });
  await expect(pcbInspector.getByRole("heading", { name: "PCB 位置" })).toBeVisible();
  await expect(pcbInspector.getByLabel("PCB 固定结构")).toHaveValue("rail-elastic");
  await expect(pcbInspector.getByLabel("X 位置")).toHaveValue("0");
  await expect(pcbInspector.getByLabel("Y 偏移")).toHaveValue("0");
  await expect(pcbInspector.getByLabel("Z 位置")).toHaveValue("0");
  await expect(pcbInspector.getByLabel("X 位置")).toBeDisabled();
  await expect(pcbInspector.getByLabel("Y 偏移")).toBeDisabled();
  await expect(pcbInspector.getByLabel("Z 位置")).toBeEnabled();
  await expect(pcbInspector.getByText(/只允许沿 Z 轴调整位置/)).toBeVisible();
});

test("connector and antenna editors stay contextual and support instances", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  await expect(page.getByRole("complementary", { name: "接口检查器" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "参数类别" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "接口参数" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "制造导出" })).toHaveCount(0);
  const connectorEditor = page.getByRole("complementary", { name: "接口检查器" });
  const connectorOffset = connectorEditor
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input");
  await expect(connectorOffset).toHaveValue("0");
  const canvas = page.locator(".viewport-canvas canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await enterViewportEditMode(page);
  await page.mouse.move(canvasBox!.x + 345, canvasBox!.y + 452);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 370, canvasBox!.y + 462, { steps: 8 });
  await page.mouse.up();
  await expect(connectorOffset).not.toHaveValue("0");
  const movedConnectorOffset = await connectorOffset.inputValue();
  await expect(page.locator(".status-bar")).toContainText("已缓存");
  await page.reload();
  await page
    .locator(".tree-item")
    .filter({ hasText: "USB Type-C 母座" })
    .click();
  await expect(connectorOffset).toHaveValue(movedConnectorOffset);
  await captureVisualCheckpoint(page, testInfo, "connector-editor.png");

  await expect(page.getByRole("button", { name: "缩放选中对象" })).toBeDisabled();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-transform-mode",
    "move",
  );
  await addAntenna(page, "内贴 FPC 天线");
  await expect(page.getByRole("complementary", { name: "天线检查器" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "参数类别" })).toHaveCount(0);
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-transform-mode",
    "move",
  );
  await expect(page.getByRole("button", { name: "缩放选中对象" })).toBeDisabled();
  await page.getByRole("combobox", { name: "天线 1 安装位置" }).selectOption(
    "right",
  );
  await page.getByRole("combobox", { name: "天线 1 面内旋转" }).selectOption(
    "180",
  );
  const firstAntennaEditor = page.getByRole("complementary", { name: "天线检查器" });
  await firstAntennaEditor
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input")
    .fill("12");
  await firstAntennaEditor
    .locator(".field-row")
    .filter({ hasText: "纵向偏移" })
    .locator("input")
    .fill("2");

  await addAntenna(page, "RP-SMA 穿板棒状天线");
  await page.getByRole("combobox", { name: "天线 2 安装位置" }).selectOption(
    "top",
  );
  const secondAntennaEditor = page.getByRole("complementary", { name: "天线检查器" });
  const secondAntennaOffset = secondAntennaEditor
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input");
  await expect(secondAntennaOffset).toHaveValue("0");
  await enterViewportEditMode(page);
  await page.mouse.move(canvasBox!.x + 500, canvasBox!.y + 268);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 525, canvasBox!.y + 273, { steps: 8 });
  await page.mouse.up();
  await expect(secondAntennaOffset).not.toHaveValue("0");
  await secondAntennaOffset.fill("40");
  await expect(page.locator(".tree-item").filter({ hasText: "内贴 FPC 天线" })).toBeVisible();
  await expect(page.locator(".tree-item").filter({ hasText: "RP-SMA 穿板棒状天线" })).toBeVisible();
  await captureVisualCheckpoint(page, testInfo, "antenna-editor.png");

  await expect(page.locator(".status-bar")).toContainText("已缓存");
  await page.reload();
  await page.locator(".tree-item").filter({ hasText: "内贴 FPC 天线" }).click();
  await expect(page.getByRole("combobox", { name: "天线 1 安装位置" })).toHaveValue(
    "right",
  );
  await expect(page.getByRole("combobox", { name: "天线 1 面内旋转" })).toHaveValue(
    "180",
  );
  await expect(
    page.getByRole("complementary", { name: "天线检查器" })
      .locator(".field-row")
      .filter({ hasText: "横向偏移" })
      .locator("input"),
  ).toHaveValue("12");
  await page.locator(".tree-item").filter({ hasText: "RP-SMA 穿板棒状天线" }).click();
  await expect(page.getByRole("combobox", { name: "天线 2 安装位置" })).toHaveValue(
    "top",
  );
  await expect(
    page.getByRole("complementary", { name: "天线检查器" })
      .locator(".field-row")
      .filter({ hasText: "横向偏移" })
      .locator("input"),
  ).toHaveValue("40");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("3D transform handles edit the selected panel", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-selected-feature",
    "panel-1",
  );
  await expect(page.getByRole("button", { name: "移动选中对象" })).toBeEnabled();
  const panelSection = page.locator(".inspector-section").filter({
    has: page.getByRole("heading", { name: "面板参数" }),
  });
  const horizontalOffset = panelSection
    .locator(".field-row")
    .filter({ hasText: "横向偏移" })
    .locator("input");
  const panelWidth = panelSection.getByRole("spinbutton", {
    name: "宽度 mm",
    exact: true,
  });
  await expect(horizontalOffset).toHaveValue("0");
  await expect(panelWidth).toHaveValue("62.64");
  const canvas = page.locator(".viewport-canvas canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.getByRole("button", { name: "缩放选中对象" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-transform-mode",
    "scale",
  );
  await enterViewportEditMode(page);
  await page.mouse.move(canvasBox!.x + 505, canvasBox!.y + 290);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 525, canvasBox!.y + 294, { steps: 10 });
  await page.mouse.up();
  await expect(panelWidth).not.toHaveValue("62.64");
  const scaledWidth = await panelWidth.inputValue();
  await page.getByRole("button", { name: "移动选中对象" }).click();
  await expect(page.locator(".viewport-canvas")).toHaveAttribute(
    "data-transform-edit-mode",
    "true",
  );
  await page.mouse.move(canvasBox!.x + 505, canvasBox!.y + 290);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 530, canvasBox!.y + 295, { steps: 12 });
  await page.mouse.up();
  await expect(horizontalOffset).not.toHaveValue("0");
  const movedOffset = await horizontalOffset.inputValue();
  await expect(page.locator(".status-bar")).toContainText("已缓存");
  await page.reload();
  await page.locator(".tree-item").filter({ hasText: "面板 1" }).click();
  await expect(horizontalOffset).toHaveValue(movedOffset);
  await expect(panelWidth).toHaveValue(scaledWidth);
  await captureVisualCheckpoint(page, testInfo, "transform-gizmo.png");
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

  const pcbLength = inspector.getByRole("spinbutton", {
    name: "长度 mm",
    exact: true,
  });
  await pcbLength.click();
  await pcbLength.press("Control+A");
  await pcbLength.press("Backspace");
  await expect(pcbLength).toHaveValue("");
  await pcbLength.pressSequentially("120");
  await pcbLength.press("Enter");
  await expect(pcbLength).toHaveValue("120");

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

  await page.getByRole("button", { name: "打开对象树" }).click();
  await expect(page.locator(".workbench")).toHaveClass(/is-assembly-open/);
  const assemblyPanel = page.getByRole("complementary", {
    name: "装配体和特征树",
  });
  await expect
    .poll(async () => (await assemblyPanel.boundingBox())?.x ?? -999)
    .toBeGreaterThanOrEqual(-1);
  const assemblyBox = await assemblyPanel.boundingBox();
  expect(assemblyBox).not.toBeNull();
  expect(assemblyBox!.x).toBeGreaterThanOrEqual(0);
  await captureVisualCheckpoint(page, testInfo, "narrow-assembly-drawer.png");
  await page.locator(".mobile-panel-close").click();

  await page.getByRole("button", { name: "更多工具" }).click();
  const mobileTools = page.getByRole("menu", { name: "项目和视图工具" });
  await expect(mobileTools.getByRole("menuitem", { name: "新建项目" })).toBeVisible();
  await expect(mobileTools.getByRole("menuitem", { name: "打开项目" })).toBeVisible();

  await captureVisualCheckpoint(page, testInfo, "narrow-workbench.png");
});
