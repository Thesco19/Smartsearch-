import { describe, it, expect } from "vitest";
import { normalizeDetections } from "./detection.ts";

describe("normalizeDetections", () => {
  it("retorna [] para input não-array", () => {
    expect(normalizeDetections(null as any)).toEqual([]);
    expect(normalizeDetections(undefined as any)).toEqual([]);
    expect(normalizeDetections("string" as any)).toEqual([]);
  });

  it("normaliza coordenadas 0..1000 → 0..1", () => {
    const result = normalizeDetections([
      {
        category: "person",
        label: "pessoa",
        bounding_box_relative: { top: 500, left: 100, bottom: 800, right: 300 },
      },
    ]);
    expect(result[0].bounding_box_relative).toEqual({
      top: 0.5,
      left: 0.1,
      bottom: 0.8,
      right: 0.3,
    });
  });

  it("mantém coordenadas já em 0..1", () => {
    const result = normalizeDetections([
      {
        category: "carro",
        bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 },
      },
    ]);
    expect(result[0].bounding_box_relative).toEqual({
      top: 0.1,
      left: 0.2,
      bottom: 0.9,
      right: 0.8,
    });
  });

  it("clampa coordenadas fora do range (negativas ou >1)", () => {
    const result = normalizeDetections([
      {
        category: "object",
        bounding_box_relative: { top: -5, left: 2000, bottom: 500, right: 0.5 },
      },
    ]);
    // left=2000 >1 → todos são divididos por 1000
    expect(result[0].bounding_box_relative.top).toBe(0);       // -5/1000=-0.005 clamped to 0
    expect(result[0].bounding_box_relative.left).toBe(1);      // 2000/1000=2 clamped to 1
    expect(result[0].bounding_box_relative.bottom).toBe(0.5);  // 500/1000=0.5
    expect(result[0].bounding_box_relative.right).toBe(0.0005); // 0.5/1000=0.0005
  });

  it("normaliza categorias fuzzy para válidas", () => {
    const input = [
      { category: "Pessoa caminhando", bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 } },
      { category: "dog atacando", bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 } },
      { category: "carro preto", bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 } },
      { category: "random junk", bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 } },
    ];
    const result = normalizeDetections(input);
    expect(result[0].category).toBe("person");
    expect(result[1].category).toBe("animal");
    expect(result[2].category).toBe("vehicle");
    expect(result[3].category).toBe("object");
  });

  it("preserva campos extras de cada detecção", () => {
    const result = normalizeDetections([
      {
        category: "vehicle",
        label: "carro",
        confidence: 0.95,
        bounding_box_relative: { top: 0.1, left: 0.2, bottom: 0.9, right: 0.8 },
        attributes: { description: "carro vermelho", action_state: "parado" },
      },
    ]);
    expect(result[0].label).toBe("carro");
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].attributes.description).toBe("carro vermelho");
  });

  it("fornece attributes padrão quando ausentes", () => {
    const result = normalizeDetections([
      { category: "object", bounding_box_relative: { top: 0, left: 0, bottom: 1, right: 1 } },
    ]);
    expect(result[0].attributes).toEqual({ description: "", action_state: "" });
  });

  it("aceita bounding_box_relative ausente (default 0)", () => {
    const result = normalizeDetections([
      { category: "person" },
    ]);
    expect(result[0].bounding_box_relative).toEqual({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    });
  });
});
