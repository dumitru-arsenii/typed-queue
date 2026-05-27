import type { ArchiveDay } from "./types.js";

const archiveDayPattern = /^\d{4}-\d{2}-\d{2}$/;

export function formatArchiveDay(date: Date): ArchiveDay {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isArchiveDay(value: string): value is ArchiveDay {
  if (!archiveDayPattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return formatArchiveDay(date) === value;
}

export function createArchiveKey(day: ArchiveDay, prefix = "archive"): string {
  return `${prefix}:${day}`;
}
