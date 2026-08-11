import { describe, expect, it } from "vitest";
import { barcodeModules, encodeCode128B } from "@/components/furniture/Barcode";

describe("Code 128B encoder", () => {
  it("wraps values in start B and stop", () => {
    const values = encodeCode128B("A");
    expect(values[0]).toBe(104);
    expect(values.at(-1)).toBe(106);
    expect(values[1]).toBe("A".charCodeAt(0) - 32);
  });

  it("computes the standard checksum (Wikipedia PJJ123456 example family)", () => {
    // checksum = (104 + Σ value_i * i) mod 103
    const values = encodeCode128B("AB");
    const expected = (104 + (33 * 1 + 34 * 2)) % 103;
    expect(values.at(-2)).toBe(expected);
  });

  it("every symbol spans 11 modules (13 for stop)", () => {
    const modules = barcodeModules("FIELDNOTES.01");
    const total = modules.reduce((n, m) => n + m.width, 0);
    const symbols = "FIELDNOTES.01".length + 3; // start + data + checksum + stop
    expect(total).toBe((symbols - 1) * 11 + 13);
  });

  it("rejects unencodable characters", () => {
    expect(() => encodeCode128B("née")).toThrow();
  });
});
