/* ============================================================
   engine.js - 斗地主牌型识别 / 比较 / 提示
   纯逻辑，无 DOM 依赖，便于 Node 测试
   ============================================================ */
function detectType(cs){
  if(!cs || cs.length===0) return null;
  const n = cs.length;
  const vals = cs.map(c=>c.val).sort((a,b)=>a-b);
  const cnt = {}; cs.forEach(c=>cnt[c.val]=(cnt[c.val]||0)+1);
  const groups = Object.entries(cnt).map(([v,c])=>({v:+v,c})).sort((a,b)=>a.c-b.c||a.v-b.v);
  if(n===2){ const s=new Set(vals); if(s.has(16)&&s.has(17)) return {type:'rocket',main:0,len:0}; }
  if(n===1) return {type:'single',main:vals[0],len:1};
  if(n===2 && groups.length===1) return {type:'pair',main:vals[0],len:1};
  if(n===3 && groups.length===1) return {type:'triple',main:vals[0],len:1};
  if(n===4 && groups.length===1) return {type:'bomb',main:vals[0],len:1};
  if(n===6 && groups.length===3 && groups[0].c===1 && groups[1].c===1 && groups[2].c===4) {
    return {type:'bomb2s',main:groups[2].v,len:1};
  }
  if(n===8 && groups.length===3 && groups[0].c===2 && groups[1].c===2 && groups[2].c===4) {
    return {type:'bomb2p',main:groups[2].v,len:1};
  }
  if(n===4 && groups.length===2 && groups[0].c===1 && groups[1].c===3) return {type:'triple1',main:groups[1].v,len:1};
  if(n===5 && groups.length===2 && groups[0].c===2 && groups[1].c===3) return {type:'triple2',main:groups[1].v,len:1};
  const isConsec = (arr)=>{ for(let i=1;i<arr.length;i++) if(arr[i]!==arr[i-1]+1) return false; return true; };
  if(n>=5 && groups.length===n && groups.every(g=>g.c===1) && vals[vals.length-1]<=14 && vals[0]>=3 && isConsec(vals))
    return {type:'straight',main:vals[0],len:n};
  if(n>=6 && n%2===0 && groups.every(g=>g.c===2)){
    const pv=groups.map(g=>g.v).sort((a,b)=>a-b);
    if(pv[pv.length-1]<=14 && pv[0]>=3 && isConsec(pv)) return {type:'pairstraight',main:pv[0],len:pv.length};
  }
  const triples = groups.filter(g=>g.c===3).map(g=>g.v).sort((a,b)=>a-b);
  if(triples.length>=2 && triples.every(v=>v<=14) && isConsec(triples)){
    const k=triples.length;
    if(n===3*k && groups.every(g=>g.c===3)) return {type:'plane',main:triples[0],len:k};
    if(n===4*k && groups.filter(g=>g.c===1).length===k) return {type:'plane1',main:triples[0],len:k};
    if(n===5*k && groups.filter(g=>g.c===2).length===k && groups.length===2*k) return {type:'plane2',main:triples[0],len:k};
  }
  return null;
}
function canBeat(ne, ol){
  if(!ol) return true;
  if(ne.type==='rocket') return true;
  if(ol.type==='rocket') return false;
  if(ne.type==='bomb'){ if(ol.type!=='bomb') return true; return ne.main>ol.main; }
  if(ol.type==='bomb') return false;
  if(ne.type==='bomb2s' || ne.type==='bomb2p'){
    if(ol.type!==ne.type) return false;
    return ne.main>ol.main;
  }
  if(ol.type==='bomb2s' || ol.type==='bomb2p') return false;
  if(ne.type!==ol.type) return false;
  if(ne.len!==ol.len) return false;
  return ne.main>ol.main;
}
function findHint(hand, ol){
  const byVal={}; hand.forEach(c=>{(byVal[c.val]=byVal[c.val]||[]).push(c);});
  const valsAsc=Object.keys(byVal).map(Number).sort((a,b)=>a-b);
  const hasN=(v,n)=>byVal[v]&&byVal[v].length>=n;
  const takeN=(v,n)=>byVal[v].slice(0,n);
  if(!ol){ if(hand.length===0) return null; return [hand.filter(c=>c.val===valsAsc[0])[0]]; }
  const T=ol.type;
  if(T==='single'){ for(const v of valsAsc) if(v>ol.main) return takeN(v,1); }
  if(T==='pair'){ for(const v of valsAsc) if(v>ol.main && hasN(v,2)) return takeN(v,2); }
  if(T==='triple'){ for(const v of valsAsc) if(v>ol.main && hasN(v,3)) return takeN(v,3); }
  if(T==='triple1'){ for(const v of valsAsc) if(v>ol.main && hasN(v,3)){ const tri=takeN(v,3); for(const w of valsAsc) if(w!==v && hasN(w,1)) return tri.concat(takeN(w,1)); } }
  if(T==='triple2'){ for(const v of valsAsc) if(v>ol.main && hasN(v,3)){ const tri=takeN(v,3); for(const w of valsAsc) if(w!==v && hasN(w,2)) return tri.concat(takeN(w,2)); } }
  if(T==='straight'){ for(let st=ol.main+1; st+ol.len-1<=14; st++){ let ok=true,cards=[]; for(let i=0;i<ol.len;i++){ if(!hasN(st+i,1)){ok=false;break;} cards.push(byVal[st+i][0]); } if(ok) return cards; } }
  if(T==='pairstraight'){ for(let st=ol.main+1; st+ol.len-1<=14; st++){ let ok=true,cards=[]; for(let i=0;i<ol.len;i++){ if(!hasN(st+i,2)){ok=false;break;} cards.push(...takeN(st+i,2)); } if(ok) return cards; } }
  if(T==='plane'){ for(let st=ol.main+1; st+ol.len-1<=14; st++){ let ok=true,cards=[]; for(let i=0;i<ol.len;i++){ if(!hasN(st+i,3)){ok=false;break;} cards.push(...takeN(st+i,3)); } if(ok) return cards; } }
  if(T==='plane1'){ for(let st=ol.main+1; st+ol.len-1<=14; st++){ let ok=true,tris=[]; for(let i=0;i<ol.len;i++){ if(!hasN(st+i,3)){ok=false;break;} tris.push(...takeN(st+i,3)); } if(ok){ const wings=[]; for(const w of valsAsc){ if(tris.some(c=>c.val===w)) continue; if(hasN(w,1)){ wings.push(byVal[w][0]); if(wings.length===ol.len) break; } } if(wings.length===ol.len) return tris.concat(wings); } } }
  if(T==='plane2'){ for(let st=ol.main+1; st+ol.len-1<=14; st++){ let ok=true,tris=[]; for(let i=0;i<ol.len;i++){ if(!hasN(st+i,3)){ok=false;break;} tris.push(...takeN(st+i,3)); } if(ok){ const wings=[]; for(const w of valsAsc){ if(tris.some(c=>c.val===w)) continue; if(hasN(w,2)){ wings.push(...takeN(w,2)); if(wings.length===ol.len*2) break; } } if(wings.length===ol.len*2) return tris.concat(wings); } } }
  if(T==='bomb2s'){ for(const v of valsAsc) if(v>ol.main && hasN(v,4)){ const quad=takeN(v,4); const wings=[]; for(const w of valsAsc){ if(w===v) continue; if(hasN(w,1)){ wings.push(byVal[w][0]); if(wings.length===2) break; } } if(wings.length===2) return quad.concat(wings); } }
  if(T==='bomb2p'){ for(const v of valsAsc) if(v>ol.main && hasN(v,4)){ const quad=takeN(v,4); const wings=[]; for(const w of valsAsc){ if(w===v) continue; if(hasN(w,2)){ wings.push(...takeN(w,2)); if(wings.length===4) break; } } if(wings.length===4) return quad.concat(wings); } }
  if(T!=='bomb' && T!=='rocket'){ for(const v of valsAsc) if(hasN(v,4)) return takeN(v,4); }
  if(T==='bomb'){ for(const v of valsAsc) if(v>ol.main && hasN(v,4)) return takeN(v,4); }
  if(hasN(16,1)&&hasN(17,1)) return [byVal[16][0],byVal[17][0]];
  return null;
}

if(typeof module!=='undefined' && module.exports){
  module.exports = {detectType, canBeat, findHint};
}
if(typeof window!=='undefined') window.__engine = {detectType, canBeat, findHint};
