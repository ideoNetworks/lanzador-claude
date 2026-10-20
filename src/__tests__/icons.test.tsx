import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TopBar from "../components/TopBar";
import NavRail from "../components/NavRail";
import { icons } from "../components/icons";

describe("icon sizing guard", () => {
  it("every inline svg has explicit width/height", () => {
    const { container } = render(<><TopBar /><NavRail onAbout={() => {}} /></>);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(5);
    svgs.forEach((s) => {
      expect(s.getAttribute("width")).toBeTruthy();
      expect(s.getAttribute("height")).toBeTruthy();
    });
    expect(Object.keys(icons).length).toBeGreaterThan(5);
  });
});
