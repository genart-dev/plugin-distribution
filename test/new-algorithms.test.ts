import { describe, it, expect, vi } from "vitest";
import { distributionMcpTools } from "../src/index.js";
import type { McpToolContext, LayerStackAccessor } from "@genart-dev/core";

function makeContext(): McpToolContext {
  const layers: Array<{ id: string; type: string; properties: Record<string, unknown> }> = [];
  return {
    layers: {
      getAll: () => layers,
      get: (id: string) => layers.find((l) => l.id === id) ?? null,
      add: (l: unknown) => layers.push(l as typeof layers[0]),
      remove: (id: string) => {
        const i = layers.findIndex((l) => l.id === id);
        if (i >= 0) layers.splice(i, 1);
      },
      update: vi.fn(),
      move: vi.fn(),
    } as unknown as LayerStackAccessor,
    sketchState: {} as McpToolContext["sketchState"],
    canvasWidth: 400,
    canvasHeight: 400,
    resolveAsset: async () => null,
    captureComposite: async () => Buffer.alloc(0),
    emitChange: vi.fn(),
  };
}

const distributeTool = distributionMcpTools.find((t) => t.name === "distribute_points")!;

function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  const t = result.content[0];
  if (t?.type === "text" && t.text) return JSON.parse(t.text);
  return null;
}

describe("lloyd-relax algorithm", () => {
  it("produces the requested number of points", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "lloyd-relax", width: 200, height: 200, params: { count: 20, iterations: 3 }, seed: 42 },
      ctx,
    );
    const data = parseResult(result);
    expect(data.count).toBe(20);
    expect(data.points.length).toBe(20);
  });

  it("points are within bounds", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "lloyd-relax", width: 300, height: 300, params: { count: 50, iterations: 5 }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    for (const p of data.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(300);
    }
  });

  it("relaxation makes distribution more uniform", async () => {
    const ctx = makeContext();
    // Compare variance of nearest-neighbor distances between 0 and 10 iterations
    const resultUnrelaxed = await distributeTool.handler(
      { algorithm: "lloyd-relax", width: 200, height: 200, params: { count: 30, iterations: 0 }, seed: 7 },
      ctx,
    );
    const resultRelaxed = await distributeTool.handler(
      { algorithm: "lloyd-relax", width: 200, height: 200, params: { count: 30, iterations: 10 }, seed: 7 },
      ctx,
    );
    const unrelaxed = parseResult(resultUnrelaxed).points;
    const relaxed = parseResult(resultRelaxed).points;

    function nnVariance(pts: Array<{ x: number; y: number }>): number {
      const dists = pts.map((p) => {
        let minD = Infinity;
        for (const q of pts) {
          if (p === q) continue;
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (d < minD) minD = d;
        }
        return Math.sqrt(minD);
      });
      const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
      return dists.reduce((a, d) => a + (d - mean) ** 2, 0) / dists.length;
    }

    // Relaxed points should have lower variance in nearest-neighbor distances
    expect(nnVariance(relaxed)).toBeLessThan(nnVariance(unrelaxed));
  });
});

describe("sobol algorithm", () => {
  it("produces the requested number of points", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "sobol", width: 400, height: 400, params: { count: 64 }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    expect(data.count).toBe(64);
  });

  it("points are within bounds", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "sobol", width: 500, height: 300, params: { count: 100 }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    for (const p of data.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(500);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(300);
    }
  });

  it("points are deterministic", async () => {
    const ctx = makeContext();
    const r1 = parseResult(await distributeTool.handler(
      { algorithm: "sobol", width: 200, height: 200, params: { count: 20 }, seed: 0 },
      ctx,
    ));
    const r2 = parseResult(await distributeTool.handler(
      { algorithm: "sobol", width: 200, height: 200, params: { count: 20 }, seed: 0 },
      ctx,
    ));
    expect(r1.points).toEqual(r2.points);
  });

  it("has good coverage (low discrepancy)", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "sobol", width: 100, height: 100, params: { count: 100 }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    // Divide into 4 quadrants — each should have roughly 25% of points
    const quads = [0, 0, 0, 0];
    for (const p of data.points) {
      const qi = (p.x >= 50 ? 1 : 0) + (p.y >= 50 ? 2 : 0);
      quads[qi]++;
    }
    for (const q of quads) {
      expect(q).toBeGreaterThan(10); // at least 10% in each quadrant
      expect(q).toBeLessThan(50);    // at most 50%
    }
  });
});

describe("weighted algorithm", () => {
  it("produces points (uniform when no weights)", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "weighted", width: 200, height: 200, params: { count: 50 }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    expect(data.count).toBe(50);
  });

  it("concentrates points in high-weight areas", async () => {
    const ctx = makeContext();
    // 2x2 grid: top-left has high weight, rest has zero
    const result = await distributeTool.handler(
      { algorithm: "weighted", width: 200, height: 200, params: { count: 50, gridSize: 2, weights: [1, 0, 0, 0] }, seed: 42 },
      ctx,
    );
    const data = parseResult(result);
    // Most points should be in the top-left quadrant (x < 100, y < 100)
    const topLeft = data.points.filter((p: { x: number; y: number }) => p.x < 100 && p.y < 100).length;
    expect(topLeft).toBeGreaterThan(data.count * 0.8);
  });

  it("points are within bounds", async () => {
    const ctx = makeContext();
    const result = await distributeTool.handler(
      { algorithm: "weighted", width: 300, height: 200, params: { count: 30, gridSize: 3, weights: [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1] }, seed: 0 },
      ctx,
    );
    const data = parseResult(result);
    for (const p of data.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
  });
});
