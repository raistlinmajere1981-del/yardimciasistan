export const $ = selector => document.querySelector(selector);
export function el(tag, attributes={}, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attributes)) {
    if(key.startsWith('on')) node.addEventListener(key.slice(2),value);
    else if(key==='class') node.className=value;
    else if(key==='text') node.textContent=value;
    else if(key in node && !key.startsWith('aria')) node[key]=value;
    else node.setAttribute(key,value);
  }
  node.append(...children.filter(c=>c!==null&&c!==undefined));return node;
}
export const button=(text,action,attrs={})=>el('button',{type:'button',text,onclick:action,...attrs});
export function download(text,name) {
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const link=el('a',{href:url,download:name}); link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function readFile(file,asData=false) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Dosya okunamadı.'));
    if(asData) reader.readAsDataURL(file); else reader.readAsText(file);
  });
}
export function field(label,input) {return el('label',{class:'field'},el('span',{text:label}),input);}
