const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const travelTimeCache = new Map<string, number>();

function buildCacheKey(originCity: string, destinationCity: string) {
  return `${originCity.trim().toLowerCase()}::${destinationCity.trim().toLowerCase()}`;
}

function toLocationQuery(city: string) {
  return `${city.trim()}, Sweden`;
}

export function hasGoogleMapsApiKey() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

export async function getGoogleMapsTravelMinutes(originCity: string, destinationCity: string): Promise<number | null> {
  const cacheKey = buildCacheKey(originCity, destinationCity);
  const reverseCacheKey = buildCacheKey(destinationCity, originCity);

  const cachedMinutes = travelTimeCache.get(cacheKey) ?? travelTimeCache.get(reverseCacheKey);
  if (cachedMinutes !== undefined) {
    return cachedMinutes;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", toLocationQuery(originCity));
  url.searchParams.set("destinations", toLocationQuery(destinationCity));
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "sv-SE");
  url.searchParams.set("region", "se");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Maps svarade med status ${response.status}`);
  }

  const data = await response.json() as {
    status?: string;
    error_message?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        duration?: { value?: number };
      }>;
    }>;
  };

  if (data.status && data.status !== "OK") {
    throw new Error(data.error_message || `Google Maps status ${data.status}`);
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK" || !element.duration?.value) {
    return null;
  }

  const minutes = Math.ceil(element.duration.value / 60);
  travelTimeCache.set(cacheKey, minutes);
  travelTimeCache.set(reverseCacheKey, minutes);
  return minutes;
}