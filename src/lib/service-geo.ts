import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { logAppAudit, type AppAuditActor } from "@/lib/app-audit";

const geoPrisma = prisma as unknown as {
  serviceGeoPlace: typeof prisma.serviceGeoPlace;
  serviceGeoRegion: typeof prisma.serviceGeoRegion;
  serviceGeoRouteCache: typeof prisma.serviceGeoRouteCache;
};

export type ServiceGeoPoint = { lat: number; lng: number };
export type ServiceGeoPlaceInput = ServiceGeoPoint & {
  pageId: string;
  key: string;
  label: string;
  query?: string | null;
  address?: string | null;
  provider?: string | null;
  providerRef?: string | null;
  metadata?: unknown;
  actor?: AppAuditActor;
};

export type ServiceGeoRegionInput = {
  pageId: string;
  key: string;
  name: string;
  center: ServiceGeoPoint;
  radiusM: number;
  active?: boolean;
  policy?: unknown;
  metadata?: unknown;
  actor?: AppAuditActor;
};

export type ServiceGeoGeocodeResult = {
  provider: string;
  query: string;
  point: ServiceGeoPoint;
  address: string;
  providerRef?: string | null;
  metadata?: Record<string, unknown>;
};

export type ServiceGeoRouteResult = {
  provider: string;
  origin: ServiceGeoPoint;
  destination: ServiceGeoPoint;
  distanceM: number;
  durationSec: number;
  geometry?: Array<ServiceGeoPoint>;
  metadata?: Record<string, unknown>;
};

export type ServiceGeoAdapterContext = {
  pageId: string;
};

export type ServiceGeoGeocoderAdapter = {
  id: string;
  geocode(input: { query: string; context: ServiceGeoAdapterContext }): Promise<ServiceGeoGeocodeResult | null>;
};

export type ServiceGeoRouterAdapter = {
  id: string;
  route(input: { origin: ServiceGeoPoint; destination: ServiceGeoPoint; context: ServiceGeoAdapterContext }): Promise<ServiceGeoRouteResult>;
};

const geocoderAdapters = new Map<string, ServiceGeoGeocoderAdapter>();
const routerAdapters = new Map<string, ServiceGeoRouterAdapter>();

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown, fallback = "") {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || fallback;
}

function normalizePoint(point: ServiceGeoPoint): ServiceGeoPoint {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("service_geo_point_invalid");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("service_geo_point_out_of_range");
  return { lat, lng };
}

function hashQuery(query: string) {
  return createHash("sha1").update(query.toLowerCase()).digest("hex");
}

function round(value: number, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computePseudoPoint(query: string): ServiceGeoPoint {
  const hash = hashQuery(query);
  const latSeed = parseInt(hash.slice(0, 8), 16);
  const lngSeed = parseInt(hash.slice(8, 16), 16);
  return {
    lat: round((latSeed / 0xffffffff) * 140 - 70, 6),
    lng: round((lngSeed / 0xffffffff) * 320 - 160, 6),
  };
}

function buildRouteKey(origin: ServiceGeoPoint, destination: ServiceGeoPoint) {
  return [
    round(origin.lat, 5),
    round(origin.lng, 5),
    round(destination.lat, 5),
    round(destination.lng, 5),
  ].join(":");
}

function haversineMeters(origin: ServiceGeoPoint, destination: ServiceGeoPoint) {
  const R = 6371000;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (destination.lat * Math.PI) / 180;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function estimateDurationSec(distanceM: number, speedKmh = 35, trafficFactor = 1.1) {
  const metersPerSec = (speedKmh * 1000) / 3600;
  return Math.max(1, Math.round((distanceM / metersPerSec) * trafficFactor));
}

const localGeocoder: ServiceGeoGeocoderAdapter = {
  id: "local",
  async geocode({ query }) {
    const raw = query.trim();
    const coordMatch = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordMatch) {
      const point = normalizePoint({ lat: Number(coordMatch[1]), lng: Number(coordMatch[2]) });
      return {
        provider: "local",
        query: raw,
        point,
        address: raw,
        providerRef: `coord:${raw}`,
        metadata: { mode: "coordinate" },
      };
    }
    const point = computePseudoPoint(raw);
    return {
      provider: "local",
      query: raw,
      point,
      address: raw,
      providerRef: `pseudo:${hashQuery(raw).slice(0, 12)}`,
      metadata: { mode: "pseudo" },
    };
  },
};

const localRouter: ServiceGeoRouterAdapter = {
  id: "local",
  async route({ origin, destination }) {
    const start = normalizePoint(origin);
    const end = normalizePoint(destination);
    const distanceM = haversineMeters(start, end);
    const durationSec = estimateDurationSec(distanceM);
    return {
      provider: "local",
      origin: start,
      destination: end,
      distanceM,
      durationSec,
      geometry: [start, end],
      metadata: { mode: "great-circle" },
    };
  },
};

geocoderAdapters.set(localGeocoder.id, localGeocoder);
routerAdapters.set(localRouter.id, localRouter);

async function audit(pageId: string, action: string, targetType: string, targetId: string | null, meta: Record<string, unknown> | null, actor?: AppAuditActor) {
  await logAppAudit({ pageId, action, targetType, targetId, meta, actor });
}

export function registerServiceGeocoderAdapter(adapter: ServiceGeoGeocoderAdapter) {
  geocoderAdapters.set(adapter.id, adapter);
}

export function registerServiceRouterAdapter(adapter: ServiceGeoRouterAdapter) {
  routerAdapters.set(adapter.id, adapter);
}

export async function upsertServiceGeoPlace(input: ServiceGeoPlaceInput) {
  const point = normalizePoint(input);
  const key = normalizeString(input.key, "place");
  const record = await geoPrisma.serviceGeoPlace.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      label: input.label,
      query: normalizeString(input.query, "") || null,
      address: normalizeString(input.address, "") || null,
      lat: point.lat,
      lng: point.lng,
      provider: normalizeString(input.provider, "local"),
      provider_ref: normalizeString(input.providerRef, "") || null,
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      label: input.label,
      query: normalizeString(input.query, "") || null,
      address: normalizeString(input.address, "") || null,
      lat: point.lat,
      lng: point.lng,
      provider: normalizeString(input.provider, "local"),
      provider_ref: normalizeString(input.providerRef, "") || null,
      metadata: asJson(input.metadata),
    },
  });
  await audit(input.pageId, "service_geo_place_upserted", "service_geo_place", record.id, { key: record.key, lat: record.lat, lng: record.lng }, input.actor);
  return record;
}

export async function listServiceGeoState(pageId: string) {
  const [places, regions, routes] = await Promise.all([
    geoPrisma.serviceGeoPlace.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    geoPrisma.serviceGeoRegion.findMany({ where: { page_id: pageId }, orderBy: { created_at: "desc" } }),
    geoPrisma.serviceGeoRouteCache.findMany({ where: { page_id: pageId }, orderBy: { updated_at: "desc" } }),
  ]);
  return { places, regions, routes };
}

export async function geocodeServiceGeo(input: {
  pageId: string;
  query: string;
  adapterId?: string | null;
  actor?: AppAuditActor;
}) {
  const adapter = geocoderAdapters.get(normalizeString(input.adapterId, "local"));
  if (!adapter) throw new Error("service_geo_geocoder_not_found");
  const result = await adapter.geocode({ query: input.query, context: { pageId: input.pageId } });
  if (!result) throw new Error("service_geo_geocode_failed");
  await audit(input.pageId, "service_geo_geocoded", "service_geo_query", null, { query: input.query, provider: result.provider }, input.actor);
  return result;
}

export async function upsertServiceGeoRegion(input: ServiceGeoRegionInput) {
  const center = normalizePoint(input.center);
  const key = normalizeString(input.key, "region");
  const record = await geoPrisma.serviceGeoRegion.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      name: input.name,
      center_lat: center.lat,
      center_lng: center.lng,
      radius_m: Math.max(1, Math.round(input.radiusM)),
      active: input.active ?? true,
      policy: asJson(input.policy),
      metadata: asJson(input.metadata),
    },
    create: {
      page_id: input.pageId,
      key,
      name: input.name,
      center_lat: center.lat,
      center_lng: center.lng,
      radius_m: Math.max(1, Math.round(input.radiusM)),
      active: input.active ?? true,
      policy: asJson(input.policy),
      metadata: asJson(input.metadata),
    },
  });
  await audit(input.pageId, "service_geo_region_upserted", "service_geo_region", record.id, { key: record.key, radiusM: record.radius_m }, input.actor);
  return record;
}

export async function searchServiceGeoRadius(input: {
  pageId: string;
  center: ServiceGeoPoint;
  radiusM: number;
}) {
  const center = normalizePoint(input.center);
  const places = await geoPrisma.serviceGeoPlace.findMany({ where: { page_id: input.pageId } });
  const radiusM = Math.max(1, Math.round(input.radiusM));
  return places
    .map((place) => ({
      ...place,
      distance_m: haversineMeters(center, { lat: place.lat, lng: place.lng }),
    }))
    .filter((place) => place.distance_m <= radiusM)
    .sort((left, right) => left.distance_m - right.distance_m);
}

export async function evaluateServiceGeoRegions(input: {
  pageId: string;
  point: ServiceGeoPoint;
}) {
  const point = normalizePoint(input.point);
  const regions = await geoPrisma.serviceGeoRegion.findMany({ where: { page_id: input.pageId, active: true } });
  return regions
    .map((region) => ({
      id: region.id,
      key: region.key,
      name: region.name,
      distance_m: haversineMeters(point, { lat: region.center_lat, lng: region.center_lng }),
      radius_m: region.radius_m,
      policy: asRecord(region.policy),
      metadata: asRecord(region.metadata),
    }))
    .filter((region) => region.distance_m <= region.radius_m)
    .sort((left, right) => left.distance_m - right.distance_m);
}

export async function routeServiceGeo(input: {
  pageId: string;
  origin: ServiceGeoPoint;
  destination: ServiceGeoPoint;
  adapterId?: string | null;
  metadata?: unknown;
  actor?: AppAuditActor;
}) {
  const origin = normalizePoint(input.origin);
  const destination = normalizePoint(input.destination);
  const adapter = routerAdapters.get(normalizeString(input.adapterId, "local"));
  if (!adapter) throw new Error("service_geo_router_not_found");
  const key = buildRouteKey(origin, destination);
  const result = await adapter.route({ origin, destination, context: { pageId: input.pageId } });
  const record = await geoPrisma.serviceGeoRouteCache.upsert({
    where: { page_id_key: { page_id: input.pageId, key } },
    update: {
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      distance_m: result.distanceM,
      duration_sec: result.durationSec,
      provider: result.provider,
      geometry: asJson(result.geometry ?? null),
      metadata: asJson({ ...(result.metadata ?? {}), ...(asRecord(input.metadata)) }),
    },
    create: {
      page_id: input.pageId,
      key,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      distance_m: result.distanceM,
      duration_sec: result.durationSec,
      provider: result.provider,
      geometry: asJson(result.geometry ?? null),
      metadata: asJson({ ...(result.metadata ?? {}), ...(asRecord(input.metadata)) }),
    },
  });
  await audit(input.pageId, "service_geo_route_computed", "service_geo_route", record.id, { distanceM: record.distance_m, durationSec: record.duration_sec, provider: record.provider }, input.actor);
  return {
    ...result,
    cacheId: record.id,
    cacheKey: record.key,
  };
}

export async function estimateServiceGeoEta(input: {
  pageId: string;
  origin: ServiceGeoPoint;
  destination: ServiceGeoPoint;
  speedKmh?: number | null;
  trafficFactor?: number | null;
}) {
  const origin = normalizePoint(input.origin);
  const destination = normalizePoint(input.destination);
  const distanceM = haversineMeters(origin, destination);
  const durationSec = estimateDurationSec(distanceM, Number(input.speedKmh ?? 35), Number(input.trafficFactor ?? 1.1));
  return { pageId: input.pageId, distanceM, durationSec };
}
