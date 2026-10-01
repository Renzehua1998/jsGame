/* ============================================================
   net.js - WebRTC 三人星形信令（主机两路 offer/answer）
   ============================================================ */
const RTC_CONFIG = {
  iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]
};

/* ---- SDP 压缩：字典替换，无需外部库 ---- */
const _SDP_DICT = [
  ['"type":"offer"','\u00C0'], ['"type":"answer"','\u00C1'], ['"sdp":"','\u00C2'],
  ['candidate:','\u00C3'], ['\r\n','\u00C4'], ['typ ','\u00C5'], ['generation','\u00C6'],
  ['network-cost','\u00C7'], ['a=group:BUNDLE','\u00C8'], ['a=ice-ufrag:','\u00C9'],
  ['a=ice-pwd:','\u00CA'], ['a=fingerprint:','\u00CB'], ['a=setup:actpass','\u00CC'],
  ['a=setup:active','\u00CD'], ['a=mid:','\u00CE'], ['a=sendrecv','\u00CF'],
  ['a=sendonly','\u00D0'], ['a=recvonly','\u00D1'], ['a=rtpmap:','\u00D2'],
  ['a=rtcp-mux','\u00D3'], ['a=ssrc:','\u00D4'], ['a=cname:','\u00D5'],
  ['a=msid:','\u00D6'], ['a=msid-semantic:','\u00D7'], ['a=track:','\u00D8'],
  ['IN IP4 ','\u00D9'], ['127.0.0.1','\u00DA'], ['udp','\u00DB'], ['host','\u00DC'],
  ['srflx','\u00DD'], ['o=- ','\u00DE'], ['s=-','\u00DF'], ['t=0 0','\u00E0'],
  ['m=application','\u00E1'], ['m=audio','\u00E2'], ['m=video','\u00E3'],
  ['SCTP/DTLS','\u00E4'], ['RTP/SAVPF','\u00E5'], ['a=sctp-port:','\u00E6'],
  ['a=max-message-size:','\u00E7'], ['{"','\u00E8'], ['":','\u00E9'], ['"}','\u00EA'],
  [',"','\u00EB'], ['"endOfCandidates"','\u00EC'], ['relay','\u00ED'], ['prflx','\u00EE'],
  ['a=end-of-candidates','\u00EF'], ['a=candidate:','\u00F0'], ['tcp','\u00F1'],
  ['active','\u00F2'], ['passive','\u00F3'], ['actpass','\u00F4'],
  ['a=ice-options:','\u00F5'], ['trickle','\u00F6'], ['renomination','\u00F7'],
  ['a=extmap:','\u00F8'], ['a=fmtp:','\u00F9'], ['a=rtcp-fb:','\u00FA'],
  ['google','\u00FB'], ['chrome','\u00FC'], ['a=rtcp:','\u00FD'],
  ['RTP/AVPF','\u00FE'], ['9 ','\u00FF'],
];
function compressSDP(json){ let s=json; for(const [f,t] of _SDP_DICT) s=s.split(f).join(t); return 'DZ:'+s; }
function decompressSDP(s){
  if(!s.startsWith('DZ:')) return s;
  s=s.slice(3);
  for(let i=_SDP_DICT.length-1;i>=0;i--) s=s.split(_SDP_DICT[i][1]).join(_SDP_DICT[i][0]);
  return s;
}
let role=null;
let pc1=null, pc2=null, ch1=null, ch2=null;   // 主机端
let pc3=null, ch3=null;                         // 主机端·观战者
let pc=null, channel=null;                      // 客户端端
let myIdx = 0;                                   // 我在三人中的座次
let rtt=0, lastPing=0;
let gameInProgress = false;     // 游戏是否在进行中（用于判断重连）
let reconnectSlot = -1;         // 主机端：正在重连的 slot（1或2）

function showStep(id){
  document.querySelectorAll('.step').forEach(el=>el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function beHost(){ role='host'; myIdx=0; showStep('stepHost1'); }
function beClient(){ role='client'; showStep('stepClient1'); }
function beSpectator(){ role='spectator'; myIdx=3; showStep('stepSpectator1'); }
function showErr(id,msg){ document.getElementById(id).innerHTML=`<div class="error-box">❌ ${msg}</div>`; }
function clrErr(id){ document.getElementById(id).innerHTML=''; }
function log(msg){
  const b=document.getElementById('logBox');
  if(!b) return;
  const line=document.createElement('div');
  line.textContent = '['+new Date().toLocaleTimeString()+'] '+msg;
  b.appendChild(line); b.scrollTop=b.scrollHeight;
}

function waitIce(pc, timeout=8000){
  return new Promise(resolve=>{
    if(pc.iceGatheringState==='complete') return resolve();
    let done=false, timer=null;
    const fin=()=>{ if(done) return; done=true; if(timer)clearTimeout(timer);
      pc.removeEventListener('icecandidate',onCand); pc.removeEventListener('icegatheringstatechange',onSt); resolve(); };
    const onCand=e=>{ if(e.candidate===null) fin(); };
    const onSt=()=>{ if(pc.iceGatheringState==='complete') fin(); };
    timer=setTimeout(()=>{console.warn('ICE 超时'); fin();}, timeout);
    pc.addEventListener('icecandidate',onCand); pc.addEventListener('icegatheringstatechange',onSt);
  });
}

/* ---- 主机：生成两份 offer ---- */
async function createOffers(){
  clrErr('hostError');
  document.getElementById('btnCreateOffer').disabled=true;
  document.getElementById('hostLoading').style.display='block';
  try{
    pc1=new RTCPeerConnection(RTC_CONFIG);
    ch1=pc1.createDataChannel('g1',{ordered:true});
    setupChannel(ch1,1);
    pc1.addEventListener('iceconnectionstatechange',()=>{ onIceState(pc1,1); });
    pc2=new RTCPeerConnection(RTC_CONFIG);
    ch2=pc2.createDataChannel('g2',{ordered:true});
    setupChannel(ch2,2);
    pc2.addEventListener('iceconnectionstatechange',()=>{ onIceState(pc2,2); });
    const o1=await pc1.createOffer(); await pc1.setLocalDescription(o1); await waitIce(pc1);
    const o2=await pc2.createOffer(); await pc2.setLocalDescription(o2); await waitIce(pc2);
    document.getElementById('offerOut1').value=compressSDP(JSON.stringify(pc1.localDescription));
    document.getElementById('offerOut2').value=compressSDP(JSON.stringify(pc2.localDescription));
    document.getElementById('hostOfferArea').style.display='block';
  }catch(err){ showErr('hostError','生成邀请码失败：'+err.message); document.getElementById('btnCreateOffer').disabled=false; }
  finally{ document.getElementById('hostLoading').style.display='none'; }
}
async function acceptAnswers(){
  clrErr('hostError');
  const a1=document.getElementById('answerIn1').value.trim();
  const a2=document.getElementById('answerIn2').value.trim();
  if(!a1||!a2) return showErr('hostError','请填入两位客户端的应答码');
  try{
    await pc1.setRemoteDescription(JSON.parse(decompressSDP(a1)));
    await pc2.setRemoteDescription(JSON.parse(decompressSDP(a2)));
  }catch(e){ showErr('hostError','应答码格式错误：'+e.message); }
}

/* ---- 主机：生成观战者邀请码 ---- */
async function createSpectatorOffer(){
  clrErr('hostError');
  try{
    pc3=new RTCPeerConnection(RTC_CONFIG);
    ch3=pc3.createDataChannel('spec',{ordered:true});
    setupSpectatorChannel(ch3);
    const o=await pc3.createOffer(); await pc3.setLocalDescription(o); await waitIce(pc3);
    document.getElementById('specOfferOut').value=compressSDP(JSON.stringify(pc3.localDescription));
    document.getElementById('specOfferArea').style.display='block';
  }catch(err){ showErr('hostError','生成观战邀请码失败：'+err.message); }
}
async function acceptSpectatorAnswer(){
  clrErr('hostError');
  const a=document.getElementById('specAnswerIn').value.trim();
  if(!a) return showErr('hostError','请填入观战者的应答码');
  try{
    await pc3.setRemoteDescription(JSON.parse(decompressSDP(a)));
    log('观战者已连接');
  }catch(e){ showErr('hostError','观战应答码格式错误：'+e.message); }
}
function setupSpectatorChannel(ch){
  ch.addEventListener('open',()=>{
    log('观战者通道已打开');
    sendRaw(ch, {t:'assign', you: 3});
    // 立即发送当前完整状态
    if(typeof getSpectatorState==='function') sendRaw(ch, {t:'state', v:getSpectatorState()});
  });
  ch.addEventListener('message', e=>{
    try{ const m=JSON.parse(e.data);
      if(m.t==='p'){ ch.send(JSON.stringify({t:'o',time:m.time})); return; }
      if(m.t==='o'){ return; }
      if(m.t==='gender'){ /* 观战者性别无关紧要 */ return; }
    }catch(err){}
  });
  ch.addEventListener('close',()=>{ log('观战者断开'); ch3=null; pc3=null; });
  ch.addEventListener('error',e=>log('观战通道错误'));
}

/* ---- 客户端 ---- */
async function createAnswer(){
  clrErr('clientError');
  const s=document.getElementById('offerIn').value.trim();
  if(!s) return showErr('clientError','请输入邀请码');
  let offer; try{ offer=JSON.parse(decompressSDP(s));}catch(e){ return showErr('clientError','邀请码格式错误：'+e.message);}
  document.getElementById('btnCreateAnswer').disabled=true;
  document.getElementById('clientLoading').style.display='block';
  try{
    pc=new RTCPeerConnection(RTC_CONFIG);
    pc.addEventListener('datachannel',e=>{ channel=e.channel; setupChannel(channel,0); });
    await pc.setRemoteDescription(offer);
    const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); await waitIce(pc);
    document.getElementById('answerOut').value=compressSDP(JSON.stringify(pc.localDescription));
    document.getElementById('clientAnswerArea').style.display='block';
  }catch(err){ showErr('clientError','生成应答码失败：'+err.message); document.getElementById('btnCreateAnswer').disabled=false; }
  finally{ document.getElementById('clientLoading').style.display='none'; }
}

/* ---- 观战者：生成应答码 ---- */
async function createSpectatorAnswer(){
  const s=document.getElementById('specOfferIn').value.trim();
  if(!s) return showErr('specError','请输入观战邀请码');
  let offer; try{ offer=JSON.parse(decompressSDP(s));}catch(e){ return showErr('specError','邀请码格式错误：'+e.message);}
  document.getElementById('btnSpecAnswer').disabled=true;
  document.getElementById('specLoading').style.display='block';
  try{
    pc=new RTCPeerConnection(RTC_CONFIG);
    pc.addEventListener('datachannel',e=>{ channel=e.channel; setupSpectatorClientChannel(channel); });
    await pc.setRemoteDescription(offer);
    const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); await waitIce(pc);
    document.getElementById('specAnswerOut').value=compressSDP(JSON.stringify(pc.localDescription));
    document.getElementById('specAnswerArea').style.display='block';
  }catch(err){ showErr('specError','生成应答码失败：'+err.message); document.getElementById('btnSpecAnswer').disabled=false; }
  finally{ document.getElementById('specLoading').style.display='none'; }
}
function setupSpectatorClientChannel(ch){
  ch.addEventListener('open',()=>{ log('观战通道已打开'); enterGame(); });
  ch.addEventListener('message', e=>{
    try{ const m=JSON.parse(e.data);
      if(m.t==='p'){ ch.send(JSON.stringify({t:'o',time:m.time})); return; }
      if(m.t==='o'){ rtt=performance.now()-m.time; return; }
      if(m.t==='assign'){ myIdx=m.you; log('已作为观战者连接'); return; }
      if(m.t==='state'){ applyState(m.v); return; }
      if(m.t==='sound'){ if(typeof onSoundMsg==='function') onSoundMsg(m.from, m.kind, m.key, m.gender); return; }
      if(m.t==='chat'){ if(typeof onChatMsg==='function') onChatMsg(m.from, m.phrase, m.gender); return; }
      if(m.t==='gift'){ if(typeof flyGift==='function') flyGift(m.from, m.to, m.gift); return; }
      if(m.t==='tick'){ view.turnLeft = m.left; view.turnDeadline = m.deadline; if(typeof render==='function') render(); return; }
    }catch(err){}
  });
  ch.addEventListener('close',()=>{ log('观战连接断开'); alert('观战连接已断开'); });
  ch.addEventListener('error',e=>log('通道错误'));
}

/* ---- 通道事件 ---- */
function setupChannel(ch, slot){
  ch.addEventListener('open',()=>{
    log('通道已打开 (slot='+slot+')');
    if(role==='host'){
      if(gameInProgress){
        // 重连场景：不发 assign，直接恢复
        log('玩家'+(slot+1)+' 重连成功');
        if(typeof restoreClient==='function') restoreClient(slot);
        reconnectSlot = -1;
      } else {
        // 首次连接
        sendRaw(ch, {t:'assign', you: slot});
        if(ch1 && ch1.readyState==='open' && ch2 && ch2.readyState==='open'){
          enterGame();
        }
      }
    } else {
      // 客户端
      sendRaw(ch, {t:'gender', g: myGender});
      // 重连时重新发送个人资料（头像/昵称）
      if(gameInProgress){
        sendRaw(ch, {t:'profile', nick: myNick, avatar: myAvatar});
        // 重连：通知主机我是谁
        sendRaw(ch, {t:'reconnect', idx: myIdx});
        // 清除断线标记
        try{ localStorage.removeItem('dou_reconnect_idx'); }catch(e){}
        // 隐藏重连面板
        const rp = document.getElementById('reconnectClientPanel');
        if(rp) rp.style.display='none';
      }
      enterGame();
    }
  });
  ch.addEventListener('message', e=>{
    try{ const m=JSON.parse(e.data);
      if(m.t==='p'){ ch.send(JSON.stringify({t:'o',time:m.time})); return; }
      if(m.t==='o'){ rtt=performance.now()-m.time; return; }
      if(m.t==='reconnect'){ // 客户端重连时告知座次
        if(role==='host' && m.idx>=1 && m.idx<=2) log('重连玩家确认：玩家'+(m.idx+1));
        return;
      }
      onNetMessage(m, slot);
    }catch(err){}
  });
  ch.addEventListener('close',()=>{
    log('连接断开 (slot='+slot+')');
    if(role==='host'){
      if(gameInProgress){
        // 游戏中断线，不结束游戏，触发重连流程
        if(typeof onClientDisconnect==='function') onClientDisconnect(slot);
      } else {
        alert('连接已断开');
      }
    } else {
      if(gameInProgress){
        // 客户端断线，保存座次，显示重连面板
        try{ localStorage.setItem('dou_reconnect_idx', String(myIdx)); }catch(e){}
        if(typeof onDisconnect==='function') onDisconnect();
      } else {
        alert('连接已断开');
      }
    }
  });
  ch.addEventListener('error',e=>log('通道错误'));
}
function sendRaw(ch, obj){ if(ch && ch.readyState==='open') ch.send(JSON.stringify(obj)); }
function onIceState(pc, slot){
  const s = pc.iceConnectionState;
  if(s==='disconnected'){
    // disconnected 可能是短暂网络波动，延迟检查是否真正断线
    log('ICE暂时断开 (slot='+slot+')，等待恢复...');
    setTimeout(()=>{
      if(pc.iceConnectionState==='disconnected' || pc.iceConnectionState==='failed'){
        if(role==='host' && gameInProgress){
          if(typeof onClientDisconnect==='function') onClientDisconnect(slot);
        } else if(role!=='host' && gameInProgress){
          try{ localStorage.setItem('dou_reconnect_idx', String(myIdx)); }catch(e){}
          if(typeof onDisconnect==='function') onDisconnect();
        }
      }
    }, 5000);
  } else if(s==='failed'){
    log('ICE断开 (slot='+slot+', state='+s+')');
    if(role==='host' && gameInProgress){
      if(typeof onClientDisconnect==='function') onClientDisconnect(slot);
    } else if(role!=='host' && gameInProgress){
      try{ localStorage.setItem('dou_reconnect_idx', String(myIdx)); }catch(e){}
      if(typeof onDisconnect==='function') onDisconnect();
    }
  }
}
function net_setGameInProgress(v){ gameInProgress = v; }

function netSend(targetIdx, obj){
  if(role==='host'){
    if(targetIdx===0) return;
    if(targetIdx===1) sendRaw(ch1,obj);
    if(targetIdx===2) sendRaw(ch2,obj);
  } else {
    sendRaw(channel, obj);
  }
}
function netBroadcast(obj){ if(role==='host'){ sendRaw(ch1,obj); sendRaw(ch2,obj); sendRaw(ch3,obj); } }
function netSendSpectator(obj){ if(role==='host') sendRaw(ch3,obj); }

/* ---- 主机：为断线客户端重新生成 offer ---- */
async function createOfferForReconnect(slot){
  try{
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const ch = pc.createDataChannel('g'+slot,{ordered:true});
    setupChannel(ch, slot);
    const o = await pc.createOffer(); await pc.setLocalDescription(o); await waitIce(pc);
    if(slot===1){ pc1=pc; ch1=ch; pc1.addEventListener('iceconnectionstatechange',()=>{ onIceState(pc1,1); }); } else if(slot===2){ pc2=pc; ch2=ch; pc2.addEventListener('iceconnectionstatechange',()=>{ onIceState(pc2,2); }); }
    reconnectSlot = slot;
    return compressSDP(JSON.stringify(pc.localDescription));
  }catch(err){ log('重新生成邀请码失败：'+err.message); return null; }
}
async function acceptReconnectAnswer(answerStr){
  if(reconnectSlot<0) return;
  try{
    const pc = reconnectSlot===1?pc1:pc2;
    await pc.setRemoteDescription(JSON.parse(decompressSDP(answerStr)));
    log('重连应答已接受');
  }catch(e){ log('重连应答码格式错误：'+e.message); }
}

/* ---- 客户端：重连 ---- */
async function reconnectClient(){
  const s=document.getElementById('reconnectOfferIn').value.trim();
  if(!s) return;
  let offer; try{ offer=JSON.parse(decompressSDP(s));}catch(e){ document.getElementById('reconnectClientError').innerHTML='<div class="error-box">❌ 邀请码格式错误</div>'; return;}
  try{
    pc=new RTCPeerConnection(RTC_CONFIG);
    pc.addEventListener('datachannel',e=>{ channel=e.channel; setupChannel(channel,0); });
    await pc.setRemoteDescription(offer);
    const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); await waitIce(pc);
    document.getElementById('reconnectAnswerOut').value=compressSDP(JSON.stringify(pc.localDescription));
    document.getElementById('reconnectAnswerArea').style.display='block';
  }catch(err){ document.getElementById('reconnectClientError').innerHTML='<div class="error-box">❌ '+err.message+'</div>'; }
}
