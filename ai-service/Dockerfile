FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Set INSTALL_YOLO=true to bake in Ultralytics/PyTorch for learned detection.
ARG INSTALL_YOLO=false
COPY requirements.txt requirements-yolo.txt ./
RUN if [ "$INSTALL_YOLO" = "true" ]; then pip install -r requirements-yolo.txt; else pip install -r requirements.txt; fi

COPY app ./app
COPY weights ./weights

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
