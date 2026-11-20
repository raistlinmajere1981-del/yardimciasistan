export class History {
  past=[]; future=[]; lastKey=null; lastTime=0;
  record(scene,key=null) {
    const now=Date.now();
    if(!key||key!==this.lastKey||now-this.lastTime>900) {
      this.past.push(structuredClone(scene)); if(this.past.length>30)this.past.shift();
    }
    this.future=[]; this.lastKey=key; this.lastTime=now;
  }
  undo(scene) { if(!this.past.length)return scene;this.future.push(structuredClone(scene));this.lastKey=null;return this.past.pop(); }
  redo(scene) { if(!this.future.length)return scene;this.past.push(structuredClone(scene));this.lastKey=null;return this.future.pop(); }
}
