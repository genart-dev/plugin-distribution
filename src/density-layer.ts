import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  LayerBounds,
  RenderResources,
} from "@genart-dev/core";

const DENSITY_PROPERTIES: LayerPropertySchema[] = [
  { key: "radius", label: "Kernel Radius", type: "number", default: 30, min: 5, max: 100, step: 5, group: "density" },
  { key: "colormap", label: "Color Map", type: "string", default: "viridis", group: "style" },
  { key: "opacity", label: "Opacity", type: "number", default: 0.65, min: 0, max: 1, step: 0.01, group: "style" },
  { key: "_points", label: "Points (JSON)", type: "string", default: "[]", group: "data" },
];

// Simple 5-stop colormaps: [t in 0..1] → [r,g,b] each 0..255
const COLORMAPS: Record<string, Array<[number, number, number]>> = {
  viridis: [[68,1,84],[59,82,139],[33,144,141],[93,201,99],[253,231,37]],
  plasma:  [[13,8,135],[156,23,158],[237,121,83],[240,249,33],[252,230,25]],
  inferno: [[0,0,4],[120,28,109],[238,125,51],[252,225,31],[252,255,164]],
  hot:     [[0,0,0],[160,0,0],[255,80,0],[255,200,0],[255,255,255]],
  cool:    [[0,255,255],[64,191,255],[128,128,255],[191,64,255],[255,0,255]],
};

function colormapLookup(name: string, t: number): [number, number, number] {
  const stops = (COLORMAPS[name] ?? COLORMAPS["viridis"]) as Array<[number, number, number]>;
  const scaled = t * (stops.length - 1);
  const lo = Math.floor(scaled), hi = Math.min(lo + 1, stops.length - 1);
  const f = scaled - lo;
  const slo = stops[lo] as [number, number, number];
  const shi = stops[hi] as [number, number, number];
  return [
    Math.round(slo[0] + f * (shi[0] - slo[0])),
    Math.round(slo[1] + f * (shi[1] - slo[1])),
    Math.round(slo[2] + f * (shi[2] - slo[2])),
  ];
}

export const densityLayerType: LayerTypeDefinition = {
  typeId: "distribution:density",
  displayName: "Density Map",
  icon: "gradient",
  category: "guide",
  properties: DENSITY_PROPERTIES,
  propertyEditorId: "distribution:density-editor",

  createDefault(): LayerProperties {
    return { radius: 30, colormap: "viridis", opacity: 0.65, _points: "[]" };
  },

  render(
    properties: LayerProperties,
    ctx: CanvasRenderingContext2D,
    bounds: LayerBounds,
    _resources: RenderResources,
  ): void {
    const points = JSON.parse(String(properties._points || "[]")) as Array<{ x: number; y: number }>;
    if (points.length === 0) return;

    const radius = Number(properties.radius ?? 30);
    const colormap = String(properties.colormap ?? "viridis");
    const opacity = Number(properties.opacity ?? 0.65);

    const w = Math.floor(bounds.width);
    const h = Math.floor(bounds.height);
    if (w <= 0 || h <= 0) return;

    // Kernel Density Estimation on a downsampled grid
    const scale = 0.25; // 1/4 resolution for performance
    const gw = Math.max(1, Math.floor(w * scale));
    const gh = Math.max(1, Math.floor(h * scale));
    const density = new Float32Array(gw * gh);
    const gr = radius * scale;
    const gr2 = gr * gr;

    for (const pt of points) {
      const px = pt.x * gw;
      const py = pt.y * gh;
      const minX = Math.max(0, Math.floor(px - gr));
      const maxX = Math.min(gw - 1, Math.ceil(px + gr));
      const minY = Math.max(0, Math.floor(py - gr));
      const maxY = Math.min(gh - 1, Math.ceil(py + gr));
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const dx = gx - px, dy = gy - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < gr2) {
            const idx2 = gy * gw + gx;
            density[idx2] = (density[idx2] ?? 0) + (1 - d2 / gr2);
          }
        }
      }
    }

    let maxD = 0;
    for (let i = 0; i < density.length; i++) if ((density[i] ?? 0) > maxD) maxD = density[i] ?? 0;
    if (maxD === 0) return;

    // Render via ImageData at low res, then scale up
    const imgData = ctx.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) {
      const t = (density[i] ?? 0) / maxD;
      const [r, g, b] = colormapLookup(colormap, t);
      imgData.data[i * 4] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = t > 0 ? Math.round(t * 200) : 0;
    }

    // Draw to offscreen, scale up
    const offscreen = new OffscreenCanvas(gw, gh);
    const octx = offscreen.getContext("2d")!;
    octx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
  },

  validate(): null { return null; },
};
