export const APP_STATUSES = ["New", "In Review", "Approved", "Denied", "Closed"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

const TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  New: ["In Review"],
  "In Review": ["Approved", "Denied"],
  Approved: ["Closed"],
  Denied: ["Closed"],
  Closed: [],
};

export function isValidStatus(value: any): value is AppStatus {
  return APP_STATUSES.includes(value);
}

export function canTransition(from: AppStatus, to: AppStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function allowedNextStatuses(from: AppStatus): AppStatus[] {
  return [from, ...TRANSITIONS[from]];
}

/**
 * Business rule:
 * - You cannot move to Approved unless an underwriter is assigned.
 */
export function validateStatusChange(params: {
  from: AppStatus;
  to: AppStatus;
  underwriterId: string;
}): string | null {
  const { from, to, underwriterId } = params;

  if (from === to) return null;

  if (!canTransition(from, to)) return `Invalid transition: ${from} → ${to}`;

  if (to === "Approved" && (!underwriterId || underwriterId.trim() === "")) {
    return "Cannot approve until an underwriter is assigned.";
  }

  return null;
}
