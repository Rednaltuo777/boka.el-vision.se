const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY || "";

const geocodeCache = new Map<string, [number, number] | null>();
const travelTimeCache = new Map<string, number>();

function normalizeCity(city: string) {
  return city.trim().toLowerCase();
}

function buildTravelCacheKey(originCity: string, destinationCity: string) {
  return `${normalizeCity(originCity)}::${normalizeCity(destinationCity)}`;
}

function toLocationQuery(city: string) {
  return `${city.trim()}, Sweden`;
}

async function getCityCoordinates(city: string): Promise<[number, number] | null> {
  const normalizedCity = normalizeCity(city);

  if (geocodeCache.has(normalizedCity)) {
    return geocodeCache.get(normalizedCity) ?? null;
  }

  if (!OPENROUTESERVICE_API_KEY) {
    return null;
  }

  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", OPENROUTESERVICE_API_KEY);
  url.searchParams.set("text", toLocationQuery(city));
  url.searchParams.set("size", "1");
  url.searchParams.set("boundary.country", "SE");
  url.searchParams.set("layers", "locality");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OpenRouteService geokodning svarade med status ${response.status}`);
  }

  const data = await response.json() as {
    features?: Array<{
      geometry?: {
        coordinates?: [number, number];
      };
    }>;
  };

  const coordinates = data.features?.[0]?.geometry?.coordinates ?? null;
  geocodeCache.set(normalizedCity, coordinates);
  return coordinates;
}

export async function getOpenRouteServiceTravelMinutes(originCity: string, destinationCity: string): Promise<number | null> {
  const cacheKey = buildTravelCacheKey(originCity, destinationCity);
  const reverseCacheKey = buildTravelCacheKey(destinationCity, originCity);

  const cachedMinutes = travelTimeCache.get(cacheKey) ?? travelTimeCache.get(reverseCacheKey);
  if (cachedMinutes !== undefined) {
    return cachedMinutes;
  }

  if (!OPENROUTESERVICE_API_KEY) {
    return null;
  }

  const [originCoordinates, destinationCoordinates] = await Promise.all([
    getCityCoordinates(originCity),
    getCityCoordinates(destinationCity),
  ]);

  if (!originCoordinates || !destinationCoordinates) {
    return null;
  }

  const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/json", {
    method: "POST",
    headers: {
      Authorization: OPENROUTESERVICE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [originCoordinates, destinationCoordinates],
      language: "sv",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouteService ruttning svarade med status ${response.status}`);
  }

  const data = await response.json() as {
    routes?: Array<{
      summary?: {
        duration?: number;
      };
    }>;
  };

  const durationSeconds = data.routes?.[0]?.summary?.duration;
  if (!durationSeconds) {
    return null;
  }

  const minutes = Math.ceil(durationSeconds / 60);
  travelTimeCache.set(cacheKey, minutes);
  travelTimeCache.set(reverseCacheKey, minutes);
  return minutes;
}