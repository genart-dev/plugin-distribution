import { describe, it, expect, vi } from "vitest";
import distributionPlugin, {
  distributionMcpTools,
  previewLayerType,
  voronoiLayerType,
  densityLayerType,
} from "../src/index.js";
import type { McpToolContext, LayerStackAccessor } from "@genart-dev/core";

// Minimal mock context
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

function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  const t = result.content[0];
  if (t?.type === "text" && t.text) return JSON.parse(t.text);
  return null;
}

describe("distributionPlugin", () => {
  it("has correct id and tier", () => {
    expect(distributionPlugin.id).toBe("distribution");
    expect(distributionPlugin.tier).toBe("free");
  });

  it("has 3 layer types", () => {
    expect(distributionPlugin.layerTypes.length).toBe(3);
  });

  it("has 8 MCP tools", () => {
    expect(distributionPlugin.mcpTools.length).toBe(8);
  });

  it("all layer types are guide category", () => {
    for (const lt of distributionPlugin.layerTypes) {
      expect(lt.category).toBe("guide");
    }
  });

  it("initialize and dispose run without error", async () => {
    const ctx = { logger: console } as unknown as import("@genart-dev/core").PluginContext;
    await expect(distributionPlugin.initialize(ctx)).resolves.not.toThrow();
    expect(() => distributionPlugin.dispose()).not.toThrow();
  });
});

describe("previewLayerType", () => {
  it("has correct typeId and icon", () => {
    expect(previewLayerType.typeId).toBe("distribution:preview");
    expect(previewLayerType.icon).toBe("scatter_plot");
  });

  it("createDefault returns expected props", () => {
    const props = previewLayerType.createDefault();
    expect(props.algorithm).toBe("poisson-disk");
    expect(props.dotSize).toBe(3);
    expect(props.opacity).toBe(0.6);
    expect(props._points).toBe("[]");
  });

  it("render no-ops with empty points", () => {
    const props = previewLayerType.createDefault();
    const ctx = { save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(() => previewLayerType.render(props, ctx, { x: 0, y: 0, width: 400, height: 400 }, {})).not.toThrow();
  });

  it("validate returns null", () => {
    expect(previewLayerType.validate()).toBeNull();
  });
});

describe("voronoiLayerType", () => {
  it("has correct typeId", () => {
    expect(voronoiLayerType.typeId).toBe("distribution:voronoi");
  });

  it("createDefault has correct defaults", () => {
    const props = voronoiLayerType.createDefault();
    expect(props.strokeColor).toBe("#333333");
    expect(props._cells).toBe("[]");
  });

  it("render no-ops with empty cells", () => {
    const props = voronoiLayerType.createDefault();
    const ctx = { save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(() => voronoiLayerType.render(props, ctx, { x: 0, y: 0, width: 400, height: 400 }, {})).not.toThrow();
  });
});

describe("densityLayerType", () => {
  it("has correct typeId", () => {
    expect(densityLayerType.typeId).toBe("distribution:density");
  });

  it("createDefault has correct defaults", () => {
    const props = densityLayerType.createDefault();
    expect(props.radius).toBe(30);
    expect(props.colormap).toBe("viridis");
  });

  it("render no-ops with empty points", () => {
    const props = densityLayerType.createDefault();
    const ctx = { save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(() => densityLayerType.render(props, ctx, { x: 0, y: 0, width: 400, height: 400 }, {})).not.toThrow();
  });
});

describe("distribute_points tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "distribute_points")!;

  it("exists with correct schema", () => {
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toContain("algorithm");
  });

  it("poisson-disk returns points", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "poisson-disk", width: 400, height: 400, params: { minDist: 30 }, seed: 42 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBeGreaterThan(0);
    expect(data.points.length).toBe(data.count);
  });

  it("phyllotaxis returns expected count", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "phyllotaxis", width: 400, height: 400, params: { count: 50 } }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(50);
  });

  it("hex-grid returns points in bounds", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "hex-grid", width: 200, height: 200, params: { size: 20 } }, ctx);
    const data = parseResult(result);
    expect(data.count).toBeGreaterThan(0);
    for (const pt of data.points) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("jittered-grid returns grid", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "jittered-grid", width: 200, height: 200, params: { size: 40 }, seed: 1 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(25); // 5x5
  });

  it("r2-sequence returns progressive sequence", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "r2-sequence", width: 400, height: 400, params: { count: 20 } }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(20);
  });

  it("halton returns sequence", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "halton", width: 400, height: 400, params: { count: 15 } }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(15);
  });

  it("best-candidate returns n points", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "best-candidate", width: 400, height: 400, params: { count: 10 }, seed: 5 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(10);
  });

  it("latin-hypercube returns n points", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "latin-hypercube", width: 400, height: 400, params: { count: 10 }, seed: 3 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(10);
  });
});

describe("pack_circles tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "pack_circles")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("returns circles with no overlaps", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ width: 400, height: 400, minRadius: 10, maxRadius: 30, count: 30, seed: 42 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBeGreaterThan(0);
    expect(data.coverage).toBeGreaterThan(0);
    // Verify no overlaps (with tolerance)
    for (let i = 0; i < data.circles.length; i++) {
      for (let j = i + 1; j < data.circles.length; j++) {
        const a = data.circles[i], b = data.circles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(a.radius + b.radius - 0.1);
      }
    }
  });
});

describe("pack_rects tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "pack_rects")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("packs all 3 rects into 400x400 bin", async () => {
    const ctx = makeContext();
    const rects = [{ w: 100, h: 50, id: "a" }, { w: 80, h: 80, id: "b" }, { w: 60, h: 30, id: "c" }];
    const result = await tool.handler({ rects, width: 400, height: 400 }, ctx);
    const data = parseResult(result);
    expect(data.packed).toBe(3);
    expect(data.utilization).toBeGreaterThan(0);
  });
});

describe("preview_distribution tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "preview_distribution")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("adds a layer to context", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "phyllotaxis", params: { count: 20 }, seed: 1 }, ctx);
    expect(result.isError).not.toBe(true);
    const allLayers = ctx.layers.getAll();
    expect(allLayers.length).toBe(1);
    expect(allLayers[0]?.type).toBe("distribution:preview");
  });
});

describe("clear_distribution_preview tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "clear_distribution_preview")!;

  it("removes all distribution layers", async () => {
    const ctx = makeContext();
    // Add a preview layer
    ctx.layers.add({ id: "preview-1", type: "distribution:preview", properties: {} } as unknown as Parameters<typeof ctx.layers.add>[0]);
    ctx.layers.add({ id: "other-1", type: "composite:solid", properties: {} } as unknown as Parameters<typeof ctx.layers.add>[0]);
    expect(ctx.layers.getAll().length).toBe(2);

    await tool.handler({}, ctx);
    expect(ctx.layers.getAll().length).toBe(1);
    expect(ctx.layers.getAll()[0]?.type).toBe("composite:solid");
  });
});

describe("grow_pattern tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "grow_pattern")!;

  it("DLA returns points", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "dla", width: 100, height: 100, iterations: 10, seed: 1 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBeGreaterThan(0);
  });

  it("other algorithms return info message", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ algorithm: "differential-growth", width: 200, height: 200, iterations: 20 }, ctx);
    const data = parseResult(result);
    expect(data.message).toBeDefined();
  });
});

describe("tile_region tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "tile_region")!;

  it("returns grid of correct dimensions", async () => {
    const tileSet = {
      tiles: [{ id: "grass" }, { id: "water" }, { id: "sand" }],
      adjacency: {
        grass: { up: ["grass", "sand"], down: ["grass", "sand"], left: ["grass", "sand"], right: ["grass", "sand"] },
        water: { up: ["water"], down: ["water"], left: ["water"], right: ["water"] },
        sand:  { up: ["grass", "water", "sand"], down: ["grass", "water", "sand"], left: ["grass", "water", "sand"], right: ["grass", "water", "sand"] },
      },
    };
    const ctx = makeContext();
    const result = await tool.handler({ tileSet, width: 5, height: 4, seed: 42 }, ctx);
    const data = parseResult(result);
    expect(data.width).toBe(5);
    expect(data.height).toBe(4);
    expect(data.grid.length).toBe(4);
    expect(data.tiles.length).toBe(20);
  });
});

describe("distribute_along_path tool", () => {
  const tool = distributionMcpTools.find((t) => t.name === "distribute_along_path")!;

  it("distributes along a straight line", async () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    const ctx = makeContext();
    const result = await tool.handler({ path, count: 5 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(5);
    expect(data.pathLength).toBeCloseTo(200);
    for (const pt of data.points) {
      expect(pt.y).toBeCloseTo(0);
    }
  });

  it("handles single-point path", async () => {
    const ctx = makeContext();
    const result = await tool.handler({ path: [{ x: 0, y: 0 }] }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(0);
  });
});
