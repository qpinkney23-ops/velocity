import "server-only";

const safeCode = (error: unknown): string => {
  if (!error || typeof error !== "object" || !("code" in error)) return "UNKNOWN";
  const code = String((error as { code?: unknown }).code ?? "UNKNOWN");
  return /^[A-Za-z0-9_./-]{1,96}$/.test(code) ? code : "UNKNOWN";
};

export function logDevelopmentServerFailure(input: Readonly<{
  stage: string;
  error: unknown;
  requestId: string;
  correlationId: string;
}>): void {
  if (process.env.NODE_ENV === "production") return;
  const errorClass = input.error instanceof Error ? input.error.constructor.name : "UnknownError";
  console.error(JSON.stringify({
    event: "velocity.server_failure.v1",
    stage: input.stage,
    errorClass: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(errorClass) ? errorClass : "Error",
    safeCode: safeCode(input.error),
    requestId: input.requestId,
    correlationId: input.correlationId,
  }));
}
