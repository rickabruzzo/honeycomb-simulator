import { describe, expect, it } from "vitest";
import { SIMULATOR_CONFIG, renderSimulatorRules } from "./simulatorConfig";

describe("simulator rules prompt", () => {
  it("treats frontend telemetry as part of the platform, not an add-on with its own expert", () => {
    const text = renderSimulatorRules(SIMULATOR_CONFIG);
    expect(text).toMatch(/not a separate product or add-on/i);
    expect(text).not.toMatch(/frontend expert/i);
    expect(text).toMatch(/Technical Support Staffer/);
  });
});
