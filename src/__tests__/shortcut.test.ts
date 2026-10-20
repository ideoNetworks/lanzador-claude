import { describe, it, expect } from "vitest";
import { comboFromEvent, type KeyLike } from "../logic/shortcut";

const ev = (o: Partial<KeyLike>): KeyLike => ({ key: "", code: "", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });

describe("comboFromEvent", () => {
  it("records Ctrl+Alt+I", () => {
    expect(comboFromEvent(ev({ key: "i", code: "KeyI", ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+I");
  });
  it("uses the physical key, not the Alt/Shift composed character", () => {
    expect(comboFromEvent(ev({ key: "¡", code: "Digit1", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+1");
  });
  it("supports function keys, arrows and Super", () => {
    expect(comboFromEvent(ev({ key: "F12", code: "F12", ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+F12");
    expect(comboFromEvent(ev({ key: "ArrowUp", code: "ArrowUp", altKey: true }))).toBe("Alt+Up");
    expect(comboFromEvent(ev({ key: "k", code: "KeyK", metaKey: true }))).toBe("Super+K");
  });
  it("ignores bare modifiers, keys without a modifier and unknown keys", () => {
    expect(comboFromEvent(ev({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(ev({ key: "i", code: "KeyI" }))).toBeNull();
    expect(comboFromEvent(ev({ key: "Dead", code: "IntlBackslash", ctrlKey: true }))).toBeNull();
  });
});
