import type { Prisma } from "@/generated/prisma/client";

/**
 * Round-trips a value through JSON so it satisfies Prisma's InputJsonValue type (a plain JSON
 * object, not an interface with a nominal shape) and strips anything non-serializable.
 */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
