"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { GeoPoint } from "@krishecarbon/shared";

import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const SOURCE = "site-boundary";

type SiteBoundaryMapProps = {
  points: GeoPoint[];
  onChange?: (points: GeoPoint[]) => void;
  focus?: { lat: number; lng: number } | null;
  readOnly?: boolean;
};

function featureCollection(points: GeoPoint[]): GeoJSON.FeatureCollection {
  const corners: GeoJSON.Feature[] = points.map((point) => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "Point",
      coordinates: [point.longitude, point.latitude],
    },
  }));

  if (points.length < 2) {
    return { type: "FeatureCollection", features: corners };
  }

  const ring = points.map(
    (point) => [point.longitude, point.latitude] as [number, number],
  );
  const shape: GeoJSON.Feature =
    points.length >= 3
      ? {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
        }
      : {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: ring },
        };

  return { type: "FeatureCollection", features: [shape, ...corners] };
}

export default function SiteBoundaryMap({
  points,
  onChange,
  focus,
  readOnly = false,
}: SiteBoundaryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pointsRef = useRef(points);
  const onChangeRef = useRef(onChange);
  pointsRef.current = points;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) return;

    const start = pointsRef.current[0];
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: start
        ? [start.longitude, start.latitude]
        : focus
          ? [focus.lng, focus.lat]
          : [78.4867, 17.385],
      zoom: start || focus ? 16 : 5,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.resize();
      map.addSource(SOURCE, {
        type: "geojson",
        data: featureCollection(pointsRef.current),
      });
      map.addLayer({
        id: "site-boundary-fill",
        type: "fill",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#16a34a", "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: "site-boundary-line",
        type: "line",
        source: SOURCE,
        filter: ["in", ["geometry-type"], ["literal", ["Polygon", "LineString"]]],
        paint: { "line-color": "#166534", "line-width": 2 },
      });
      map.addLayer({
        id: "site-boundary-corners",
        type: "circle",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#166534",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      if (pointsRef.current.length >= 2) fit(map, pointsRef.current);
    });

    if (!readOnly) {
      map.on("click", (event) => {
        const next = [
          ...pointsRef.current,
          { latitude: event.lngLat.lat, longitude: event.lngLat.lng },
        ];
        onChangeRef.current?.(next);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Later point changes update the source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(featureCollection(points));
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length > 0 || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: 16 });
  }, [focus?.lat, focus?.lng, points.length]);

  if (!mapboxgl.accessToken) {
    return (
      <p className="text-sm text-red-600">
        The map needs a Mapbox token before a site boundary can be drawn.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-xl" />
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          {points.length} {points.length === 1 ? "corner" : "corners"}
          {points.length < 3 ? " · add at least 3" : ""}
        </span>
        {readOnly ? null : (
          <>
            <button
              type="button"
              disabled={points.length === 0}
              onClick={() => onChange?.(points.slice(0, -1))}
              className="rounded-full px-2.5 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
              Undo corner
            </button>
            <button
              type="button"
              disabled={points.length === 0}
              onClick={() => onChange?.([])}
              className="rounded-full px-2.5 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Clear boundary
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function fit(map: mapboxgl.Map, points: GeoPoint[]) {
  const bounds = new mapboxgl.LngLatBounds();
  for (const point of points) bounds.extend([point.longitude, point.latitude]);
  map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
}
