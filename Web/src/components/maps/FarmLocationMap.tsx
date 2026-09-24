"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { GeoPoint } from "@krishecarbon/shared";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function googleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

interface FarmLocationMapProps {
  latitude?: number | null;
  longitude?: number | null;
  points?: GeoPoint[];
  className?: string;
  interactive?: boolean;
}

function finiteCoord(value?: number | null) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function closedRing(points: GeoPoint[]): [number, number][] {
  const ring: [number, number][] = points.map((point) => [
    point.longitude,
    point.latitude,
  ]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

export default function FarmLocationMap({
  latitude,
  longitude,
  points = [],
  className = "h-48",
  interactive = true,
}: FarmLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lat = finiteCoord(latitude);
  const lng = finiteCoord(longitude);
  const polygonKey = points
    .filter(
      (point) =>
        Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    )
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");

  useEffect(() => {
    const container = containerRef.current;
    const polygon: GeoPoint[] = polygonKey
      ? polygonKey.split(";").map((pair) => {
          const [longitude, latitude] = pair.split(",").map(Number);
          return { latitude, longitude };
        })
      : [];
    if (!container || !mapboxgl.accessToken) return;
    if (lat == null && lng == null && polygon.length < 3) return;

    const first = polygon[0];
    let center: [number, number] | null = null;
    if (lng != null && lat != null) center = [lng, lat];
    else if (first) center = [first.longitude, first.latitude];
    if (!center) return;

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center,
      zoom: 16,
      interactive,
      attributionControl: false,
    });

    if (interactive) {
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );
    }
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    const marker =
      lat != null && lng != null
        ? new mapboxgl.Marker({ color: "#1A3C2A" })
            .setLngLat([lng, lat])
            .addTo(map)
        : null;

    map.on("load", () => {
      if (polygon.length >= 3) {
        map.addSource("farm-boundary", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [closedRing(polygon)],
            },
          },
        });
        map.addLayer({
          id: "farm-boundary-fill",
          type: "fill",
          source: "farm-boundary",
          paint: {
            "fill-color": "#86efac",
            "fill-opacity": 0.45,
          },
        });
        map.addLayer({
          id: "farm-boundary-line",
          type: "line",
          source: "farm-boundary",
          paint: {
            "line-color": "#facc15",
            "line-width": 2.5,
          },
        });
      }

      const bounds = new mapboxgl.LngLatBounds();
      for (const point of polygon) {
        bounds.extend([point.longitude, point.latitude]);
      }
      if (lat != null && lng != null) bounds.extend([lng, lat]);
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 32,
          maxZoom: polygon.length >= 3 ? 17 : 16,
          duration: 0,
        });
      }
      map.resize();
      const resizeTimer = window.setTimeout(() => map.resize(), 300);
      map.once("remove", () => window.clearTimeout(resizeTimer));
    });

    return () => {
      marker?.remove();
      map.remove();
    };
  }, [interactive, lat, lng, polygonKey]);

  const hasPolygon = polygonKey.split(";").filter(Boolean).length >= 3;

  if (!mapboxgl.accessToken) {
    return (
      <p className="text-sm text-neutral-500">
        Map preview needs a Mapbox token.
      </p>
    );
  }

  if (lat == null && lng == null && !hasPolygon) return null;

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden rounded-xl border border-neutral-200 ${className}`}
    />
  );
}
