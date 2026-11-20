const claims=new WeakSet();

/** A motion target is one explicitly named, full-object-coordinate child.
 * No selectors from scene JSON, ancestor lookup or unrelated DOM fallback. */
export function bindMotionLayer(host,effect) {
  const matches=[...host.children].filter(child=>child.dataset?.effectLayer===effect.layerId);
  if(matches.length!==1)throw new Error(`Motion layer missing or ambiguous: ${effect.objectId}/${effect.layerId}`);
  const element=matches[0];
  if(claims.has(element))throw new Error('Motion layer already bound');
  claims.add(element);
  const origin=element.style.transformOrigin,rotate=element.style.rotate;
  element.style.transformOrigin=`${(effect.anchor.x+effect.offset.x)*100}% ${(effect.anchor.y+effect.offset.y)*100}%`;
  return {
    connected:()=>element.parentElement===host&&element.isConnected,
    apply({angle}){element.style.rotate=`${angle}deg`;},
    reset(){element.style.rotate=rotate;},
    destroy(){element.style.rotate=rotate;element.style.transformOrigin=origin;claims.delete(element);},
  };
}
