const fail = message => {throw new Error(message);};
const round = value => Math.round(value*1e6)/1e6;
const percent = value => `${Math.round(value*100*1e4)/1e4}%`;

export function findObject(scene,id) {
  const object=scene?.objects?.find(item=>item.id===id);
  if(!object) fail(`Nesne bulunamadı: ${id}`);
  return object;
}

export function findAnchor(object,id) {
  const anchor=object?.anchors?.find(item=>item.id===id);
  if(!anchor) fail(`Bağlantı noktası bulunamadı: ${id}`);
  return anchor;
}

// Anchor coordinates stay normalized to the object; scene coordinates use the
// object's normalized pose rectangle.
export function anchorScenePoint(object,anchorId) {
  const anchor=findAnchor(object,anchorId);
  return {x:round(object.pose.x+anchor.x*object.pose.width),y:round(object.pose.y+anchor.y*object.pose.height)};
}

// Effect offsets are normalized to object width/height, so they add directly to
// the anchor in local space.
export function effectLocalPoint(object,effect) {
  const anchor=findAnchor(object,effect.target.anchorId),offset=effect.target.offset;
  return {x:round(anchor.x+offset.x),y:round(anchor.y+offset.y)};
}

export function effectScenePoint(object,effect) {
  const local=effectLocalPoint(object,effect);
  return {x:round(object.pose.x+local.x*object.pose.width),y:round(object.pose.y+local.y*object.pose.height)};
}

// CSS-only placement derives from normalized anchors; no per-frame layout reads.
export function effectCanvasStyle({anchor,offset,width,height,placement}) {
  return {
    left:percent(anchor.x+offset.x),
    top:percent(anchor.y+offset.y),
    width:percent(width),
    height:percent(height),
    transform:placement==='center'?'translate(-50%, -50%)':'translate(-50%, -100%)',
  };
}

export const depthZIndex = depth => String(1000+Math.round(depth));

export function sortByDepth(items) {
  return [...items].sort((a,b)=>(a.depth??0)-(b.depth??0));
}
