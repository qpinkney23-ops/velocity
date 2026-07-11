import type { ServerAuthErrorCode, ServerPrincipalKind } from "../../contracts/serverAuth";

export type UserApiRoutePolicy = Readonly<{
  routeId: string;
  allowedPrincipalKind: ServerPrincipalKind;
  allowSessionCookie: boolean;
  allowFirebaseBearer: boolean;
  requireAuthorizationContext: boolean;
  allowedMethods: readonly string[];
  bodySizeLimit?: number;
  csrfMode: "none" | "double-submit";
  originPolicy: "none" | "same-origin";
  auditAction: string;
  productionEnabled: boolean;
  trustIncomingCorrelationId: boolean;
}>;

export type PolicyValidation = Readonly<{ ok: true; policy: UserApiRoutePolicy }> | Readonly<{ ok: false; code: Extract<ServerAuthErrorCode, "INTERNAL_ERROR"> }>;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export function defineUserApiRoutePolicy(input: UserApiRoutePolicy): UserApiRoutePolicy { return Object.freeze({ ...input, allowedMethods: Object.freeze([...input.allowedMethods]) }); }

export function validateUserApiRoutePolicy(input: unknown): PolicyValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return Object.freeze({ ok: false, code: "INTERNAL_ERROR" });
  const p = input as UserApiRoutePolicy;
  const methodsValid = Array.isArray(p.allowedMethods) && p.allowedMethods.length > 0 && p.allowedMethods.every((method) => typeof method === "string" && METHODS.has(method) && method === method.toUpperCase());
  const sizeValid = p.bodySizeLimit === undefined || (Number.isSafeInteger(p.bodySizeLimit) && p.bodySizeLimit! > 0 && p.bodySizeLimit! <= 10 * 1024 * 1024);
  const valid = SAFE_ID.test(p.routeId || "") && SAFE_ID.test(p.auditAction || "") && p.allowedPrincipalKind === "firebase_user" && typeof p.allowSessionCookie === "boolean" && typeof p.allowFirebaseBearer === "boolean" && (p.allowSessionCookie || p.allowFirebaseBearer) && typeof p.requireAuthorizationContext === "boolean" && methodsValid && sizeValid && ["none", "double-submit"].includes(p.csrfMode) && ["none", "same-origin"].includes(p.originPolicy) && typeof p.productionEnabled === "boolean" && typeof p.trustIncomingCorrelationId === "boolean" && !(p.csrfMode === "double-submit" && (!p.allowSessionCookie || p.originPolicy !== "same-origin"));
  return valid ? Object.freeze({ ok: true, policy: p }) : Object.freeze({ ok: false, code: "INTERNAL_ERROR" });
}
