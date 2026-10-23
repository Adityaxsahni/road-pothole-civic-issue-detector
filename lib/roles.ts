import type { Role } from "@prisma/client";

export const STAFF_ROLES: Role[] = ["STAFF", "ADMIN"];

export const isStaff = (user: { role: Role } | null | undefined): boolean =>
  !!user && STAFF_ROLES.includes(user.role);
