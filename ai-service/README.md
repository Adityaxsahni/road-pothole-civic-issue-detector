# CivicPulse AI service

A FastAPI inference service for road-damage detection. The web app calls it when `AI_SERVICE_URL` is set, and falls back to its built-in analyser if the service is unavailable.

* **YOLO mode:** set `YOLO_WEIGHTS` to an Ultralytics `.pt` model and install `requirements-yolo.txt`.
* **Heuristic mode (default):** a NumPy port of CivicVision-Lite; no GPU or weights needed.

```bash
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q
```

| Env | Default | Description |
| --- | --- | --- |
| `YOLO_WEIGHTS` | — | Path to `.pt` weights (e.g. `weights/best.pt`) |
| `YOLO_CONFIDENCE` | `0.25` | Minimum box confidence |
| `MAX_UPLOAD_MB` | `15` | Upload size limit |

`GET /health` reports the active backend. `POST /detect` accepts a multipart `file` and returns the contract documented in [`../docs/api.md`](../docs/api.md#ai-service-contract). Model class names are mapped to CivicPulse categories in `app/detector.py` (`LABEL_MAP`); extend it for your model’s classes.
