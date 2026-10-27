// Ear clipping once per instance; supports narrow and concave simple polygons.
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function polygonSampler(points) {
  const vertices=points.slice(),triangles=[];
  const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
  const sign=Math.sign(area);
  while(vertices.length>3){
    let found=false;
    for(let i=0;i<vertices.length;i++){
      const a=vertices[(i+vertices.length-1)%vertices.length],b=vertices[i],c=vertices[(i+1)%vertices.length];
      if(sign*cross(a,b,c)<=0)continue;
      if(vertices.some(p=>p!==a&&p!==b&&p!==c&&sign*cross(a,b,p)>=0&&sign*cross(b,c,p)>=0&&sign*cross(c,a,p)>=0))continue;
      triangles.push([a,b,c]);vertices.splice(i,1);found=true;break;
    }
    if(!found)break;
  }
  if(vertices.length===3)triangles.push(vertices);
  const weights=triangles.map(([a,b,c])=>Math.abs(cross(a,b,c))),total=weights.reduce((s,w)=>s+w,0);
  return random=>{
    if(!total)return points[0];
    let pick=random()*total,index=0;
    while(index<weights.length-1&&(pick-=weights[index])>0)index++;
    const [a,b,c]=triangles[index],u=Math.sqrt(random()),v=random();
    return [0,1].map(i=>(1-u)*a[i]+u*(1-v)*b[i]+u*v*c[i]);
  };
}
