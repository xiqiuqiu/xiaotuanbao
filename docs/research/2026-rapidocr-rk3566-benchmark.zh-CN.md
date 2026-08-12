# RapidOCR 3.9.2 在 RK3566 上的隔离基准

> 测试日期：2026-08-12  
> 目标：在不影响现有 OCR 服务的前提下，评估当前硬件上更合理的 RapidOCR 版本、模型与运行参数。  
> 服务器：Armbian 26.2.1 Jammy，Linux aarch64，RK3566（4 × Cortex-A55 1.8GHz），3.8GiB RAM。

## 结论

首期推荐使用：

- `rapidocr==3.9.2`
- `onnxruntime==1.28.0`
- 检测与识别：`PP-OCRv6 tiny`
- 文本行方向分类：`PP-OCRv4 mobile`
- ONNX Runtime：独立服务器性能档使用 `intra_op_num_threads=4`；当前共享预览服务器安全档使用 `2`；`inter_op_num_threads=1`
- 检测：`limit_type=max`、`limit_side_len=640`
- 分类与识别批量：`4`
- 单 Worker、单活动 OCR；上层使用持久化队列

该组合在合成中文资料上比现有 `rapidocr_onnxruntime 1.4.4 + PP-OCRv4 mobile` 更快，并未观察到识别准确率下降。但样本规模不足以证明真实旅行社图片、聊天截图和扫描件的总体准确率，正式切换前仍须跑脱敏业务样本集。

2026-08-12 决策确认：开发阶段直接复用当前 RK3566 OCR 节点完成功能验证；正式生产环境使用独立解析服务器。小团宝通过稳定的 OCR 执行契约和可配置端点接入，不把业务逻辑、任务状态或资料归属绑定到当前开发节点。

预览环境实机网络核对：小团宝 API 运行在 Docker Compose 网络，OCR 运行在同一宿主机的 systemd；API 容器可通过 `http://host.docker.internal:8089` 访问 OCR，容器内的 `127.0.0.1:8089` 不可用。Cloudflare Tunnel 面向浏览器暴露小团宝入口，内部 OCR 调用不经过 Tunnel。生产环境迁移到独立解析服务器时，仅替换受配置管理的 OCR 端点与服务认证方式。

## 存储与隔离

服务器存储结构：

| 位置 | 介质 | 容量与状态 | 约束 |
|---|---|---|---|
| `/` | 5.5GB eMMC | 剩余约 1.5GB | 不存模型、环境、缓存或实验结果 |
| `/tmp` | tmpfs | 约 1.9GB | 不用于安装解包或大文件解析 |
| `/mnt/mydata` | 477GB SSD | 剩余约 356GB | OCR 全部持久资源的唯一落点 |

新版安装在 `/mnt/mydata/ocr-lab-rapidocr-3.9.2-20260812`，占用约 382MB。安装和运行显式重定向 `HOME`、`XDG_CACHE_HOME`、`PIP_CACHE_DIR` 与 `TMPDIR` 到该 SSD 目录。现有 `/mnt/mydata/ocr`、8089 端口和 `rapidocr.service` 均未修改；测试结束后健康检查仍为 `active/ok`。

## 模型与可复现性

| 模型 | SHA-256 |
|---|---|
| `PP-OCRv6_det_tiny.onnx` | `f42c0fbd294d95eac1a550e131b277dac97462c8025fa4b6c3cec1b7894bd3d5` |
| `PP-OCRv6_rec_tiny.onnx` | `e16e242de5937ad92609223f19bc2aff3727ee40b095f996907c24749bad251b` |
| `ch_ppocr_mobile_v2.0_cls_mobile.onnx` | `e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c` |

这些哈希与 RapidOCR 3.9.2 官方模型清单一致。正式镜像应预置并校验模型，运行时禁止自动下载。

## 基准结果

### 原有低密度样本

原测试图片只有 3–4 个超长文本行。旧版 HTTP 服务实测：

| 图片 | 旧版耗时 |
|---|---:|
| 640×480 | 4.74s |
| 800×600 | 6.19s |
| 1080p | 6.88s |
| 1920×1080 | 7.33s |

新版 `PP-OCRv6 tiny` 在单张 640×480 初测约 1.36s，并把旧版的 `Rapid0CR` 识别为正确的 `RapidOCR`。不同参数连续长测受 CPU 调频及机器其它服务影响，绝对耗时存在波动，因此主要用于筛除明显不合理的参数：

- 单线程大图约 10.9s，不采用；
- 2 线程、640 边长，大图约 7.8–8.4s；
- 736 边长没有增加识别内容，却普遍增加计算量；
- 4 线程总体延迟最低，但波动大于 2 线程。

### 密集中文资料样本

在 SSD 实验目录生成固定的 1280×1800、20 行中文发团资料样本，涵盖线路、日期、人数、负责人、八日行程、客源、团款、车辆、住宿及资料编号。旧版与新版均正确识别 20 行。

| 方案 | 耗时 | 结果 |
|---|---:|---|
| 旧版 v4，现有服务 | 10.22s | 20/20 行 |
| 新版 v6 tiny，2 线程、batch 6 | 7.21–7.49s | 20/20 行 |
| 新版 v6 tiny，4 线程、batch 6 | 热身后 6.56–6.63s | 20/20 行 |
| 新版 v6 tiny，4 线程、batch 4 | 5.93–6.14s | 20/20 行 |
| 新版 v6 tiny，4 线程、batch 10 | 6.14–6.48s | 20/20 行 |
| 新版 v6 tiny，4 线程、batch 20 | 6.51–6.67s | 20/20 行 |

新版进程峰值 RSS 约 480–520MB。考虑服务器同时运行小团宝、PostgreSQL、Garage、Affine、Hermes 等服务，不应启动多个 OCR Worker。

### 方向分类

| 样本 | 开启方向分类 | 关闭方向分类 |
|---|---|---|
| 正向 20 行 | 6.15s，20 行，均分 0.9927 | 5.96s，20 行，均分 0.9927 |
| 旋转 180° | 5.76s，20 行，均分 0.9943 | 5.61s，13 行乱码，均分 0.5928 |

关闭方向分类只节省约 0.18s，却会破坏倒置资料，故应常开。

## 部署建议

1. 将新版做成独立 Python Worker，不直接把当前 PoC HTTP 服务暴露给业务端。
2. NestJS 创建持久化解析任务；Worker 单并发领取，处理后返回文字、坐标、分数和版本证据。
3. Worker 的环境、模型、任务临时目录、日志和结果均放在 `/mnt/mydata`；systemd 显式设置 `HOME`、`XDG_CACHE_HOME`、`PIP_CACHE_DIR`、`TMPDIR`。
4. 当前共享预览服务器使用安全档：2 个推理线程、`Nice=10`、较低 `CPUWeight`、`CPUQuota` 约 200%、`MemoryHigh` 约 600MB、`MemoryMax` 约 750MB、`MemorySwapMax=0`，使 OCR 先被限流或终止，而不是拖垮同机 API、数据库与其它服务；独立生产服务器再根据基准切换至 4 线程性能档。
5. 保持 `OCR_MAX_CONCURRENCY=1`。用户并发由队列吸收，不复制模型进程。
6. 保留方向分类；检测边长默认 640；batch 默认 4。对极小字资料允许作为显式高质量档提升检测尺寸，而不是全局改为 736。
7. PDF 原生文本、Excel 和 Word 结构仍由确定性解析器处理；只有图片或扫描页进入 RapidOCR。

### 当前预览服务器的保守输入上限

当前机器只有 3.8GiB RAM，并同时运行小团宝、PostgreSQL、Garage、Affine、Hermes 等服务。开发验证应采用比平台附件 50MB 上限更严格的解析上限：

- 单个可解析文件最多 20MB；原件存储层仍可维持 50MB 平台上限；
- 图片最多 1200 万像素，解码后逐张处理；
- PDF 最多 20 页，逐页渲染与 OCR，单页渲染最多 800 万像素；
- XLSX 最多 10 个 Sheet、5 万个非空单元格、解压后最多 50MB；
- 单个解析任务最长 10 分钟，单页 OCR 最长 60 秒；
- 瞬时故障最多自动重试 1 次；
- 全局同时只执行 1 个解析任务，最多保留 20 个待处理任务，超出后拒绝新解析但不影响原件存档和手工录入。

这些值是共享预览服务器的保护参数，不应照搬到独立生产解析服务器。正式生产环境应根据其 CPU、内存和真实资料基准重新标定。

## 尚未验证

- 真实旅行社资料、手机截图、压缩图、倾斜照片、小字表格和低光照片的字符准确率；
- 50–100 页扫描 PDF 的连续温度、峰值内存、队列恢复与吞吐；
- 业务高峰时 OCR 四线程对 NestJS/PostgreSQL 延迟的影响；
- 长时间运行后的内存增长；
- RapidTable、RapidLayout 或 RKNN/NPU 路线。

因此当前结论是“推荐首期基线”，不是直接替换生产服务的授权。

## 一手资料

- [RapidOCR 官方仓库](https://github.com/RapidAI/RapidOCR)
- [RapidOCR 3.9.2 模型清单](https://github.com/RapidAI/RapidOCR/blob/v3.9.2/python/rapidocr/default_models.yaml)
- [RapidOCR 推理引擎说明](https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/how_to_use_infer_engine/)
- [RapidOCR 参数说明](https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/parameters/)
