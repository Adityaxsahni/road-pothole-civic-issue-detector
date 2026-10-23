"use client";

import { Camera, ImagePlus, Loader2, RotateCcw, Sparkles, Video, X } from "lucide-react";
import { useRef } from "react";
import { DetectionOverlay } from "@/components/reports/detection-overlay";
import { SeverityBadge } from "@/components/reports/badges";
import { Button } from "@/components/ui/button";
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES, MAX_MEDIA_FILES } from "@/lib/constants";
import { formatBytes } from "@/lib/client-media";
import type { DetectionSuggestion, MediaItem, WizardCategory } from "./types";

interface Props {
  media: MediaItem[];
  detection: DetectionSuggestion | null;
  detectionStatus: "idle" | "running" | "done" | "error";
  categories: WizardCategory[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onRetryDetection: () => void;
}

const ACCEPT = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(",");

export function StepMedia({
  media,
  detection,
  detectionStatus,
  categories,
  onAdd,
  onRemove,
  onRetryDetection,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const primary = media.find((m) => m.kind === "image") ?? media.find((m) => m.posterUrl);
  const primarySrc = primary ? (primary.kind === "image" ? primary.previewUrl : primary.posterUrl!) : null;
  const remaining = MAX_MEDIA_FILES - media.length;
  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length) onAdd(files);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handle}
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={handle}
        data-testid="media-input"
        aria-label="Upload photos or videos"
      />

      {media.length === 0 ? (
        <div className="border-input bg-muted/40 flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center">
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <Camera className="size-7" aria-hidden />
          </span>
          <p className="mt-4 font-semibold">Add a photo or short video</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-sm">
            A clear, close shot helps our AI identify the problem and estimate how severe it is.
          </p>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
            <Button size="lg" type="button" onClick={() => cameraRef.current?.click()}>
              <Camera className="!size-5" /> Take photo
            </Button>
            <Button size="lg" variant="outline" type="button" onClick={() => galleryRef.current?.click()}>
              <ImagePlus className="!size-5" /> Upload from device
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            JPEG, PNG, WebP up to 10 MB · MP4, WebM, MOV up to 50 MB
          </p>
        </div>
      ) : (
        <>
          {primarySrc && (
            <DetectionOverlay
              src={primarySrc}
              alt="Photo of the issue"
              box={detection?.boundingBox}
              label={
                detection?.categoryName
                  ? `${detection.categoryName} · ${Math.round(detection.confidence * 100)}%`
                  : undefined
              }
              imgClassName="max-h-[340px] object-contain"
            />
          )}
          <ul className="grid grid-cols-4 gap-2" aria-label="Attached media">
            {media.map((m) => (
              <li
                key={m.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-900"
              >
                {m.kind === "image" || m.posterUrl ? (
                  <img
                    src={m.kind === "image" ? m.previewUrl : m.posterUrl!}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-white/70">
                    <Video className="size-6" aria-hidden />
                  </div>
                )}
                {m.kind === "video" && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">
                    Video
                  </span>
                )}
                <span className="sr-only">{`${m.file.name}, ${formatBytes(m.file.size)}`}</span>
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                  aria-label={`Remove ${m.file.name}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {remaining > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="border-input text-muted-foreground hover:bg-muted flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs"
                >
                  <ImagePlus className="size-5" aria-hidden /> Add
                </button>
              </li>
            )}
          </ul>

          <div className="to-card rounded-xl border bg-gradient-to-br from-blue-50 p-4" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="text-primary size-4" aria-hidden /> AI analysis
            </div>
            {detectionStatus === "running" && (
              <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Analysing your photo…
              </p>
            )}
            {detectionStatus === "error" && (
              <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-sm">
                AI analysis is unavailable right now — you can still choose the category yourself.
                <Button size="sm" variant="outline" type="button" onClick={onRetryDetection}>
                  <RotateCcw /> Retry
                </Button>
              </div>
            )}
            {detectionStatus === "idle" && !primarySrc && (
              <p className="text-muted-foreground mt-2 text-sm">
                Add a photo (or a video we can grab a frame from) to get an AI suggestion.
              </p>
            )}
            {detectionStatus === "done" && detection && (
              <div className="mt-2 space-y-2 text-sm">
                {detection.categoryName ? (
                  <p>
                    Looks like a <strong>{detection.categoryName.toLowerCase()}</strong> —{" "}
                    {Math.round(detection.confidence * 100)}% confidence.
                  </p>
                ) : (
                  <p>We couldn&apos;t confidently identify the issue. You&apos;ll pick the category next.</p>
                )}
                {detection.categoryName && (
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    Estimated severity <SeverityBadge severity={detection.severity} />
                    {detection.alternatives.length > 0 && (
                      <span>
                        · also possible: {detection.alternatives.map((a) => categoryName(a.label)).join(", ")}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Model {detection.modelName} v{detection.modelVersion} · {detection.latencyMs} ms
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
