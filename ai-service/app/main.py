"""CivicPulse inference service (FastAPI).

Endpoints
  GET  /health   -> liveness + which backend is active
  POST /detect   -> multipart `file` (JPEG/PNG/WebP) -> detection JSON
"""

from __future__ import annotations

import io
import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .detector import load_detector

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

MAX_BYTES = int(float(os.getenv("MAX_UPLOAD_MB", "15")) * 1024 * 1024)
Image.MAX_IMAGE_PIXELS = 60_000_000  # guard against decompression bombs

app = FastAPI(title="CivicPulse AI", version="1.0.0")
detector = load_detector()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": detector.name, "version": detector.version}


@app.post("/detect")
async def detect(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=415, detail="Unsupported or corrupt image") from exc
    if image.format not in {"JPEG", "PNG", "WEBP"}:
        raise HTTPException(status_code=415, detail=f"Unsupported format {image.format}")
    return detector.detect(image)
