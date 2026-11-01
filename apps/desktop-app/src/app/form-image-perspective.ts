/** Offline preparation core. Coordinates address pixel centres, normalized to [0,1]. */
export interface FormImagePoint { x: number; y: number }
export interface FormImagePixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface FormImageTransform {
  /** Clockwise in screen coordinates: top-left, top-right, bottom-right, bottom-left. */
  corners: readonly [FormImagePoint, FormImagePoint, FormImagePoint, FormImagePoint];
  /** Existing template page dimensions in mm10; final output retains this aspect ratio. */
  pageWidth: number;
  pageHeight: number;
  rotation?: 0 | 90 | 180 | 270;
  brightness?: number; // additive [-1,1], multiplied by 255
  contrast?: number; // multiplier [0,3] about 127.5
  grayscale?: boolean;
  threshold?: number; // optional luminance threshold [0,255], after adjustments
}
const fail = (): never => { throw new Error("DOCUMENT_IMAGE_TRANSFORM_INVALID"); };
const finite = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const cross = (a: FormImagePoint, b: FormImagePoint, c: FormImagePoint) => (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
/** Inverse sampling: destination unit rectangle -> source quadrilateral homography. */
export function prepareFormImage(source: FormImagePixels, spec: FormImageTransform): FormImagePixels {
  if (!source || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 2 || source.height < 2 || source.width * source.height > 25_000_000 ||
    !(source.data instanceof Uint8ClampedArray || source.data instanceof Uint8Array) || source.data.length !== source.width * source.height * 4) fail();
  if (!spec || !Array.isArray(spec.corners) || spec.corners.length !== 4 || !Number.isSafeInteger(spec.pageWidth) || !finite(spec.pageWidth,200,5000) || !Number.isSafeInteger(spec.pageHeight) || !finite(spec.pageHeight,200,10000)) fail();
  const p = spec.corners;
  for (const point of p) if (!point || !finite(point.x,0,1) || !finite(point.y,0,1)) fail();
  // Strictly positive turns reject mirrored, crossed, concave and near-collinear quads.
  for (let i=0;i<4;i++) if (cross(p[i]!,p[(i+1)%4]!,p[(i+2)%4]!) < 1e-6) fail();
  if (p[0].y+p[1].y >= p[2].y+p[3].y || p[0].x+p[3].x >= p[1].x+p[2].x) fail();
  const rotation = spec.rotation === undefined ? 0 : spec.rotation;
  const brightness = spec.brightness === undefined ? 0 : spec.brightness;
  const contrast = spec.contrast === undefined ? 1 : spec.contrast;
  if (![0,90,180,270].includes(rotation) || !finite(brightness,-1,1) || !finite(contrast,0,3) || (spec.grayscale !== undefined && typeof spec.grayscale !== "boolean") || (spec.threshold !== undefined && !finite(spec.threshold,0,255))) fail();
  const dx1=p[1].x-p[2].x, dx2=p[3].x-p[2].x, dx3=p[0].x-p[1].x+p[2].x-p[3].x;
  const dy1=p[1].y-p[2].y, dy2=p[3].y-p[2].y, dy3=p[0].y-p[1].y+p[2].y-p[3].y;
  const determinant=dx1*dy2-dx2*dy1;
  if (Math.abs(determinant)<1e-8) fail();
  const g=(dx3*dy2-dx2*dy3)/determinant, h=(dx1*dy3-dx3*dy1)/determinant;
  // A projective pole must never cross or approach the destination rectangle.
  const denominators=[1,1+g,1+h,1+g+h];
  if (denominators.some(d=>!Number.isFinite(d)||d<1e-6) || Math.min(...denominators)/Math.max(...denominators)<1e-6) fail();
  const a=p[1].x-p[0].x+g*p[1].x, b=p[3].x-p[0].x+h*p[3].x;
  const d=p[1].y-p[0].y+g*p[1].y, e=p[3].y-p[0].y+h*p[3].y;
  const distance=(q:FormImagePoint,r:FormImagePoint)=>Math.hypot((q.x-r.x)*(source.width-1),(q.y-r.y)*(source.height-1))+1;
  let availableWidth=Math.max(distance(p[0],p[1]),distance(p[3],p[2]));
  let availableHeight=Math.max(distance(p[0],p[3]),distance(p[1],p[2]));
  if (rotation===90||rotation===270) [availableWidth,availableHeight]=[availableHeight,availableWidth];
  const ratio=spec.pageWidth/spec.pageHeight;
  // Keep at least two pixels on both axes, including very small crops/extreme page ratios.
  let width=Math.max(2,2*ratio,Math.min(availableWidth,availableHeight*ratio)), height=width/ratio;
  const scale=Math.min(1,2200/Math.max(width,height),Math.sqrt(4_000_000/(width*height)));
  width=Math.max(2,Math.floor(width*scale)); height=Math.max(2,Math.floor(height*scale));
  if (width>2200||height>2200||width*height>4_000_000) fail();
  const data=new Uint8ClampedArray(width*height*4);
  const adjusted=(v:number)=>Math.max(0,Math.min(255,(v-127.5)*contrast+127.5+brightness*255));
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const rx=x/(width-1), ry=y/(height-1);
    const u=rotation===90?ry:rotation===180?1-rx:rotation===270?1-ry:rx;
    const v=rotation===90?1-rx:rotation===180?1-ry:rotation===270?rx:ry;
    const denominator=g*u+h*v+1;
    const sx=Math.max(0,Math.min(source.width-1,(a*u+b*v+p[0].x)/denominator*(source.width-1)));
    const sy=Math.max(0,Math.min(source.height-1,(d*u+e*v+p[0].y)/denominator*(source.height-1)));
    const x0=Math.floor(sx), y0=Math.floor(sy), x1=Math.min(x0+1,source.width-1), y1=Math.min(y0+1,source.height-1);
    const fx=sx-x0, fy=sy-y0, out=(y*width+x)*4;
    // Composite each tap on white before interpolation, avoiding transparent colour fringes.
    const tap=(tx:number,ty:number,c:number)=>{const i=(ty*source.width+tx)*4;return source.data[i+c]!*source.data[i+3]!/255+255-source.data[i+3]!;};
    for (let c=0;c<3;c++) data[out+c]=adjusted((tap(x0,y0,c)*(1-fx)+tap(x1,y0,c)*fx)*(1-fy)+(tap(x0,y1,c)*(1-fx)+tap(x1,y1,c)*fx)*fy);
    if (spec.grayscale || spec.threshold!==undefined) {
      const luma=0.2126*data[out]!+0.7152*data[out+1]!+0.0722*data[out+2]!;
      const value=spec.threshold===undefined?luma:luma>=spec.threshold?255:0;
      data[out]=data[out+1]=data[out+2]=value;
    }
    data[out+3]=255;
  }
  return {width,height,data};
}
