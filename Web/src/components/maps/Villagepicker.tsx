"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import type { VillageLocationValue } from "@/types";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface VillageMapPickerProps {
  value?: VillageLocationValue | null;
  onChange: (value: VillageLocationValue) => void;
}

export default function VillageMapPicker({
  value,
  onChange,
}: VillageMapPickerProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const centerLng = value?.lng ? Number(value.lng) : 78.4867;
    const centerLat = value?.lat ? Number(value.lat) : 17.385;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [centerLng, centerLat],
      zoom: value?.lng ? 9 : 6,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.resize();
      setTimeout(() => map.resize(), 300);
    });

    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken || undefined,
      mapboxgl,
      countries: "IN",
      types: "place,locality",
      placeholder: "Search village",
    });

    map.addControl(geocoder, "top-left");

    function setMarker(lng: number, lat: number) {
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = new mapboxgl.Marker()
        .setLngLat([lng, lat])
        .addTo(map);
    }

    geocoder.on("result", (e) => {
      const result = e.result;
      const [lng, lat] = result.center;
      setMarker(lng, lat);
      const context = result.context || [];

      const getContext = (type: string) =>
        context.find((c) => c.id.startsWith(type))?.text || null;

      onChange({
        lat,
        lng,
        place_name: result.place_name,
        village: result.text,
        district: getContext("district"),
        state: getContext("region"),
        pincode: getContext("postcode"),
        country: getContext("country"),
        mapbox_place_id: result.id,
        raw: result,
      });
    });

    map.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      setMarker(lng, lat);
      onChange({ lat, lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="w-full h-[250px] rounded border" />
  );
}
