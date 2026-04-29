import { beforeEach, describe, expect, it, vi } from "vitest";

type PlaceRow = {
  id: string;
  page_id: string;
  key: string;
  label: string;
  query: string | null;
  address: string | null;
  lat: number;
  lng: number;
  provider: string;
  provider_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type RegionRow = {
  id: string;
  page_id: string;
  key: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
  active: boolean;
  policy: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type RouteRow = {
  id: string;
  page_id: string;
  key: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  distance_m: number;
  duration_sec: number;
  provider: string;
  geometry: Array<{ lat: number; lng: number }> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

const state = vi.hoisted(() => ({
  seq: 0,
  places: [] as PlaceRow[],
  regions: [] as RegionRow[],
  routes: [] as RouteRow[],
}));

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}_${state.seq}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const logAppAuditMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  serviceGeoPlace: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.places.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("place"),
        page_id: String(create.page_id),
        key: String(create.key),
        label: String(create.label),
        query: (create.query as string | null) ?? null,
        address: (create.address as string | null) ?? null,
        lat: Number(create.lat),
        lng: Number(create.lng),
        provider: String(create.provider),
        provider_ref: (create.provider_ref as string | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.places.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.places.filter((item) => item.page_id === where.page_id);
      if (orderBy?.created_at === "desc") {
        rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      }
      return clone(rows);
    }),
  },
  serviceGeoRegion: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.regions.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("region"),
        page_id: String(create.page_id),
        key: String(create.key),
        name: String(create.name),
        center_lat: Number(create.center_lat),
        center_lng: Number(create.center_lng),
        radius_m: Number(create.radius_m),
        active: Boolean(create.active),
        policy: (create.policy as Record<string, unknown> | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.regions.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.regions.filter(
        (item) => item.page_id === where.page_id && (where.active === undefined || item.active === where.active),
      );
      if (orderBy?.created_at === "desc") {
        rows = rows.slice().sort((left, right) => right.created_at.getTime() - left.created_at.getTime());
      }
      return clone(rows);
    }),
  },
  serviceGeoRouteCache: {
    upsert: vi.fn(async ({ where, update, create }: any) => {
      const key = where.page_id_key;
      let row = state.routes.find((item) => item.page_id === key.page_id && item.key === key.key);
      if (row) {
        Object.assign(row, update, { updated_at: new Date() });
        return clone(row);
      }
      row = {
        id: nextId("route"),
        page_id: String(create.page_id),
        key: String(create.key),
        origin_lat: Number(create.origin_lat),
        origin_lng: Number(create.origin_lng),
        destination_lat: Number(create.destination_lat),
        destination_lng: Number(create.destination_lng),
        distance_m: Number(create.distance_m),
        duration_sec: Number(create.duration_sec),
        provider: String(create.provider),
        geometry: (create.geometry as Array<{ lat: number; lng: number }> | null) ?? null,
        metadata: (create.metadata as Record<string, unknown> | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      state.routes.push(row);
      return clone(row);
    }),
    findMany: vi.fn(async ({ where, orderBy }: any) => {
      let rows = state.routes.filter((item) => item.page_id === where.page_id);
      if (orderBy?.updated_at === "desc") {
        rows = rows.slice().sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());
      }
      return clone(rows);
    }),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-audit", () => ({ logAppAudit: logAppAuditMock }));

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

describe("service geo", () => {
  beforeEach(() => {
    state.seq = 0;
    state.places.length = 0;
    state.regions.length = 0;
    state.routes.length = 0;
    prismaMock.serviceGeoPlace.upsert.mockClear();
    prismaMock.serviceGeoPlace.findMany.mockClear();
    prismaMock.serviceGeoRegion.upsert.mockClear();
    prismaMock.serviceGeoRegion.findMany.mockClear();
    prismaMock.serviceGeoRouteCache.upsert.mockClear();
    prismaMock.serviceGeoRouteCache.findMany.mockClear();
    logAppAuditMock.mockReset();
  });

  it("upserts places and lists state", async () => {
    await upsertServiceGeoPlace({
      pageId: "page_1",
      key: "hq",
      label: "HQ",
      lat: 37.5,
      lng: 127.0,
      actor: { userId: "user_1", anonId: null },
    });

    const stateResult = await listServiceGeoState("page_1");

    expect(stateResult.places).toHaveLength(1);
    expect(stateResult.places[0]?.key).toBe("hq");
    expect(logAppAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "service_geo_place_upserted", pageId: "page_1" }),
    );
  });

  it("geocodes coordinates and uses deterministic local fallback", async () => {
    const coord = await geocodeServiceGeo({
      pageId: "page_1",
      query: "37.5,127.0",
    });
    const pseudo = await geocodeServiceGeo({
      pageId: "page_1",
      query: "Gangnam Station",
    });

    expect(coord.point).toEqual({ lat: 37.5, lng: 127 });
    expect(coord.metadata?.mode).toBe("coordinate");
    expect(pseudo.provider).toBe("local");
    expect(pseudo.metadata?.mode).toBe("pseudo");
  });

  it("filters places by radius and evaluates active regions", async () => {
    await upsertServiceGeoPlace({
      pageId: "page_1",
      key: "near",
      label: "Near",
      lat: 37.5,
      lng: 127.0,
    });
    await upsertServiceGeoPlace({
      pageId: "page_1",
      key: "far",
      label: "Far",
      lat: 35.0,
      lng: 129.0,
    });
    await upsertServiceGeoRegion({
      pageId: "page_1",
      key: "seoul",
      name: "Seoul",
      center: { lat: 37.5, lng: 127.0 },
      radiusM: 1000,
      policy: { delivery: true },
    });
    await upsertServiceGeoRegion({
      pageId: "page_1",
      key: "inactive",
      name: "Inactive",
      center: { lat: 37.5, lng: 127.0 },
      radiusM: 1000,
      active: false,
    });

    const places = await searchServiceGeoRadius({
      pageId: "page_1",
      center: { lat: 37.5, lng: 127.0 },
      radiusM: 500,
    });
    const regions = await evaluateServiceGeoRegions({
      pageId: "page_1",
      point: { lat: 37.5001, lng: 127.0001 },
    });

    expect(places).toHaveLength(1);
    expect(places[0]?.key).toBe("near");
    expect(regions).toHaveLength(1);
    expect(regions[0]?.key).toBe("seoul");
    expect(regions[0]?.policy).toEqual({ delivery: true });
  });

  it("routes between points and estimates eta", async () => {
    const route = await routeServiceGeo({
      pageId: "page_1",
      origin: { lat: 37.5, lng: 127.0 },
      destination: { lat: 37.6, lng: 127.1 },
      metadata: { trip: "delivery" },
      actor: { userId: "user_1", anonId: null },
    });
    const eta = await estimateServiceGeoEta({
      pageId: "page_1",
      origin: { lat: 37.5, lng: 127.0 },
      destination: { lat: 37.6, lng: 127.1 },
      speedKmh: 20,
      trafficFactor: 1.5,
    });

    expect(route.cacheId).toBeTruthy();
    expect(route.distanceM).toBeGreaterThan(0);
    expect(route.durationSec).toBeGreaterThan(0);
    expect(route.geometry).toHaveLength(2);
    expect(eta.distanceM).toBeGreaterThan(0);
    expect(eta.durationSec).toBeGreaterThan(route.durationSec);
    expect(logAppAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "service_geo_route_computed", pageId: "page_1" }),
    );
  });
});
