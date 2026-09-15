export const ASSIGNMENT_TIMEOUT_MS = 15_000;

export class AssignmentTimeoutError extends Error {
  constructor() {
    super("No se recibió respuesta de BL dentro del tiempo esperado");
    this.name = "AssignmentTimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new AssignmentTimeoutError()),
      timeoutMs,
    );

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function newCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `mapping-${Date.now()}`;
}
