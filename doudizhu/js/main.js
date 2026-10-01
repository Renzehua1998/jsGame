/* ============================================================
   main.js - 入口：移动端检测、动态缩放、RTT 周期、初始化
   ============================================================ */
const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|Mobile/i.test(navigator.userAgent)
  || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches && window.innerWidth < 1100);
if(isMobile) document.body.classList.add('mobile');

/* ---- 主题切换 ---- */
let currentTheme = 'green';
try{ const t = localStorage.getItem('dou_theme'); if(t) currentTheme = t; }catch(e){}
function setTheme(t){
  currentTheme = t;
  document.body.className = document.body.className.replace(/\s*theme-\w+/g,'') + ' theme-'+t;
  if(isMobile) document.body.classList.add('mobile');
  try{ localStorage.setItem('dou_theme', t); }catch(e){}
  const sel=document.getElementById('themeSelect'); if(sel) sel.value=t;
}
setTheme(currentTheme);
function fitScale(){
  if(!isMobile) return;
  const ga = document.getElementById('gameArea');
  if(!ga) return;
  if(ga.classList.contains('step') && !ga.classList.contains('active')) return;
  const winW = window.innerWidth, winH = window.innerHeight;
  // 竖屏时 #app 被旋转90度，有效可视尺寸为 高当宽、宽当高
  const portraitRotated = winW < winH;
  const effW = portraitRotated ? winH : winW;
  const effH = portraitRotated ? winW : winH;
  const baseW = 1000, baseH = 760;
  const s = Math.min(effW/baseW, effH/baseH, 1);
  ga.style.transform = `scale(${s})`;
  ga.style.transformOrigin = 'top center';
  const newH = baseH * s;
  document.body.style.minHeight = (newH + 40) + 'px';
}
window.addEventListener('resize', fitScale);
window.addEventListener('orientationchange', ()=>{ setTimeout(fitScale, 300); });
document.addEventListener('click', (e)=>{ if(typeof cancelGiftOnEmpty==='function') cancelGiftOnEmpty(e); });
window.addEventListener('load', ()=>{
  // 检测断线重连：如果上次有未完成的客户端对局，显示重连入口
  detectReconnectOnLoad();
  if(isMobile){
    document.body.classList.add('mobile');
    fitScale();
  }
  setInterval(()=>{
    const ch = role==='host'? (ch1&&ch1.readyState==='open'?ch1:null) : (channel&&channel.readyState==='open'?channel:null);
    if(ch){ lastPing=performance.now(); ch.send(JSON.stringify({t:'p',time:lastPing})); }
  }, 2000);
});
function detectReconnectOnLoad(){
  try{
    const idx = localStorage.getItem('dou_reconnect_idx');
    if(idx!==null && idx!==''){
      const banner = document.getElementById('reconnectBanner');
      if(banner) banner.style.display = 'block';
    }
  }catch(e){}
  // 恢复页面 UI 状态：性别按钮、昵称、头像预览
  try{
    const g = localStorage.getItem('dou_gender');
    if(g && typeof setGender==='function') setGender(g);
    const n = localStorage.getItem('dou_nick');
    if(n){ const ni=document.getElementById('nickInput'); if(ni) ni.value=n; }
    const a = localStorage.getItem('dou_avatar');
    if(a){ const pv=document.getElementById('avatarPreview'); if(pv){ pv.src=a; pv.style.display='inline-block'; } }
  }catch(e){}
}
function clearReconnectState(){
  try{ localStorage.removeItem('dou_reconnect_idx'); }catch(e){}
  const banner = document.getElementById('reconnectBanner');
  if(banner) banner.style.display = 'none';
}
function startReconnectFromNewPage(){
  const idx = parseInt(localStorage.getItem('dou_reconnect_idx')||'0');
  myIdx = idx;
  role = 'client';
  gameInProgress = true;
  // 隐藏 step0，显示客户端重连面板
  document.querySelectorAll('.step').forEach(el=>el.classList.remove('active'));
  const panel = document.getElementById('reconnectClientPanel');
  if(panel) panel.style.display = 'flex';
  const title = panel.querySelector('h3');
  if(title) title.textContent = '🔄 重连到上次对局（玩家'+(idx+1)+'）';
  // myGender/myNick/myAvatar 已在页面加载时从 localStorage 恢复
  // 更新标题提示
  const p = panel.querySelector('p');
  if(p) p.textContent = '请向主机获取新的重连邀请码，粘贴到下方：';
}
if(!window.RTCPeerConnection) alert('你的浏览器不支持 WebRTC，请使用 Chrome/Edge/Firefox 最新版。');
