import { notFound } from "next/navigation";
import AdminConsole from "@/components/admin-console";

export default async function AdminOpsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const secret = process.env.ADMIN_SECRET_SLUG;
  if (!secret || slug !== secret) {
    notFound();
  }
  return <AdminConsole slug={slug} />;
}
