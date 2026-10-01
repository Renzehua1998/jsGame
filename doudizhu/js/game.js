/* ============================================================
   game.js - 主机权威状态 + 叫地主/出牌/胜负 + 视图 + 渲染 + 初始化
   含：轮流叫地主（首叫按局轮换）、初始每人 100 分计分
   ============================================================ */
const INIT_SCORE = 100;   // 每人初始积分

/* ---- 礼物素材（img/gift.png）---- */
const GIFT_SHEET_W = 1536, GIFT_SHEET_H = 1024;
const GIFT_SPR = {
  coffee_pot:{x:33,y:18,w:384,h:481}, roses:{x:418,y:44,w:361,h:452},
  tomato:{x:795,y:87,w:381,h:420}, bucket:{x:1188,y:121,w:311,h:359},
  coffee_cup:{x:37,y:532,w:306,h:445}, petal_ring:{x:393,y:547,w:404,h:401},
  splash_red:{x:806,y:549,w:358,h:397}, splash_water:{x:1170,y:559,w:345,h:396}
};
const GIFT_INFO = {
  coffee:{fly:'coffee_pot', land:'coffee_cup',   dur:1500, label:'倒咖啡'},
  roses: {fly:'roses',      land:'petal_ring',   dur:1500, label:'送玫瑰'},
  tomato:{fly:'tomato',     land:'splash_red',   dur:600,  label:'扔番茄', spin:true},
  water: {fly:'bucket',     land:'splash_water', dur:600,  label:'泼水',   spin:true}
};
function makeGiftEl(name, scale){
  const r=GIFT_SPR[name]; if(!r) return document.createElement('div');
  let s=scale||0.2;
  // 若 scale='fit'：按给定最大宽高自动缩放
  if(s==='fit'){
    // 默认 fit 到 36px
    const maxW=arguments[2]||36, maxH=arguments[3]||36;
    s=Math.min(maxW/r.w, maxH/r.h);
  }
  const el=document.createElement('div');
  el.className='gift-sprite';
  el.style.width=(r.w*s)+'px'; el.style.height=(r.h*s)+'px';
  el.style.backgroundImage="url('img/gift.png')";
  el.style.backgroundRepeat='no-repeat';
  el.style.backgroundSize=(GIFT_SHEET_W*s)+'px '+(GIFT_SHEET_H*s)+'px';
  el.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  return el;
}
let giftPopupOpen = null;  // 当前打开的礼物浮层对应玩家idx

let H = null;   // 主机权威状态
let view = {
  phase:'wait', turn:-1, landlord:-1, points:0,
  hands:[0,0,0], played:{0:null,1:null,2:null}, lastPlay:null, lastPlayer:-1,
  bottom:[], bottomShown:false, bidLog:[], scores:[INIT_SCORE,INIT_SCORE,INIT_SCORE],
  over:null, names:['玩家1','玩家2','玩家3'], myHand:[], round:0, lastEffect:null,
  genders:['man','man','man'], turnDeadline:0, turnLeft:0
};
let myHand=[];
let selected=new Set();
let firstBidder = 0;   // 本局首叫人（按局轮换：每局+1）
let autoPlay = false;  // 托管标记
let autoSlots = [false,false,false];  // 三玩家各自的托管状态（主机维护，广播给所有人）
let prevPhase = null;
let prevPlayed = {0:null,1:null,2:null};

/* ---- 自定义头像与昵称 ---- */
let myNick = '';
let myAvatar = null;  // base64 dataURL
// 从 localStorage 恢复本机玩家信息（供新页面重连用）
try{
  const sn = localStorage.getItem('dou_nick'); if(sn) myNick = sn;
  const sa = localStorage.getItem('dou_avatar'); if(sa) myAvatar = sa;
}catch(e){}
let customAvatars = [null,null,null];  // 三玩家自定义头像
let customNicks = ['','',''];          // 三玩家自定义昵称
// 从 localStorage 恢复头像和昵称
try{
  const sa = localStorage.getItem('dou_avatars'); if(sa) customAvatars = JSON.parse(sa);
  const sn = localStorage.getItem('dou_nicks'); if(sn) customNicks = JSON.parse(sn);
}catch(e){}
function saveAvatars(){ try{ localStorage.setItem('dou_avatars', JSON.stringify(customAvatars)); }catch(e){} }
function saveNicks(){ try{ localStorage.setItem('dou_nicks', JSON.stringify(customNicks)); }catch(e){} }
function onAvatarPick(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = new Image();
    img.onload = ()=>{
      showAvatarCropper(img, function(croppedDataUrl){
        myAvatar = croppedDataUrl;
        const pv = document.getElementById('avatarPreview');
        if(pv){ pv.src = myAvatar; pv.style.display = 'inline-block'; }
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function showAvatarCropper(img, onConfirm){
  const maxSrcW = 400, maxSrcH = 400;
  let sw = img.width, sh = img.height;
  if(sw > maxSrcW || sh > maxSrcH){ const sc = Math.min(maxSrcW/sw, maxSrcH/sh); sw=Math.round(sw*sc); sh=Math.round(sh*sc); }
  // 默认裁剪框：居中正方形，边长为图片短边
  let cw = Math.min(sw, sh), ch = cw;
  let cx = (sw - cw) / 2, cy = (sh - ch) / 2;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;';
  const title = document.createElement('p');
  title.textContent = '拖动选择正方形头像区域';
  title.style.cssText = 'color:#fff;font-size:15px;margin:0;';
  overlay.appendChild(title);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:'+sw+'px;height:'+sh+'px;overflow:hidden;border:2px solid #555;';
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sw; srcCanvas.height = sh;
  srcCanvas.getContext('2d').drawImage(img, 0, 0, sw, sh);
  srcCanvas.style.cssText = 'position:absolute;left:0;top:0;width:'+sw+'px;height:'+sh+'px;';
  wrap.appendChild(srcCanvas);
  const dim = document.createElement('div');
  dim.style.cssText = 'position:absolute;left:0;top:0;width:'+sw+'px;height:'+sh+'px;background:rgba(0,0,0,.55);pointer-events:none;';
  wrap.appendChild(dim);
  const crop = document.createElement('div');
  crop.style.cssText = 'position:absolute;left:'+cx+'px;top:'+cy+'px;width:'+cw+'px;height:'+ch+'px;border:2px solid #ffd54a;box-shadow:0 0 0 9999px rgba(0,0,0,0);cursor:move;box-sizing:border-box;';
  // 在裁剪框内开"洞"（用反向阴影让外部变暗）
  dim.style.background = 'rgba(0,0,0,.55)';
  crop.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.55)';
  // 改为用 crop 的 box-shadow 做遮罩，移除 dim
  dim.style.display = 'none';
  wrap.appendChild(crop);
  overlay.appendChild(wrap);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:12px;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消'; cancelBtn.className = 'secondary';
  const okBtn = document.createElement('button');
  okBtn.textContent = '确认裁剪';
  btnRow.appendChild(cancelBtn); btnRow.appendChild(okBtn);
  overlay.appendChild(btnRow);
  document.body.appendChild(overlay);
  // 拖动裁剪框
  let dragging = false, dx = 0, dy = 0;
  crop.addEventListener('mousedown', e=>{
    dragging = true; dx = e.clientX - crop.offsetLeft; dy = e.clientY - crop.offsetTop;
    e.preventDefault();
  });
  const moveHandler = e=>{
    if(!dragging) return;
    let nx = e.clientX - dx, ny = e.clientY - dy;
    nx = Math.max(0, Math.min(sw - cw, nx));
    ny = Math.max(0, Math.min(sh - ch, ny));
    crop.style.left = nx+'px'; crop.style.top = ny+'px';
    cx = nx; cy = ny;
  };
  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', ()=>{ dragging=false; });
  // 触摸支持
  crop.addEventListener('touchstart', e=>{
    dragging = true; const t = e.touches[0];
    dx = t.clientX - crop.offsetLeft; dy = t.clientY - crop.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const t = e.touches[0];
    let nx = t.clientX - dx, ny = t.clientY - dy;
    nx = Math.max(0, Math.min(sw - cw, nx));
    ny = Math.max(0, Math.min(sh - ch, ny));
    crop.style.left = nx+'px'; crop.style.top = ny+'px';
    cx = nx; cy = ny;
    e.preventDefault();
  }, {passive:false});
  document.addEventListener('touchend', ()=>{ dragging=false; });
  cancelBtn.onclick = ()=>{ document.removeEventListener('mousemove', moveHandler); overlay.remove(); };
      okBtn.onclick = ()=>{
    document.removeEventListener('mousemove', moveHandler);
    // 从裁剪区域生成正方形头像
    const out = 200;
    const cv = document.createElement('canvas');
    cv.width = out; cv.height = out;
    cv.getContext('2d').drawImage(img, cx/sw*img.width, cy/sh*img.height, cw/sw*img.width, ch/sh*img.height, 0, 0, out, out);
    let quality = 0.92, dataUrl = cv.toDataURL('image/jpeg', quality);
    while(dataUrl.length > 136000 && quality > 0.3){ quality -= 0.1; dataUrl = cv.toDataURL('image/jpeg', quality); }
    overlay.remove();
    onConfirm(dataUrl);
    try{ localStorage.setItem('dou_avatar', dataUrl); }catch(e){}
  };
}
function getDisplayName(idx){
  if(customNicks[idx]) return customNicks[idx];
  if(idx===myIdx) return myNick || '我';
  return '玩家'+(idx+1);
}

function enterGame(){
  showStep('gameArea');
  // 读取昵称
  const nickEl=document.getElementById('nickInput'); if(nickEl && nickEl.value.trim()) myNick=nickEl.value.trim();
  // 持久化玩家信息供新页面重连使用
  try{
    if(myNick) localStorage.setItem('dou_nick', myNick);
    if(myAvatar) localStorage.setItem('dou_avatar', myAvatar);
  }catch(e){}
  document.getElementById('gameStatus').textContent='🟢 '+(role==='spectator'?'观战模式':'三人已连接，准备发牌');
  const chatBtn=document.getElementById('chatBtn'); if(chatBtn) chatBtn.style.display=role==='spectator'?'none':'block';
  const autoBt=document.getElementById('autoBtn'); if(autoBt) autoBt.style.display=role==='spectator'?'none':'block';
  const setBtn=document.getElementById('settingsBtn'); if(setBtn) setBtn.style.display='block';
  if(typeof startBgm==='function') startBgm();
  if(role==='host'){
    genders[0]=myGender; customAvatars[0]=myAvatar; customNicks[0]=myNick; saveAvatars(); saveNicks();
    view.names[0]=getDisplayName(0);
  } else if(role!=='spectator'){
    genders[myIdx]=myGender;
    // 客户端把自己的昵称和头像发给主机
    netSend(0, {t:'profile', nick:myNick, avatar:myAvatar});
  }
  view.genders = genders.slice();
  if(typeof isMobile!=='undefined' && isMobile) setTimeout(fitScale, 50);
  if(role==='host') hostStartGame();
  if(role==='spectator'){
    setActInfo('👁 观战模式 - 只读观看');
    clearButtons();
  }
  if(typeof net_setGameInProgress==='function') net_setGameInProgress(true);
}

/* ---- 重连：主机端客户端断线 ---- */
function onClientDisconnect(slot){
  if(autoSlots[slot]) return;  // 已标记托管，不重复触发
  log('⚠ 玩家'+(slot+1)+' 断线，已自动托管。点击该玩家头像可生成重连邀请码');
  autoSlots[slot] = true;  // 标记该玩家托管
  // 不暂停对局：如果当前是断线玩家的回合，主机代替操作
  if(H && H.phase){
    if((H.phase==='play' && H.turn===slot) ||
       (H.phase==='bid' && H.bidIdx===slot) ||
       (H.phase==='grab' && H.grabIdx===slot) ||
       (H.phase==='show' && H.landlord===slot)){
      hostAutoActForSlot(slot);
    }
  }
  broadcastState();
}
function hostAutoActForSlot(slot){
  if(!H) return;
  if(H.phase==='play' && H.turn===slot){
    const ol = H.lastPlay;
    const hand = H.hands[slot];
    if(!hand || hand.length===0) return;
    if(ol && H.lastPlayer!==slot){
      // 有上家牌，尝试出最小能管的，否则pass
      const h = findHint(hand, ol);
      if(h && h.length>0){ hostPlay(slot, h.map(cardKey)); }
      else { hostPass(slot); }
    } else {
      // 自由出，出最小单张
      const minCard = hand.slice().sort((a,b)=>a.val-b.val)[0];
      hostPlay(slot, [cardKey(minCard)]);
    }
  } else if(H.phase==='bid' && H.bidIdx===slot){
    hostBid(slot, 0); // 不叫
  } else if(H.phase==='grab' && H.grabIdx===slot){
    hostGrab(slot, false); // 不抢
  } else if(H.phase==='show' && H.landlord===slot){
    hostShow(slot, false); // 不明牌
  }
}
async function genReconnectOffer(slot){
  const s = await createOfferForReconnect(slot);
  if(s){
    const area=document.getElementById('reconnectOfferArea');
    if(area) area.style.display='block';
    const out=document.getElementById('reconnectOfferOut');
    if(out) out.value=s;
  }
}
async function acceptReconnect(){
  const a=document.getElementById('reconnectAnswerIn').value.trim();
  if(!a) return;
  await acceptReconnectAnswer(a);
  // 重连成功后 UI 由 channel open 事件触发关闭
}
function closeReconnectHostPanel(){
  const panel=document.getElementById('reconnectHostPanel');
  if(panel) panel.style.display='none';
}
function openReconnectPanel(slot){
  const panel=document.getElementById('reconnectHostPanel');
  if(!panel) return;
  panel.style.display='flex';
  const content=document.getElementById('reconnectHostContent');
  if(content){
    content.innerHTML = '<p>玩家'+(slot+1)+' 已断线，已自动托管。</p>'+
      '<p style="font-size:12px;color:#aaa;">点击下方按钮生成邀请码，发给玩家'+(slot+1)+'：</p>'+
      '<div style="text-align:center;margin:10px 0;"><button onclick="genReconnectOffer('+slot+')">重新生成玩家'+(slot+1)+'的邀请码</button></div>'+
      '<div id="reconnectOfferArea" style="display:none;">'+
      '<p class="label">📋 新邀请码 — 发给玩家'+(slot+1)+'：</p>'+
      '<textarea id="reconnectOfferOut" readonly onclick="this.select()"></textarea>'+
      '<p class="label">📥 玩家'+(slot+1)+' 回传的应答码：</p>'+
      '<textarea id="reconnectAnswerIn" placeholder="粘贴应答码..."></textarea>'+
      '<div style="text-align:center;margin:8px 0;"><button onclick="acceptReconnect()">建立重连</button></div>'+
      '</div>'+
      '<div style="text-align:center;margin-top:8px;"><button class="secondary" onclick="closeReconnectHostPanel()">关闭</button></div>';
  }
}

/* ---- 重连：主机端恢复客户端状态 ---- */
function restoreClient(slot){
  log('正在为玩家'+(slot+1)+' 恢复对局...');
  autoSlots[slot] = false;  // 重连后取消托管标记
  // 先重新分配座次（确保客户端 myIdx 正确）
  netSend(slot, {t:'assign', you: slot});
  // 重新发送手牌（已包含底牌，不再单独发 bottom 消息避免重复添加）
  const keys = H.hands[slot].map(cardKey);
  netSend(slot, {t:'deal', hand:keys});
  // 底牌显示信息由 broadcastState 同步（bottom/bottomShown）
  // 广播完整状态
  broadcastState();
  // 关闭重连面板
  closeReconnectHostPanel();
  // 如果当前是断线玩家的回合，恢复倒计时和操作UI
  if(H.phase==='play' && H.turn===slot){
    promptPlay();
  } else if(H.phase==='bid' && H.bidIdx===slot){
    promptBid();
  } else if(H.phase==='grab' && H.grabIdx===slot){
    promptGrab();
  } else if(H.phase==='show' && H.landlord===slot){
    startShow();
  } else {
    // 不是该玩家回合，告知等待
    let waitMsg = '等待中...';
    if(H.phase==='play') waitMsg = '等待 玩家'+(H.turn+1)+' 出牌...';
    else if(H.phase==='bid') waitMsg = '等待 玩家'+(H.bidIdx+1)+' 叫分...';
    else if(H.phase==='grab') waitMsg = '等待 玩家'+(H.grabIdx+1)+' 抢地主...';
    else if(H.phase==='show') waitMsg = '等待 玩家'+(H.landlord+1)+' 选择明牌...';
    netSend(slot, {t:'waitMsg', msg:waitMsg});
  }
  setActInfo('玩家'+(slot+1)+' 已重连，对局继续');
  log('玩家'+(slot+1)+' 已恢复对局');
}

/* ---- 重连：客户端断线 ---- */
function onDisconnect(){
  const panel=document.getElementById('reconnectClientPanel');
  if(panel && panel.style.display==='flex') return;  // 已显示，不重复
  log('与主机连接断开，请重连');
  if(panel) panel.style.display='flex';
}

/* ---- 主机：开始一局 ---- */
function hostStartGame(){
  selected.clear();
  const prevScores = H ? H.scores.slice() : [INIT_SCORE,INIT_SCORE,INIT_SCORE];
  const prevRound  = H ? H.round + 1 : 1;
  H = {
    hands:[[],[],[]], bottom:[], turn:-1, landlord:-1, points:0,
    lastPlay:null, lastPlayer:-1, passCount:0, phase:'bid',
    bidIdx:-1, bidMax:0, bidWinner:-1, bidCount:0,
    grabOrder:[], grabIdx:-1, grabCount:0,
    scores:prevScores, mult:1, round:prevRound
  };
  view.round = prevRound;
  view.scores = prevScores.slice();
  const deck = shuffle(buildDeck());
  for(let i=0;i<51;i++) H.hands[i%3].push(deck[i]);
  H.bottom = deck.slice(51);
  H.hands.forEach(h=>h.sort((a,b)=>b.val-a.val));
  for(let i=0;i<3;i++){
    const keys = H.hands[i].map(cardKey);
    if(i===0){ myHand = H.hands[0].slice(); view.myHand=myHand; }
    else netSend(i, {t:'deal', hand:keys, you:i});
  }
  view.phase='bid'; view.hands=[17,17,17]; view.bottom=[]; view.bottomShown=false;
  view.played={0:null,1:null,2:null}; view.lastPlay=null; view.lastPlayer=-1;
  prevPlayed={0:null,1:null,2:null};
  view.bidLog=[]; view.landlord=-1; view.points=0; view.over=null; view.lastEffect=null; view.showCards=null;
  view.turnLeft=0; view.turnDeadline=0;
  clearTurnTimer();
  document.getElementById('effectLayer').style.display='none';
  document.getElementById('bannerLayer').style.display='none';
  closeAllGiftPopups();
  broadcastState();
  // 轮流叫地主：首叫人按局轮换（每局 firstBidder 递增 1）
  H.bidIdx = firstBidder % 3;
  firstBidder++;
  H.phase='bid';
  log('第 '+H.round+' 局开始，由 玩家'+(H.bidIdx+1)+' 首先叫分');
  promptBid();
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function broadcastState(){
  const pub = {
    phase:view.phase, turn:view.turn, landlord:view.landlord, points:view.points,
    hands:view.hands, played:view.played, lastPlay:view.lastPlay, lastPlayer:view.lastPlayer,
    bottom:view.bottom, bottomShown:view.bottomShown, bidLog:view.bidLog.slice(),
    scores:view.scores, over:view.over, names:view.names, lastEffect:view.lastEffect, round:view.round,
    genders:view.genders, turnDeadline:view.turnDeadline, turnLeft:view.turnLeft, showCards:view.showCards,
    avatars:customAvatars, mult:(H?H.mult:1), autoSlots:autoSlots.slice()
  };
  // 发给两个客户端（不含观战者，观战者单独发送含 specHands 的状态）
  if(role==='host'){ sendRaw(ch1,{t:'state',v:pub}); sendRaw(ch2,{t:'state',v:pub}); }
  // 观战者收到额外信息：所有人手牌
  if(role==='host' && ch3 && ch3.readyState==='open'){
    const specPub = Object.assign({}, pub, { specHands: H.hands.map(h=>h.map(cardKey)), specBottom: H.bottom.map(cardKey) });
    netSendSpectator({t:'state', v:specPub});
  }
  render();
}
function getSpectatorState(){
  return {
    phase:view.phase, turn:view.turn, landlord:view.landlord, points:view.points,
    hands:view.hands, played:view.played, lastPlay:view.lastPlay, lastPlayer:view.lastPlayer,
    bottom:view.bottom, bottomShown:view.bottomShown, bidLog:view.bidLog.slice(),
    scores:view.scores, over:view.over, names:view.names, lastEffect:view.lastEffect, round:view.round,
    genders:view.genders, turnDeadline:view.turnDeadline, turnLeft:view.turnLeft, showCards:view.showCards,
    specHands: H ? H.hands.map(h=>h.map(cardKey)) : [[],[],[]], specBottom: H ? H.bottom.map(cardKey) : [],
    mult: H ? H.mult : 1, autoSlots:autoSlots.slice()
  };
}

/* ---- 主机：叫地主提示 ---- */
function promptBid(){
  view.turn = H.bidIdx;
  view.phase='bid';
  broadcastState();
  if(H.bidIdx===0){
    showBidUI();
  } else if(autoSlots[H.bidIdx]){
    // 断线托管：主机代替操作
    setTimeout(()=>hostAutoActForSlot(H.bidIdx), 600);
    setActInfo('玩家'+(H.bidIdx+1)+' 托管中...');
  } else {
    clearButtons();
    netSend(H.bidIdx, {t:'bidReq', curMax:H.bidMax});
    setActInfo('等待 玩家'+(H.bidIdx+1)+' 叫分...');
  }
}
function hostBid(senderIdx, val){
  if(H.phase!=='bid' || senderIdx!==H.bidIdx) return;
  if(val!==0 && (val<=H.bidMax || val>3)) return;
  view.bidLog.push({idx:senderIdx, val});
  if(val>0){
    H.bidMax=val; H.bidWinner=senderIdx;
    log('玩家'+(senderIdx+1)+' 叫 '+val+' 分');
    const gnd = genders[senderIdx] || 'man';
    playCallSound(gnd); netBroadcast({t:'sound', from:senderIdx, kind:'call', gender:gnd});
    if(val===3){ endBidding(); return; }
  } else {
    log('玩家'+(senderIdx+1)+' 不叫');
    const gnd = genders[senderIdx] || 'man';
    playNoCallSound(gnd); netBroadcast({t:'sound', from:senderIdx, kind:'nocal', gender:gnd});
  }
  H.bidCount++; H.bidIdx=(H.bidIdx+1)%3;
  if(H.bidCount>=3){ endBidding(); return; }
  promptBid();
}
function endBidding(){
  if(H.bidWinner<0){
    log('全员不叫，重新发牌');
    firstBidder--;  // 回退首叫人，重新发牌时保持同一人首叫
    hostStartGame(); return;
  }
  // 叫3分直接定地主，跳过抢地主；否则进入抢地主阶段
  if(H.bidMax>=3){
    confirmLandlord();
  } else {
    startGrab();
  }
}

/* ---- 抢地主阶段 ---- */
function startGrab(){
  H.phase='grab'; view.phase='grab';
  // 抢地主顺序：除叫分者外，按叫分者下家开始的两人
  H.grabOrder = [];
  for(let i=1;i<=2;i++){ const idx=(H.bidWinner+i)%3; H.grabOrder.push(idx); }
  H.grabCount=0;
  log('进入抢地主，倍数 '+H.mult);
  promptGrab();
}
function promptGrab(){
  if(H.grabCount>=H.grabOrder.length){ endGrab(); return; }
  H.grabIdx = H.grabOrder[H.grabCount];
  view.turn = H.grabIdx;
  broadcastState();
  if(H.grabIdx===0){
    showGrabUI();
  } else if(autoSlots[H.grabIdx]){
    setTimeout(()=>hostAutoActForSlot(H.grabIdx), 600);
    setActInfo('玩家'+(H.grabIdx+1)+' 托管中...');
  } else {
    clearButtons();
    netSend(H.grabIdx, {t:'grabReq', mult:H.mult});
    setActInfo('等待 玩家'+(H.grabIdx+1)+' 抢地主...');
  }
}
function hostGrab(senderIdx, grab){
  if(H.phase!=='grab' || senderIdx!==H.grabIdx) return;
  view.bidLog.push({idx:senderIdx, grab});
  const gnd = genders[senderIdx] || 'man';
  if(grab){
    H.mult*=2; H.bidWinner=senderIdx;
    log('玩家'+(senderIdx+1)+' 抢地主，倍数 '+H.mult);
    playSound('do','recall',gnd); netBroadcast({t:'sound', from:senderIdx, kind:'recall', gender:gnd});
  } else {
    log('玩家'+(senderIdx+1)+' 不抢');
    playSound('do','bq',gnd); netBroadcast({t:'sound', from:senderIdx, kind:'bq', gender:gnd});
  }
  H.grabCount++;
  promptGrab();
}
function endGrab(){
  log('玩家'+(H.bidWinner+1)+' 抢到地主');
  confirmLandlord();
}

/* ---- 确定地主 + 明牌阶段 ---- */
function confirmLandlord(){
  H.landlord=H.bidWinner; view.landlord=H.bidWinner; view.points=H.bidMax;
  H.hands[H.landlord] = sortHand(H.hands[H.landlord].concat(H.bottom));
  view.hands = H.hands.map(h=>h.length);
  view.bottom = H.bottom.map(cardKey);
  view.bottomShown = true;
  if(H.landlord!==0) netSend(H.landlord, {t:'bottom', cards:view.bottom});
  else { myHand = H.hands[0].slice(); view.myHand=myHand; }
  log('玩家'+(H.landlord+1)+' 当地主，底分 '+H.bidMax+'，倍数 '+H.mult);
  // 进入明牌阶段
  startShow();
}
function startShow(){
  H.phase='show'; view.phase='show'; view.turn=H.landlord;
  broadcastState();
  if(H.landlord===0){
    showShowUI();
  } else if(autoSlots[H.landlord]){
    setTimeout(()=>hostAutoActForSlot(H.landlord), 600);
    setActInfo('玩家'+(H.landlord+1)+' 托管中...');
  } else {
    clearButtons();
    netSend(H.landlord, {t:'showReq', mult:H.mult});
    setActInfo('等待 玩家'+(H.landlord+1)+' 选择是否明牌...');
  }
}
function hostShow(senderIdx, show){
  if(H.phase!=='show' || senderIdx!==H.landlord) return;
  if(show){
    H.mult*=2;
    view.showCards = H.hands[H.landlord].map(cardKey);
    log('玩家'+(H.landlord+1)+' 明牌，倍数 '+H.mult);
  } else {
    log('玩家'+(H.landlord+1)+' 不明牌');
  }
  view.showCards = view.showCards || null;
  beginPlay();
}
function beginPlay(){
  H.phase='play'; view.phase='play'; H.turn=H.landlord; view.turn=H.landlord;
  H.lastPlay=null; H.lastPlayer=-1; H.passCount=0;
  view.lastPlay=null; view.lastPlayer=-1;
  log('开始出牌');
  broadcastState();
  promptPlay();
}

const TURN_LIMIT = 60;   // 每人出牌限时秒数
let turnTimer = null;    // 主机出牌倒计时定时器
let lastTickLeft = -1;   // 上次广播的剩余秒（避免重复广播）
function clearTurnTimer(){
  if(turnTimer){ clearInterval(turnTimer); turnTimer=null; }
  lastTickLeft = -1;
}
function startTurnTimer(){
  clearTurnTimer();
  if(role!=='host') return;
  H.deadline = Date.now() + TURN_LIMIT*1000;
  view.turnDeadline = H.deadline;
  lastTickLeft = TURN_LIMIT;
  // 立即广播一次 deadline
  netBroadcast({t:'tick', left:TURN_LIMIT, deadline:H.deadline});
  turnTimer = setInterval(()=>{
    const left = Math.max(0, Math.round((H.deadline - Date.now())/1000));
    view.turnLeft = left;
    if(role==='host') render();   // 主机本地刷新倒计时显示
    if(left <= 15){
      // 广播剩余秒供客户端显示
      netBroadcast({t:'tick', left:left, deadline:H.deadline});
    }
    if(left <= 5 && left > 0 && lastTickLeft > left){
      // 播放倒计时音效
      if(typeof playEffect==='function') playEffect('time');
      netBroadcast({t:'sound', from:H.turn, kind:'effect', key:'time'});
    }
    if(left <= 0){
      clearTurnTimer();
      log('玩家'+(H.turn+1)+' 出牌超时');
      // 超时处理：有上家牌则 pass，无则出最小单张
      if(H.lastPlay && H.lastPlayer!==H.turn){
        hostPass(H.turn);
      } else {
        // 自由出：出最小单张
        const hand = H.hands[H.turn];
        if(hand && hand.length>0){
          const minCard = hand.slice().sort((a,b)=>a.val-b.val)[0];
          hostPlay(H.turn, [cardKey(minCard)]);
        }
      }
    }
    lastTickLeft = left;
  }, 1000);
}

/* ---- 主机：出牌提示 ---- */
function promptPlay(){
  view.turn = H.turn;
  view.turnLeft = TURN_LIMIT;
  broadcastState();
  startTurnTimer();
  if(H.turn===0){
    showPlayUI();
  } else if(autoSlots[H.turn]){
    setActInfo('玩家'+(H.turn+1)+' 托管中...');
    const autoSlot = H.turn;
    setTimeout(()=>{ if(H.phase==='play' && H.turn===autoSlot && autoSlots[autoSlot]) hostAutoActForSlot(autoSlot); }, 800);
  } else {
    clearButtons();
    netSend(H.turn, {t:'playReq', lastPlay:H.lastPlay});
    setActInfo('等待 玩家'+(H.turn+1)+' 出牌...');
  }
}
function hostPlay(senderIdx, keys){
  if(H.phase!=='play' || senderIdx!==H.turn) return;
  clearTurnTimer();
  const cards = keys.map(keyToCard);
  const handSet = {}; H.hands[senderIdx].forEach(c=>handSet[cardKey(c)]=true);
  if(!keys.every(k=>handSet[k])) return rejectPlay(senderIdx,'手牌不一致');
  const type = detectType(cards);
  if(!type) return rejectPlay(senderIdx,'牌型不合法');
  // 记录出牌前的状态（用于判断是否"管上"）
  const wasBeating = !!(H.lastPlay && H.lastPlayer!==senderIdx);
  if(H.lastPlay && H.lastPlayer!==senderIdx && !canBeat(type, H.lastPlay)) return rejectPlay(senderIdx,'管不上');
  H.hands[senderIdx] = H.hands[senderIdx].filter(c=>!keys.includes(cardKey(c)));
  if(senderIdx===0) myHand = H.hands[0].slice();
  if(view.showCards && senderIdx===H.landlord) view.showCards = H.hands[H.landlord].map(cardKey);
  H.lastPlay = type; H.lastPlayer = senderIdx; H.passCount=0;
  view.lastPlay = type; view.lastPlayer = senderIdx;
  view.played[senderIdx] = keys.slice();
  view.hands = H.hands.map(h=>h.length);
  if(type.type==='bomb' || type.type==='rocket'){ H.mult*=2; }
  view.lastEffect = type.type;
  log('玩家'+(senderIdx+1)+' 出：'+keys.join(' '));
  broadcastState();
  triggerEffect(type.type);
  // 声音：管上播 bigger，自由出播牌型；剩1/2张播报牌
  const sndGender = genders[senderIdx] || 'man';
  if(wasBeating){ playBiggerSound(sndGender); netBroadcast({t:'sound', from:senderIdx, kind:'bigger', gender:sndGender}); }
  else { playTypeSound(type, sndGender); netBroadcast({t:'sound', from:senderIdx, kind:'type', key:type, gender:sndGender}); }
  if(H.hands[senderIdx].length===0){ endGame(senderIdx); return; }
  // 报牌音效：剩1张或2张时播放
  const remain = H.hands[senderIdx].length;
  if(remain===1 || remain===2){
    const lk = remain===1?'l1':'l2';
    playSound('do', lk, sndGender); netBroadcast({t:'sound', from:senderIdx, kind:lk, gender:sndGender});
  }
  H.turn=(senderIdx+1)%3; view.turn=H.turn;
  promptPlay();
}
function hostPass(senderIdx){
  if(H.phase!=='play' || senderIdx!==H.turn) return;
  clearTurnTimer();
  if(!H.lastPlay) return rejectPlay(senderIdx,'首出不能 pass');
  view.played[senderIdx]='pass';
  H.passCount++;
  log('玩家'+(senderIdx+1)+' 不出');
  broadcastState();
  const sndGender = genders[senderIdx] || 'man';
  playPassSound(sndGender); netBroadcast({t:'sound', from:senderIdx, kind:'pass', gender:sndGender});
  if(H.passCount>=2){
    H.lastPlay=null; view.lastPlay=null;
    H.turn=H.lastPlayer; view.turn=H.turn; H.passCount=0;
    view.played={0:null,1:null,2:null};
    log('回到 玩家'+(H.turn+1)+' 自由出牌');
    broadcastState();
  } else {
    H.turn=(senderIdx+1)%3; view.turn=H.turn;
  }
  promptPlay();
}
function rejectPlay(idx,msg){
  log('玩家'+(idx+1)+' 出牌被拒：'+msg);
  if(idx===0) alert(msg);
  else netSend(idx,{t:'reject',msg});
  if(H.phase==='play') promptPlay(); else if(H.phase==='bid') promptBid();
}
function endGame(winner){
  clearTurnTimer();
  H.phase='over'; view.phase='over';
  const landlordWin = (winner===H.landlord);
  // 春天判定：地主胜且两农民一张牌都没出过（手牌仍17）
  const isSpring = landlordWin && [0,1,2].filter(i=>i!==H.landlord).every(i=>H.hands[i].length===17);
  if(isSpring) H.mult *= 2;
  const finalDelta = H.bidMax * H.mult;
  view.over = {winner, landlord:H.landlord, landlordWin, delta:finalDelta, mult:H.mult, bidMax:H.bidMax, spring:isSpring};
  if(landlordWin){ view.scores[H.landlord]+=2*finalDelta; for(let i=0;i<3;i++) if(i!==H.landlord) view.scores[i]-=finalDelta; }
  else { view.scores[H.landlord]-=2*finalDelta; for(let i=0;i<3;i++) if(i!==H.landlord) view.scores[i]+=finalDelta; }
  H.scores = view.scores.slice();
  log((landlordWin?'地主胜':'农民胜')+'，本局倍数 '+H.mult+'，底分 '+H.bidMax+'，结算 '+finalDelta+' 分'+(isSpring?' [春天]':''));
  broadcastState();
  // 胜负音效：各客户端按自己身份播放（from=玩家idx，客户端据此判断）
  if(isSpring){
    if(typeof playEffect==='function') playEffect('spring');
    netBroadcast({t:'sound', from:-1, kind:'effect', key:'spring'});
  }
  const iAmLandlord = (H.landlord===0);
  const iWin = iAmLandlord ? landlordWin : !landlordWin;
  if(typeof playEffect==='function') playEffect(iWin?'win':'lose');
  // 广播胜负结果，客户端按自己身份播放对应音效
  netBroadcast({t:'sound', from:-1, kind:'result', landlord:H.landlord, landlordWin:landlordWin});
  // 记录战绩（仅主机）
  recordMatch({
    round: H.round, landlord: H.landlord, landlordWin, delta: finalDelta,
    mult: H.mult, bidMax: H.bidMax, spring: isSpring,
    scores: view.scores.slice(), names: view.names.slice(), time: Date.now()
  });
}

/* ---- 战绩统计 ---- */
let matchHistory = [];
try{ const h = localStorage.getItem('dou_history'); if(h) matchHistory = JSON.parse(h); }catch(e){}
function recordMatch(rec){
  matchHistory.push(rec);
  try{ localStorage.setItem('dou_history', JSON.stringify(matchHistory)); }catch(e){}
}
function getStats(){
  const total = matchHistory.length;
  if(total===0) return {total:0};
  let myWins=0, myLandlord=0, myLandlordWins=0, myFarmer=0, myFarmerWins=0;
  const scoreChart = []; // 累计积分折线
  let runningScore = 0;
  matchHistory.forEach(r=>{
    const iAmLandlord = (r.landlord===0);
    const iWin = iAmLandlord ? r.landlordWin : !r.landlordWin;
    if(iAmLandlord){ myLandlord++; if(r.landlordWin) myLandlordWins++; }
    else { myFarmer++; if(!r.landlordWin) myFarmerWins++; }
    if(iWin) myWins++;
    runningScore += iAmLandlord ? (r.landlordWin? 2*r.delta : -2*r.delta) : (r.landlordWin? -r.delta : r.delta);
    scoreChart.push(runningScore);
  });
  return {
    total, myWins, myLandlord, myLandlordWins, myFarmer, myFarmerWins,
    winRate: Math.round(myWins/total*100),
    landlordWinRate: myLandlord>0?Math.round(myLandlordWins/myLandlord*100):0,
    farmerWinRate: myFarmer>0?Math.round(myFarmerWins/myFarmer*100):0,
    scoreChart, finalScore: runningScore
  };
}
function showStats(){
  const panel=document.getElementById('statsPanel'); if(!panel) return;
  panel.style.display='flex';
  const s = getStats();
  const content=document.getElementById('statsContent');
  if(s.total===0){
    content.innerHTML='<p style="text-align:center;color:#888;">暂无战绩记录</p>';
    return;
  }
  content.innerHTML =
    '<div class="stats-grid">'+
      '<div class="stat-item"><div class="stat-num">'+s.total+'</div><div class="stat-label">总局数</div></div>'+
      '<div class="stat-item"><div class="stat-num">'+s.myWins+'</div><div class="stat-label">我的胜场</div></div>'+
      '<div class="stat-item"><div class="stat-num">'+s.winRate+'%</div><div class="stat-label">胜率</div></div>'+
      '<div class="stat-item"><div class="stat-num">'+s.myLandlordWins+'/'+s.myLandlord+'</div><div class="stat-label">地主胜率 '+s.landlordWinRate+'%</div></div>'+
      '<div class="stat-item"><div class="stat-num">'+s.myFarmerWins+'/'+s.myFarmer+'</div><div class="stat-label">农民胜率 '+s.farmerWinRate+'%</div></div>'+
      '<div class="stat-item"><div class="stat-num" style="color:'+(s.finalScore>=0?'#7fff7f':'#ff7f7f')+'">'+s.finalScore+'</div><div class="stat-label">累计积分</div></div>'+
    '</div>'+
    '<h4 style="color:var(--accent);margin:12px 0 6px;">累计积分走势</h4>'+
    '<canvas id="scoreChart" width="420" height="120" style="background:rgba(0,0,0,.3);border-radius:8px;"></canvas>'+
    '<h4 style="color:var(--accent);margin:12px 0 6px;">最近对局</h4>'+
    '<div class="stats-history">'+matchHistory.slice(-10).reverse().map(r=>
      '<div class="hist-row"><span>第'+r.round+'局</span><span>'+(r.landlordWin?'地主胜':'农民胜')+'</span><span>倍'+r.mult+'</span><span>'+(r.spring?'春天':'')+'</span><span>'+r.scores.join('/')+'</span></div>'
    ).join('')+'</div>';
  // 绘制折线图
  setTimeout(()=>drawScoreChart(s.scoreChart), 50);
}
function drawScoreChart(data){
  const cv=document.getElementById('scoreChart'); if(!cv) return;
  const ctx=cv.getContext('2d');
  const w=cv.width, h=cv.height, pad=10;
  ctx.clearRect(0,0,w,h);
  if(data.length<2) return;
  // 读取主题色
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ffd54a';
  const max=Math.max(...data), min=Math.min(...data);
  const range=max-min||1;
  // 零线
  const zeroY = h-pad - (0-min)/range*(h-2*pad);
  if(0>=min && 0<=max){
    ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(pad,zeroY); ctx.lineTo(w-pad,zeroY); ctx.stroke();
  }
  // 折线
  ctx.strokeStyle=accent; ctx.lineWidth=2; ctx.beginPath();
  data.forEach((v,i)=>{
    const x=pad+i/(data.length-1)*(w-2*pad);
    const y=h-pad-(v-min)/range*(h-2*pad);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // 填充
  ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath();
  // 把 accent 转成 rgba 填充
  ctx.fillStyle = accent.startsWith('#') ? accent+'20' : 'rgba(255,213,74,.12)';
  ctx.fill();
}
function closeStats(){ const p=document.getElementById('statsPanel'); if(p) p.style.display='none'; }
function clearStats(){ if(confirm('确定清空所有战绩记录？')){ matchHistory=[]; try{localStorage.removeItem('dou_history');}catch(e){} showStats(); } }

/* ---- 导出/导入 ---- */
function exportData(){
  const data = {
    version: 1, exportTime: Date.now(),
    matchHistory: matchHistory,
    customAvatars: customAvatars,
    customNicks: customNicks,
    scores: view.scores ? view.scores.slice() : [100,100,100],
    round: view.round || 0
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'dou_stats_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  URL.revokeObjectURL(url);
  log('已导出战绩数据');
}
function importData(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(data.matchHistory) matchHistory = data.matchHistory;
      if(data.customAvatars) customAvatars = data.customAvatars;
      if(data.customNicks) customNicks = data.customNicks;
      saveAvatars(); saveNicks();
      try{ localStorage.setItem('dou_history', JSON.stringify(matchHistory)); }catch(err){}
      log('已导入战绩数据: '+matchHistory.length+' 局');
      showStats();
    }catch(err){ alert('导入失败：文件格式错误'); }
    input.value='';
  };
  reader.readAsText(file);
}

/* ============================================================
   网络消息路由
   ============================================================ */
function onNetMessage(m, slot){
  if(role==='host'){
    const sender = slot;
    if(m.t==='bid'){ hostBid(sender, m.val|0); }
    else if(m.t==='grab'){ hostGrab(sender, m.grab); }
    else if(m.t==='show'){ hostShow(sender, m.show); }
    else if(m.t==='play'){ hostPlay(sender, m.cards); }
    else if(m.t==='pass'){ hostPass(sender); }
    else if(m.t==='ping'){ netSend(sender,{t:'o',time:m.time}); }
    else if(m.t==='o'){ }
    else if(m.t==='gender'){ genders[sender]=m.g||'man'; view.genders=genders.slice(); log('玩家'+(sender+1)+' 性别: '+(m.g==='woman'?'女':'男')); }
    else if(m.t==='profile'){ customAvatars[sender]=m.avatar||null; customNicks[sender]=m.nick||''; saveAvatars(); saveNicks(); view.names[sender]=getDisplayName(sender); log('玩家'+(sender+1)+' 昵称: '+view.names[sender]); broadcastState(); }
    else if(m.t==='autoPlay'){ autoSlots[sender]=!!m.on; log('玩家'+(sender+1)+(m.on?' 开启托管':' 取消托管')); broadcastState(); }
    else if(m.t==='chat'){ // 客户端发来的聊天，主机本地播放并转发给另一客户端
      onChatMsg(m.from, m.phrase, m.gender);
      const other = sender===1?2:1;
      netSend(other, {t:'chat', from:m.from, phrase:m.phrase, gender:m.gender});
    }
    else if(m.t==='gift'){ // 客户端送礼，主机本地播放并转发给另一客户端
      flyGift(m.from, m.to, m.gift);
      const other = sender===1?2:1;
      netSend(other, {t:'gift', from:m.from, to:m.to, gift:m.gift});
    }
    // 主机广播的 sound 消息由自己发出，客户端在 else 分支处理
  } else {
    if(m.t==='assign'){ myIdx=m.you; view.names[myIdx]='我'; genders[myIdx]=myGender; log('已分配座次：玩家'+(myIdx+1)); }
    else if(m.t==='deal'){ selected.clear(); myHand = m.hand.map(keyToCard).sort((a,b)=>b.val-a.val); view.myHand=myHand; }
    else if(m.t==='bottom'){ myHand = sortHand(myHand.concat(m.cards.map(keyToCard))); view.myHand=myHand; }
    else if(m.t==='bidReq'){ showBidUI(m.curMax); }
    else if(m.t==='grabReq'){ showGrabUI(m.mult); }
    else if(m.t==='showReq'){ showShowUI(m.mult); }
    else if(m.t==='playReq'){ showPlayUI(m.lastPlay); }
    else if(m.t==='reject'){ alert(m.msg); }
    else if(m.t==='waitMsg'){ clearButtons(); setActInfo(m.msg); }
    else if(m.t==='state'){ applyState(m.v); }
    else if(m.t==='o'){ rtt=performance.now()-m.time; }
    else if(m.t==='chat'){ onChatMsg(m.from, m.phrase, m.gender); }
    else if(m.t==='gift'){ flyGift(m.from, m.to, m.gift); }
    else if(m.t==='sound'){ onSoundMsg(m.from, m.kind, m.key, m.gender); }
    else if(m.t==='tick'){ view.turnLeft = m.left; view.turnDeadline = m.deadline; render(); }
  }
  render();
}
function applyState(v){
  const prevEffect = view.lastEffect;
  Object.assign(view, v);
  view.played = v.played || {0:null,1:null,2:null};
  view.bidLog = v.bidLog || [];
  if(v.genders){ genders = v.genders.slice(); view.genders = genders; }
  if(v.avatars){ customAvatars = v.avatars.slice(); }
  if(v.names){ view.names = v.names.slice(); }
  if(v.autoSlots){ autoSlots = v.autoSlots.slice(); view.autoSlots = autoSlots; }
  // 观战者：用 specHands 恢复所有人的手牌显示
  if(role==='spectator' && v.specHands){
    view.specHands = v.specHands;
    view.specBottom = v.specBottom;
  }
  if(v.lastEffect && v.lastEffect!==prevEffect) triggerEffect(v.lastEffect);
  render();
}

/* ============================================================
   UI：叫分 / 出牌 面板
   ============================================================ */
function setActInfo(t){ document.getElementById('actInfo').textContent=t; }
function clearButtons(){ document.getElementById('actButtons').innerHTML=''; }

function imgBtn(sprName, onClick, disabled){
  const r = SPR[sprName], s = 0.6;
  const b = document.createElement('button'); b.className='img-btn';
  b.style.width=(r.w*s)+'px'; b.style.height=(r.h*s)+'px';
  b.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  b.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  if(disabled) b.disabled=true;
  b.onclick = onClick;
  return b;
}
function txtBtn(label, onClick, disabled){
  const b = document.createElement('button'); b.className='txt-btn'; b.textContent=label;
  if(disabled) b.disabled=true;
  b.onclick = onClick;
  return b;
}
function toggleAutoPlay(){
  autoPlay = !autoPlay;
  const btn=document.getElementById('autoBtn');
  if(btn) btn.classList.toggle('active', autoPlay);
  log(autoPlay?'已开启托管':'已取消托管，手动接管');
  // 同步托管状态到主机
  if(role==='host'){
    autoSlots[0] = autoPlay;
    broadcastState();
  } else if(role==='client'){
    netSend(0, {t:'autoPlay', on:autoPlay});
  }
  if(autoPlay) autoAct();
  render();
}
/* ---- 送礼物（点头像弹浮层选礼物） ---- */
function toggleGiftPopup(targetIdx){
  // 关闭其他浮层
  document.querySelectorAll('.gift-popup').forEach(p=>p.classList.remove('show'));
  if(giftPopupOpen===targetIdx){ giftPopupOpen=null; return; }
  const pos = seatPos(targetIdx);
  const popup=document.getElementById('giftPopup'+cap(pos));
  if(!popup) return;
  popup.innerHTML='';
  ['coffee','roses','tomato','water'].forEach(g=>{
    const btn=document.createElement('div');
    btn.className='gift-item'; btn.title=GIFT_INFO[g].label;
    btn.onclick=(e)=>{ e.stopPropagation(); sendGift(targetIdx, g); };
    btn.appendChild(makeGiftEl(GIFT_INFO[g].fly, 'fit', 34, 34));
    popup.appendChild(btn);
  });
  popup.classList.add('show');
  giftPopupOpen=targetIdx;
}
function closeAllGiftPopups(){
  document.querySelectorAll('.gift-popup').forEach(p=>p.classList.remove('show'));
  giftPopupOpen=null;
}
function sendGift(targetIdx, gift){
  closeAllGiftPopups();
  if(targetIdx===myIdx) return;  // 不能给自己送
  flyGift(myIdx, targetIdx, gift);
  if(role==='host') netBroadcast({t:'gift', from:0, to:targetIdx, gift});
  else netSend(0, {t:'gift', from:myIdx, to:targetIdx, gift});
  log('送出 '+GIFT_INFO[gift].label+' 给 玩家'+(targetIdx+1));
}
function flyGift(fromIdx, toIdx, gift){
  const info=GIFT_INFO[gift]; if(!info) return;
  const fromSeat=document.getElementById('seat'+cap(seatPos(fromIdx)));
  const toSeat=document.getElementById('seat'+cap(seatPos(toIdx)));
  if(!fromSeat||!toSeat) return;
  // 使用页面坐标（getBoundingClientRect），挂载到 body 避免 overflow:hidden 裁剪
  const frect=fromSeat.getBoundingClientRect();
  const trect=toSeat.getBoundingClientRect();
  const fx=frect.left+frect.width/2, fy=frect.top+frect.height/2;
  const tx=trect.left+trect.width/2, ty=trect.top+trect.height/2;
  const wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;left:'+fx+'px;top:'+fy+'px;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;transition:left '+info.dur+'ms linear,top '+info.dur+'ms linear;';
  const fly=makeGiftEl(info.fly, 0.2);
  if(info.spin) fly.style.animation='giftFlyFast '+info.dur+'ms linear';
  wrap.appendChild(fly);
  document.body.appendChild(wrap);
  requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ wrap.style.left=tx+'px'; wrap.style.top=ty+'px'; }); });
  setTimeout(()=>{
    wrap.remove();
    const land=makeGiftEl(info.land, 0.3);
    land.style.position='fixed';
    land.style.left=tx+'px';
    land.style.top=ty+'px';
    land.style.transform='translate(-50%,-50%)';
    land.style.zIndex='9999';
    land.style.pointerEvents='none';
    land.style.animation='giftLand .4s ease-out';
    document.body.appendChild(land);
    setTimeout(()=>land.remove(), 2000);
  }, info.dur);
}
function cancelGiftOnEmpty(e){
  if(giftPopupOpen && !e.target.closest('.seat')) closeAllGiftPopups();
}
function autoAct(){
  if(!autoPlay) return;
  // 叫地主阶段：不叫
  if(view.phase==='bid' && view.turn===myIdx){
    doBid(0);
    return;
  }
  // 抢地主阶段：不抢
  if(view.phase==='grab' && view.turn===myIdx){
    doGrab(false);
    return;
  }
  // 明牌阶段：不明牌
  if(view.phase==='show' && view.turn===myIdx){
    doShow(false);
    return;
  }
  // 出牌阶段
  if(view.phase==='play' && view.turn===myIdx){
    const ol = (role==='host') ? H.lastPlay : view.lastPlay;
    const h = findHint(myHand, ol);
    if(h && h.length>0){
      selected.clear();
      h.forEach(c=>selected.add(cardKey(c)));
      doPlay();
    } else if(ol){
      doPass();
    } else {
      // 自由出无提示（不可能，findHint 自由出总返回最小单张）
      const c = myHand[myHand.length-1];
      if(c){ selected.clear(); selected.add(cardKey(c)); doPlay(); }
    }
  }
}
function showAutoBadge(){
  if(!autoPlay) return;
  const box=document.getElementById('actButtons');
  if(!box) return;
  const badge=document.createElement('span');
  badge.style.cssText='color:#ffd54a;font-weight:bold;margin-right:8px;';
  badge.textContent='🤖 托管中';
  box.appendChild(badge);
  const cancel=document.createElement('button');
  cancel.textContent='取消托管'; cancel.className='secondary';
  cancel.onclick=()=>{ autoPlay=false; const btn=document.getElementById('autoBtn'); if(btn) btn.classList.remove('active'); log('已取消托管'); if(role==='host'){ autoSlots[0]=false; broadcastState(); } else if(role==='client'){ netSend(0,{t:'autoPlay',on:false}); } render(); };
  box.appendChild(cancel);
}

function showBidUI(curMax){
  curMax = curMax || (role==='host'? H.bidMax : 0);
  setActInfo('轮到你叫分'+(curMax>0?'（当前最高 '+curMax+'）':''));
  const box=document.getElementById('actButtons'); box.innerHTML='';
  box.appendChild(imgBtn('btn_no_call', ()=>doBid(0)));
  box.appendChild(imgBtn('btn_1', ()=>doBid(1), 1<=curMax));
  box.appendChild(imgBtn('btn_2', ()=>doBid(2), 2<=curMax));
  box.appendChild(imgBtn('btn_3', ()=>doBid(3), 3<=curMax));
  box.appendChild(imgBtn('btn_call_landlord', ()=>doBid(curMax>0?curMax:1)));
  if(autoPlay) setTimeout(autoAct, 600);
}
function doBid(v){
  clearButtons();
  if(typeof playEffect==='function') playEffect('button');
  if(role==='host') hostBid(0,v);
  else netSend(0,{t:'bid',val:v});
  setActInfo('已叫分，等待其他人...');
}
function showGrabUI(curMult){
  const mult = curMult || (role==='host'? H.mult : 1);
  setActInfo('轮到你抢地主（倍数 '+mult+'，抢则×2）');
  const box=document.getElementById('actButtons'); box.innerHTML='';
  box.appendChild(txtBtn('抢地主', ()=>doGrab(true)));
  box.appendChild(txtBtn('不抢', ()=>doGrab(false)));
  if(autoPlay) setTimeout(autoAct, 600);
}
function doGrab(g){
  clearButtons();
  if(typeof playEffect==='function') playEffect('button');
  if(role==='host') hostGrab(0,g);
  else netSend(0,{t:'grab',grab:g});
  setActInfo('已选择，等待其他人...');
}
function showShowUI(curMult){
  const mult = curMult || (role==='host'? H.mult : 1);
  setActInfo('是否明牌？（当前倍数 '+mult+'，明牌×2）');
  const box=document.getElementById('actButtons'); box.innerHTML='';
  box.appendChild(txtBtn('明牌', ()=>doShow(true)));
  box.appendChild(txtBtn('不明牌', ()=>doShow(false)));
  if(autoPlay) setTimeout(()=>doShow(false), 600);
}
function doShow(s){
  clearButtons();
  if(typeof playEffect==='function') playEffect('button');
  if(role==='host') hostShow(0,s);
  else netSend(0,{t:'show',show:s});
  setActInfo('已选择，开始出牌...');
}
function showPlayUI(lastPlay){
  const ol = role==='host'? H.lastPlay : lastPlay;
  setActInfo(ol? '轮到你出牌（需管上）' : '轮到你出牌（自由出）');
  const box=document.getElementById('actButtons'); box.innerHTML='';
  box.appendChild(imgBtn('btn_pass', ()=>doPass(), !ol));
  box.appendChild(imgBtn('btn_hint', ()=>doHint(ol)));
  const bClear=document.createElement('button'); bClear.className='secondary'; bClear.textContent='清空';
  bClear.onclick=()=>{ selected.clear(); render(); }; box.appendChild(bClear);
  box.appendChild(imgBtn('btn_play', ()=>doPlay()));
  showAutoBadge();
  if(autoPlay) setTimeout(autoAct, 600);
}
function doPass(){
  clearButtons();
  if(typeof playEffect==='function') playEffect('button');
  if(role==='host') hostPass(0);
  else netSend(0,{t:'pass'});
  setActInfo('已不出，等待...');
}
function doPlay(){
  const keys = Array.from(selected);
  if(keys.length===0){ alert('请先选牌'); return; }
  clearButtons();
  if(typeof playEffect==='function') playEffect('button');
  if(role==='host') hostPlay(0, keys);
  else netSend(0,{t:'play',cards:keys});
  selected.clear();
  setActInfo('已出牌，等待...');
  render();
}
function doHint(ol){
  const olType = (role==='host') ? H.lastPlay : ol;
  const h = findHint(myHand, olType);
  if(!h){ alert('没有可压制的牌型'); return; }
  selected.clear();
  h.forEach(c=>selected.add(cardKey(c)));
  render();
}

/* ============================================================
   渲染
   ============================================================ */
function seatPos(idx){
  const rel = (idx - myIdx + 3)%3;
  return rel===0?'me': rel===1?'right':'left';
}
function render(){
  // 发牌动画：phase 从非bid变为bid时触发
  if(view.phase==='bid' && prevPhase && prevPhase!=='bid'){ playDealAnim(); }
  prevPhase = view.phase;
  renderTableFan();
  renderSignRound();
  renderMultScroll();
  for(let i=0;i<3;i++){
    const pos = seatPos(i);
    const seat = document.getElementById('seat'+cap(pos));
    if(!seat) continue;
    seat.querySelector('.name').textContent = getDisplayName(i);
    const cntEl = seat.querySelector('.count');
    cntEl.textContent = view.hands[i]!==undefined ? '🂠 '+view.hands[i] : '';
    renderAvatar(pos, i);
    renderCrown(pos, i);
    renderBadge(pos, i);
    renderAutoBadge(pos, i);
    // 点头像弹礼物浮层（自己不能给自己送，不弹；观战者不弹）
    if(i!==myIdx && role!=='spectator'){
      seat.style.cursor='pointer';
      seat.onclick=(e)=>{
        if(e.target.closest('.gift-popup')) return;
        // 主机点击断线托管玩家：弹重连面板
        if(role==='host' && autoSlots[i]){
          openReconnectPanel(i);
        } else {
          toggleGiftPopup(i);
        }
      };
    } else {
      seat.style.cursor=''; seat.onclick=null;
    }
  }
  renderClock();
  const leftIdx=(myIdx+2)%3, rightIdx=(myIdx+1)%3;
  if(role==='spectator'){
    // 观战者看到所有人真实手牌
    renderOppHand('Left', view.hands[leftIdx], view.specHands ? view.specHands[leftIdx] : null);
    renderOppHand('Right', view.hands[rightIdx], view.specHands ? view.specHands[rightIdx] : null);
  } else {
    renderOppHand('Left', view.hands[leftIdx], view.showCards && view.landlord===leftIdx ? view.showCards : null);
    renderOppHand('Right', view.hands[rightIdx], view.showCards && view.landlord===rightIdx ? view.showCards : null);
  }
  renderBottom();
  const renderIdxMe = role==='spectator' ? 0 : myIdx;
  const renderIdxLeft = role==='spectator' ? 2 : (myIdx+2)%3;
  const renderIdxRight = role==='spectator' ? 1 : (myIdx+1)%3;
  renderPlayed('Left', renderIdxLeft);
  renderPlayed('Right', renderIdxRight);
  renderPlayed('Me', renderIdxMe);
  renderMyHand();
  renderBanner();
  renderActions();
  const st=document.getElementById('gameStatus');
  if(view.over){
    const win = view.over.landlordWin ? '地主胜' : '农民胜';
    st.textContent = '🎉 第'+view.round+'局结束：'+win+' ｜ 本局结算 '+view.over.delta+' 分 ｜ 累计积分 '+view.scores.join('/');
  } else if(view.phase==='bid'){
    st.textContent = '🟡 第'+view.round+'局叫地主中 ｜ 当前最高 '+view.points+' 分 ｜ 积分 '+view.scores.join('/');
  } else if(view.phase==='play'){
    st.textContent = '🟢 第'+view.round+'局出牌中 ｜ 轮到 '+ (view.turn===myIdx?'你':getDisplayName(view.turn))+' ｜ 积分 '+view.scores.join('/');
  } else if(view.phase==='grab'){
    st.textContent = '🟡 第'+view.round+'局抢地主中 ｜ 轮到 '+ (view.turn===myIdx?'你':getDisplayName(view.turn))+' ｜ 积分 '+view.scores.join('/');
  } else if(view.phase==='show'){
    st.textContent = '🟡 第'+view.round+'局明牌选择 ｜ 等待 '+getDisplayName(view.landlord)+' ｜ 积分 '+view.scores.join('/');
  } else {
    st.textContent='🟢 已连接';
  }
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

function avatarNameFor(idx){
  if(idx===view.landlord) return 'avatar_landlord';
  // 农民/未定身份：按性别
  const g = genders[idx] || 'man';
  return g==='woman' ? 'avatar_peasant2' : 'avatar_peasant1';
}
function renderAvatar(pos, idx){
  const el = document.getElementById('avatar'+cap(pos));
  if(!el) return;
  el.innerHTML='';
  el.style.background='none';
  // 自定义头像优先
  if(customAvatars[idx]){
    el.style.width='54px'; el.style.height='54px'; el.style.borderRadius='50%';
    el.style.backgroundImage='url("'+customAvatars[idx]+'")';
    el.style.backgroundRepeat='no-repeat'; el.style.backgroundSize='cover';
    el.style.backgroundPosition='center';
    return;
  }
  const name = avatarNameFor(idx);
  if(!name){ el.style.backgroundColor='#2a3a26'; return; }
  const r = SPR[name];
  // 按容器宽度等比缩放，保留素材宽高比
  const targetW = 70;
  const s = targetW / r.w;
  el.style.width = targetW+'px';
  el.style.height = (r.h * s)+'px';
  el.style.backgroundImage = 'url(\'img/dou.png\')';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundSize = (SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  el.style.backgroundPosition = (-r.x*s)+'px '+(-r.y*s)+'px';
}
function renderCrown(pos, idx){
  const el = document.getElementById('crown'+cap(pos));
  if(!el) return;
  if(view.landlord===idx){
    el.style.display='block';
    el.innerHTML='';
    const r = SPR.icon_crown, s = 38/r.w;
    const c = makeSpriteEl('icon_crown', s);
    c.style.width='38px'; c.style.height=(r.h*s)+'px';
    c.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
    c.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
    el.appendChild(c);
  } else el.style.display='none';
}
function renderBadge(pos, idx){
  const el = document.getElementById('badge'+cap(pos));
  if(!el) return;
  el.innerHTML='';
  if(view.landlord<0) return;
  const name = idx===view.landlord ? 'badge_landlord' : 'badge_peasant';
  const r = SPR[name], s = 52/r.w;
  const b = makeSpriteEl(name, s); b.style.width='52px'; b.style.height=(r.h*s)+'px';
  b.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  b.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  el.appendChild(b);
}
function renderAutoBadge(pos, idx){
  let el = document.getElementById('autoBadge'+cap(pos));
  if(!el){
    el = document.createElement('div');
    el.id = 'autoBadge'+cap(pos);
    el.style.cssText='font-size:11px;color:#ffd54a;background:rgba(192,57,43,.85);padding:1px 6px;border-radius:8px;margin-top:1px;white-space:nowrap;';
    el.textContent='🤖 托管';
    el.style.display='none';
    const seat = document.getElementById('seat'+cap(pos));
    if(seat) seat.appendChild(el);
  }
  el.style.display = (autoSlots[idx] || (idx===myIdx && autoPlay)) ? 'inline-block' : 'none';
}
function renderClock(){
  document.querySelectorAll('.clock').forEach(c=>c.remove());
  if(view.over || view.turn<0 || view.phase!=='play') return;
  const left = (typeof view.turnLeft!=='undefined') ? view.turnLeft : (view.turnDeadline ? Math.max(0, Math.round((view.turnDeadline-Date.now())/1000)) : TURN_LIMIT);
  // 剩余≤15秒才显示闹钟+数字
  if(left > 15) return;
  const pos = seatPos(view.turn);
  const seat = document.getElementById('seat'+cap(pos));
  if(!seat) return;
  const r = SPR.clock_timer, s = 52/r.w;
  const clock = makeSpriteEl('clock_timer', s);
  clock.className += ' clock';
  clock.style.width='52px'; clock.style.height=(r.h*s)+'px';
  clock.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  clock.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  // 倒计时数字
  const num = document.createElement('div');
  num.className = 'clock-num' + (left<=5?' urgent':'');
  num.textContent = left;
  clock.appendChild(num);
  if(pos==='me') clock.style.cssText += 'position:absolute;left:50%;bottom:300px;transform:translateX(-50%);';
  else if(pos==='right') clock.style.cssText += 'position:absolute;right:80px;top:150px;';
  else clock.style.cssText += 'position:absolute;left:80px;top:150px;';
  document.querySelector('.stage').appendChild(clock);
}
function renderTableFan(){
  const el = document.getElementById('tableFan'); if(!el) return;
  if(el.children.length>0) return;
  const r = FAN_RECT, s = 0.5;
  const f = document.createElement('div'); f.className='card sprite';
  f.style.width=(r.w*s)+'px'; f.style.height=(r.h*s)+'px';
  f.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  f.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  el.appendChild(f);
}
function renderSignRound(){
  const el = document.getElementById('signRound'); if(!el) return;
  el.innerHTML='';
  const r = SPR.sign_round, s = 0.5;
  const s1 = document.createElement('div'); s1.className='card sprite';
  s1.style.width=(r.w*s)+'px'; s1.style.height=(r.h*s)+'px';
  s1.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  s1.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  el.appendChild(s1);
  const lab=document.createElement('div'); lab.className='sign-label'; lab.textContent='第 '+view.round+' 局';
  el.appendChild(lab);
}
function renderMultScroll(){
  const el = document.getElementById('multScroll'); if(!el) return;
  if(view.phase==='wait' || !view.phase){ el.innerHTML=''; return; }
  el.innerHTML='';
  const r = SPR.scroll_paper, s = 0.4;
  const wrap = document.createElement('div'); wrap.className='scroll-bg'; wrap.style.position='relative';
  const bg = document.createElement('div'); bg.className='card sprite';
  bg.style.width=(r.w*s)+'px'; bg.style.height=(r.h*s)+'px';
  bg.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  bg.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  wrap.appendChild(bg);
  const mult = (role==='host'? (H&&H.mult||1) : (view.mult||1));
  const base = view.points || 0;
  const val = document.createElement('div'); val.className='mult-val';
  val.textContent = base>0 ? (mult+'×'+base) : '待叫';
  wrap.appendChild(val);
  el.appendChild(wrap);
}
function renderBanner(){
  const el = document.getElementById('bannerLayer'); if(!el) return;
  if(!view.over){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='flex';
  el.innerHTML='';
  // 横幅图片：按当前玩家是否胜利选择
  let iWin;
  if(role==='spectator'){
    iWin = true; // 观战者中立，显示胜利横幅
  } else {
    const iAmLandlord = (view.over.landlord===myIdx);
    iWin = iAmLandlord ? view.over.landlordWin : !view.over.landlordWin;
  }
  const r = SPR[iWin?'banner_victory':'banner_defeat'], s = 0.7;
  const b = document.createElement('div'); b.className='card sprite';
  b.style.width=(r.w*s)+'px'; b.style.height=(r.h*s)+'px';
  b.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  b.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  el.appendChild(b);
  const t = document.createElement('div'); t.className='banner-text';
  if(role==='spectator'){
    t.textContent = view.over.landlordWin ? '地主胜利 🏆' : '农民胜利 🎉';
  } else {
    t.textContent = iWin ? '胜利 🏆 本局 +'+view.over.delta : '失败 💔 本局 -'+view.over.delta;
  }
  el.appendChild(t);
}
let effectTimer = null;
function triggerEffect(typeName){
  const el = document.getElementById('effectLayer'); if(!el) return;
  el.innerHTML=''; el.style.display='flex'; el.className='effect-layer';
  if(effectTimer) clearTimeout(effectTimer);
  const isHost = role==='host';
  if(typeName==='bomb'){
    el.classList.add('bomb');
    if(isHost){ if(typeof playEffect==='function') playEffect('13'); netBroadcast({t:'sound', from:-1, kind:'effect', key:'13'}); }
    const r = SPR.icon_bomb, s = 0.7;
    const img = document.createElement('div'); img.className='card sprite';
    img.style.width=(r.w*s)+'px'; img.style.height=(r.h*s)+'px';
    img.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
    img.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
    el.appendChild(img);
  } else if(typeName==='rocket'){
    el.classList.add('rocket');
    if(isHost){ if(typeof playEffect==='function') playEffect('14'); netBroadcast({t:'sound', from:-1, kind:'effect', key:'14'}); }
    const r = SPR.icon_rocket, s = 0.8;
    const img = document.createElement('div'); img.className='card sprite';
    img.style.width=(r.w*s)+'px'; img.style.height=(r.h*s)+'px';
    img.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
    img.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
    el.appendChild(img);
  } else if(typeName==='plane' || typeName==='plane1' || typeName==='plane2'){
    el.classList.add('plane');
    if(isHost){ if(typeof playEffect==='function') playEffect('11'); netBroadcast({t:'sound', from:-1, kind:'effect', key:'11'}); }
    const t = document.createElement('div'); t.className='effect-text'; t.textContent='✈ 飞机！';
    el.appendChild(t);
  } else if(typeName==='bomb2s' || typeName==='bomb2p'){
    const t = document.createElement('div'); t.className='effect-text'; t.textContent='💥 四带二！';
    el.appendChild(t);
  } else if(typeName==='straight'){
    const t = document.createElement('div'); t.className='effect-text'; t.textContent='顺子！';
    el.appendChild(t);
  } else if(typeName==='pairstraight'){
    const t = document.createElement('div'); t.className='effect-text'; t.textContent='连对！';
    el.appendChild(t);
  } else { el.style.display='none'; return; }
  effectTimer = setTimeout(()=>{ el.style.display='none'; el.innerHTML=''; }, 2500);
}
function renderOppHand(side, count, realCards){
  const el=document.getElementById('hand'+side);
  if(!el) return;
  el.innerHTML='';
  // 根据舞台高度动态决定每列最多牌数，按数量自动分列
  const stage = document.querySelector('.stage');
  const stageH = stage ? stage.offsetHeight : 560;
  // 侧边手牌可用高度：从座位下方到舞台底部，留出出牌区空间
  const availH = Math.min(stageH - 300, 200);
  const cardH = 36, overlap = 28;
  const maxPerCol = Math.max(5, Math.min(10, Math.floor(availH / (cardH - overlap))));
  const total = (realCards && realCards.length) ? realCards.length : count;
  if(total === 0) return;
  const cols = Math.max(1, Math.ceil(total / maxPerCol));
  el.style.flexDirection = 'row';
  el.style.flexWrap = 'nowrap';
  el.style.gap = '0';
  if(realCards && realCards.length){
    for(let c=0;c<cols;c++){
      const col = document.createElement('div');
      col.style.cssText='display:flex;flex-direction:column;align-items:center;';
      if(c>0) col.style.marginLeft = '-12px';
      const start = c * maxPerCol;
      const end = Math.min(realCards.length, start + maxPerCol);
      for(let i=start;i<end;i++) col.appendChild(makeCardEl(keyToCard(realCards[i]),'sm'));
      el.appendChild(col);
    }
    return;
  }
  for(let c=0;c<cols;c++){
    const col = document.createElement('div');
    col.style.cssText='display:flex;flex-direction:column;align-items:center;';
    if(c>0) col.style.marginLeft = '-12px';
    const start = c * maxPerCol;
    const end = Math.min(count, start + maxPerCol);
    for(let i=start;i<end;i++){
      const b=makeBackEl('sm'); b.classList.add('back'); col.appendChild(b);
    }
    el.appendChild(col);
  }
}
function renderBottom(){
  const el=document.getElementById('bottomCards');
  el.innerHTML='';
  const lab=document.createElement('div'); lab.className='label-b'; lab.textContent='底牌'; el.appendChild(lab);
  if(!view.bottomShown || view.bottom.length===0){ const h=document.createElement('div'); h.className='label-b'; h.textContent='❓❓❓'; el.appendChild(h); return; }
  view.bottom.forEach(k=> el.appendChild(makeCardEl(keyToCard(k),'sm')));
}
let dealSoundTimer = null;
function startDealSound(){
  if(typeof playEffect==='function') playEffect('do');
  dealSoundTimer = setInterval(()=>{ if(typeof playEffect==='function') playEffect('do'); }, 200);
}
function stopDealSound(){
  if(dealSoundTimer){ clearInterval(dealSoundTimer); dealSoundTimer=null; }
}
function playDealAnim(){
  const stage=document.querySelector('.stage'); if(!stage) return;
  const cx=480, cy=280;
  const seats=[
    document.getElementById('seatMe'),
    document.getElementById('seatLeft'),
    document.getElementById('seatRight')
  ];
  const targets=seats.map(s=>{
    if(!s) return {x:cx,y:cy};
    return {x:s.offsetLeft+s.offsetWidth/2, y:s.offsetTop+s.offsetHeight/2};
  });
  startDealSound();
  for(let r=0;r<6;r++){
    for(let p=0;p<3;p++){
      setTimeout(()=>{
        const card=makeBackEl('sm');
        card.style.cssText='position:absolute;left:'+cx+'px;top:'+cy+'px;transform:translate(-50%,-50%) scale(.3) rotate(180deg);z-index:60;transition:all .35s cubic-bezier(.22,.61,.36,1);pointer-events:none;opacity:.9;';
        stage.appendChild(card);
        requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
          const t=targets[p];
          card.style.left=t.x+'px'; card.style.top=t.y+'px';
          card.style.transform='translate(-50%,-50%) scale(.8) rotate(0deg)';
          card.style.opacity='0';
        }); });
        setTimeout(()=>card.remove(),420);
      }, r*80+p*25);
    }
  }
  setTimeout(stopDealSound, 1000);
}
function renderPlayed(side, idx){
  const el=document.getElementById('played'+side);
  if(!el) return;
  el.innerHTML='';
  const p = view.played[idx];
  if(p===undefined || p===null) return;
  const isNew = Array.isArray(p) && p!==prevPlayed[idx];
  prevPlayed[idx] = p;
  if(p==='pass'){
    const d=document.createElement('div'); d.className='played-pass'; d.textContent='不出'; el.appendChild(d);
    return;
  }
  if(Array.isArray(p)){
    const lab=document.createElement('div'); lab.className='played-label'; lab.textContent=getDisplayName(idx); el.appendChild(lab);
    p.forEach((k,i)=>{
      const c=makeCardEl(keyToCard(k),'sm');
      if(isNew){ c.style.animation='cardFlyIn .35s ease-out '+((i*40)/1000)+'s both'; }
      el.appendChild(c);
    });
  }
}
function renderMyHand(){
  const el=document.getElementById('myHand'); el.innerHTML='';
  if(role==='spectator'){
    // 观战者：显示玩家1的真实手牌（只读，不可选）
    const specHand = (view.specHands && view.specHands[0]) ? view.specHands[0].map(keyToCard) : [];
    specHand.sort((a,b)=>b.val-a.val);
    specHand.forEach(c=>{
      const wrap=document.createElement('div'); wrap.className='card-wrap';
      wrap.appendChild(makeCardEl(c,''));
      el.appendChild(wrap);
    });
    const pv=document.getElementById('handPreview'); if(pv){ pv.textContent='玩家1手牌（观战）'; pv.className='hand-preview'; }
    return;
  }
  myHand.forEach(c=>{
    const wrap=document.createElement('div'); wrap.className='card-wrap';
    const card=makeCardEl(c,'');
    if(selected.has(cardKey(c))) wrap.classList.add('selected');
    wrap.appendChild(card);
    wrap.onclick=()=>{ const k=cardKey(c); if(selected.has(k)) selected.delete(k); else selected.add(k); render(); };
    el.appendChild(wrap);
  });
  renderHandPreview();
}
const TYPE_CN = {
  single:'单张', pair:'对子', triple:'三张', triple1:'三带一', triple2:'三带二',
  straight:'顺子', pairstraight:'连对', plane:'飞机', plane1:'飞机带单', plane2:'飞机带对',
  bomb:'炸弹', bomb2s:'四带二(单)', bomb2p:'四带二(对)', rocket:'王炸'
};
function renderHandPreview(){
  const el=document.getElementById('handPreview'); if(!el) return;
  if(selected.size===0){ el.textContent=''; el.className='hand-preview'; return; }
  const cards = Array.from(selected).map(keyToCard);
  const type = detectType(cards);
  if(!type){ el.textContent='无效牌型'; el.className='hand-preview invalid'; return; }
  const cn = TYPE_CN[type.type] || type.type;
  let txt = cn;
  if(view.phase==='play' && view.turn===myIdx){
    const ol = view.lastPlay;
    if(ol && view.lastPlayer!==myIdx && view.lastPlayer>=0){
      const beat = canBeat(type, ol);
      txt += beat ? ' · 能管上 ✓' : ' · 管不上 ✗';
      el.className = 'hand-preview ' + (beat?'valid':'invalid');
    } else {
      el.className = 'hand-preview valid';
    }
  } else {
    el.className = 'hand-preview';
  }
  el.textContent = txt;
}
function renderActions(){
  if(role==='spectator'){
    clearButtons();
    if(view.over){
      const overText = (view.over.landlordWin ? '地主胜利 🏆' : '农民胜利 🎉') +
                       ' ｜ 本局结算 '+view.over.delta+' 分 ｜ 累计 '+view.scores.join('/');
      setActInfo('👁 观战 ｜ '+overText+' ｜ 等待主机开始下一局...');
    } else {
      setActInfo('👁 观战模式 - 只读观看');
    }
    return;
  }
  if(view.over){
    clearButtons();
    const overText = (view.over.landlordWin ? '地主胜利 🏆' : '农民胜利 🎉') +
                     ' ｜ 本局结算 '+view.over.delta+' 分 ｜ 累计 '+view.scores.join('/');
    if(role==='host'){
      setActInfo(overText+' ｜ 你是'+(view.over.landlord===0?'地主':'农民'));
      const box=document.getElementById('actButtons'); box.innerHTML='';
      const b=document.createElement('button'); b.textContent='再来一局'; b.onclick=()=>hostStartGame(); box.appendChild(b);
    } else {
      setActInfo(overText+' ｜ 你是'+(view.over.landlord===myIdx?'地主':'农民')+' ｜ 等待主机开始下一局...');
    }
    return;
  }
}
