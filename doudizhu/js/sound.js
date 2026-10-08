/* ============================================================
   sound.js - 声音播放：BGM背景音乐 + 出牌/不出/叫地主语音 + 聊天短语
   目录: sound/{do|chat}/{man|woman}/{key}.mp3, sound/effect/{key}.mp3, sound/bgm.mp3
   设置: bgm开关 / sfx(打牌音效)开关，localStorage 持久化
   ============================================================ */
let myGender = 'man';          // 本地玩家性别
try{ const g = localStorage.getItem('dou_gender'); if(g) myGender = g; }catch(e){}
let genders = ['man','man','man']; // 三玩家性别（主机同步）

/* ---- 设置（BGM/音效音量 0-100，localStorage 持久化） ---- */
let settings = { bgm:35, sfx:70 };
try{ const s = localStorage.getItem('dou_settings'); if(s) settings = Object.assign(settings, JSON.parse(s)); }catch(e){}
function saveSettings(){ try{ localStorage.setItem('dou_settings', JSON.stringify(settings)); }catch(e){} }

/* ---- BGM 背景音乐（循环） ---- */
let bgmAudio = null;
function initBgm(){
  if(bgmAudio) return;
  try{
    bgmAudio = new Audio('sound/bgm.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = settings.bgm/100;
  }catch(e){}
}
function startBgm(){
  initBgm();
  if(!bgmAudio || settings.bgm<=0) return;
  bgmAudio.volume = settings.bgm/100;
  bgmAudio.play().catch(()=>{});
}
function stopBgm(){
  if(bgmAudio){ try{ bgmAudio.pause(); }catch(e){} }
}
function setBgmVol(v){
  v = v|0;
  settings.bgm = v;
  saveSettings();
  if(bgmAudio){ bgmAudio.volume = v/100; if(v>0) bgmAudio.play().catch(()=>{}); else stopBgm(); }
  const sl=document.getElementById('setBgmVol'); if(sl) sl.value=v;
  const val=document.getElementById('bgmVolVal'); if(val) val.textContent=v;
}
function setSfxVol(v){
  v = v|0;
  settings.sfx = v;
  saveSettings();
  const sl=document.getElementById('setSfxVol'); if(sl) sl.value=v;
  const val=document.getElementById('sfxVolVal'); if(val) val.textContent=v;
}

/* ---- 设置面板 ---- */
function toggleSettings(force){
  const p=document.getElementById('settingsPanel');
  if(!p) return;
  if(force===false) p.style.display='none';
  else if(force===true) p.style.display='flex';
  else p.style.display = p.style.display==='flex'?'none':'flex';
  const bs=document.getElementById('setBgmVol'), sf=document.getElementById('setSfxVol');
  if(bs) bs.value=settings.bgm;
  if(sf) sf.value=settings.sfx;
  const bv=document.getElementById('bgmVolVal'), sv=document.getElementById('sfxVolVal');
  if(bv) bv.textContent=settings.bgm;
  if(sv) sv.textContent=settings.sfx;
  const ts=document.getElementById('themeSelect'); if(ts) ts.value=currentTheme;
}

function setGender(g){
  myGender = g;
  try{ localStorage.setItem('dou_gender', g); }catch(e){}
  const m=document.getElementById('genderMale'), f=document.getElementById('genderFemale');
  if(m) m.classList.toggle('secondary', g!=='man');
  if(f) f.classList.toggle('secondary', g!=='woman');
  playEffect('button');
}

/* 通用播放：category=do|chat|effect, gender=man|woman(仅do/chat), key=文件名 */
let lastAudio = null;
function playSound(category, key, gender){
  if(settings.sfx<=0) return;
  const g = gender || myGender || 'man';
  const url = `sound/${category}/${g}/${key}.mp3`;
  try{
    if(lastAudio){ try{lastAudio.pause();}catch(e){} }
    const a = new Audio(url);
    a.volume = settings.sfx/100;
    lastAudio = a;
    a.play().catch(()=>{});
  }catch(e){}
}
function playEffect(key){
  if(settings.sfx<=0) return;
  try{ const a=new Audio(`sound/effect/${key}.mp3`); a.volume=settings.sfx/100; a.play().catch(()=>{}); }catch(e){}
}

/* 牌点值(val) → 单张/对子声音文件序号(1-13)
   val: 3-13→3-13, 14(A)→1, 15(2)→2 */
function valToSD(v){
  if(v===14) return 1;   // A
  if(v===15) return 2;   // 2
  return v;              // 3-13
}

/* 牌型 → do 类声音 key（数组，可随机选一个） */
function playTypeSound(type, gender){
  if(!type) return;
  const T = type.type;
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];
  if(T==='single'){
    if(type.main===16) playSound('do','s60',gender);
    else if(type.main===17) playSound('do','s61',gender);
    else playSound('do','s'+valToSD(type.main),gender);
  } else if(T==='pair'){
    playSound('do','d'+valToSD(type.main),gender);
  } else if(T==='triple'){
    playSound('do','5',gender);
  } else if(T==='triple1'){
    playSound('do','7',gender);
  } else if(T==='triple2'){
    playSound('do','8',gender);
  } else if(T==='bomb'){
    playSound('do','13',gender);
  } else if(T==='rocket'){
    playSound('do','14',gender);
  } else if(T==='bomb2s'){
    playSound('do','9',gender);
  } else if(T==='bomb2p'){
    playSound('do','10',gender);
  } else if(T==='straight'){
    playSound('do','2',gender);
  } else if(T==='pairstraight'){
    playSound('do','4',gender);
  } else if(T==='plane' || T==='plane1' || T==='plane2'){
    playSound('do','11',gender);
  }
}
function playPassSound(gender){ playSound('do',['pass0','pass1','pass2'][Math.floor(Math.random()*3)],gender); }
function playBiggerSound(gender){ playSound('do',['bigger0','bigger1','bigger2'][Math.floor(Math.random()*3)],gender); }
function playCallSound(gender){ playSound('do','call',gender); }
function playNoCallSound(gender){ playSound('do','bj',gender); }
function playChatSound(phrase, gender){ playSound('chat', String(phrase), gender); }

/* ============ 聊天 ============ */
function toggleChat(force){
  const bar=document.getElementById('chatBar');
  if(!bar) return;
  if(force===false) bar.style.display='none';
  else if(force===true) bar.style.display='flex';
  else bar.style.display = bar.style.display==='flex'?'none':'flex';
}
function sendChat(phrase){
  toggleChat(false);
  // 本地播放自己的语音
  playChatSound(phrase, myGender);
  // 通过网络转发给其他人
  if(role==='host'){
    // 主机：广播给两个客户端
    netBroadcast({t:'chat', from:0, phrase:phrase, gender:myGender});
  } else {
    // 客户端：发给主机，主机转发给另一客户端
    netSend(0, {t:'chat', from:myIdx, phrase:phrase, gender:myGender});
  }
  log((role==='host'?'我':'玩家'+(myIdx+1))+'：'+chatPhraseText(phrase));
}
function chatPhraseText(p){
  return ['大家好，很高兴见到各位','快点吧，我等的花都谢了','不要走，决战到天亮',
          '你是帅哥还是美女','君子报仇，十盘不算晚','打错了，呜呜~'][p] || '';
}

/* 收到他人聊天：播放对方语音 */
function onChatMsg(from, phrase, gender){
  if(from===myIdx) return; // 自己发的已本地播放
  playChatSound(phrase, gender);
  log('玩家'+(from+1)+'：'+chatPhraseText(phrase));
}

/* 收到出牌声音消息（主机广播）：按出牌人性别播放（含自己出牌，因客户端出牌由主机触发广播） */
function onSoundMsg(from, kind, key, gender){
  if(kind==='effect'){ playEffect(key); return; }   // 音效（time/spring/win/lose/11/13/14）
  if(kind==='result' && key){
    // 胜负音效：各客户端按自己身份播放
    const iAmLandlord = (key.landlord===myIdx);
    const iWin = iAmLandlord ? key.landlordWin : !key.landlordWin;
    if(typeof playEffect==='function') playEffect(iWin?'win':'lose');
    return;
  }
  const g = gender || genders[from] || 'man';
  if(kind==='type') playTypeSound(key, g);
  else if(kind==='pass') playPassSound(g);
  else if(kind==='bigger') playBiggerSound(g);
  else if(kind==='call') playCallSound(g);
  else if(kind==='nocal') playNoCallSound(g);
  else if(kind==='recall') playCallSound(g);   // 抢地主复用叫地主语音
  else if(kind==='bq') playNoCallSound(g);      // 不抢复用不叫语音
  else if(kind==='l1') playSound('do','l1',g);
  else if(kind==='l2') playSound('do','l2',g);
}

if(typeof window!=='undefined'){
  window.setGender=setGender; window.playSound=playSound; window.playEffect=playEffect;
  window.playTypeSound=playTypeSound; window.playPassSound=playPassSound;
  window.playBiggerSound=playBiggerSound; window.playCallSound=playCallSound;
  window.playNoCallSound=playNoCallSound; window.playChatSound=playChatSound;
  window.toggleChat=toggleChat; window.sendChat=sendChat; window.chatPhraseText=chatPhraseText;
  window.onChatMsg=onChatMsg; window.onSoundMsg=onSoundMsg;
  window.toggleSettings=toggleSettings; window.setBgmVol=setBgmVol; window.setSfxVol=setSfxVol;
  window.startBgm=startBgm; window.stopBgm=stopBgm;
}
