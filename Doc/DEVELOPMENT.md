# 3DShellDesigner 开发文档

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 项目名称 | 3DShellDesigner |
| 文档版本 | 0.2 |
| 文档状态 | 开发中 |
| 目标平台 | 桌面端现代浏览器，平板端后续适配 |
| 默认单位 | 毫米（mm） |
| 部署方式 | GitHub Pages 静态部署 |

本文档定义 3DShellDesigner 的产品范围、技术架构、核心数据模型、开发阶段和验收标准，作为后续界面设计、任务拆分和实现评审的基础。

## 2. 项目目标

3DShellDesigner 是一个面向电子开发者、创客和小批量产品设计人员的浏览器端参数化外壳设计工具。用户通过导入 PCB、选择壳体模板、放置接口器件和设置制造参数，快速生成可用于 3D 打印、激光切割或进一步机械设计的外壳文件。

核心工作流如下：

```text
创建项目
  -> 导入 PCB 或录入板框
  -> 生成外壳基础结构
  -> 放置连接器、紧固件和开孔
  -> 配置顶盖与亚克力部件
  -> 选择材料和制造工艺
  -> 执行结构与制造检查
  -> 导出生产文件和装配资料
```

### 2.1 产品目标

- 将常见电子外壳设计过程参数化、模板化。
- 在不安装桌面 CAD 的情况下完成常规外壳设计。
- 让器件放置同时驱动可视模型、面板开孔和安全空间检查。
- 为 3D 打印、亚克力切割和后续 CAD 编辑提供合理的输出格式。
- 项目默认在浏览器本地运行，PCB 和设计数据不需要上传服务器。

### 2.2 首版非目标

- 不实现通用自由曲面建模。
- 不承诺编辑任意导入 STEP 模型的内部特征。
- 不提供有限元强度、热仿真或防水等级认证。
- 不保证所有材料和设备一次制造成功，制造规则仅作为设计建议。
- 不在 GitHub Pages 内实现需要服务器数据库的多人实时协作。

## 3. 用户与典型场景

### 3.1 目标用户

- 需要为开发板快速制作保护壳的软硬件工程师。
- 使用 KiCad 设计 PCB 的电子工程师。
- 使用 FDM、SLA 或激光切割设备的创客和工作室。
- 需要快速调整接口、面板或透明窗口的小批量产品团队。

### 3.2 典型任务

1. 导入 KiCad PCB，根据板框和最高元件自动生成上下壳。
2. 在侧壁放置 Type-C 母座，自动生成开孔并检查插头插拔空间。
3. 添加 PCB 螺柱、热熔螺母和顶盖螺丝。
4. 将顶盖局部替换为可单独切割和低成本更换的亚克力面板。
5. 选择 PETG 和激光切割亚克力，应用对应壁厚、公差和切缝补偿。
6. 导出上下壳 STL、亚克力 DXF、项目 JSON 和物料清单。

## 4. 功能需求

### 4.1 项目管理

| 编号 | 需求 |
| --- | --- |
| FR-PROJ-001 | 创建、打开、另存和导出项目。 |
| FR-PROJ-002 | 项目使用带版本号的 JSON 格式保存。 |
| FR-PROJ-003 | 支持撤销、重做、自动保存和崩溃恢复。 |
| FR-PROJ-004 | 支持复制零件、复制特征和保存用户模板。 |
| FR-PROJ-005 | 所有内部几何统一使用毫米，导入时处理源文件单位。 |

### 4.2 PCB 参考导入

| 优先级 | 格式 | 目标能力 |
| --- | --- | --- |
| P0 | KiCad `.kicad_pcb` | 板框、板厚、安装孔、焊盘、元件位置与朝向。 |
| P0 | STEP | 完整机械外形参考、包围盒和碰撞参考。 |
| P1 | Gerber + Excellon | 板框、铜层预览和钻孔。 |
| P1 | DXF/SVG | 二维板框、自定义轮廓和面板轮廓。 |
| P2 | STL/OBJ/GLTF | 仅作为可视或碰撞参考。 |

PCB 导入要求：

- 支持坐标原点、旋转、翻转和板厚校正。
- 自动提取板框包络和安装孔候选项。
- 支持用户指定未能自动识别的安装孔和最高元件。
- STEP 和网格模型缺少器件语义时，不进行无依据的连接器识别。
- 大文件解析和三角化必须在 Web Worker 内完成。

### 4.3 壳体生成与模板

首版支持以下模板：

- 圆角矩形上下分体壳。
- 单板式底座加顶盖。
- 带可更换面板的仪表盒。
- 壁挂式壳体。

后续模板包括手持式、DIN 导轨式、防水舌槽式和多层 PCB 壳体。

基础参数至少包括：

- 内部长、宽、高和 PCB 四周安全间隙。
- 壁厚、底厚、顶厚和圆角半径。
- 分型面高度、上下壳重叠量和装配间隙。
- PCB 离底高度、安装柱尺寸和板边支撑结构。
- 加强筋、倒角、拔模角和脚垫位置。

规则壳体应直接从内外轮廓生成，避免依赖对任意复杂实体执行通用抽壳操作。

### 4.4 标准器件库

首批器件：

- USB-A、Micro USB、USB Type-C、DC 电源座和 RJ45。
- 接线端子、排针、FPC、按钮、拨动开关、LED 和显示窗口。
- 风扇、散热孔、线缆孔和护线圈。
- M2、M2.5、M3 螺丝、螺母、铜柱和热熔螺母。
- SMA、RP-SMA 穿板天线、内贴 FPC 天线和 PCB 板边天线净空区。

每个器件定义必须包含：

```text
ComponentDefinition
  visualGeometry      可视模型
  panelCutout         面板开孔体
  placementAnchor     安装基准与朝向
  keepoutVolumes      PCB、插拔、工具操作安全空间
  fastenerFeatures    螺丝孔、沉孔或螺母槽
  toleranceRules      推荐间隙及孔径补偿
  metadata            名称、规格、标签和物料信息
```

器件放置在壳体面上时，应自动完成吸附、法向对齐、开孔生成和安全空间检查。用户可以覆盖默认参数并保存为自定义器件。

### 4.5 表面花纹、镂空和文字

- 支持圆孔、长圆孔、矩形孔、蜂窝孔和用户轮廓阵列。
- 支持阵列方向、间距、边距、交错方式和禁入区域。
- 支持凸字、凹字、Logo、编号和简单表面纹理。
- P0 仅支持平面区域；曲面投影放入后续版本。
- 编辑预览使用实例化显示，最终导出时才执行完整实体布尔运算。
- 系统应检查剩余筋宽、最小壁厚和孔到边缘距离。

### 4.6 顶盖和装配方式

| 方式 | 优先级 | 说明 |
| --- | --- | --- |
| 螺丝固定 | P0 | 支持自攻、机牙、沉头、沉孔和热熔螺母。 |
| 磁吸固定 | P0 | 支持磁铁槽、装配间隙、胶水间隙和磁极标记。 |
| 止口定位 | P0 | 支持内外止口、定位柱和装配间隙。 |
| 滑盖 | P1 | 支持导轨、限位和拆卸空间。 |
| 普通卡扣 | P1 | 根据材料给出卡扣尺寸和形变提示。 |
| 转轴翻盖 | P1 | 支持打印转轴或独立销轴。 |
| 活铰链 | P2 | 仅对适合材料开放，并提示打印方向和寿命风险。 |
| 舌槽与密封圈 | P2 | 仅提供结构模板，不声明实际防水等级。 |

### 4.7 亚克力和板材部件

- 亚克力必须作为独立零件管理，不能只作为透明材质显示。
- 支持整面替换、局部窗口、可拆卸面板和内部隔板。
- 支持插槽、台阶、压边、压板、磁吸、卡扣和螺丝固定。
- 支持板厚、激光切缝补偿、装配间隙和最小内圆角。
- 支持单独导出 DXF/SVG、孔位图和尺寸信息。
- 同一设计允许使用亚克力、PC、ABS 或铝板等不同板材。

### 4.8 材料与制造工艺

材料按零件独立选择。下壳、顶盖、透明面板、密封件和紧固件可使用不同材料。

| 制造工艺 | 首批材料 |
| --- | --- |
| FDM | PLA、PETG、ABS、ASA、PC、PA、TPU |
| 光固化 | 普通树脂、韧性树脂、耐高温树脂 |
| 激光切割 | 亚克力、PC 板、ABS 板和木板 |
| CNC/钣金 | 铝合金、不锈钢和工程塑料 |

材料配置至少包含：

- 最小壁厚、推荐螺柱尺寸和加强筋尺寸。
- XY/Z 方向间隙、孔径补偿、切缝宽度和材料收缩率。
- 耐温、耐冲击、耐紫外线、弹性和透明度等提示属性。
- 卡扣、活铰链、攻丝、热熔螺母和密封结构的适用性。
- 颜色、表面效果、成本等级、阻燃和绝缘等可选信息。

材料规则只负责推荐值和告警，不自动声称满足强度、安全或行业认证要求。

### 4.9 设计检查

P0 检查项：

- PCB、元件、螺柱、螺丝、壳体和顶盖之间的碰撞。
- 连接器开孔是否覆盖接口及插拔安全空间。
- 壁厚、底厚、孔到边缘距离和剩余筋宽。
- 螺丝刀操作空间、螺母安装空间和顶盖拆卸空间。
- 亚克力面板是否具有完整支撑和固定结构。

P1 检查项：

- FDM 悬空角、桥接距离和建议打印方向。
- 封闭空腔、不可装配结构和紧固件路径冲突。
- 天线附近金属遮挡、电气绝缘距离和散热开孔提示。

所有检查结果分为错误、警告和建议三级，并能定位到对应零件或特征。

### 4.10 导出与交付物

| 格式 | 用途 | 优先级 |
| --- | --- | --- |
| 项目 JSON | 可继续编辑的参数化项目 | P0 |
| STL | 3D 打印网格 | P0 |
| 3MF | 带单位、零件和材料信息的打印项目 | P1 |
| DXF/SVG | 亚克力、板材和二维轮廓切割 | P0 |
| STEP | 专业 CAD 后续编辑 | P1，取决于几何内核 |
| CSV/JSON BOM | 材料、紧固件和零件清单 | P1 |
| PNG/PDF | 尺寸图、爆炸图和装配说明 | P2 |

导出前必须重新生成全部实体并执行可制造性检查。STL 导出应明确使用毫米单位，并检查网格是否封闭、法线是否一致。

## 5. 交互与界面设计

应用启动后直接进入设计工作台，不设置营销式首页。

```text
+-------------------------------------------------------------------+
| 文件  导入  撤销/重做  视图  检查  导出                          |
+----------------+--------------------------------+-----------------+
| 装配/特征树    |                                | 参数检查器      |
|                |           3D 视口              | 尺寸            |
| PCB            |                                | 材料            |
| 下壳           |                                | 制造工艺        |
| 顶盖           |                                | 外观            |
| 亚克力面板     |                                |                 |
+----------------+--------------------------------+-----------------+
| 坐标 | 单位 | 当前选择 | 重建状态 | 错误/警告数量                 |
+-------------------------------------------------------------------+
```

交互要求：

- 左侧树管理装配体、零件和特征顺序。
- 中央视口支持旋转、平移、缩放、框选、剖切、透明和爆炸视图。
- 右侧参数检查器编辑尺寸、材料、工艺和当前特征属性。
- 工具命令优先使用图标和快捷菜单，图标提供工具提示。
- 数值输入支持表达式、单位显示、步进调整和非法值提示。
- 视口操作与几何重建分离，重建过程中界面不能冻结。
- 首版以桌面 Chromium/Edge/Firefox 为主要目标，移动端只保证查看和简单标注。

## 6. 技术架构

### 6.1 推荐技术栈

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 工程化 | Vite + TypeScript | 构建、模块化和类型约束 |
| 界面 | React | 工作台、属性编辑器和对话框 |
| 状态管理 | Zustand | 项目状态、选择状态和命令历史 |
| 三维显示 | Three.js | 场景、相机、渲染、选取和辅助对象 |
| 空间查询 | three-mesh-bvh | 网格选取、包围和碰撞加速 |
| 几何内核 | 待技术验证 | 实体生成、布尔运算、圆角和导出 |
| 后台计算 | Web Worker | PCB 解析、重建、三角化和导出 |
| 本地存储 | IndexedDB | 自动保存、用户模板和器件库 |
| 测试 | Vitest + Playwright | 单元、集成和浏览器工作流测试 |
| 发布 | GitHub Actions + Pages | 自动检查、构建和静态部署 |

React 只管理界面状态。Three.js 场景和高频交互不应通过 React 状态逐帧驱动。

### 6.2 几何内核选型

候选方案：

| 方案 | 优点 | 限制 | 适用方向 |
| --- | --- | --- | --- |
| Manifold WASM | 网格布尔稳定、封闭性好、适合打印输出 | 不提供完整 B-Rep 和原生 STEP 编辑 | STL/3MF 优先的 MVP |
| OpenCascade.js/Replicad | B-Rep、圆角、STEP 和机械 CAD 能力完整 | WASM 较大、接口复杂、重建成本较高 | STEP 优先的专业路线 |

在技术验证阶段建立 `GeometryKernel` 适配层并完成以下基准测试后再确定首版内核：

- 生成 200 x 120 x 40 mm 圆角上下壳。
- 添加 4 个螺柱、6 个接口开孔和 200 个蜂窝孔。
- 连续修改壁厚、圆角和壳体高度 30 次。
- 检查重建耗时、失败率、内存、WASM 加载时间和导出封闭性。
- 验证 GitHub Pages 环境下 Worker 与单线程 WASM 的加载。

若 STEP 是首版硬性要求，优先选择 OpenCascade 路线；若首先保证快速生成和 3D 打印，优先选择 Manifold 路线。

### 6.3 系统模块

```text
UI Shell
  |-- Project/Command Manager
  |-- Assembly and Feature Tree
  |-- Property Inspector
  |-- Material and Component Library
  |-- Validation Panel
  `-- Viewport Controller

Domain Layer
  |-- Project Model
  |-- Parametric Feature Graph
  |-- PCB Import Adapters
  |-- Component Placement Service
  |-- Material/Process Rules
  |-- Validation Engine
  `-- Export Service

Geometry Worker
  |-- Geometry Kernel Adapter
  |-- Feature Rebuild Pipeline
  |-- Tessellation and BVH Data
  `-- STL/3MF/STEP Export

Browser Storage
  |-- IndexedDB Projects
  |-- User Components
  `-- Material and Template Presets
```

### 6.4 建议目录结构

```text
3DShellDesigner/
  .github/workflows/
  Doc/
  public/
  src/
    app/
    components/
    domain/
      assembly/
      features/
      materials/
      validation/
    geometry/
      kernel/
      workers/
    importers/
      kicad/
      step/
      gerber/
    exporters/
    libraries/
    storage/
    viewport/
  tests/
    unit/
    fixtures/
    e2e/
  package.json
  vite.config.ts
```

## 7. 核心数据模型

以下接口用于说明领域边界，最终字段以实现阶段为准：

```ts
interface ProjectDocument {
  schemaVersion: number;
  id: string;
  name: string;
  units: "mm";
  assembly: AssemblyNode;
  materials: MaterialProfile[];
  manufacturingProfiles: ManufacturingProfile[];
  references: ReferenceModel[];
  userComponents: ComponentDefinition[];
}

interface PartNode {
  id: string;
  name: string;
  role: "pcb" | "base" | "lid" | "panel" | "fastener" | "custom";
  transform: Transform3D;
  materialId?: string;
  manufacturingProfileId?: string;
  features: FeatureNode[];
  visible: boolean;
}

interface FeatureNode {
  id: string;
  type: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  dependencies: string[];
}

interface MaterialProfile {
  id: string;
  name: string;
  category: "filament" | "resin" | "sheet" | "metal" | "other";
  appearance: MaterialAppearance;
  designRules: MaterialDesignRules;
}

interface ComponentDefinition {
  id: string;
  name: string;
  parameterSchema: Record<string, unknown>;
  visualGeometry: GeometryRecipe;
  panelCutout: GeometryRecipe;
  placementAnchor: PlacementAnchor;
  keepoutVolumes: KeepoutVolume[];
  toleranceRules: ToleranceRule[];
}
```

所有对象使用稳定 ID 关联，不能依赖界面数组下标。项目格式必须保留 `schemaVersion`，并为后续版本提供迁移函数。

## 8. 参数化重建流程

一次完整重建按以下顺序执行：

1. 校验项目参数、单位和依赖关系。
2. 加载 PCB 参考并计算包络、安装孔和禁入区域。
3. 生成下壳和顶盖基础实体。
4. 添加安装柱、加强筋、止口和亚克力支撑结构。
5. 应用连接器、按钮、通风孔和文字等减料或加料特征。
6. 生成紧固件、磁铁槽、铰链或滑轨特征。
7. 三角化实体并更新视口网格和空间索引。
8. 运行增量设计检查并返回错误和警告。

几何 Worker 返回可转移的网格缓冲区、实体摘要和错误信息，不返回不能序列化的内核对象。内核对象只在 Worker 内部存活。

## 9. 性能与非功能要求

| 编号 | 要求 |
| --- | --- |
| NFR-001 | 普通视口交互目标为 60 FPS，几何重建时仍可操作界面。 |
| NFR-002 | 所有可能超过一帧的几何和文件解析任务放入 Worker。 |
| NFR-003 | 支持取消过期重建任务，只提交最新参数对应的结果。 |
| NFR-004 | 导入文件设置大小、数量和处理超时保护。 |
| NFR-005 | 自动保存失败不能覆盖用户最近一次有效项目。 |
| NFR-006 | 几何错误必须关联到具体零件或特征，并给出可理解提示。 |
| NFR-007 | 项目默认离线可用，核心设计文件不上传第三方服务。 |
| NFR-008 | 常见尺寸参数和材料规则必须有单元测试。 |

首版性能验收模型定义为：1 块 PCB、2 个壳体零件、10 个器件、8 个螺柱和不超过 200 个规则开孔。实际时间目标在几何内核技术验证后确定。

## 10. GitHub Pages 发布方案

远程仓库：`https://github.com/hvhghv/3DShellDesign`

预计站点地址：`https://hvhghv.github.io/3DShellDesign/`

计划新增 `.github/workflows/pages.yml`，在 `main` 分支推送或手动触发时执行：

1. 检出源码并安装固定版本 Node.js。
2. 使用 lockfile 安装依赖。
3. 执行类型检查、Lint、单元测试和正式构建。
4. 上传 `dist/` 为 GitHub Pages artifact。
5. 使用 GitHub 官方 Pages Action 完成部署。

部署约束：

- Vite 生产基础路径使用 `/3DShellDesign/`，本地开发使用 `/`。
- Worker、WASM、纹理和模型必须通过模块 URL 或 `import.meta.env.BASE_URL` 定位。
- 不依赖服务端路由；需要页面路由时采用 Hash Router。
- GitHub Pages 无法自由设置 COOP/COEP 响应头，Pages 版本使用单线程 WASM。
- 大型示例模型不直接放入 Git 仓库，测试夹具应裁剪到最小可复现规模。
- Pages workflow 在单独确认后实施，不能在尚无应用构建入口时发布空站点。

## 11. 测试方案

### 11.1 单元测试

- 单位换算、尺寸约束和公差计算。
- 材料规则、工艺规则和告警条件。
- KiCad 板框、孔位和元件坐标解析。
- 参数迁移、项目序列化和撤销/重做。
- 器件锚点、法向对齐和开孔位置计算。

### 11.2 几何测试

- 标准壳体、螺柱、沉孔、止口和开孔的尺寸快照。
- 布尔结果封闭性、法线方向和退化三角形检查。
- 极限壁厚、重叠孔、相切实体和无效圆角回归测试。
- 同一项目重复重建结果的一致性。

### 11.3 集成测试

- 导入 PCB 后自动生成壳体。
- 放置 Type-C 后同时生成开孔和插拔禁入空间。
- 更换材料后更新推荐值和制造警告。
- 亚克力面板独立生成并导出 DXF/SVG。
- 保存项目、刷新页面并恢复全部参数。

### 11.4 端到端测试

Playwright 至少验证：

- GitHub Pages 基础路径下应用可打开。
- Three.js 画布存在且渲染非空。
- Worker 和 WASM 资源成功加载。
- 完成 MVP 样例设计并导出非空文件。
- 页面刷新后没有资源路径 404。

## 12. 开发阶段与交付物

### 阶段 0：技术验证，预计 2 至 3 周

- 搭建 Vite、TypeScript、React、Three.js 和测试框架。
- 完成两种候选几何内核的基准测试。
- 实现圆角壳体、上下盖、螺柱、开孔和 STL 导出原型。
- 验证 Worker、WASM 和 GitHub Pages 路径兼容性。
- 输出几何内核选型记录和实测性能基线。

### 阶段 1：MVP，预计 6 至 10 周

- KiCad PCB 导入和手工板框模式。
- 圆角矩形壳、上下盖和 PCB 安装柱。
- Type-C、USB、按钮、端子和常用紧固件。
- 螺丝、磁吸、止口和亚克力面板。
- FDM 与激光切割材料配置。
- 碰撞、壁厚和开孔边距检查。
- 项目 JSON、STL、DXF/SVG 导出。
- GitHub Pages 自动部署。

### 阶段 2：增强版，预计 6 至 8 周

- STEP、Gerber 和 Excellon 导入。
- 花纹、通风阵列、文字和 Logo。
- 滑盖、普通卡扣和转轴翻盖。
- 3MF、BOM 和装配爆炸视图。
- 用户器件库和用户模板。

### 阶段 3：专业能力，持续开发

- STEP 输出和更完整的 B-Rep 能力。
- 防水舌槽、密封件和复杂壳体模板。
- 更全面的制造检查、尺寸图和装配文档。
- 可选云端项目分享、团队器件库和版本管理。

## 13. MVP 验收标准

MVP 必须完成以下端到端任务：

1. 从浏览器导入一个有效 KiCad PCB。
2. 自动识别板框和安装孔，并生成上下壳。
3. 放置 Type-C 器件，生成正确开孔和插拔空间。
4. 添加 PCB 螺柱、热熔螺母以及螺丝或磁吸顶盖。
5. 创建一块可更换亚克力面板。
6. 为壳体选择 PETG，为面板选择亚克力，并应用对应规则。
7. 检测碰撞、薄壁、孔边距和装配空间问题。
8. 导出封闭的上下壳 STL 和尺寸正确的亚克力 DXF/SVG。
9. 保存项目 JSON，刷新页面后恢复并继续编辑。
10. 在 GitHub Pages 地址完成同样流程，资源加载无 404。

## 14. 主要风险与应对

| 风险 | 影响 | 应对措施 |
| --- | --- | --- |
| 复杂布尔运算失败 | 产生坏面或无法导出 | 技术验证选型、限制退化参数、保留可定位错误。 |
| 大量镂空重建缓慢 | 编辑体验卡顿 | 实例化预览、延迟布尔、Worker 和取消过期任务。 |
| PCB 格式语义不一致 | 自动识别不完整 | 格式适配器、明确证据边界、允许用户修正。 |
| 材料参数差异大 | 推荐尺寸与设备不匹配 | 提供预设和用户校准配置，不作制造保证。 |
| 翻盖和卡扣疲劳 | 实物寿命不稳定 | 后置到 P1/P2，增加材料与打印方向告警。 |
| Pages 多线程限制 | WASM 无法启动 | 使用单线程构建，未来需要时迁移可控静态托管。 |
| 项目格式演进 | 旧文件无法读取 | schemaVersion、迁移函数和固定回归样例。 |

## 15. 开发决策原则

- 优先完成从 PCB 到可制造文件的完整闭环，再扩大模板数量。
- 参数化特征是项目事实来源，Three.js 网格仅用于显示和选择。
- 器件库同时管理模型、开孔和禁入空间，不能只保存外观模型。
- 材料选择必须影响设计规则，不能只改变颜色。
- 亚克力必须是独立零件，能够独立定价、替换和导出。
- 自动推断必须允许用户检查和修正，不能将格式猜测当成机械事实。
- 所有导出文件必须由最新成功重建的实体生成。

## 16. 已确认边界与后续事项

- 制造实体采用 Manifold WASM；STEP 只读参考采用按需加载的 `occt-import-js`/OpenCascade Worker。
- 首批模板为圆角分体壳、单板底座、可更换面板仪表盒和壁挂式壳体。
- 首批连接器覆盖 USB-A、Micro USB、Type-C、DC、RJ45、5.08 mm 端子和 0.5 mm FPC。
- 首批紧固件覆盖 M2、M2.5、M3 自攻、M3 热熔螺母和 M3 六角螺母槽。
- GitHub Pages workflow 已实施；PWA 离线安装和服务端协作仍不在当前范围。
- STEP 输出仍需后续 B-Rep 导出内核验证，当前不以网格重新封装冒充 STEP。

## 17. 当前实现状态

截至 2026-08-04，阶段 0、阶段 1 和阶段 2 的计划原型能力已完成，专业阶段保留 STEP 输出等后续事项。当前实现包括：

- Vite、TypeScript、React、Three.js、Zustand、Vitest 和 ESLint 工程骨架。
- 参数化壳体预览、PCB 参考板、安装柱、顶盖止口和爆炸视图。
- 零件聚焦模式可隔离顶盖、下壳、面板、PCB、接口或天线，并随焦点重新适配相机。
- 螺丝、磁吸、卡扣、滑盖和转轴翻盖五种固定方式的可交互预览与制造实体。
- 独立亚克力、PC、ABS 和金属面板，以及螺丝、磁吸、滑轨面板固定。
- 七类连接器和四类天线的位置、开孔、插拔/射频安全空间和数据驱动制造定义。
- 壁厚、装配间隙、元件高度、卡扣材料和面板厚度检查。
- 项目 JSON 导入导出、localStorage 参数快照和 IndexedDB STEP 网格缓存，关闭页面后可恢复当前项目。
- GitHub Pages 自动检查、构建和部署工作流。
- Manifold WASM 单线程实体内核和后台导出 Worker。
- 下壳、顶盖、独立面板的封闭实体生成和二进制 STL 导出。
- 多零件 3MF、面板 SVG/DXF、BOM CSV 和制造清单 JSON 导出。
- KiCad `.kicad_pcb` 的 Worker 导入、板框包络、板厚和安装孔提取。
- KiCad 安装孔同时驱动预览螺柱和下壳制造实体。
- 明确板框 Gerber 与可选 Excellon 的 Worker 导入，不从铜层猜测机械外形。
- `occt-import-js`/OpenCascade STEP Worker、毫米包围盒、三角化统计和只读视口参考。
- M2、M2.5、M3 自攻、M3 热熔螺母和六角螺母槽的实体驱动。
- 圆孔、长槽、蜂窝阵列的预览、实体减料和安全区域/筋宽检查。
- 四类外壳模板，其中壁挂模板生成真实安装耳和固定孔。
- 项目自有代码采用 MIT License；项目许可证、第三方许可说明和 OpenCascade 许可证随 GitHub Pages 产物发布。

Three.js 场景仍用于实时预览，STL 和 3MF 则由 Manifold WASM 根据参数重新生成封闭实体。浏览器回归会检查 WebGL 像素、三类 STL 尺寸、3MF 包结构、面板 DXF、BOM、KiCad、Gerber/Excellon、STEP Worker/WASM、页面刷新后的项目缓存，以及蜂窝、天线、翻盖、滑盖、热熔螺母、圆形接口和壁挂安装耳等非默认实体路径。

当前明确限制：STEP 网格会保存在当前浏览器的 IndexedDB 中，但不写入项目 JSON；复杂 STEP 只做包围盒与显示参考；连接器和天线库使用通用机械包络，生产前仍需按具体器件图纸及射频测试复核；制造规则是建议和告警，不构成材料强度、防水、射频或安全认证。
