import type {
  LayerTypeDefinition,
  LayerPropertySchema,
  LayerProperties,
  LayerBounds,
  RenderResources,
} from "@genart-dev/core";

const PREVIEW_PROPERTIES: LayerPropertySchema[] = [
  { key: "algorithm", label: "Algorithm", type: "string", default: "poisson-disk", group: "distribution" },
  { key: "params", label: "Parameters (JSON)", type: "string", default: "{}", group: "distribution" },
  { key: "dotSize", label: "Dot Size", type: "number", default: 3, min: 0.5, max: 20, step: 0.5, group: "style" },
  { key: "dotColor", label: "Dot Color", type: "color", default: "#0088ff", group: "style" },
  { key: "opacity", label: "Opacity", type: "number", default: 0.6, min: 0, max: 1, step: 0.01, group: "style" },
  { key: "_points", label: "Points (JSON)", type: "string", default: "[]", group: "data" },
];

export const previewLayerType: LayerTypeDefinition = {
  typeId: "distribution:preview",
  displayName: "Distribution Preview",
  icon: "scatter_plot",
  category: "guide",
  properties: PREVIEW_PROPERTIES,
  propertyEditorId: "distribution:preview-editor",

  createDefault(): LayerProperties {
    return {
      algorithm: "poisson-disk",
      params: "{}",
      dotSize: 3,
      dotColor: "#0088ff",
      opacity: 0.6,
      _points: "[]",
    };
  },

  render(
    properties: LayerProperties,
    ctx: CanvasRenderingContext2D,
    bounds: LayerBounds,
    _resources: RenderResources,
  ): void {
    const points = JSON.parse(String(properties._points || "[]")) as Array<{ x: number; y: number }>;
    if (points.length === 0) return;

    const dotSize = Number(properties.dotSize ?? 3);
    const dotColor = String(properties.dotColor ?? "#0088ff");
    const opacity = Number(properties.opacity ?? 0.6);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = dotColor;

    const scaleX = bounds.width;
    const scaleY = bounds.height;

    for (const pt of points) {
      const x = bounds.x + pt.x * scaleX;
      const y = bounds.y + pt.y * scaleY;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

  validate(): null { return null; },
};
