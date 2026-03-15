const OPENROUTESERVICE_API_KEY = process.env.OPENROUTESERVICE_API_KEY || "";

const geocodeCache = new Map<string, [number, number] | null>();
const routeCache = new Map<string, { travelMinutes: number; distanceKm: number }>();

function normalizeCity(city: string) {
  return city.trim().toLowerCase();
}

function buildTravelCacheKey(originCity: string, destinationCity: string) {
  return `${normalizeCity(originCity)}::${normalizeCity(destinationCity)}`;
}

function toLocationQuery(city: string) {
  return `${city.trim()}, Sweden`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

async function getOpenRouteServiceRoute(originCity: string, destinationCity: string): Promise<{ travelMinutes: number; distanceKm: number } | null> {
  const cacheKey = buildTravelCacheKey(originCity, destinationCity);
  const reverseCacheKey = buildTravelCacheKey(destinationCity, originCity);

  const cachedRoute = routeCache.get(cacheKey) ?? routeCache.get(reverseCacheKey);
  if (cachedRoute) {
    return cachedRoute;
  }

  const [originCoordinates, destinationCoordinates] = await Promise.all([
    getCityCoordinates(originCity),
    getCityCoordinates(destinationCity),
  ]);

  if (!originCoordinates || !destinationCoordinates) {
    return null;
  }

  if (!OPENROUTESERVICE_API_KEY) {
    return {
      travelMinutes: Math.ceil((haversineKm(originCoordinates[1], originCoordinates[0], destinationCoordinates[1], destinationCoordinates[0]) / 80) * 60) + 30,
      distanceKm: haversineKm(originCoordinates[1], originCoordinates[0], destinationCoordinates[1], destinationCoordinates[0]),
    };
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
        distance?: number;
      };
    }>;
  };

  const durationSeconds = data.routes?.[0]?.summary?.duration;
  const distanceMeters = data.routes?.[0]?.summary?.distance;
  if (!durationSeconds || !distanceMeters) {
    return null;
  }

  const route = {
    travelMinutes: Math.ceil(durationSeconds / 60),
    distanceKm: distanceMeters / 1000,
  };

  routeCache.set(cacheKey, route);
  routeCache.set(reverseCacheKey, route);
  return route;
}

export async function getOpenRouteServiceTravelMinutes(originCity: string, destinationCity: string): Promise<number | null> {
  const route = await getOpenRouteServiceRoute(originCity, destinationCity);
  return route?.travelMinutes ?? null;
}

export async function getOpenRouteServiceDistanceKm(originCity: string, destinationCity: string): Promise<number | null> {
  const route = await getOpenRouteServiceRoute(originCity, destinationCity);
  return route?.distanceKm ?? null;
}