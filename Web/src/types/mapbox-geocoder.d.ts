declare module "@mapbox/mapbox-gl-geocoder" {
  import type { IControl, Map } from "mapbox-gl";

  interface MapboxGeocoderOptions {
    accessToken?: string;
    mapboxgl?: unknown;
    countries?: string;
    types?: string;
    placeholder?: string;
  }

  interface GeocoderResult {
    center: [number, number];
    place_name: string;
    text: string;
    id: string;
    context?: Array<{ id: string; text: string }>;
  }

  export default class MapboxGeocoder implements IControl {
    constructor(options?: MapboxGeocoderOptions);
    on(event: "result", listener: (e: { result: GeocoderResult }) => void): this;
    onMapLoad(map: Map): void;
    onAdd(map: Map): HTMLElement;
    onRemove(map: Map): void;
  }
}
