export type CanvasBounds = { left: number; top: number; right: number; bottom: number };
export function canvasViewport(pan: { x: number; y: number }, scale: number, width: number, height: number, overscan = 0): CanvasBounds | null {
  if (![pan.x,pan.y,scale,width,height].every(Number.isFinite) || scale <= 0 || width <= 0 || height <= 0) return null;
  return {left:(-pan.x-overscan)/scale,top:(-pan.y-overscan)/scale,right:(width-pan.x+overscan)/scale,bottom:(height-pan.y+overscan)/scale};
}
export function intersectsCanvasViewport(element: { x: number; y: number; width?: number; height?: number; type?: string }, bounds: CanvasBounds | null) {
  if (!bounds) return true;
  const width = element.width || (element.type === 'text' ? 240 : 120);
  const height = element.height || (element.type === 'text' ? 100 : 120);
  return element.x < bounds.right && element.x+width > bounds.left && element.y < bounds.bottom && element.y+height > bounds.top;
}
