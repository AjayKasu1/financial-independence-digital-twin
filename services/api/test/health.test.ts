import { describe, expect, it } from "vitest";
import { app } from "../src";

describe("Worker health route", () => {
  it("returns a request id and security headers", async () => {
    const response = await app.request("http://localhost/api/health", undefined, {
      APP_ENV: "demo"
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
