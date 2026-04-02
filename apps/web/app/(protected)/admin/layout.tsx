import type { ReactNode } from "react";

import { requireAdminUser } from "@/lib/server/session";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireAdminUser();
  return children;
}
