export class Camera {
  // World point shown at the screen center
  centerX = 0;
  centerY = 0;
  // Screen pixels (CSS) per world unit
  zoom = 1;
  width = 0;
  height = 0;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  fit(worldRadius: number): void {
    this.centerX = 0;
    this.centerY = 0;
    this.zoom = Math.min(this.width, this.height) / (2 * worldRadius);
  }

  // World y points up, screen y points down
  toScreenX(x: number): number {
    return (x - this.centerX) * this.zoom + this.width / 2;
  }

  toScreenY(y: number): number {
    return (this.centerY - y) * this.zoom + this.height / 2;
  }

  toWorldX(sx: number): number {
    return (sx - this.width / 2) / this.zoom + this.centerX;
  }

  toWorldY(sy: number): number {
    return this.centerY - (sy - this.height / 2) / this.zoom;
  }
}
