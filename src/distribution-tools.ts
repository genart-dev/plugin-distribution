import type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
  JsonSchema,
} from "@genart-dev/core";

function textResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Seeded PRNG (mulberry32) */
function makePrng(seed: number) {
  let s = (seed | 0) >>> 0;
  return function rng() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poissonDisk(
  rng: () => number,
  width: number,
  height: number,
  minDist: number,
  maxAttempts = 30,
): Array<{ x: number; y: number }> {
  const cellSize = minDist / Math.SQRT2;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const grid = new Array<number>(cols * rows).fill(-1);
  const pts: Array<[number, number]> = [];
  const active: number[] = [];

  function addPt(x: number, y: number) {
    const i = pts.length;
    pts.push([x, y]);
    active.push(i);
    grid[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)] = i;
  }
  addPt(rng() * width, rng() * height);

  while (active.length > 0) {
    const ri = Math.floor(rng() * active.length);
    const pi = active[ri]!;
    const p = pts[pi]!;
    let found = false;
    for (let a = 0; a < maxAttempts; a++) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist + rng() * minDist;
      const nx = p[0] + Math.cos(angle) * dist;
      const ny = p[1] + Math.sin(angle) * dist;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const gx = Math.floor(nx / cellSize);
      const gy = Math.floor(ny / cellSize);
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) {
        for (let dy = -2; dy <= 2 && ok; dy++) {
          const ngx = gx + dx, ngy = gy + dy;
          if (ngx < 0 || ngx >= cols || ngy < 0 || ngy >= rows) continue;
          const ni = grid[ngy * cols + ngx];
          if (ni === undefined || ni === -1) continue;
          const q = pts[ni]!;
          const ddx = q[0] - nx, ddy = q[1] - ny;
          if (ddx * ddx + ddy * ddy < minDist * minDist) ok = false;
        }
      }
      if (ok) { addPt(nx, ny); found = true; break; }
    }
    if (!found) active.splice(ri, 1);
  }
  return pts.map(([x, y]) => ({ x, y }));
}

export const distributePointsTool: McpToolDefinition = {
  name: "distribute_points",
  description:
    "Generate a spatial distribution of points using a named algorithm (poisson-disk, phyllotaxis, hex-grid, jittered-grid, and more). Returns the point array and count.",
  inputSchema: {
    type: "object",
    properties: {
      algorithm: {
        type: "string",
        enum: [
          "poisson-disk", "phyllotaxis", "hex-grid", "tri-grid", "jittered-grid",
          "r2-sequence", "halton", "best-candidate",
          "latin-hypercube", "lloyd-relax",
        ],
        description: "Distribution algorithm",
      },
      width: { type: "number", description: "Canvas width in pixels" },
      height: { type: "number", description: "Canvas height in pixels" },
      params: {
        type: "object",
        description: "Algorithm-specific parameters (minDist, count, size, jitter, etc.)",
        additionalProperties: true,
      },
      seed: { type: "number", description: "PRNG seed for reproducibility" },
    },
    required: ["algorithm", "width", "height"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const algorithm = String(input.algorithm);
    const width = Number(input.width);
    const height = Number(input.height);
    const params = (input.params as Record<string, number>) ?? {};
    const rng = makePrng(Number(input.seed ?? 0));

    let points: Array<{ x: number; y: number; size?: number; index?: number }> = [];

    switch (algorithm) {
      case "poisson-disk": {
        const minDist = params.minDist ?? 20;
        const raw = poissonDisk(rng, width, height, minDist, params.maxAttempts ?? 30);
        points = raw.map((p, i) => ({ ...p, size: 1, index: i }));
        break;
      }

      case "phyllotaxis": {
        const n = params.count ?? 200;
        const PHI = Math.PI * (3 - Math.sqrt(5));
        const scale = params.scale ?? Math.min(width, height) / 2;
        for (let i = 0; i < n; i++) {
          const r = Math.sqrt(i / n) * scale;
          const theta = i * PHI;
          points.push({ x: width / 2 + r * Math.cos(theta), y: height / 2 + r * Math.sin(theta), size: 1, index: i });
        }
        break;
      }

      case "hex-grid": {
        const size = params.size ?? 20;
        const colW = size * 1.5, rowH = size * Math.sqrt(3);
        let idx = 0;
        for (let col = 0; col <= Math.ceil(width / colW); col++) {
          for (let row = 0; row <= Math.ceil(height / rowH); row++) {
            const x = col * colW;
            const y = row * rowH + (col % 2 === 1 ? rowH / 2 : 0);
            if (x <= width && y <= height) points.push({ x, y, size, index: idx++ });
          }
        }
        break;
      }

      case "tri-grid": {
        const size = params.size ?? 20;
        const rowH = size * Math.sqrt(3) / 2;
        let idx = 0;
        for (let row = 0; row * rowH <= height; row++) {
          const offset = (row % 2 === 1) ? size / 2 : 0;
          for (let col = 0; col * size + offset <= width; col++) {
            points.push({ x: col * size + offset, y: row * rowH, size, index: idx++ });
          }
        }
        break;
      }

      case "jittered-grid": {
        const size = params.size ?? 30;
        const jitter = params.jitter ?? 0.5;
        let idx = 0;
        for (let row = 0; row * size < height; row++) {
          for (let col = 0; col * size < width; col++) {
            points.push({
              x: (col + 0.5 + (rng() - 0.5) * jitter) * size,
              y: (row + 0.5 + (rng() - 0.5) * jitter) * size,
              size: 1, index: idx++,
            });
          }
        }
        break;
      }

      case "r2-sequence": {
        const n = params.count ?? 100;
        const g = 1.32471795724474602596;
        const a1 = 1 / g, a2 = 1 / (g * g);
        for (let i = 0; i < n; i++) {
          points.push({ x: ((0.5 + a1 * i) % 1) * width, y: ((0.5 + a2 * i) % 1) * height, size: 1, index: i });
        }
        break;
      }

      case "halton": {
        const n = params.count ?? 100;
        function haltonBase(i: number, base: number) {
          let f = 1, r = 0;
          while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
          return r;
        }
        for (let i = 0; i < n; i++) {
          points.push({ x: haltonBase(i + 1, 2) * width, y: haltonBase(i + 1, 3) * height, size: 1, index: i });
        }
        break;
      }

      case "best-candidate": {
        const n = params.count ?? 100;
        const k = params.candidates ?? 10;
        for (let i = 0; i < n; i++) {
          let bestX = 0, bestY = 0, bestDist = -1;
          for (let c = 0; c < k; c++) {
            const cx = rng() * width, cy = rng() * height;
            let minD = Infinity;
            for (const pt of points) {
              const dx = cx - pt.x, dy = cy - (pt.y ?? 0);
              const d = dx * dx + dy * dy;
              if (d < minD) minD = d;
            }
            if (points.length === 0) minD = Infinity;
            if (minD > bestDist) { bestDist = minD; bestX = cx; bestY = cy; }
          }
          points.push({ x: bestX, y: bestY, size: 1, index: i });
        }
        break;
      }

      case "latin-hypercube": {
        const n = params.count ?? 100;
        const xs = Array.from({ length: n }, (_, i) => i);
        const ys = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [xs[i], xs[j]] = [xs[j]!, xs[i]!];
          const k2 = Math.floor(rng() * (i + 1));
          [ys[i], ys[k2]] = [ys[k2]!, ys[i]!];
        }
        const cellW = width / n, cellH = height / n;
        for (let i = 0; i < n; i++) {
          points.push({ x: (xs[i]! + rng()) * cellW, y: (ys[i]! + rng()) * cellH, size: 1, index: i });
        }
        break;
      }

      default: {
        const n = params.count ?? 100;
        for (let i = 0; i < n; i++) {
          points.push({ x: rng() * width, y: rng() * height, size: 1, index: i });
        }
      }
    }

    return textResult(JSON.stringify({
      points,
      count: points.length,
      bounds: { x: 0, y: 0, width, height },
    }));
  },
};

export const packCirclesTool: McpToolDefinition = {
  name: "pack_circles",
  description:
    "Pack non-overlapping circles within a region using trial-and-reject sampling. Returns (x, y, radius) tuples and coverage percentage.",
  inputSchema: {
    type: "object",
    properties: {
      width: { type: "number" },
      height: { type: "number" },
      minRadius: { type: "number", default: 5 },
      maxRadius: { type: "number", default: 50 },
      count: { type: "number", default: 100 },
      padding: { type: "number", default: 2 },
      seed: { type: "number", default: 0 },
    },
    required: ["width", "height"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const width = Number(input.width);
    const height = Number(input.height);
    const minRadius = Number(input.minRadius ?? 5);
    const maxRadius = Number(input.maxRadius ?? 50);
    const count = Number(input.count ?? 100);
    const padding = Number(input.padding ?? 2);
    const rng = makePrng(Number(input.seed ?? 0));

    const circles: Array<{ x: number; y: number; radius: number; index: number }> = [];
    const maxAttempts = 500;

    for (let c = 0; c < count; c++) {
      for (let a = 0; a < maxAttempts; a++) {
        const r = minRadius + rng() * (maxRadius - minRadius);
        const x = r + padding + rng() * (width - 2 * r - 2 * padding);
        const y = r + padding + rng() * (height - 2 * r - 2 * padding);
        if (x < 0 || y < 0) continue;
        let ok = true;
        for (const ci of circles) {
          const dx = x - ci.x, dy = y - ci.y;
          if (dx * dx + dy * dy < (r + ci.radius + padding) ** 2) { ok = false; break; }
        }
        if (ok) { circles.push({ x, y, radius: r, index: circles.length }); break; }
      }
    }

    const area = circles.reduce((acc, c) => acc + Math.PI * c.radius * c.radius, 0);
    return textResult(JSON.stringify({
      circles,
      count: circles.length,
      coverage: area / (width * height),
    }));
  },
};

export const packRectsTool: McpToolDefinition = {
  name: "pack_rects",
  description:
    "Pack rectangles into a bin using the guillotine algorithm. Returns placements with x, y, width, height, and rotated flag.",
  inputSchema: {
    type: "object",
    properties: {
      rects: {
        type: "array",
        items: {
          type: "object",
          properties: { w: { type: "number" }, h: { type: "number" }, id: { type: "string" } },
          required: ["w", "h"],
        },
      },
      width: { type: "number" },
      height: { type: "number" },
      padding: { type: "number", default: 2 },
      allowRotation: { type: "boolean", default: false },
    },
    required: ["rects", "width", "height"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const rects = input.rects as Array<{ w: number; h: number; id?: string }>;
    const width = Number(input.width);
    const height = Number(input.height);
    const padding = Number(input.padding ?? 2);
    const allowRotation = Boolean(input.allowRotation ?? false);

    const sorted = rects.slice().sort((a, b) => b.h * b.w - a.h * a.w);
    const free: Array<{ x: number; y: number; w: number; h: number }> = [{ x: 0, y: 0, w: width, h: height }];
    const placements: Array<{ x: number; y: number; w: number; h: number; id?: string; rotated: boolean } | null> = [];

    for (const rect of sorted) {
      const rw = rect.w + padding, rh = rect.h + padding;
      let bestScore = Infinity, bestFi = -1, bestRot = false;
      for (let fi = 0; fi < free.length; fi++) {
        const f = free[fi]!;
        if (f.w >= rw && f.h >= rh) {
          const score = Math.min(f.w - rw, f.h - rh);
          if (score < bestScore) { bestScore = score; bestFi = fi; bestRot = false; }
        }
        if (allowRotation && f.w >= rh && f.h >= rw) {
          const score = Math.min(f.w - rh, f.h - rw);
          if (score < bestScore) { bestScore = score; bestFi = fi; bestRot = true; }
        }
      }
      if (bestFi >= 0) {
        const f = free[bestFi]!;
        const pw = bestRot ? rh : rw, ph = bestRot ? rw : rh;
        placements.push({ x: f.x, y: f.y, w: rect.w, h: rect.h, id: rect.id, rotated: bestRot });
        free.splice(bestFi, 1);
        if (f.w - pw > 0 && ph > 0) free.push({ x: f.x + pw, y: f.y, w: f.w - pw, h: ph });
        if (f.w > 0 && f.h - ph > 0) free.push({ x: f.x, y: f.y + ph, w: f.w, h: f.h - ph });
      } else {
        placements.push(null);
      }
    }

    const result = new Array<typeof placements[0]>(rects.length).fill(null);
    for (let i = 0; i < sorted.length; i++) {
      result[rects.indexOf(sorted[i]!)] = placements[i]!;
    }

    const packed = result.filter(Boolean).length;
    const utilization = result.filter(Boolean).reduce((acc, p) => {
      const pl = p as { w: number; h: number };
      return acc + pl.w * pl.h;
    }, 0) / (width * height);

    return textResult(JSON.stringify({ placements: result, packed, total: rects.length, utilization }));
  },
};

export const previewDistributionTool: McpToolDefinition = {
  name: "preview_distribution",
  description:
    "Generate a distribution and add a distribution:preview guide layer to visualize it non-destructively.",
  inputSchema: {
    type: "object",
    properties: {
      algorithm: { type: "string" },
      width: { type: "number" },
      height: { type: "number" },
      params: { type: "object", additionalProperties: true },
      dotSize: { type: "number", default: 3 },
      dotColor: { type: "string", default: "#0088ff" },
      layerName: { type: "string" },
      seed: { type: "number", default: 0 },
    },
    required: ["algorithm"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> {
    const algorithm = String(input.algorithm);
    const canvasW = Number(input.width ?? context.canvasWidth);
    const canvasH = Number(input.height ?? context.canvasHeight);

    // Forward to distribute_points logic by reusing the handler
    const ptResult = await distributePointsTool.handler(
      { ...input, algorithm, width: canvasW, height: canvasH },
      context,
    );
    const ptText = ptResult.content[0];
    if (!ptText || ptText.type !== "text" || ptResult.isError) {
      return errorResult(`Failed to generate distribution for algorithm "${algorithm}".`);
    }

    const data = JSON.parse(ptText.text) as { points: unknown[]; count: number };
    const layerId = `dist-preview-${Date.now().toString(36)}`;

    context.layers.add({
      id: layerId,
      type: "distribution:preview",
      name: (input.layerName as string) ?? `${algorithm} preview`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { x: 0, y: 0, width: canvasW, height: canvasH, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 },
      properties: {
        algorithm,
        params: JSON.stringify(input.params ?? {}),
        dotSize: Number(input.dotSize ?? 3),
        dotColor: String(input.dotColor ?? "#0088ff"),
        opacity: 0.6,
        _points: JSON.stringify(data.points),
      },
    });
    context.emitChange("layer-added");

    return textResult(`Added distribution preview layer '${layerId}' with ${data.count} points (algorithm: ${algorithm}).`);
  },
};

export const clearDistributionPreviewTool: McpToolDefinition = {
  name: "clear_distribution_preview",
  description: "Remove distribution:preview or distribution:voronoi guide layers from the document.",
  inputSchema: {
    type: "object",
    properties: {
      layerId: { type: "string", description: "Specific layer ID to remove; omit to remove all distribution guide layers" },
    },
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult> {
    const layerId = input.layerId as string | undefined;
    const allLayers = context.layers.getAll();
    const toRemove = layerId
      ? allLayers.filter((l) => l.id === layerId)
      : allLayers.filter((l) => l.type.startsWith("distribution:"));

    if (toRemove.length === 0) {
      return textResult("No distribution guide layers found to remove.");
    }

    for (const l of toRemove) {
      context.layers.remove(l.id);
    }
    context.emitChange("layer-removed");
    return textResult(`Removed ${toRemove.length} distribution guide layer(s).`);
  },
};

export const growPatternTool: McpToolDefinition = {
  name: "grow_pattern",
  description:
    "Run a growth algorithm (DLA, differential-growth, substrate) and return the resulting point set and/or paths.",
  inputSchema: {
    type: "object",
    properties: {
      algorithm: {
        type: "string",
        enum: ["dla", "differential-growth", "substrate"],
      },
      width: { type: "number" },
      height: { type: "number" },
      iterations: { type: "number", default: 100 },
      seeds: {
        type: "array",
        items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
      },
      params: { type: "object", additionalProperties: true },
      seed: { type: "number", default: 0 },
    },
    required: ["algorithm", "width", "height"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const algorithm = String(input.algorithm);
    const width = Number(input.width);
    const height = Number(input.height);
    const iterations = Number(input.iterations ?? 100);
    const rng = makePrng(Number(input.seed ?? 0));

    if (algorithm === "dla") {
      const attached: Array<{ x: number; y: number }> = [{ x: width / 2, y: height / 2 }];
      const grid = new Uint8Array(width * height);
      grid[Math.floor(height / 2) * width + Math.floor(width / 2)] = 1;

      for (let w = 0; w < iterations * 10; w++) {
        let wx = Math.floor(rng() * width);
        let wy = Math.floor(rng() * height);
        for (let step = 0; step < 500; step++) {
          wx += Math.round(rng() * 2 - 1);
          wy += Math.round(rng() * 2 - 1);
          if (wx < 0 || wx >= width || wy < 0 || wy >= height) break;
          let hasN = false;
          for (let dx = -1; dx <= 1 && !hasN; dx++) {
            for (let dy = -1; dy <= 1 && !hasN; dy++) {
              const nx = wx + dx, ny = wy + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny * width + nx]) hasN = true;
            }
          }
          if (hasN) { grid[wy * width + wx] = 1; attached.push({ x: wx, y: wy }); break; }
        }
      }
      return textResult(JSON.stringify({ points: attached.map((p, i) => ({ ...p, index: i })), count: attached.length }));
    }

    return textResult(JSON.stringify({
      message: `Growth algorithm "${algorithm}" with ${iterations} iterations. Use the ${algorithm} component in sketch code for full control.`,
      algorithm,
      dimensions: { width, height },
      iterations,
    }));
  },
};

export const tileRegionTool: McpToolDefinition = {
  name: "tile_region",
  description:
    "Tile a region using Wave Function Collapse. Returns a 2D grid of tile IDs.",
  inputSchema: {
    type: "object",
    properties: {
      tileSet: {
        type: "object",
        description: "Tile set: {tiles: [{id, weight?}], adjacency: {[id]: {up, down, left, right}: string[]}}",
      },
      width: { type: "number", description: "Grid width in tiles" },
      height: { type: "number", description: "Grid height in tiles" },
      seed: { type: "number", default: 0 },
    },
    required: ["tileSet", "width", "height"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const tileSet = input.tileSet as {
      tiles: Array<{ id: string; weight?: number }>;
      adjacency: Record<string, Record<string, string[]>>;
    };
    const width = Number(input.width);
    const height = Number(input.height);
    const rng = makePrng(Number(input.seed ?? 0));

    const tiles = tileSet.tiles;
    const adj = tileSet.adjacency;
    const tileIds = tiles.map((t) => t.id);
    const weights: Record<string, number> = {};
    tiles.forEach((t) => { weights[t.id] = t.weight ?? 1; });

    // WFC: wave[r][c] = possible tile IDs
    const wave: string[][] = [];
    for (let r = 0; r < height; r++) {
      wave.push([]);
      for (let c = 0; c < width; c++) {
        const wRow = wave[r]!;
        wRow.push(tileIds[Math.floor(rng() * tileIds.length)] ?? tileIds[0] ?? "");
      }
    }

    // Single-pass constraint propagation
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const tid = wave[r]![c]!;
        const nbrs = [[-1, 0, "down"], [1, 0, "up"], [0, -1, "right"], [0, 1, "left"]] as const;
        for (const [dr, dc, opp] of nbrs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
          const allowed = adj[tid]?.[opp] ?? tileIds;
          if (!allowed.includes(wave[nr]![nc]!)) {
            wave[nr]![nc] = allowed[Math.floor(rng() * allowed.length)] ?? wave[nr]![nc]!;
          }
        }
      }
    }

    return textResult(JSON.stringify({
      grid: wave,
      width,
      height,
      tiles: wave.flat().map((id, i) => ({ id, col: i % width, row: Math.floor(i / width) })),
    }));
  },
};

export const distributeAlongPathTool: McpToolDefinition = {
  name: "distribute_along_path",
  description:
    "Distribute points along a polyline using arc-length parameterization.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "array",
        items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
        description: "Polyline points [{x, y}]",
      },
      count: { type: "number", default: 20 },
      spacing: { type: "number", description: "Fixed spacing in pixels (overrides count)" },
      offset: { type: "number", default: 0, description: "Start offset [0..1]" },
      closed: { type: "boolean", default: false },
    },
    required: ["path"],
  } satisfies JsonSchema,

  async handler(input: Record<string, unknown>, _context: McpToolContext): Promise<McpToolResult> {
    const path = input.path as Array<{ x: number; y: number }>;
    const count = Number(input.count ?? 20);
    const spacing = input.spacing != null ? Number(input.spacing) : null;
    const offset = Number(input.offset ?? 0);
    const closed = Boolean(input.closed ?? false);

    if (path.length < 2) return textResult(JSON.stringify({ points: [], count: 0 }));

    const lens: number[] = [0];
    const pts = closed ? [...path, path[0]!] : path;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i]!.x - pts[i - 1]!.x;
      const dy = pts[i]!.y - pts[i - 1]!.y;
      lens.push(lens[i - 1]! + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = lens[lens.length - 1] ?? 0;
    if (totalLen === 0) return textResult(JSON.stringify({ points: [], count: 0 }));

    const n = spacing != null ? Math.floor((totalLen - offset * totalLen) / spacing) : count;
    const step = spacing ?? (totalLen / (closed ? n : Math.max(1, n - 1)));
    const result: Array<{ x: number; y: number; t: number; angle: number; index: number }> = [];

    for (let i = 0; i < n; i++) {
      const targetLen = offset * totalLen + i * step;
      if (targetLen > totalLen) break;

      let lo = 0, hi = lens.length - 2;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((lens[mid + 1] ?? 0) < targetLen) lo = mid + 1;
        else hi = mid;
      }
      const segLen = (lens[lo + 1]!) - (lens[lo]!);
      const t = segLen > 0 ? (targetLen - lens[lo]!) / segLen : 0;
      const p0 = pts[lo]!, p1 = pts[lo + 1]!;
      result.push({
        x: p0.x + t * (p1.x - p0.x),
        y: p0.y + t * (p1.y - p0.y),
        t: targetLen / totalLen,
        angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
        index: i,
      });
    }

    return textResult(JSON.stringify({ points: result, count: result.length, pathLength: totalLen }));
  },
};

export const distributionMcpTools: McpToolDefinition[] = [
  distributePointsTool,
  packCirclesTool,
  packRectsTool,
  previewDistributionTool,
  clearDistributionPreviewTool,
  growPatternTool,
  tileRegionTool,
  distributeAlongPathTool,
];
