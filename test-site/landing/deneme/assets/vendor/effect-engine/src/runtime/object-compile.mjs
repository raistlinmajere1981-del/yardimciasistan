import {validateProject,OBJECT_SCENE_VERSION,OBJECT_SCENE_KIND} from '../model/project.mjs';
import {objectEffectRegistry,effectTrigger} from '../registry/effects.mjs';
import {findAnchor} from './object-scene.mjs';

// Separate from compileScene so v1 output stays byte-for-byte stable. The
// object compiler resolves anchors once and leaves DOM placement to the caller.
export function compileObjectScene(scene) {
  if(!scene||scene.version!==OBJECT_SCENE_VERSION||scene.kind!==OBJECT_SCENE_KIND)
    throw new Error(`compileObjectScene yalnızca version ${OBJECT_SCENE_VERSION} kind “${OBJECT_SCENE_KIND}” sahnelerini derler.`);
  validateProject(scene);
  const objects=structuredClone(scene.objects), byId=new Map(objects.map(object=>[object.id,object]));
  const effects=scene.effects.filter(effect=>effect.enabled&&byId.get(effect.target.objectId)?.visible).map(effect=>{
    const object=byId.get(effect.target.objectId), registry=objectEffectRegistry[effect.type], anchor=findAnchor(object,effect.target.anchorId);
    return {
      id:effect.id, type:effect.type, objectId:object.id, trigger:effectTrigger(effect), interaction:effect.interaction?{...effect.interaction}:null,
      anchor:{x:anchor.x,y:anchor.y},
      offset:{...effect.target.offset},
      scale:effect.target.scale, depth:effect.target.depth,
      placement:registry.placement,
      output:registry.output??'canvas', layerId:effect.target.layerId,
      seed:`${effect.id}:${effect.seed}`,
      create:registry.create,
      params:registry.compile(object,effect.target,effect.params),
    };
  });
  return {
    seed:scene.seed, sceneId:scene.sceneId, viewport:{...scene.viewport},
    performance:{fps:24,maxDpr:1.25,maxPixels:650000,lowPowerFps:15,lowPowerDpr:1},
    objects, effects,
  };
}
