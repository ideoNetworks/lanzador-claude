import { describe, it, expect } from "vitest";
import { relativeTime } from "../logic/time";

const now = new Date("2026-10-20T12:00:00Z").getTime();

describe("relativeTime", () => {
  it("picks a sensible unit", () => {
    expect(relativeTime("2026-10-20T11:59:40Z", "en", now)).toBe("now");
    expect(relativeTime("2026-10-20T11:55:00Z", "en", now)).toBe("5 minutes ago");
    expect(relativeTime("2026-10-20T10:00:00Z", "en", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-19T12:00:00Z", "en", now)).toBe("yesterday");
    expect(relativeTime("2026-10-01T12:00:00Z", "es", now)).toBe("hace 19 días");
    expect(relativeTime("2026-06-01T12:00:00Z", "en", now)).toBe("4 months ago");
  });
  it("returns the input for unparseable dates", () => {
    expect(relativeTime("nope", "en", now)).toBe("nope");
  });
});
