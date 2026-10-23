import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app

client = TestClient(app)


def road_image(pothole: bool) -> bytes:
    img = Image.new("RGB", (640, 480), (119, 115, 109))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, 640, 110], fill=(207, 224, 238))
    if pothole:
        draw.ellipse([220, 300, 420, 400], fill=(92, 88, 83))
        draw.ellipse([235, 310, 405, 390], fill=(38, 36, 31))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_detects_pothole_with_bbox():
    res = client.post("/detect", files={"file": ("p.jpg", road_image(True), "image/jpeg")})
    assert res.status_code == 200
    body = res.json()
    assert body["label"] == "pothole"
    assert 0.3 <= body["confidence"] <= 0.97
    assert body["bbox"]["y"] > 0.4
    assert body["damage_area_ratio"] > 0.01


def test_clean_road_is_other():
    res = client.post("/detect", files={"file": ("r.jpg", road_image(False), "image/jpeg")})
    assert res.json()["label"] == "other"


def test_rejects_non_images():
    res = client.post("/detect", files={"file": ("x.jpg", b"not an image", "image/jpeg")})
    assert res.status_code == 415
