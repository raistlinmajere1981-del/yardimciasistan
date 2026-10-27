import {photoTransform} from '../runtime/coordinates.mjs';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function polygonBounds(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y};
}
export function signedArea(points) {
  return points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
}
const cross = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(a, b, p) {
  return Math.abs(cross(a,b,p)) < 1e-7 && p[0] >= Math.min(a[0],b[0])-1e-7 && p[0] <= Math.max(a[0],b[0])+1e-7 && p[1] >= Math.min(a[1],b[1])-1e-7 && p[1] <= Math.max(a[1],b[1])+1e-7;
}
function intersects(a,b,c,d) {
  return (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
}
export function isSimplePolygon(points) {
  if (Math.abs(signedArea(points)) < 1) return false;
  for (let i=0; i<points.length; i++) {
    const next=(i+1)%points.length;
    if (Math.hypot(points[i][0]-points[next][0],points[i][1]-points[next][1])<.01) return false;
    for (let j=i+1; j<points.length; j++) {
      if (j===next || (j+1)%points.length===i) continue;
      if (intersects(points[i],points[next],points[j],points[(j+1)%points.length])) return false;
    }
  }
  return true;
}
export function imageTransform(rect, photo, fit='contain', objectPosition='50% 50%') {
  return photoTransform({width:rect.width, height:rect.height, crop:{x:0,y:0,width:photo.width,height:photo.height}, fit, objectPosition});
}
export function toPhoto(clientX, clientY, rect, transform, photo) {
  return [clamp((clientX-rect.left-transform.x)/transform.sx,0,photo.width), clamp((clientY-rect.top-transform.y)/transform.sy,0,photo.height)].map(n=>Math.round(n*100)/100);
}
export function toScreen(point, transform) { return [point[0]*transform.sx+transform.x,point[1]*transform.sy+transform.y]; }
export function insertPoint(points,index) {
  const result=structuredClone(points), a=points[index], b=points[(index+1)%points.length];
  result.splice(index+1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2]); return result;
}
