/**
 * Browser-side media helpers for the reporting wizard. Downscaling on the device keeps uploads
 * fast on mobile data; the server re-validates and re-encodes everything regardless.
 */

const MAX_EDGE = 2048;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/** Grab a representative frame from a video so the AI can analyse it. */
export function extractVideoFrame(file: File, atSeconds = 0.8): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const cleanup = (result: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => cleanup(null), 10_000);
    video.addEventListener("error", () => {
      clearTimeout(timer);
      cleanup(null);
    });
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, (video.duration || 1) / 2));
    });
    video.addEventListener("seeked", () => {
      clearTimeout(timer);
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => cleanup(blob), "image/jpeg", 0.85);
    });
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
