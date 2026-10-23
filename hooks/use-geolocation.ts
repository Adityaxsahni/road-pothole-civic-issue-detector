"use client";

import { useCallback, useState } from "react";

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type GeoStatus = "idle" | "locating" | "success" | "denied" | "unavailable" | "error";

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(
    () =>
      new Promise<GeoFix | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          setStatus("unavailable");
          setError("Location is not available on this device. Drop a pin on the map instead.");
          resolve(null);
          return;
        }
        setStatus("locating");
        setError(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setStatus("success");
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          (err) => {
            const denied = err.code === err.PERMISSION_DENIED;
            setStatus(denied ? "denied" : "error");
            setError(
              denied
                ? "Location permission was denied. Allow it in your browser settings or drop a pin on the map."
                : "We couldn't get a GPS fix. Move outdoors or drop a pin on the map.",
            );
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
        );
      }),
    [],
  );

  return { status, error, locate };
}
