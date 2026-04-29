-- CreateTable
CREATE TABLE "ServiceGeoPlace" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "query" TEXT,
  "address" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'local',
  "provider_ref" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceGeoPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceGeoRegion" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "center_lat" DOUBLE PRECISION NOT NULL,
  "center_lng" DOUBLE PRECISION NOT NULL,
  "radius_m" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "policy" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceGeoRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceGeoRouteCache" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "origin_lat" DOUBLE PRECISION NOT NULL,
  "origin_lng" DOUBLE PRECISION NOT NULL,
  "destination_lat" DOUBLE PRECISION NOT NULL,
  "destination_lng" DOUBLE PRECISION NOT NULL,
  "distance_m" INTEGER NOT NULL,
  "duration_sec" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'local',
  "geometry" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceGeoRouteCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceGeoPlace_page_id_key_key" ON "ServiceGeoPlace"("page_id", "key");
CREATE INDEX "ServiceGeoPlace_page_id_lat_lng_idx" ON "ServiceGeoPlace"("page_id", "lat", "lng");

CREATE UNIQUE INDEX "ServiceGeoRegion_page_id_key_key" ON "ServiceGeoRegion"("page_id", "key");
CREATE INDEX "ServiceGeoRegion_page_id_active_center_lat_center_lng_idx" ON "ServiceGeoRegion"("page_id", "active", "center_lat", "center_lng");

CREATE UNIQUE INDEX "ServiceGeoRouteCache_page_id_key_key" ON "ServiceGeoRouteCache"("page_id", "key");
CREATE INDEX "ServiceGeoRouteCache_page_id_provider_updated_at_idx" ON "ServiceGeoRouteCache"("page_id", "provider", "updated_at");

-- AddForeignKey
ALTER TABLE "ServiceGeoPlace"
ADD CONSTRAINT "ServiceGeoPlace_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceGeoRegion"
ADD CONSTRAINT "ServiceGeoRegion_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceGeoRouteCache"
ADD CONSTRAINT "ServiceGeoRouteCache_page_id_fkey"
FOREIGN KEY ("page_id") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
