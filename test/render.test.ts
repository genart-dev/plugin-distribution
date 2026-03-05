import { describe, it, expect, vi } from "vitest";
import {
  previewLayerType,
  voronoiLayerType,
  densityLayerType,
} from "../src/index.js";
import type { LayerBounds, RenderResources } from "@genart-dev/core";

const BOUNDS: LayerBounds = { x: 0, y: 0, width: 400, height: 400 };
const RESOURCES: RenderResources = {} as RenderResources;

function makeMockCtx() {
  const ctx: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockImplementation((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("previewLayerType render", () => {
  it("no-ops with empty points", () => {
    const ctx = makeMockCtx();
    previewLayerType.render(previewLayerType.createDefault(), ctx, BOUNDS, RESOURCES);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("renders dots for each point", () => {
    const ctx = makeMockCtx();
    const points = [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.8 }];
    const props = { ...previewLayerType.createDefault(), _points: JSON.stringify(points) };
    previewLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
    expect(ctx.arc).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalledTimes(3);
  });

  it("scales points to bounds", () => {
    const ctx = makeMockCtx();
    const points = [{ x: 0.5, y: 0.5 }];
    const props = { ...previewLayerType.createDefault(), _points: JSON.stringify(points), dotSize: 5 };
    previewLayerType.render(props, ctx, BOUNDS, RESOURCES);
    // x = 0 + 0.5*400 = 200, y = 0 + 0.5*400 = 200
    expect(ctx.arc).toHaveBeenCalledWith(200, 200, 5, 0, Math.PI * 2);
  });

  it("sets globalAlpha from opacity", () => {
    const ctx = makeMockCtx();
    const points = [{ x: 0.5, y: 0.5 }];
    const props = { ...previewLayerType.createDefault(), _points: JSON.stringify(points), opacity: 0.3 };
    previewLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.globalAlpha).toBe(0.3);
  });
});

describe("voronoiLayerType render", () => {
  it("no-ops with empty cells", () => {
    const ctx = makeMockCtx();
    voronoiLayerType.render(voronoiLayerType.createDefault(), ctx, BOUNDS, RESOURCES);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("renders cell polygons", () => {
    const ctx = makeMockCtx();
    const cells = [
      { vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] },
      { vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 150, y: 100 }] },
    ];
    const props = { ...voronoiLayerType.createDefault(), _cells: JSON.stringify(cells) };
    voronoiLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it("skips degenerate cells (< 3 vertices)", () => {
    const ctx = makeMockCtx();
    const cells = [
      { vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, // degenerate
      { vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] }, // valid
    ];
    const props = { ...voronoiLayerType.createDefault(), _cells: JSON.stringify(cells) };
    voronoiLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("fills cells when fillColor is not transparent", () => {
    const ctx = makeMockCtx();
    const cells = [{ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] }];
    const props = { ...voronoiLayerType.createDefault(), _cells: JSON.stringify(cells), fillColor: "#ff0000" };
    voronoiLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.fillStyle).toBe("#ff0000");
  });

  it("does not fill when fillColor is transparent", () => {
    const ctx = makeMockCtx();
    const cells = [{ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] }];
    const props = { ...voronoiLayerType.createDefault(), _cells: JSON.stringify(cells) };
    voronoiLayerType.render(props, ctx, BOUNDS, RESOURCES);
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});

describe("densityLayerType render", () => {
  it("no-ops with empty points", () => {
    const ctx = makeMockCtx();
    densityLayerType.render(densityLayerType.createDefault(), ctx, BOUNDS, RESOURCES);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
