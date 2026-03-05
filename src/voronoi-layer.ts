import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  LayerBounds,
  RenderResources,
} from "@genart-dev/core";

const VORONOI_PROPERTIES: LayerPropertySchema[] = [
  { key: "strokeColor", label: "Edge Color", type: "color", default: "#333333", group: "style" },
  { key: "strokeWidth", label: "Edge Width", type: "number", default: 1, min: 0.5, max: 5, step: 0.5, group: "style" },
  { key: "fillColor", label: "Fill Color", type: "color", default: "transparent", group: "style" },
  { key: "opacity", label: "Opacity", type: "number", default: 0.7, min: 0, max: 1, step: 0.01, group: "style" },
  { key: "_cells", label: "Cells (JSON)", type: "string", default: "[]", group: "data" },
];

type VoronoiVertex = { x: number; y: number };
type VoronoiCell = { vertices: VoronoiVertex[] };

export const voronoiLayerType: LayerTypeDefinition = {
  typeId: "distribution:voronoi",
  displayName: "Voronoi Overlay",
  icon: "hexagon",
  category: "guide",
  properties: VORONOI_PROPERTIES,
  propertyEditorId: "distribution:voronoi-editor",

  createDefault(): LayerProperties {
    return {
      strokeColor: "#333333",
      strokeWidth: 1,
      fillColor: "transparent",
      opacity: 0.7,
      _cells: "[]",
    };
  },

  render(
    properties: LayerProperties,
    ctx: CanvasRenderingContext2D,
    bounds: LayerBounds,
    _resources: RenderResources,
  ): void {
    const cells = JSON.parse(String(properties._cells || "[]")) as VoronoiCell[];
    if (cells.length === 0) return;

    const strokeColor = String(properties.strokeColor ?? "#333333");
    const strokeWidth = Number(properties.strokeWidth ?? 1);
    const fillColor = String(properties.fillColor ?? "transparent");
    const opacity = Number(properties.opacity ?? 0.7);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    for (const cell of cells) {
      const verts = cell.vertices;
      if (verts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(bounds.x + verts[0]!.x, bounds.y + verts[0]!.y);
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(bounds.x + verts[i]!.x, bounds.y + verts[i]!.y);
      }
      ctx.closePath();
      if (fillColor !== "transparent") {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
    }

    ctx.restore();
  },

  validate(): null { return null; },
};
