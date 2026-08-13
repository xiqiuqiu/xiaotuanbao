FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/opt/ocr \
    XDG_CACHE_HOME=/opt/ocr/cache \
    OCR_TMP_DIR=/tmp/ocr \
    OMP_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    MKL_NUM_THREADS=4

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --requirement requirements.txt

COPY services/ocr/app ./app

# RapidOCR 3.9.2 ships its selected models in the package. Instantiating the
# engine during the build verifies the ARM64 wheels and model files early.
RUN mkdir -p /opt/ocr/cache /tmp/ocr \
    && python -c "from rapidocr import RapidOCR; RapidOCR()"

EXPOSE 8089

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8089/health', timeout=2)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8089", "--workers", "1"]
