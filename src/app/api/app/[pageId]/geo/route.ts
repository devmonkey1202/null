import { NextResponse } from "next/server";
import { apiErrorJson } from "@/lib/api-error";
import type { AppRole } from "@/lib/app-permissions";
import { ensureServiceRoutePermission, resolveServiceRouteAccess } from "@/lib/service-route-access";
import { parseJsonObject } from "@/lib/validation";
import {
  estimateServiceGeoEta,
  evaluateServiceGeoRegions,
  geocodeServiceGeo,
  listServiceGeoState,
  routeServiceGeo,
  searchServiceGeoRadius,
  upsertServiceGeoPlace,
  upsertServiceGeoRegion,
} from "@/lib/service-geo";

type Params = { pageId: string };
const OPERATOR_ROLES: AppRole[] = ["admin", "editor"];

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown, fallback?: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function permissionForAction(action: string) {
  if (action === "place.upsert" || action === "region.upsert") {
    return { allowedRoles: OPERATOR_ROLES } as const;
  }

  if (
    action === "place.radius" ||
    action === "geocode" ||
    action === "region.evaluate" ||
    action === "route" ||
    action === "eta"
  ) {
    return { allowAnonymous: true } as const;
  }

  return { allowedRoles: OPERATOR_ROLES } as const;
}

function pointFromBody(value: unknown, fallbackLatKey: string, fallbackLngKey: string, body: Record<string, unknown>) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    const lat = asNumber(source.lat);
    const lng = asNumber(source.lng);
    if (lat !== undefined && lng !== undefined) return { lat, lng };
  }
  const lat = asNumber(body[fallbackLatKey]);
  const lng = asNumber(body[fallbackLngKey]);
  if (lat === undefined || lng === undefined) throw new Error("service_geo_point_invalid");
  return { lat, lng };
}

export async function GET(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;
  const permissionError = ensureServiceRoutePermission(gate.access, { allowedRoles: OPERATOR_ROLES });
  if (permissionError) return permissionError;

  const state = await listServiceGeoState(pageId);
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request, context: { params: Promise<Params> }) {
  const { pageId } = await context.params;
  if (!pageId) return apiErrorJson("bad_request", 400);

  const gate = await resolveServiceRouteAccess(req, pageId);
  if ("error" in gate) return gate.error;

  const parsed = await parseJsonObject(req);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const action = asString(body.action) ?? "";
  const permissionError = ensureServiceRoutePermission(gate.access, permissionForAction(action));
  if (permissionError) return permissionError;
  const actor = gate.access.actor;

  try {
    if (action === "place.upsert") {
      const point = pointFromBody(body.point, "lat", "lng", body);
      const place = await upsertServiceGeoPlace({
        pageId,
        key: asString(body.key) ?? "",
        label: asString(body.label) ?? "",
        query: asString(body.query) ?? null,
        address: asString(body.address) ?? null,
        provider: asString(body.provider) ?? null,
        providerRef: asString(body.providerRef) ?? asString(body.provider_ref) ?? null,
        metadata: body.metadata,
        actor,
        ...point,
      });
      return NextResponse.json({ ok: true, place });
    }

    if (action === "place.radius") {
      const center = pointFromBody(body.center, "lat", "lng", body);
      const results = await searchServiceGeoRadius({
        pageId,
        center,
        radiusM: asNumber(body.radiusM ?? body.radius_m, 1000) ?? 1000,
      });
      return NextResponse.json({ ok: true, results });
    }

    if (action === "geocode") {
      const result = await geocodeServiceGeo({
        pageId,
        query: asString(body.query) ?? "",
        adapterId: asString(body.adapterId) ?? asString(body.adapter_id) ?? null,
        actor,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === "region.upsert") {
      const center = pointFromBody(body.center, "center_lat", "center_lng", body);
      const region = await upsertServiceGeoRegion({
        pageId,
        key: asString(body.key) ?? "",
        name: asString(body.name) ?? "",
        center,
        radiusM: asNumber(body.radiusM ?? body.radius_m, 1) ?? 1,
        active: typeof body.active === "boolean" ? body.active : true,
        policy: body.policy,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, region });
    }

    if (action === "region.evaluate") {
      const point = pointFromBody(body.point, "lat", "lng", body);
      const matches = await evaluateServiceGeoRegions({ pageId, point });
      return NextResponse.json({ ok: true, matches });
    }

    if (action === "route") {
      const origin = pointFromBody(body.origin, "origin_lat", "origin_lng", body);
      const destination = pointFromBody(body.destination, "destination_lat", "destination_lng", body);
      const result = await routeServiceGeo({
        pageId,
        origin,
        destination,
        adapterId: asString(body.adapterId) ?? asString(body.adapter_id) ?? null,
        metadata: body.metadata,
        actor,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (action === "eta") {
      const origin = pointFromBody(body.origin, "origin_lat", "origin_lng", body);
      const destination = pointFromBody(body.destination, "destination_lat", "destination_lng", body);
      const estimate = await estimateServiceGeoEta({
        pageId,
        origin,
        destination,
        speedKmh: asNumber(body.speedKmh ?? body.speed_kmh),
        trafficFactor: asNumber(body.trafficFactor ?? body.traffic_factor),
      });
      return NextResponse.json({ ok: true, estimate });
    }

    return apiErrorJson("invalid_action", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_geo_failed";
    return apiErrorJson(code, 400);
  }
}
