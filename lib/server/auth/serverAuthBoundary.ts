import "server-only";

/**
 * Marker for the future SEC-001 server verification boundary. Slice 01 performs
 * no Firebase, cookie, Admin SDK, or credential verification.
 */
export const SERVER_AUTH_BOUNDARY_VERSION = "server-auth-boundary.v1" as const;
