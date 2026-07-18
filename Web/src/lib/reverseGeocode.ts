interface GeocodeResponse {
  features?: Array<{ place_name?: string }>;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeocodeResponse> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}&country=IN`
  );
  return res.json();
}
