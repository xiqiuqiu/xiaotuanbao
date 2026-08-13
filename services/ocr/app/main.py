from __future__ import annotations

import asyncio
import math
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

import fitz
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from rapidocr import RapidOCR

SERVICE_VERSION = "1.0.0"
ENGINE_VERSION = "3.9.2"
MAX_FILE_BYTES = int(os.getenv("OCR_MAX_FILE_BYTES", str(20 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("OCR_MAX_IMAGE_PIXELS", "12000000"))
MAX_PDF_PAGES = int(os.getenv("OCR_MAX_PDF_PAGES", "20"))
MAX_PDF_PAGE_PIXELS = int(os.getenv("OCR_MAX_PDF_PAGE_PIXELS", "8000000"))
PDF_RENDER_DPI = int(os.getenv("OCR_PDF_RENDER_DPI", "144"))
TMP_DIR = Path(os.getenv("OCR_TMP_DIR", "/tmp/ocr"))
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff"}
ALLOWED_PDF_TYPES = {"application/pdf"}


class ErrorDetail(BaseModel):
    code: str
    message: str


class HealthResponse(BaseModel):
    status: str
    serviceVersion: str
    engine: str
    engineVersion: str
    backend: str
    maxConcurrency: int


def structured_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail=ErrorDetail(code=code, message=message).model_dump(),
    )


def as_json_value(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    return value


def normalize_page_result(result: Any, page_number: int, width: int, height: int, elapsed_ms: int) -> dict[str, Any]:
    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)
    if boxes is None or texts is None or scores is None:
        return {"pageNumber": page_number, "width": width, "height": height, "elapsedMs": elapsed_ms, "lines": []}

    lines = []
    for box, text, score in zip(boxes, texts, scores, strict=False):
        lines.append({"text": str(text), "score": float(as_json_value(score)), "box": as_json_value(box)})
    return {"pageNumber": page_number, "width": width, "height": height, "elapsedMs": elapsed_ms, "lines": lines}


def run_page_ocr(engine: RapidOCR, image: Image.Image, page_number: int) -> dict[str, Any]:
    width, height = image.size
    started_at = time.perf_counter()
    result = engine(np.asarray(image.convert("RGB")))
    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    return normalize_page_result(result, page_number, width, height, elapsed_ms)


def image_pages(path: Path) -> list[Image.Image]:
    try:
        image = Image.open(path)
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise structured_error(422, "OCR_INVALID_IMAGE", "文件不是可识别的图片") from error
    width, height = image.size
    if width * height > MAX_IMAGE_PIXELS:
        image.close()
        raise structured_error(413, "OCR_IMAGE_TOO_LARGE", f"图片像素不能超过 {MAX_IMAGE_PIXELS}")
    return [image]


def pdf_pages(path: Path) -> list[Image.Image]:
    try:
        document = fitz.open(path)
    except (fitz.FileDataError, RuntimeError) as error:
        raise structured_error(422, "OCR_INVALID_PDF", "文件不是可识别的 PDF") from error

    with document:
        if document.page_count > MAX_PDF_PAGES:
            raise structured_error(413, "OCR_PDF_TOO_MANY_PAGES", f"PDF 页数不能超过 {MAX_PDF_PAGES}")
        images: list[Image.Image] = []
        base_scale = PDF_RENDER_DPI / 72
        for page in document:
            target_pixels = page.rect.width * base_scale * page.rect.height * base_scale
            scale = base_scale
            if target_pixels > MAX_PDF_PAGE_PIXELS:
                scale *= math.sqrt(MAX_PDF_PAGE_PIXELS / target_pixels)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            images.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
        return images


async def save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "upload").suffix.lower()
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    descriptor, raw_path = tempfile.mkstemp(prefix="ocr-", suffix=suffix, dir=TMP_DIR)
    path = Path(raw_path)
    size = 0
    try:
        with os.fdopen(descriptor, "wb") as target:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise structured_error(413, "OCR_FILE_TOO_LARGE", f"文件不能超过 {MAX_FILE_BYTES} 字节")
                target.write(chunk)
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    app.state.engine = RapidOCR()
    app.state.inference_semaphore = asyncio.Semaphore(1)
    yield


app = FastAPI(title="Xiaotuanbao Local OCR", version=SERVICE_VERSION, lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", serviceVersion=SERVICE_VERSION, engine="RapidOCR", engineVersion=ENGINE_VERSION, backend="ONNX Runtime CPU", maxConcurrency=1)


@app.post("/v1/ocr")
async def recognize(file: Annotated[UploadFile, File(...)]) -> dict[str, Any]:
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES | ALLOWED_PDF_TYPES:
        raise structured_error(415, "OCR_UNSUPPORTED_MEDIA_TYPE", "仅支持 PNG、JPEG、WebP、TIFF 和 PDF")

    path = await save_upload(file)
    request_id = str(uuid.uuid4())
    started_at = time.perf_counter()
    pages: list[Image.Image] = []
    try:
        pages = pdf_pages(path) if content_type in ALLOWED_PDF_TYPES else image_pages(path)
        async with app.state.inference_semaphore:
            results = []
            for index, image in enumerate(pages, start=1):
                results.append(await asyncio.to_thread(run_page_ocr, app.state.engine, image, index))
        return {"requestId": request_id, "engine": {"name": "RapidOCR", "version": ENGINE_VERSION, "backend": "onnxruntime-cpu"}, "pages": results, "totalElapsedMs": round((time.perf_counter() - started_at) * 1000)}
    finally:
        for image in pages:
            image.close()
        path.unlink(missing_ok=True)
