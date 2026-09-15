import { describe, expect, it } from "vitest";
import { AssignmentTimeoutError, withTimeout } from "./tenant-mapping";

describe("tenant-mapping recovery helpers", () => {
  it("resuelve una respuesta que llega antes del timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("expone un resultado incierto cuando BL supera el timeout", async () => {
    const lateResponse = new Promise<string>((resolve) => {
      globalThis.setTimeout(() => resolve("late"), 25);
    });

    await expect(withTimeout(lateResponse, 5)).rejects.toBeInstanceOf(
      AssignmentTimeoutError,
    );
  });
});
