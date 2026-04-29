import { notFound } from "next/navigation";

import OpsTelemetryConsole from "@/components/ops-telemetry-console";

export default async function OpsTelemetryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const secret = process.env.ADMIN_SECRET_SLUG;
  if (!secret || slug !== secret) {
    notFound();
  }

  return <OpsTelemetryConsole slug={slug} />;
}
