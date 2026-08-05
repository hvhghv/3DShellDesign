# 3DShellDesigner

浏览器端参数化电子外壳设计工具。当前原型已经贯通 PCB/机械参考导入、参数化外壳、器件与材料配置、制造检查和多格式导出，可在 GitHub Pages 纯静态环境运行。

## 当前能力

- 实时调整 PCB、壳体、面板、接口、天线开孔和镂空阵列尺寸；面板和接口可在 3D 视口中移动或缩放，天线可直接拖动位置。
- 导入 KiCad `.kicad_pcb`、明确选定的板框 Gerber + Excellon，以及 STEP 只读机械参考。
- 提供圆角分体壳、单板底座、仪表面板盒和带安装耳壁挂壳模板。
- 切换螺丝、磁吸、卡扣、滑盖和转轴翻盖结构；磁吸支持双壁角托、单壁耳台、四周内翻边和底板连续立柱。
- 从左侧对象树的加号直接添加多个可更换面板，将每个面板独立放置到顶盖、底板或任一侧壁。
- 点击接口加号后从可搜索、分类的器件库选择型号，再添加多个 USB、Type-C、RJ45、电源、端子或 FPC 接口；每个接口可独立选择六个壳体面或可更换面板、位置与旋转方向。
- 生成圆孔、长槽或蜂窝底部镂空阵列并检查边界与剩余筋宽。
- 创建多个独立亚克力、PC、ABS 或金属面板，每个面板可分别设置尺寸、材料及螺丝、磁吸或滑轨固定。
- 从数据驱动库选择 USB-A、Micro USB、Type-C、DC、RJ45、FPC，以及 1.0/1.25/2.54/5.08 mm 间距的 2P/4P/5P 端子。
- 添加多个 SMA、RP-SMA、内贴 FPC 或 PCB 板边天线；每个实例可选择六个壳体面或可更换面板，并生成穿板孔、射频禁入区和 BOM。
- 选择 M2/M2.5/M3、M3 热熔螺母或六角螺母槽。
- 选择 FDM、树脂、工程板材和金属面板材料。
- 根据材料检查最小壁厚、装配间隙和卡扣适用性。
- 使用 localStorage + IndexedDB 自动缓存参数、PCB 参考和 STEP 网格，关闭或刷新页面后自动恢复。
- 支持装配视图、爆炸视图、零件选择和适合视图。
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
- STEP 不推断安装孔、连接器或 PCB 层语义；当前浏览器会缓存三角网格并在刷新后恢复，但导出的项目 JSON 只保存来源和包围盒，换浏览器导入 JSON 时仍需重新附加原 STEP。

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
npm run test:e2e
npm run build
```

也可以执行完整检查：

```powershell
npm run check
```

生产文件生成到 `dist/`。

端到端测试默认使用本机 Microsoft Edge，覆盖桌面和窄屏工作台，并检查 WebGL 画布像素分布。

## GitHub Pages

推送 `main` 后，[pages.yml](.github/workflows/pages.yml) 会执行依赖安装、Lint、单元测试、桌面/窄屏浏览器测试和生产构建，再发布 `dist/`。

仓库名称为 `3DShellDesign`，Actions 构建时 Vite 基础路径自动切换为 `/3DShellDesign/`。GitHub 仓库的 Pages Source 需要设置为 `GitHub Actions`。

预计站点地址：`https://hvhghv.github.io/3DShellDesign/`

发布产物包含项目 [MIT 许可证](LICENSE)、[第三方许可说明](THIRD_PARTY_NOTICES.md)，以及 `occt-import-js` 和 OpenCascade 的许可证文本。

## 许可证

3DShellDesigner 自有代码采用 [MIT License](LICENSE)。第三方软件继续遵循各自的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。用户导入的 PCB 数据、创建的设计及导出文件不因使用本软件而转让给本项目。

## 文档

完整需求、架构、数据模型、里程碑和验收标准见 [开发文档](Doc/DEVELOPMENT.md)。
