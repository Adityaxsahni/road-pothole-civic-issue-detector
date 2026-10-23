import type { DetectionResult, MediaAsset } from "@prisma/client";
import { DetectionOverlay, type NormalizedBox } from "./detection-overlay";

/** Report media: the primary image carries the AI bounding box; videos stream via range requests. */
export function MediaGallery({
  media,
  detections,
  labelFor,
}: {
  media: MediaAsset[];
  detections: DetectionResult[];
  labelFor: (slug: string) => string;
}) {
  if (media.length === 0) return <p className="text-muted-foreground text-sm">No media attached.</p>;
  const [first, ...rest] = [...media].sort(
    (a, b) =>
      Number(a.type === "VIDEO") - Number(b.type === "VIDEO") || Number(a.derived) - Number(b.derived),
  );
  const detectionFor = (id: string) => detections.find((d) => d.mediaAssetId === id);
  const firstDet = detectionFor(first.id);

  return (
    <div className="flex flex-col gap-3">
      {first.type === "IMAGE" ? (
        <a
          href={first.url}
          target="_blank"
          rel="noreferrer"
          className="block"
          aria-label="Open full-size photo"
        >
          <DetectionOverlay
            src={first.url}
            alt="Reported issue"
            box={(firstDet?.boundingBox as NormalizedBox | null) ?? null}
            label={
              firstDet && firstDet.label !== "other"
                ? `${labelFor(firstDet.label)} · ${Math.round(firstDet.confidence * 100)}%`
                : undefined
            }
            imgClassName="max-h-[420px] object-contain"
          />
        </a>
      ) : (
        <video
          src={first.url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[420px] w-full rounded-xl bg-slate-900"
        />
      )}
      {rest.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rest.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-lg border bg-slate-900">
              {m.type === "IMAGE" ? (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={m.derived ? "Open video frame" : "Open photo"}
                >
                  <img src={m.thumbnailUrl ?? m.url} alt="" className="aspect-square w-full object-cover" />
                </a>
              ) : (
                <video
                  src={m.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-square w-full object-cover"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
