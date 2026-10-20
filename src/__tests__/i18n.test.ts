import { describe, it, expect } from "vitest";
import es from "../i18n/es.json";
import en from "../i18n/en.json";
import zh from "../i18n/zh.json";
import { t, setLanguage, detectLanguage } from "../i18n";

function flatten(o: Record<string, unknown>, p = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

describe("i18n", () => {
  it("i18n_keys_match", () => {
    const e = flatten(es), n = flatten(en), z = flatten(zh);
    expect(Object.keys(n).sort()).toEqual(Object.keys(e).sort());
    expect(Object.keys(z).sort()).toEqual(Object.keys(e).sort());
    for (const d of [e, n, z]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe("");
  });
  it("includes all engine error codes", () => {
    for (const c of ["path_not_found","access_denied","launch_failed","wt_not_found","invalid_key","secret_store_failed","io","git_missing","repo_url_empty","git_failed","invalid_name","already_exists"])
      expect(flatten(es)[`errors.${c}`], c).toBeTruthy();
  });
  it("t translates, interpolates and falls back to the key", () => {
    setLanguage("en");
    expect(t("status.connected")).toBe("Connected to the engine");
    setLanguage("es");
    expect(t("status.connected")).toBe("Conectado al motor");
    expect(t("nope.missing")).toBe("nope.missing");
  });
  it("detectLanguage prefers config then system locale", () => {
    expect(detectLanguage("zh", "es-ES")).toBe("zh");
    expect(detectLanguage(null, "es-ES")).toBe("es");
    expect(detectLanguage(null, "zh-CN")).toBe("zh");
    expect(detectLanguage(null, "fr-FR")).toBe("en");
  });
});
