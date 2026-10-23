"""Detection backends for the CivicPulse inference service.

* ``YoloDetector`` wraps an Ultralytics YOLO model (v5/v8/v11 ``.pt`` weights). Point
  ``YOLO_WEIGHTS`` at a road-damage model, e.g. one trained on RDD2022 or a pothole dataset.
* ``HeuristicDetector`` is a NumPy port of the app's built-in CivicVision-Lite analyser and is
  used automatically when no weights (or no ``ultralytics`` install) are available.

Both return the same dictionary shape, consumed by ``server/ai/remote.ts`` in the web app.
"""

from __future__ import annotations

import logging
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from PIL import Image

log = logging.getLogger("civicpulse.ai")

# Map model class names (lower-cased) to CivicPulse category slugs.
LABEL_MAP: dict[str, str] = {
    "pothole": "pothole",
    "potholes": "pothole",
    "d40": "pothole",  # RDD2022: pothole
    "d00": "road-crack",  # longitudinal crack
    "d10": "road-crack",  # transverse crack
    "d20": "road-crack",  # alligator crack
    "crack": "road-crack",
    "cracks": "road-crack",
    "manhole": "open-manhole",
    "open_manhole": "open-manhole",
    "garbage": "trash",
    "trash": "trash",
    "litter": "trash",
    "waterlogging": "blocked-drain",
    "flood": "blocked-drain",
    "water": "water-leak",
    "puddle": "water-leak",
}

DAMAGE_LABELS = {"pothole", "road-crack", "open-manhole"}


class Detector(Protocol):
    name: str
    version: str

    def detect(self, image: Image.Image) -> dict[str, Any]: ...


def _result(name: str, version: str, label: str, confidence: float, bbox: dict | None,
            damage: float | None, detections: list[dict], started: float) -> dict[str, Any]:
    return {
        "model_name": name,
        "model_version": version,
        "label": label,
        "confidence": round(float(confidence), 3),
        "bbox": bbox,
        "damage_area_ratio": None if damage is None else round(float(damage), 4),
        "detections": detections,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


# ───────────────────────────── YOLO ─────────────────────────────


class YoloDetector:
    def __init__(self, weights: str, conf: float = 0.25) -> None:
        from ultralytics import YOLO  # imported lazily: optional dependency

        self.model = YOLO(weights)
        self.conf = conf
        self.name = f"yolo:{os.path.basename(weights)}"
        self.version = getattr(self.model, "ckpt", {}).get("version", "custom") if hasattr(self.model, "ckpt") else "custom"

    def detect(self, image: Image.Image) -> dict[str, Any]:
        started = time.perf_counter()
        result = self.model.predict(image, conf=self.conf, verbose=False)[0]
        names = result.names
        detections: list[dict] = []
        damage = 0.0
        for box, conf, cls in zip(result.boxes.xyxyn.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist()):
            raw = str(names[int(cls)]).lower()
            label = LABEL_MAP.get(raw, "other")
            x1, y1, x2, y2 = (max(0.0, min(1.0, v)) for v in box)
            bbox = {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1}
            detections.append({"label": label, "confidence": round(conf, 3), "bbox": bbox, "raw_label": raw})
            if label in DAMAGE_LABELS:
                damage += bbox["w"] * bbox["h"]
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        if not detections:
            return _result(self.name, str(self.version), "other", 0.3, None, None, [], started)
        best = detections[0]
        return _result(self.name, str(self.version), best["label"], best["confidence"], best["bbox"],
                       min(1.0, damage) if damage else None, detections[:10], started)


# ───────────────────────────── Heuristic ─────────────────────────────

W, H = 160, 120
ROI_TOP = int(round(H * 0.28))


def _band(v: float, lo: float, peak_lo: float, peak_hi: float, hi: float) -> float:
    if v <= lo or v >= hi:
        return 0.0
    if v < peak_lo:
        return (v - lo) / (peak_lo - lo)
    if v > peak_hi:
        return (hi - v) / (hi - peak_hi)
    return 1.0


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


@dataclass
class _Component:
    area: int
    min_x: int
    min_y: int
    max_x: int
    max_y: int
    gray_sum: float

    @property
    def fill(self) -> float:
        return self.area / ((self.max_x - self.min_x + 1) * (self.max_y - self.min_y + 1))


def _components(mask: np.ndarray, gray: np.ndarray) -> list[_Component]:
    seen = np.zeros_like(mask, dtype=bool)
    out: list[_Component] = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        c = _Component(0, W, H, 0, 0, 0.0)
        queue = deque([(y0, x0)])
        seen[y0, x0] = True
        while queue:
            y, x = queue.popleft()
            c.area += 1
            c.gray_sum += float(gray[y, x])
            c.min_x, c.max_x = min(c.min_x, x), max(c.max_x, x)
            c.min_y, c.max_y = min(c.min_y, y), max(c.max_y, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        out.append(c)
    return sorted(out, key=lambda c: c.area, reverse=True)


class HeuristicDetector:
    name = "civicvision-lite-py"
    version = "1.2.0"

    def features(self, image: Image.Image) -> tuple[dict[str, float], dict | None]:
        rgb = np.asarray(image.convert("RGB").resize((W, H)), dtype=np.float32)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        gray = 0.299 * r + 0.587 * g + 0.114 * b
        mx, mn = rgb.max(axis=2), rgb.min(axis=2)
        sat = np.where(mx == 0, 0, (mx - mn) / np.maximum(mx, 1e-6))
        delta = np.maximum(mx - mn, 1e-6)
        hue = np.select(
            [mx == r, mx == g],
            [((g - b) / delta) % 6, (b - r) / delta + 2],
            default=(r - g) / delta + 4,
        ) * 60
        hue = np.where(mx == mn, 0, hue)

        roi = np.zeros((H, W), dtype=bool)
        roi[ROI_TOP:, :] = True
        road = roi & (sat < 0.22) & (gray > 25) & (gray < 215)
        road_mean = float(gray[road].mean()) if road.any() else 128.0
        road_std = float(gray[road].std()) if road.any() else 40.0
        water = roi & (hue >= 185) & (hue <= 235) & (sat > 0.28) & (gray > 40)
        clutter = roi & ~water & (sat > 0.42) & (gray > 40)
        hist = np.bincount((hue[clutter] // 30).astype(int) % 12, minlength=12) if clutter.any() else np.zeros(12)
        hue_diversity = int((hist / max(hist.sum(), 1) > 0.04).sum()) if hist.sum() else 0

        dark_threshold = min(road_mean - 1.1 * road_std, road_mean * 0.62)
        dark = roi & (gray < dark_threshold) & (sat < 0.45)
        comps = _components(dark, gray)
        compact = next((c for c in comps if c.area >= 12 and c.fill >= 0.3), None)
        blob_ratio = blob_fill = blob_contrast = 0.0
        bbox = None
        if compact:
            blob_ratio = compact.area / (W * H)
            blob_fill = compact.fill
            blob_contrast = _clamp((road_mean - compact.gray_sum / compact.area) / max(road_mean, 1))
            bbox = {
                "x": compact.min_x / W,
                "y": compact.min_y / H,
                "w": (compact.max_x - compact.min_x + 1) / W,
                "h": (compact.max_y - compact.min_y + 1) / H,
            }
        thin = 0
        for c in comps:
            if c is compact or c.area < 6:
                continue
            bw, bh = c.max_x - c.min_x + 1, c.max_y - c.min_y + 1
            if c.fill < 0.3 or max(bw, bh) / max(1, min(bw, bh)) > 3:
                thin += c.area
        roi_count = int(roi.sum())
        extra_dark = int((dark & ~((sat < 0.22) & (gray > 25))).sum())
        return (
            {
                "road_ratio": (int(road.sum()) + extra_dark) / roi_count,
                "blob_ratio": blob_ratio,
                "blob_fill": blob_fill,
                "blob_contrast": blob_contrast,
                "thin_dark_ratio": thin / (W * H),
                "water_ratio": int(water.sum()) / roi_count,
                "clutter_ratio": int(clutter.sum()) / roi_count,
                "hue_diversity": float(hue_diversity),
                "brightness": float(gray.mean() / 255),
            },
            bbox,
        )

    @staticmethod
    def classify(f: dict[str, float]) -> dict[str, float]:
        road = _clamp(0.35 + f["road_ratio"])
        pothole = road * _band(f["blob_ratio"], 0.004, 0.03, 0.35, 0.6) * _clamp(f["blob_fill"] / 0.5) * _clamp((f["blob_contrast"] - 0.15) / 0.3)
        crack = road * _band(f["thin_dark_ratio"], 0.003, 0.015, 0.12, 0.3) * (1 - 0.6 * _clamp(f["blob_ratio"] / 0.08))
        water = _band(f["water_ratio"], 0.03, 0.15, 1, 1.01)
        debris = _clamp(f["clutter_ratio"] / 0.02) * _clamp(f["hue_diversity"] / 4)
        return {
            "pothole": pothole,
            "road-crack": crack,
            "water-leak": water * (1 - 0.8 * debris),
            "blocked-drain": min(_band(f["water_ratio"], 0.04, 0.12, 1, 1.01), debris) * 0.85,
            "trash": _band(f["clutter_ratio"], 0.04, 0.15, 1, 1.01) * _clamp(f["hue_diversity"] / 5),
            "broken-streetlight": _clamp((0.2 - f["brightness"]) / 0.1) * 0.7 if f["brightness"] < 0.2 else 0.0,
            "other": 0.22,
        }

    def detect(self, image: Image.Image) -> dict[str, Any]:
        started = time.perf_counter()
        features, bbox = self.features(image)
        ranked = sorted(self.classify(features).items(), key=lambda kv: kv[1], reverse=True)
        best_label, best = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        confidence = 0.3 if best_label == "other" else _clamp(0.45 + 0.5 * best - 0.25 * second, 0.3, 0.97)
        uses_blob = best_label in ("pothole", "blocked-drain")
        damage = features["blob_ratio"] if uses_blob else (features["thin_dark_ratio"] * 3 if best_label == "road-crack" else None)
        detections = [
            {"label": label, "confidence": round(_clamp(0.45 + 0.5 * score, 0.3, 0.97), 3), "bbox": bbox if label in ("pothole", "blocked-drain") else None}
            for label, score in ranked
            if label != "other" and score >= 0.15
        ][:3]
        return _result(self.name, self.version, best_label, confidence, bbox if uses_blob else None, damage, detections, started)


def load_detector() -> Detector:
    weights = os.getenv("YOLO_WEIGHTS", "").strip()
    if weights and os.path.exists(weights):
        try:
            detector = YoloDetector(weights, conf=float(os.getenv("YOLO_CONFIDENCE", "0.25")))
            log.info("Loaded YOLO weights from %s", weights)
            return detector
        except Exception as exc:  # pragma: no cover - depends on optional install
            log.warning("Could not load YOLO (%s); falling back to heuristic detector", exc)
    elif weights:
        log.warning("YOLO_WEIGHTS=%s not found; using heuristic detector", weights)
    return HeuristicDetector()
