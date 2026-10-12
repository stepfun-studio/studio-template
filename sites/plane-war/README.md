# 天际突袭 · SKY STRIKE 3D

浏览器 3D 空战射击游戏。开源战机模型（CC BY 4.0）+ StepFun TTS 中文语音包，
three.js r169 + 原生 ES Modules + importmap，**零构建步骤**。

---

## 一、本地运行（30 秒）

需要 Node 18+ 或任意静态服务器。**必须通过 http 访问**（ES Module + importmap 不支持 `file://`）。

> 玩游戏本身**零依赖**，不需要 `npm install`。
> 只有第三节的 CDP 测试工具需要额外装一个 `ws`：`npm install`。

```bash
# 方式 A：项目自带的零依赖服务器（推荐）
node tools/serve.js            # → http://127.0.0.1:8099/

# 方式 B：python
python3 -m http.server 8099
```

浏览器打开 <http://127.0.0.1:8099/> 即可开玩。

### 操作

| 按键 | 功能 |
|---|---|
| 鼠标 / WASD | 操控战机（俯仰、滚转） |
| 左键 / 空格 | 机炮射击 |
| 右键 / F | 发射导弹（需先锁定） |
| Shift | 加力冲刺 |
| Esc / P | 暂停 |
| M | 静音 |
| 准星对准敌机 | 自动锁定 |

---

## 二、目录结构

```
plane-war/
├── index.html                  入口（importmap 在此声明 three 的裸模块名）
├── css/style.css               HUD / 菜单 / 扫描线 / 雷达样式
├── js/
│   ├── main.js                 游戏主循环：玩家、敌机、波次、HUD、雷达、结算
│   ├── models.js               战机模型装配器（makeJet）
│   ├── world.js                场景：网格地面、星空、浮空柱体、小行星、光环、雾
│   ├── audio.js                WebAudio 实时音效合成 + 语音播放
│   ├── data-f16.js             F-16 的 base64 GLB（由 .glb 生成，勿手改）
│   ├── data-l159.js            L-159 的 base64 GLB（同上）
│   └── vendor/                 three.module.js + GLTFLoader + BufferGeometryUtils（本地化）
├── audio/vo_*.mp3              StepFun TTS 语音包（12 条）
├── assets/models/*.glb         模型源素材（运行时不再读取，仅保留作源）
├── tools/                      开发 / 测试 / 复现工具（见第三节）
├── CREDITS.txt                 第三方资源与许可
└── package.json
```

### 关于 `assets/models/*.glb` 与 `js/data-*.js`

部分静态托管平台会拒绝或不稳定地服务 `.glb` 这类二进制扩展名，因此两架战机被
**整体 base64 内嵌成 ES Module**（`js/data-f16.js` / `js/data-l159.js`），
运行时由 `GLTFLoader.parse()` 直接解析 `ArrayBuffer`。
游戏完全不依赖 `assets/models/` 目录，`.glb` 只作为源素材保留，
需要改模型时改 `.glb` 后重新生成即可：

```bash
node tools/pack-models.js            # 重新生成 js/data-*.js
node tools/pack-models.js --check    # 校验现有文件与 .glb 是否一致（CI 用）
```

---

## 三、tools/ —— 开发与测试工具

| 文件 | 作用 |
|---|---|
| `serve.js` | 零依赖静态服务器（`node tools/serve.js 8099`） |
| `pack-models.js` | `.glb` → base64 ES Module（`--check` 只校验不写入） |
| `cdp.js` | 极简 Chrome DevTools Protocol 客户端（仅依赖 `ws`） |
| `run-test.js` | 冒烟测试：启动、进菜单、开打、抓控制台错误、截图 |
| `shot.js` / `probe.js` | 截图 / 场景探针 |
| `tests/verify-model.js` | **模型健康检查**（曾经的线上事故回归测试，见第五节） |
| `tests/test2.js` | 飞行操控 / 加力 / 波次回归 |
| `tests/test3.js` | 静音 / 俯仰 / 推进 / 资源统计回归 |
| `tests/test4.js` | 死亡结算 / 重开 / 波次推进回归 |

CDP 类工具需要先以调试端口启动 Chrome，并在项目根目录执行一次 `npm install`（只为装 `ws`）：

```bash
npm install
node tools/serve.js 8099 &
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-profile \
  --ignore-certificate-errors --window-size=1440,810 &

node tools/tests/verify-model.js      # 模型体检
node tools/run-test.js                # 冒烟测试
URL=http://127.0.0.1:8099/index.html node tools/tests/test2.js
```

---

## 四、模型装配器 `makeJet()` 的工作方式

`js/models.js` 把 Sketchfab 上下载的模型统一装配成游戏可用的机体：

1. **烘焙**：把 glTF 节点层级的矩阵 `applyMatrix4` 进各 mesh 的几何体，
   再用 `BufferGeometryUtils.mergeGeometries()` 合并成**单个 mesh**（大幅降低 draw call）。
2. **居中 + 归一化**：按烘焙后的包围盒平移几何体，使机体中心位于原点、机头朝 `-Z`；
   `length` 参数把整机长度缩放到指定值，翼展等比缩放。
3. **轴向修正**：F-16 源模型机头朝 `+Z`，用 `yawFix = π` 转成 `-Z`；
   L-159 机头朝 `-X`，用 `yawFix = -π/2`。
4. **挂点定位**：按机体尺寸自动计算炮口、尾焰、翼下挂点位置，所以换模型不用改代码。

游戏内尺寸（缩放后，世界单位 ≈ 米）：

| 模型 | 尺寸（翼展 × 机高 × 机长） | 翼展/机长 | 真机翼展/机长 |
|---|---|---|---|
| F-16 Block 70（玩家） | 4.52 × 2.29 × **6.6** | 0.685 | 0.66 |
| Aero L-159A ALCA（敌机） | 4.53 × 1.89 × **6.0** | 0.755 | 0.75 |

---

## 五、曾经的坑：glTF 的量化 + 交错顶点缓冲（重要）

glTF 为了省体积，会把顶点属性**量化**成整数并**交错**存进同一个 buffer：
`position` 是 `InterleavedBufferAttribute`，底层是 `Int16Array/Uint16Array` 共享同一个
140 元素数组，并带 `normalized: true`。此时直接调用 `geometry.applyMatrix4()` 会：

* 把浮点结果**原样写回那个整数数组**，顶点被截断成 `0 / ±1` —— 机翼、尾翼直接归零；
* 同一 buffer 里的法线 / UV 被兄弟属性交叉污染；
* `geometry.clone()` 会**继承过期的 `boundingBox`**，`Box3.setFromObject()` 用本地旧盒子
  算出的 `span` 偏小（曾出现 2.0 vs 真实 9.97），归一化尺度跟着错。

**表现**：飞机塌成一个方块/畸形块在飞。

**修法**（`js/models.js` 的 `compactAttrs()`）：按 `data.stride` / `data.offset` **去交错**、
按 `normalized` 标志**去量化**（32767 / 65535 / 255 / 127），输出紧凑的 Float32 普通属性，
再进 `applyMatrix4`；烘焙与合并后补算 `computeBoundingBox()` / `computeBoundingSphere()`。

`node tools/tests/verify-model.js` 会把这三项全部纳入断言（NaN 数、是否残留交错/量化、
翼展比、三角面数），改动模型管线后跑一遍即可防回归。

---

## 六、发布

整个游戏是纯静态站点，把以下内容打包即可（`index.html` 必须在 zip 根）：

```
index.html  css/  js/  audio/
```

**不要**打 `assets/models/`（运行时不需要）和 `tools/`（开发工具）。
本仓库发布用的打包命令：

```bash
zip -r plane-war.zip . -x '.*' -x '__MACOSX*' -x 'assets/models/*' -x 'tools/*' \
    -x 'package.json' -x '*.md' -x 'CREDITS.txt'
```

---

## 七、许可

代码部分可自由使用。战机模型依据 **CC BY 4.0** 使用，需保留署名；
语音包由 StepFun TTS 合成；three.js 为 MIT License。详见 `CREDITS.txt`。
