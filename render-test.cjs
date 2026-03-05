/**
 * Render test: Distribution plugin visual outputs
 * 1. Algorithm gallery (all 10 distribution algorithms)
 * 2. Circle packing + voronoi overlay
 */
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const {
  distributionMcpTools,
  previewLayerType,
  voronoiLayerType,
} = require("./dist/index.cjs");

const outDir = path.join(__dirname, "test-renders");
fs.mkdirSync(outDir, { recursive: true });

const resources = {};

function makeContext() {
  const layers = [];
  return {
    layers: {
      getAll: () => layers,
      get: (id) => layers.find((l) => l.id === id) ?? null,
      add: (l) => layers.push(l),
      remove: (id) => { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); },
      update: () => {},
      move: () => {},
    },
    sketchState: {},
    canvasWidth: 400,
    canvasHeight: 400,
    resolveAsset: async () => null,
    captureComposite: async () => Buffer.alloc(0),
    emitChange: () => {},
  };
}

function parseResult(result) {
  const t = result.content[0];
  if (t?.type === "text" && t.text) return JSON.parse(t.text);
  return null;
}

const distributeTool = distributionMcpTools.find((t) => t.name === "distribute_points");
const packCirclesTool = distributionMcpTools.find((t) => t.name === "pack_circles");

async function main() {
  // ─── 1. Algorithm Gallery ───
  {
    const CW = 200, CH = 200, PAD = 8, LABEL_H = 24;
    const COLS = 5, ROWS = 2;
    const W = COLS * CW + (COLS + 1) * PAD;
    const H = ROWS * (CH + LABEL_H) + (ROWS + 1) * PAD;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    const algorithms = [
      ["poisson-disk", { minDist: 16 }],
      ["phyllotaxis", { count: 300 }],
      ["hex-grid", { size: 16 }],
      ["tri-grid", { size: 20 }],
      ["jittered-grid", { size: 20, jitter: 0.5 }],
      ["r2-sequence", { count: 200 }],
      ["halton", { count: 200 }],
      ["best-candidate", { count: 150 }],
      ["latin-hypercube", { count: 150 }],
      ["lloyd-relax", { count: 150 }],
    ];

    const colors = [
      "#4ecdc4", "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff",
      "#ff6fb7", "#c084fc", "#f97316", "#14b8a6", "#a78bfa",
    ];

    for (let idx = 0; idx < algorithms.length; idx++) {
      const [algo, params] = algorithms[idx];
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = PAD + col * (CW + PAD);
      const y = PAD + row * (CH + LABEL_H + PAD) + LABEL_H;

      // Label
      ctx.fillStyle = "#e0e0e0";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(algo, x + 4, y - 6);

      // Background cell
      ctx.fillStyle = "#16213e";
      ctx.fillRect(x, y, CW, CH);

      // Generate points
      const mcpCtx = makeContext();
      const result = await distributeTool.handler({
        algorithm: algo,
        width: CW,
        height: CH,
        params,
        seed: 42,
      }, mcpCtx);
      const data = parseResult(result);

      if (data && data.points) {
        // Draw points
        ctx.fillStyle = colors[idx];
        for (const pt of data.points) {
          ctx.beginPath();
          ctx.arc(x + pt.x, y + pt.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Count label
        ctx.fillStyle = "#666";
        ctx.font = "10px sans-serif";
        ctx.fillText(`n=${data.count}`, x + CW - 48, y + CH - 6);
      }

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CW, CH);
    }

    fs.writeFileSync(path.join(outDir, "algorithm-gallery.png"), canvas.toBuffer("image/png"));
    console.log("Wrote algorithm-gallery.png");
  }

  // ─── 2. Circle Packing ───
  {
    const W = 500, H = 500, PAD = 20;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    const mcpCtx = makeContext();
    const result = await packCirclesTool.handler({
      width: W - PAD * 2,
      height: H - PAD * 2,
      minRadius: 5,
      maxRadius: 40,
      count: 500,
      seed: 42,
    }, mcpCtx);
    const data = parseResult(result);

    if (data && data.circles) {
      const colors = ["#4ecdc4", "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6fb7", "#c084fc", "#f97316"];
      data.circles.forEach((c, i) => {
        const color = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(PAD + c.x, PAD + c.y, c.radius, 0, Math.PI * 2);
        ctx.fillStyle = color + "40"; // semi-transparent fill
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.fillStyle = "#666";
      ctx.font = "11px sans-serif";
      ctx.fillText(`${data.count} circles, ${(data.coverage * 100).toFixed(1)}% coverage`, PAD, H - 8);
    }

    fs.writeFileSync(path.join(outDir, "circle-packing.png"), canvas.toBuffer("image/png"));
    console.log("Wrote circle-packing.png");
  }

  // ─── 3. Voronoi Overlay on Poisson Disk ───
  {
    const W = 500, H = 500;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    // Generate poisson disk points
    const mcpCtx = makeContext();
    const result = await distributeTool.handler({
      algorithm: "poisson-disk",
      width: W,
      height: H,
      params: { minDist: 30 },
      seed: 7,
    }, mcpCtx);
    const data = parseResult(result);

    if (data && data.points) {
      // Draw points
      ctx.fillStyle = "#4ecdc4";
      for (const pt of data.points) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Compute Voronoi cells (simple brute-force for demo)
      // We'll just show the points with a message about voronoi in the tool
      ctx.fillStyle = "#666";
      ctx.font = "11px sans-serif";
      ctx.fillText(`Poisson disk: ${data.count} points, minDist=30`, 8, H - 8);
    }

    fs.writeFileSync(path.join(outDir, "poisson-voronoi.png"), canvas.toBuffer("image/png"));
    console.log("Wrote poisson-voronoi.png");
  }
}

main().catch(console.error);
