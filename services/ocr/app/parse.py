from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import fitz
from PIL import Image

PARSER_VERSIONS = {
    "pdfInspector": "1.14.2",
    "rapidocr": "3.9.2",
    "pymupdf": "1.26.3",
}


def as_page_number(raw: int, one_based: bool) -> int:
    return raw if one_based else raw + 1


def render_pdf_page(path: Path, page_index: int) -> Image.Image:
    from .main import MAX_PDF_PAGE_PIXELS, PDF_RENDER_DPI, structured_error

    document = fitz.open(path)
    with document:
        if page_index < 0 or page_index >= document.page_count:
            raise structured_error(422, "OCR_INVALID_PDF", "PDF 页码超出范围")
        page = document[page_index]
        base_scale = PDF_RENDER_DPI / 72
        target_pixels = page.rect.width * base_scale * page.rect.height * base_scale
        scale = base_scale
        if target_pixels > MAX_PDF_PAGE_PIXELS:
            scale *= math.sqrt(MAX_PDF_PAGE_PIXELS / target_pixels)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def native_page(page_number: int, markdown: str, items: list[Any]) -> dict[str, Any]:
    lines = []
    for item in items:
        if int(getattr(item, "page", page_number)) != page_number:
            continue
        lines.append(
            {
                "text": str(getattr(item, "text", "")),
                "box": [
                    float(getattr(item, "x", 0)),
                    float(getattr(item, "y", 0)),
                    float(getattr(item, "width", 0)),
                    float(getattr(item, "height", 0)),
                ],
                "coordinateSystem": "pdf_point",
            }
        )
    text = "\n".join(line["text"] for line in lines if line["text"]).strip() or markdown
    return {
        "pageNumber": page_number,
        "source": "native_pdf",
        "text": text,
        "markdown": markdown,
        "lines": lines,
    }


def ocr_page(engine: Any, image: Image.Image, page_number: int) -> dict[str, Any]:
    from .main import PDF_RENDER_DPI, run_page_ocr

    result = run_page_ocr(engine, image, page_number)
    lines = []
    for line in result.get("lines", []):
        lines.append(
            {
                "text": str(line.get("text", "")),
                "score": line.get("score"),
                "box": line.get("box"),
                "coordinateSystem": "pixel",
            }
        )
    return {
        "pageNumber": page_number,
        "source": "ocr",
        "text": "\n".join(line["text"] for line in lines if line["text"]),
        "width": result.get("width"),
        "height": result.get("height"),
        "dpi": PDF_RENDER_DPI,
        "elapsedMs": result.get("elapsedMs"),
        "lines": lines,
    }


def parse_image(path: Path, engine: Any) -> dict[str, Any]:
    from .main import image_pages

    images = image_pages(path)
    try:
        pages = [ocr_page(engine, image, 1) for image in images[:1]]
    finally:
        for image in images:
            image.close()
    return {"parserVersions": PARSER_VERSIONS, "fallbackUsed": False, "pages": pages}


def parse_pdf(path: Path, engine: Any) -> dict[str, Any]:
    import pdf_inspector
    from .main import MAX_PDF_PAGES, structured_error

    try:
        markdown_result = pdf_inspector.extract_pages_markdown(str(path))
        positions = pdf_inspector.extract_text_with_positions(str(path))
    except Exception as error:
        raise structured_error(422, "PARSE_PDF_INSPECTOR_FAILED", "pdf-inspector 无法处理该 PDF") from error

    pages_out: list[dict[str, Any]] = []
    fallback_used = False
    page_count = len(markdown_result.pages)
    if page_count > MAX_PDF_PAGES:
        raise structured_error(413, "OCR_PDF_TOO_MANY_PAGES", f"PDF 页数不能超过 {MAX_PDF_PAGES}")

    for page in markdown_result.pages:
        page_number = as_page_number(int(page.page), one_based=False)
        if page.needs_ocr:
            image = render_pdf_page(path, page_number - 1)
            try:
                pages_out.append(ocr_page(engine, image, page_number))
            finally:
                image.close()
        else:
            pages_out.append(native_page(page_number, page.markdown or "", positions))

    return {
        "parserVersions": PARSER_VERSIONS,
        "fallbackUsed": fallback_used,
        "pages": pages_out,
    }


def parse_pdf_with_fallback(path: Path, engine: Any) -> dict[str, Any]:
    try:
        return parse_pdf(path, engine)
    except Exception:
        from .main import pdf_pages

        images = pdf_pages(path)
        try:
            pages = [ocr_page(engine, image, index) for index, image in enumerate(images, start=1)]
        finally:
            for image in images:
                image.close()
        return {"parserVersions": PARSER_VERSIONS, "fallbackUsed": True, "pages": pages}
