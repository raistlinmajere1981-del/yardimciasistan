import {validateProject} from '../model/project.mjs';
import {effectRegistry} from '../registry/effects.mjs';
import {polygonBounds} from '../model/geometry.mjs';
export function compileScene(project) {
  validateProject(project);
  const scene=structuredClone(project), zones=new Map(scene.zones.map(z=>[z.id,z]));
  const layers=scene.effects.filter(e=>e.enabled&&zones.get(e.zoneId).visible);
  const points=layers.flatMap(e=>zones.get(e.zoneId).points);
  return {seed:scene.seed,photo:{width:scene.photo.width,height:scene.photo.height},
    bounds:points.length?polygonBounds(points):{x:0,y:0,width:0,height:0},
    performance:{fps:24,maxDpr:1.25,maxPixels:650000,lowPowerFps:15,lowPowerDpr:1},
    effects:layers.map(e=>({id:e.id,seed:`${e.id}:${e.seed}`,create:effectRegistry[e.type].create,params:effectRegistry[e.type].compile(zones.get(e.zoneId),e.params)}))};
}
