# 本地 RapidOCR 开发环境

本地 OCR 是可选服务，不会把 Python 依赖安装到 macOS，也不会阻塞不涉及资料解析的日常开发。当前镜像固定使用 RapidOCR 3.9.2 与 ONNX Runtime CPU，支持 Apple Silicon Docker。

## 启动

```bash
pnpm ocr:up
curl http://127.0.0.1:8089/health
pnpm ocr:smoke
```

首次构建会安装 Python 依赖并校验模型，耗时明显长于后续启动。服务只绑定本机回环地址，不对局域网或公网开放。

本地直接运行 NestJS 时使用：

```dotenv
OCR_BASE_URL=http://127.0.0.1:8089
OCR_REQUEST_TIMEOUT_MS=60000
PARSE_SERVICE_TOKEN=
```

如果 NestJS 也运行在同一个 Compose 网络中，则使用 `http://ocr:8089`。预览服务器仍使用已确认的 `http://host.docker.internal:8089`，生产地址由部署环境单独配置。

## 识别接口

- `GET /health`：服务、RapidOCR 与推理后端版本。
- `POST /v1/parse`：发团资料解析。PDF 先走 pdf-inspector 1.14.2 按页路由，`needsOcr` 页和图片再进 RapidOCR。设置 `PARSE_SERVICE_TOKEN` 后要求 `Authorization: Bearer`。
- `POST /v1/ocr`：兼容全页 OCR。multipart 字段 `file`，支持 PNG、JPEG、WebP、TIFF 和 PDF。
- 返回逐页文本行、坐标、来源（`native_pdf` / `ocr`）与解析器版本，供 NestJS 转为发团资料解析结果。

```bash
curl --form 'file=@/absolute/path/to/sample.png' http://127.0.0.1:8089/v1/ocr
```

## 本地保护参数

- 单进程、全局推理并发 1；
- 文件最多 20MB；
- 图片最多 1200 万像素；
- PDF 最多 20 页，单页渲染最多 800 万像素；
- 容器内存上限 2GB；
- 上传与 PDF 渲染临时文件写入项目 `tmp/ocr`，任务结束后立即清理。

这些值用于功能开发，不代表生产容量。普通单元测试应使用假的 OCR 适配器；真实服务用于集成测试和人工冒烟。

## 停止和排错

```bash
pnpm ocr:logs
pnpm ocr:down
```
