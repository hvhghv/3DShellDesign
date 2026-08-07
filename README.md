# 3DShellDesigner

浏览器端参数化电子外壳设计工具。当前原型已经贯通 PCB/机械参考导入、参数化外壳、器件与材料配置、制造检查和多格式导出，可在 GitHub Pages 纯静态环境运行。

## 当前能力

- 实时调整 PCB、壳体、面板、接口、天线开孔和镂空阵列尺寸；面板、接口和自定义组件可在 3D 视口中移动或缩放，PCB 和天线可直接拖动位置。
- 追加导入多个 KiCad `.kicad_pcb`、板框 Gerber + Excellon 或 STEP 机械参考，每块 PCB 可独立设置 X/Z 偏移、抬高和旋转，并共同驱动安装柱与边界检查。
- 提供圆角分体壳、单板底座、仪表面板盒和带安装耳壁挂壳模板。
- 切换螺丝、磁吸、隐藏卡扣、按压快拆扣、滑盖、转轴翻盖和双侧快拆销结构；磁吸支持双壁角托、单壁耳台、四周内翻边和底板连续立柱。
- 从左侧对象树的加号直接添加多个可更换面板，将每个面板独立放置到顶盖、底板或任一侧壁。
- 面板、接口和天线使用独立参数检查器；拖动和数值输入自动限制在安装面安全区域内并即时刷新，对象树右键可直接删除实例。
- 对象树支持按名称、类型、安装面筛选；面板、PCB、接口、天线、自定义组件和电池仓可通过右键或 `Ctrl+D` 复制，并可使用工具栏或 `Ctrl+Z` / `Ctrl+Y` 撤销、重做。
- 点击接口/器件加号后从可搜索、分类的器件库选择型号，再添加多个 USB、Type-C、RJ45、电源、端子、FPC 或显示屏器件；FPC 默认用间距和针数两项紧凑选择，也可搜索具体型号；每个器件可独立选择六个壳体面或可更换面板、位置与旋转方向。
- 生成圆孔、长槽或蜂窝底部镂空阵列并检查边界与剩余筋宽。
- 创建多个独立亚克力、PC、ABS 或金属面板，每个面板可选择螺丝、双侧盲孔磁吸、弹性柱卡扣或滑轨，并分别设置尺寸、圆角、嵌入深度及边框；螺丝通过与壳壁同厚的一体平面舌片固定，不生成悬空支柱，并支持齐平沉孔。
- 从 AAA、AA、18650、软包锂电和自定义规格添加多槽电池仓，可调整槽数、仓体尺寸、壁厚、间隙、位置和方向；仓壁与隔板作为下壳一体制造实体导出。
- 添加可自由定位、旋转和缩放的自定义长方体、圆柱体，或导入 STEP/STL/OBJ 机械包络模型。
- 从数据驱动库选择 USB-A、Micro USB、Type-C、DC、RJ45、`0.5/1.0 mm` 间距且覆盖 `5P–40P` 的 FPC、1.0/1.25/2.54/5.08 mm 间距的 2P/4P/5P 端子，以及 `lcdwiki_downloads.zip` 中 2.2/2.4/2.8/3.2/3.5/4.0 寸 LCDWIKI SPI 屏幕。
- 添加多个 SMA、RP-SMA、内贴 FPC 或 PCB 板边天线；每个实例可选择六个壳体面或可更换面板，并生成穿板孔、射频禁入区和 BOM。
- 在对象树中分别显示或隐藏顶盖、底板、前后壁和左右壁；显隐只影响检查视图，不改变 STL、3MF 等制造导出。
- 面板、PCB、接口、天线、自定义组件和电池仓可独立隐藏或锁定；隐藏对象仍保留在制造模型中，锁定对象不可拖动、改参或误删，并可从检查器直接恢复。
- 选择 M2/M2.5/M3、M3 热熔螺母或六角螺母槽；顶盖螺丝可独立开启深度可调的齐平沉孔。
- 选择 FDM、树脂、工程板材和金属面板材料。
- 根据材料检查最小壁厚、装配间隙和卡扣适用性。
- 使用 localStorage + IndexedDB 自动缓存参数、多 PCB 参考、自定义组件和导入网格，关闭或刷新页面后自动恢复。
- 支持装配视图、爆炸视图、零件选择和适合视图，并可从左侧对象树将上盖切换为半透明以检查内部结构。
- 窄屏提供可开合对象树和完整工具菜单；接口/天线选择器使用可搜索的居中弹窗，数值输入允许连续编辑并保持 3D 即时更新。
- 支持聚焦选中零件，并通过“显示全部”恢复完整装配视图。
- 使用 Manifold WASM 生成封闭下壳、顶盖和面板实体。
- 按面板实例导出包含接口及天线开孔的二进制 STL 与 SVG/DXF，并导出包含全部面板的多零件 3MF、BOM CSV 和制造清单 JSON。

Three.js 模型用于实时交互预览，制造导出时由 Web Worker 中的 Manifold WASM 根据同一组参数重新生成封闭实体。`occt-import-js`/OpenCascade 仅在导入 STEP 时延迟加载，用于只读三角化和包围盒，不参与参数化实体编辑或 STEP 输出。

## KiCad 导入范围

- 支持 `gr_line`、`gr_rect`、`gr_arc`、`gr_circle` 和 `gr_poly` 的 `Edge.Cuts` 边界。
- 自动读取 `general/thickness` 板厚。
- 自动读取 `np_thru_hole`，以及名称明确为 MountingHole 的通孔。
- 普通连接器和元件通孔不会被当作安装孔。
- 未支持的板框图元会产生警告，用户需要核对包络尺寸。
- 文件解析在独立 Web Worker 中进行，当前单文件上限为 15 MiB。

## Gerber、Excellon 与 STEP 边界

- Gerber 入口要求用户明确选择一个板框/机械文件，不从铜层推断板框。
- Excellon 可选；全部钻孔会统计，直径不小于 2 mm 的圆孔才作为安装孔候选驱动螺柱。
- STEP 在独立 Worker 中由 OpenCascade 三角化，当前上限为 50 MiB。
- STEP 不推断安装孔、连接器或 PCB 层语义；当前浏览器会缓存 PCB 与自定义组件的三角网格并在刷新后恢复，但导出的项目 JSON 只保存来源、包围盒和放置参数，换浏览器导入 JSON 时仍需重新附加原模型。
- 自定义 STEP/STL/OBJ 当前是机械包络参考，不会自动推断开孔，也不会作为壳体材料并入 STL/3MF 布尔实体。
- 螺丝沉孔采用平底圆柱结构；导孔、沉孔直径和深度需按实际低头螺丝或垫圈复核，至少保留 0.4 mm 材料承托层。

## 开发环境

- Node.js 24 LTS
- npm 11 或更高版本
- 支持 WebGL2 的现代桌面浏览器

```powershell
npm install
npm run dev
```

默认开发地址由 Vite 输出，通常为 `http://localhost:5173/`。

## 检查与构建

```powershell
npm run lint
npm test
npm run test:e2e:smoke
npm run test:e2e:manufacturing
npm run test:e2e:full
npm run build
```

也可以执行完整检查：

```powershell
npm run check
```

生产文件生成到 `dist/`。

端到端测试默认使用本机 Microsoft Edge，覆盖桌面和窄屏工作台，并检查 WebGL 画布像素分布。

## GitHub Pages

推送 `main` 后，[pages.yml](.github/workflows/pages.yml) 会并行执行静态检查/单元测试/生产构建和 3 项关键 Playwright 烟测；两者通过后发布 `dist/`，不再让完整 STL/3MF 制造回归阻塞 Pages。完整 21 项浏览器回归由 [regression.yml](.github/workflows/regression.yml) 每天北京时间 02:00 或手动触发，并拆成两个单 worker 分片。CI 成功用例不生成非必要全页截图，失败时保留 Playwright 截图、上下文和 trace artifact。

仓库名称为 `3DShellDesign`，Actions 构建时 Vite 基础路径自动切换为 `/3DShellDesign/`。GitHub 仓库的 Pages Source 需要设置为 `GitHub Actions`。

预计站点地址：`https://hvhghv.github.io/3DShellDesign/`

发布产物包含项目 [MIT 许可证](LICENSE)、[第三方许可说明](THIRD_PARTY_NOTICES.md)，以及 `occt-import-js` 和 OpenCascade 的许可证文本。

## 许可证

3DShellDesigner 自有代码采用 [MIT License](LICENSE)。第三方软件继续遵循各自的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。用户导入的 PCB 数据、创建的设计及导出文件不因使用本软件而转让给本项目。

## 文档

完整需求、架构、数据模型、里程碑和验收标准见 [开发文档](Doc/DEVELOPMENT.md)。
