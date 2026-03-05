import type { DesignPlugin, PluginContext } from "@genart-dev/core";
import { previewLayerType } from "./preview-layer.js";
import { voronoiLayerType } from "./voronoi-layer.js";
import { densityLayerType } from "./density-layer.js";
import { distributionMcpTools } from "./distribution-tools.js";

const distributionPlugin: DesignPlugin = {
  id: "distribution",
  name: "Distribution & Packing",
  version: "0.1.0",
  tier: "free",
  description:
    "Spatial distribution algorithms (Poisson disk, phyllotaxis, hex grid, DLA, WFC, and more) plus circle/rect packing. Includes guide layers for non-destructive distribution previews.",
  layerTypes: [previewLayerType, voronoiLayerType, densityLayerType],
  tools: [],
  exportHandlers: [],
  mcpTools: distributionMcpTools,
  async initialize(_context: PluginContext): Promise<void> {},
  dispose(): void {},
};

export default distributionPlugin;
export { distributionPlugin };
export { previewLayerType, voronoiLayerType, densityLayerType };
export { distributionMcpTools };
