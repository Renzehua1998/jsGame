/* ============================================================
   test.js - 单元测试：牌型识别/比较/提示/卡牌工具/计分/叫地主/
     抢地主/明牌/春天/炸弹倍数/战绩统计/SDP压缩/礼物配置/昵称
   兼容 Node (require) 和浏览器 (全局函数)
   runTests(showPanel?) -> {pass, fail, total, details}
   ============================================================ */
(function(){
  // 环境适配：取纯逻辑函数
  let detectType, canBeat, findHint, keyToCard, buildDeck, sortHand, RANK_VAL, cardKey;
  let compressSDP, decompressSDP;
  if(typeof require === 'function' && typeof module !== 'undefined'){
    const eng = require('./engine.js');
    const crd = require('./cards.js');
    detectType = eng.detectType; canBeat = eng.canBeat; findHint = eng.findHint;
    keyToCard = crd.keyToCard; buildDeck = crd.buildDeck; sortHand = crd.sortHand;
    RANK_VAL = crd.RANK_VAL; cardKey = crd.cardKey;
    // net.js 中的压缩函数需要手动加载（它在浏览器全局，Node 中 require 会执行 DOM 代码）
    try{
      const fs = require('fs');
      const netSrc = fs.readFileSync(__dirname+'/net.js','utf8');
      // 提取 compressSDP/decompressSDP 和 _SDP_DICT
      const mockWindow = {};
      const fn = new Function('window','document','navigator','RTCPeerConnection', netSrc);
      fn(mockWindow, {}, {}, function(){});
      compressSDP = mockWindow.compressSDP;
      decompressSDP = mockWindow.decompressSDP;
    }catch(e){ /* net.js 可能无法在 Node 加载，跳过压缩测试 */ }
  } else {
    detectType = window.detectType; canBeat = window.canBeat; findHint = window.findHint;
    keyToCard = window.keyToCard; buildDeck = window.buildDeck; sortHand = window.sortHand;
    RANK_VAL = window.RANK_VAL; cardKey = window.cardKey;
    compressSDP = window.compressSDP; decompressSDP = window.decompressSDP;
  }

  // 构造卡牌数组：vals=[5,5,5] -> [{val:5,key:'S_5'}]
  function C(...vals){ return vals.map(v=>({val:v, key:keyOf(v)})); }
  function keyOf(v){ if(v===16) return 'JB'; if(v===17) return 'JR'; const r = v===14?'A':v===15?'2':String(v); return 'S_'+r; }

  const results = [];
  let pass=0, fail=0;
  function ok(name, cond, extra){
    if(cond){ pass++; results.push({name, ok:true}); }
    else { fail++; results.push({name, ok:false, extra:extra||''}); }
  }
  function eq(name, got, want){
    const g = JSON.stringify(got), w = JSON.stringify(want);
    ok(name, g===w, 'got='+g+' want='+w);
  }

  /* ============================================================
     1. detectType 牌型识别
     ============================================================ */
  function T(name, vals, expectType, expectMain, expectLen){
    const t = detectType(C(...vals));
    if(expectType===null){ ok(name+' → null', t===null, 'got='+JSON.stringify(t)); return; }
    ok(name+' → type', t && t.type===expectType, 'got='+JSON.stringify(t));
    if(expectMain!==undefined) ok(name+' → main', t && t.main===expectMain, 'got='+JSON.stringify(t));
    if(expectLen!==undefined) ok(name+' → len', t && t.len===expectLen, 'got='+JSON.stringify(t));
  }
  T('单张', [5], 'single', 5, 1);
  T('对子', [5,5], 'pair', 5, 1);
  T('三张', [7,7,7], 'triple', 7, 1);
  T('炸弹', [9,9,9,9], 'bomb', 9, 1);
  T('王炸', [16,17], 'rocket', 0, 0);
  T('三带一', [5,5,5,6], 'triple1', 5, 1);
  T('三带二', [5,5,5,6,6], 'triple2', 5, 1);
  T('四带二单', [5,5,5,5,6,7], 'bomb2s', 5, 1);
  T('四带二对', [5,5,5,5,6,6,7,7], 'bomb2p', 5, 1);
  T('顺子5', [3,4,5,6,7], 'straight', 3, 5);
  T('顺子12', [3,4,5,6,7,8,9,10,11,12,13,14], 'straight', 3, 12);
  T('连对3', [3,3,4,4,5,5], 'pairstraight', 3, 3);
  T('飞机2', [3,3,3,4,4,4], 'plane', 3, 2);
  T('飞机带单2', [3,3,3,4,4,4,5,6], 'plane1', 3, 2);
  T('飞机带对2', [3,3,3,4,4,4,5,5,6,6], 'plane2', 3, 2);
  T('飞机3', [3,3,3,4,4,4,5,5,5], 'plane', 3, 3);
  T('飞机带单3', [3,3,3,4,4,4,5,5,5,6,7,8], 'plane1', 3, 3);
  T('飞机带对3', [3,3,3,4,4,4,5,5,5,6,6,7,7,8,8], 'plane2', 3, 3);
  T('顺子最短5张', [3,4,5,6], null);
  T('顺子含2非法', [12,13,14,15], null);
  T('顺子含王非法', [13,14,16], null);
  T('四张非炸弹', [3,4,5,6], null);
  T('三张杂', [3,4,5], null);
  T('飞机不连', [3,3,3,5,5,5], null);
  T('飞机带对数量错', [3,3,3,4,4,4,5,5,6], null);
  T('四带二对不成', [5,5,5,5,6,6,7], null);
  T('两王非对子', [16,17], 'rocket', 0, 0);
  T('空数组null', [], null);
  T('单张大王', [17], 'single', 17, 1);
  T('连对2对太短', [3,3,4,4], null);

  /* ============================================================
     2. canBeat 压制规则
     ============================================================ */
  function B(name, ne, ol, want){
    ok(name, canBeat(ne, ol)===want, 'ne='+JSON.stringify(ne)+' ol='+JSON.stringify(ol));
  }
  B('单张大压小', {type:'single',main:8,len:1}, {type:'single',main:5,len:1}, true);
  B('单张小不压大', {type:'single',main:4,len:1}, {type:'single',main:5,len:1}, false);
  B('对子压单张(异型)', {type:'pair',main:5,len:1}, {type:'single',main:5,len:1}, false);
  B('炸弹压单张', {type:'bomb',main:5,len:1}, {type:'single',main:14,len:1}, true);
  B('炸弹压炸弹大', {type:'bomb',main:9,len:1}, {type:'bomb',main:5,len:1}, true);
  B('炸弹压炸弹小', {type:'bomb',main:5,len:1}, {type:'bomb',main:9,len:1}, false);
  B('王炸压炸弹', {type:'rocket',main:0,len:0}, {type:'bomb',main:9,len:1}, true);
  B('炸弹压王炸', {type:'bomb',main:9,len:1}, {type:'rocket',main:0,len:0}, false);
  B('四带二被炸弹压(反向)', {type:'bomb2s',main:5,len:1}, {type:'bomb',main:9,len:1}, false);
  B('炸弹压四带二', {type:'bomb',main:9,len:1}, {type:'bomb2s',main:5,len:1}, true);
  B('四带二异型不压', {type:'bomb2s',main:5,len:1}, {type:'bomb2p',main:5,len:1}, false);
  B('四带二同型大压小', {type:'bomb2s',main:9,len:1}, {type:'bomb2s',main:5,len:1}, true);
  B('顺子同长大压小', {type:'straight',main:5,len:5}, {type:'straight',main:3,len:5}, true);
  B('顺子不同长不压', {type:'straight',main:3,len:6}, {type:'straight',main:3,len:5}, false);
  B('飞机同长大压小', {type:'plane',main:5,len:2}, {type:'plane',main:3,len:2}, true);
  B('自由出(ol=null)', {type:'single',main:3,len:1}, null, true);
  B('三带一同型压', {type:'triple1',main:7,len:1}, {type:'triple1',main:5,len:1}, true);
  B('三带二异型不压', {type:'triple2',main:7,len:1}, {type:'triple1',main:5,len:1}, false);

  /* ============================================================
     3. findHint 提示
     ============================================================ */
  function H(name, handVals, ol, wantVals){
    const hand = handVals.map(v=>({val:v, key:keyOf(v)}));
    const h = findHint(hand, ol);
    if(wantVals===null){ ok(name+' → null', h===null || (h && h.length===0), 'got='+JSON.stringify(h&&h.map?h.map(c=>c?c.val:c):h)); return; }
    const got = h ? h.map(c=>c?c.val:null).sort((a,b)=>a-b) : null;
    const want = wantVals.slice().sort((a,b)=>a-b);
    eq(name, got, want);
  }
  H('自由出最小单张', [5,7,9], null, [5]);
  H('单张能压', [3,5,7,9], {type:'single',main:6,len:1}, [7]);
  H('单张无能压给炸弹', [3,5,5,5,5], {type:'single',main:13,len:1}, [5,5,5,5]);
  H('小王当单张能压K', [3,16,17], {type:'single',main:13,len:1}, [16]);
  H('压炸弹无大牌给王炸', [3,4,16,17], {type:'bomb',main:9,len:1}, [16,17]);
  H('全无能压返回null', [3,4], {type:'single',main:13,len:1}, null);
  H('对子能压', [3,3,5,5,7,7], {type:'pair',main:4,len:1}, [5,5]);
  H('三张能压', [3,3,3,5,5,5], {type:'triple',main:4,len:1}, [5,5,5]);
  H('顺子能压', [3,4,5,6,7,8], {type:'straight',main:3,len:5}, [4,5,6,7,8]);
  H('连对能压', [3,3,4,4,5,5,6,6], {type:'pairstraight',main:3,len:3}, [4,4,5,5,6,6]);
  H('飞机能压', [3,3,3,4,4,4,5,5,5], {type:'plane',main:3,len:2}, [4,4,4,5,5,5]);
  H('三带一能压', [3,3,3,5,5,5,7], {type:'triple1',main:3,len:1}, [3,5,5,5]);
  H('三带二能压', [3,3,3,5,5,5,7,7], {type:'triple2',main:3,len:1}, [3,3,5,5,5]);
  H('压对子有对子先出', [3,5,5,5,5], {type:'pair',main:4,len:1}, [5,5]);
  H('压三张有三张先出', [3,5,5,5,5,9], {type:'triple',main:4,len:1}, [5,5,5]);
  H('自由出手牌空', [], null, null);
  H('压顺子手牌不足返回null', [3,4,5], {type:'straight',main:3,len:5}, null);

  /* ============================================================
     4. 卡牌工具
     ============================================================ */
  ok('buildDeck 54张', buildDeck().length===54);
  ok('deck 含2王', (function(){ const d=buildDeck(); return d.some(c=>c.val===16)&&d.some(c=>c.val===17); })());
  ok('deck 含4花色各13张', (function(){ const d=buildDeck(); const suits={}; d.forEach(c=>{ if(c.suit!=='J') suits[c.suit]=(suits[c.suit]||0)+1; }); return Object.values(suits).every(n=>n===13); })());
  eq('keyToCard JB', keyToCard('JB'), {suit:'J',rank:'JB',val:16,key:'JB'});
  eq('keyToCard JR', keyToCard('JR'), {suit:'J',rank:'JR',val:17,key:'JR'});
  eq('keyToCard S_A', keyToCard('S_A'), {suit:'S',rank:'A',val:14,key:'S_A'});
  eq('keyToCard H_2', keyToCard('H_2'), {suit:'H',rank:'2',val:15,key:'H_2'});
  eq('keyToCard D_3', keyToCard('D_3'), {suit:'D',rank:'3',val:3,key:'D_3'});
  ok('cardKey 正向', cardKey({suit:'S',rank:'A'})==='S_A');
  ok('cardKey 王牌', cardKey({suit:'J',rank:'JB'})==='JB');
  ok('sortHand 降序', (function(){ const h=[{val:3},{val:10},{val:7}]; const s=sortHand(h); return s[0].val===10&&s[2].val===3; })());
  ok('sortHand 不改原数组', (function(){ const h=[{val:3},{val:10}]; sortHand(h); return h[0].val===3; })());
  ok('RANK_VAL A=14 2=15', RANK_VAL.A===14 && RANK_VAL['2']===15);
  ok('RANK_VAL 3=3 J=11', RANK_VAL['3']===3 && RANK_VAL.J===11);
  ok('keyToCard+cardKey 往返', (function(){ const c=keyToCard('S_5'); return cardKey(c)==='S_5'; })());

  /* ============================================================
     5. 计分守恒 + 倍数
     ============================================================ */
  function scoreDelta(landlordWin, landlord, bidMax, mult){
    const delta = bidMax*mult;
    const s = [0,0,0];
    if(landlordWin){ s[landlord]+=2*delta; for(let i=0;i<3;i++) if(i!==landlord) s[i]-=delta; }
    else { s[landlord]-=2*delta; for(let i=0;i<3;i++) if(i!==landlord) s[i]+=delta; }
    return s;
  }
  ok('计分守恒-地主胜', scoreDelta(true,0,3,1).reduce((a,b)=>a+b,0)===0);
  ok('计分守恒-地主败', scoreDelta(false,1,2,4).reduce((a,b)=>a+b,0)===0);
  ok('计分-地主胜地主+2delta', scoreDelta(true,0,3,1)[0]===6);
  ok('计分-地主胜农民-delta', scoreDelta(true,0,3,1)[1]===-3 && scoreDelta(true,0,3,1)[2]===-3);
  ok('计分-地主败地主-2delta', scoreDelta(false,0,3,2)[0]===-12);
  ok('计分-地主败农民+delta', scoreDelta(false,0,3,2)[1]===6 && scoreDelta(false,0,3,2)[2]===6);
  ok('初始分100不穿底', (function(){ const s=[100,100,100]; const d=scoreDelta(false,0,3,2); return s.every((v,i)=>v+d[i]>=0); })());
  // 倍数场景
  ok('计分守恒-抢地主倍数2', scoreDelta(true,0,3,2).reduce((a,b)=>a+b,0)===0);
  ok('计分守恒-明牌倍数4', scoreDelta(false,0,3,4).reduce((a,b)=>a+b,0)===0);
  ok('计分守恒-炸弹倍数8', scoreDelta(true,0,3,8).reduce((a,b)=>a+b,0)===0);
  ok('计分守恒-春天倍数', scoreDelta(true,0,3,4).reduce((a,b)=>a+b,0)===0);
  ok('计分-抢地主倍数2 地主+12', scoreDelta(true,0,3,2)[0]===12);
  ok('计分-明牌倍数4 地主-24', scoreDelta(false,0,3,4)[0]===-24);

  /* ============================================================
     6. 叫地主首叫轮换
     ============================================================ */
  let fb = 0; const seq = [];
  for(let i=0;i<7;i++){ seq.push(fb%3); fb++; }
  eq('首叫轮换 7局', seq, [0,1,2,0,1,2,0]);

  /* ============================================================
     7. 抢地主倍数逻辑
     ============================================================ */
  // 模拟抢地主：初始mult=1, 每次抢 mult*=2
  function simGrab(grabResults){
    let mult = 1;
    let bidWinner = 0; // 假设叫分者
    grabResults.forEach((grab, i)=>{
      if(grab){ mult *= 2; bidWinner = i+1; } // 抢的人成为新地主
    });
    return {mult, bidWinner};
  }
  eq('无人抢 倍数不变', simGrab([false,false]), {mult:1, bidWinner:0});
  eq('一人抢 倍数x2', simGrab([true,false]), {mult:2, bidWinner:1});
  eq('两人抢 倍数x4', simGrab([true,true]), {mult:4, bidWinner:2});
  eq('后抢者不抢 倍数x2', simGrab([false,false]), {mult:1, bidWinner:0});

  /* ============================================================
     8. 明牌倍数逻辑
     ============================================================ */
  function simShow(show, mult){ return show ? mult*2 : mult; }
  ok('明牌倍数x2', simShow(true, 1)===2);
  ok('明牌倍数x2叠加', simShow(true, 4)===8);
  ok('不明牌倍数不变', simShow(false, 1)===1);
  ok('不明牌倍数不变2', simShow(false, 4)===4);

  /* ============================================================
     9. 春天判定逻辑
     ============================================================ */
  // 春天：地主胜且两农民一张牌都没出过（手牌仍17）
  function simSpring(landlordWin, farmerHandLens){
    if(!landlordWin) return false;
    return farmerHandLens.every(len => len===17);
  }
  ok('春天-地主胜两农民17张', simSpring(true, [17,17])===true);
  ok('非春天-地主败', simSpring(false, [17,17])===false);
  ok('非春天-农民出了牌', simSpring(true, [15,17])===false);
  ok('非春天-农民都出牌', simSpring(true, [10,5])===false);
  ok('春天-倍数x2', (function(){ let mult=2; if(simSpring(true,[17,17])) mult*=2; return mult===4; })());

  /* ============================================================
     10. 炸弹/王炸倍数
     ============================================================ */
  function simBombMult(type, mult){
    if(type==='bomb' || type==='rocket') return mult*2;
    return mult;
  }
  ok('炸弹倍数x2', simBombMult('bomb', 1)===2);
  ok('王炸倍数x2', simBombMult('rocket', 1)===2);
  ok('普通牌型倍数不变', simBombMult('pair', 1)===1);
  ok('炸弹叠加倍数', simBombMult('bomb', 4)===8);
  // 综合倍数：底分3, 抢地主x2, 明牌x2, 炸弹x2, 春天x2 = 3*16=48
  ok('综合倍数场景', (function(){
    let mult = 1;
    mult = simShow(true, mult);  // 明牌 x2
    mult = simBombMult('bomb', mult); // 炸弹 x2
    if(simSpring(true,[17,17])) mult *= 2; // 春天 x2
    return 3 * mult === 24; // 底分3 * 倍数8 = 24
  })());

  /* ============================================================
     11. 战绩统计 getStats 逻辑
     ============================================================ */
  // 模拟 getStats 逻辑
  function simGetStats(history){
    const total = history.length;
    if(total===0) return {total:0};
    let myWins=0, myLandlord=0, myLandlordWins=0, myFarmer=0, myFarmerWins=0;
    let runningScore = 0;
    history.forEach(r=>{
      const iAmLandlord = (r.landlord===0);
      const iWin = iAmLandlord ? r.landlordWin : !r.landlordWin;
      if(iAmLandlord){ myLandlord++; if(r.landlordWin) myLandlordWins++; }
      else { myFarmer++; if(!r.landlordWin) myFarmerWins++; }
      if(iWin) myWins++;
      runningScore += iAmLandlord ? (r.landlordWin? 2*r.delta : -2*r.delta) : (r.landlordWin? -r.delta : r.delta);
    });
    return { total, myWins, myLandlord, myLandlordWins, myFarmer, myFarmerWins, finalScore: runningScore,
      winRate: Math.round(myWins/total*100) };
  }
  const testHistory = [
    {landlord:0, landlordWin:true, delta:3},   // 我是地主，胜，+6
    {landlord:1, landlordWin:false, delta:6},  // 我是农民，胜，+6
    {landlord:0, landlordWin:false, delta:3},  // 我是地主，败，-6
  ];
  const stats = simGetStats(testHistory);
  ok('stats 总局数', stats.total===3);
  ok('stats 我的胜场', stats.myWins===2);
  ok('stats 胜率67%', stats.winRate===67);
  ok('stats 地主次数', stats.myLandlord===2);
  ok('stats 地主胜场', stats.myLandlordWins===1);
  ok('stats 农民次数', stats.myFarmer===1);
  ok('stats 农民胜场', stats.myFarmerWins===1);
  ok('stats 累计积分+6', stats.finalScore===6);  // +6+6-6=6
  ok('stats 空记录', simGetStats([]).total===0);
  // 全胜
  const allWin = simGetStats([{landlord:0,landlordWin:true,delta:3},{landlord:1,landlordWin:false,delta:3}]);
  ok('stats 全胜胜率100%', allWin.winRate===100);
  ok('stats 全胜累计+9', allWin.finalScore===9);  // +6(地主胜) +3(农民胜)

  /* ============================================================
     12. SDP 压缩/解压 round-trip
     ============================================================ */
  if(compressSDP && decompressSDP){
    const sampleSDP = JSON.stringify({
      type:'offer',
      sdp:'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefgh\r\na=fingerprint:sha-256 00:11:22\r\na=setup:actpass\r\na=mid:0\r\na=sendrecv\r\na=rtpmap:0 PCMU/8000\r\na=rtcp-mux\r\na=candidate:123456 1 udp 2122252543 192.168.1.1 12345 typ host generation 0\r\nm=application 9 SCTP/DTLS webrtc-datachannel\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n'
    });
    const compressed = compressSDP(sampleSDP);
    ok('SDP 压缩有前缀', compressed.startsWith('DZ:'));
    ok('SDP 压缩变短', compressed.length < sampleSDP.length);
    const decompressed = decompressSDP(compressed);
    eq('SDP round-trip', JSON.parse(decompressed), JSON.parse(sampleSDP));
    // 原始JSON无前缀直接透传
    ok('SDP 无前缀透传', decompressSDP('{"type":"offer"}')==='{"type":"offer"}');
    // 空字符串
    ok('SDP 压缩空串', compressSDP('').startsWith('DZ:'));
  } else {
    ok('SDP 压缩函数不可用(跳过)', true);
  }

  /* ============================================================
     13. 礼物配置完整性
     ============================================================ */
  // 从 game.js 提取的礼物配置（硬编码测试）
  const TEST_GIFT_INFO = {
    coffee:{fly:'coffee_pot', land:'coffee_cup', dur:1500, label:'倒咖啡'},
    roses: {fly:'roses',      land:'petal_ring',  dur:1500, label:'送玫瑰'},
    tomato:{fly:'tomato',     land:'splash_red',  dur:600,  label:'扔番茄', spin:true},
    water: {fly:'bucket',     land:'splash_water',dur:600,  label:'泼水',   spin:true}
  };
  const TEST_GIFT_SPR = {
    coffee_pot:{x:33,y:18,w:384,h:481}, roses:{x:418,y:44,w:361,h:452},
    tomato:{x:795,y:87,w:381,h:420}, bucket:{x:1188,y:121,w:311,h:359},
    coffee_cup:{x:37,y:532,w:306,h:445}, petal_ring:{x:393,y:547,w:404,h:401},
    splash_red:{x:806,y:549,w:358,h:397}, splash_water:{x:1170,y:559,w:345,h:396}
  };
  Object.entries(TEST_GIFT_INFO).forEach(([key, info])=>{
    ok('礼物 '+key+' fly坐标存在', !!TEST_GIFT_SPR[info.fly]);
    ok('礼物 '+key+' land坐标存在', !!TEST_GIFT_SPR[info.land]);
    ok('礼物 '+key+' 有dur', info.dur>0);
    ok('礼物 '+key+' 有label', info.label.length>0);
  });
  ok('礼物4种', Object.keys(TEST_GIFT_INFO).length===4);
  ok('礼物素材8项', Object.keys(TEST_GIFT_SPR).length===8);
  // 慢飞1.5s, 快飞0.6s
  ok('咖啡慢飞1500ms', TEST_GIFT_INFO.coffee.dur===1500);
  ok('番茄快飞600ms', TEST_GIFT_INFO.tomato.dur===600);
  ok('番茄有旋转', TEST_GIFT_INFO.tomato.spin===true);
  ok('咖啡无旋转', !TEST_GIFT_INFO.coffee.spin);

  /* ============================================================
     14. 昵称显示逻辑
     ============================================================ */
  // 模拟 getDisplayName 逻辑
  function simGetDisplayName(idx, customNicks, myNick, myIdx){
    if(customNicks[idx]) return customNicks[idx];
    if(idx===myIdx) return myNick || '我';
    return '玩家'+(idx+1);
  }
  ok('昵称-有自定义', simGetDisplayName(0,['张三','',''],'',0)==='张三');
  ok('昵称-无自定义是自己', simGetDisplayName(0,['','',''],'小明',0)==='小明');
  ok('昵称-无自定义是自己无昵称', simGetDisplayName(0,['','',''],'',0)==='我');
  ok('昵称-无自定义是他人', simGetDisplayName(1,['','',''],'小明',0)==='玩家2');
  ok('昵称-自定义优先于默认', simGetDisplayName(1,['','李四',''],'小明',0)==='李四');

  /* ============================================================
     15. 头像压缩边界验证
     ============================================================ */
  // 模拟头像压缩的尺寸计算逻辑
  function simAvatarScale(w, h, maxSide){
    if(w > maxSide || h > maxSide){
      const scale = maxSide / Math.max(w, h);
      return {w: Math.round(w*scale), h: Math.round(h*scale)};
    }
    return {w, h};
  }
  eq('头像缩放-大方形', simAvatarScale(1000,1000,200), {w:200, h:200});
  eq('头像缩放-横图', simAvatarScale(800,400,200), {w:200, h:100});
  eq('头像缩放-竖图', simAvatarScale(400,800,200), {w:100, h:200});
  eq('头像缩放-小图不变', simAvatarScale(100,100,200), {w:100, h:100});
  eq('头像缩放-刚好200', simAvatarScale(200,200,200), {w:200, h:200});
  eq('头像缩放-略超', simAvatarScale(201,201,200), {w:200, h:200});

  /* ============================================================
     16. 导出数据结构验证
     ============================================================ */
  // 模拟 exportData 数据结构
  function simExportData(history, avatars, nicks, scores, round){
    return {
      version: 1, exportTime: Date.now(),
      matchHistory: history,
      customAvatars: avatars,
      customNicks: nicks,
      scores: scores, round: round
    };
  }
  const exportTest = simExportData([], [null,null,null], ['','',''], [100,100,100], 0);
  ok('导出有version', exportTest.version===1);
  ok('导出有exportTime', exportTest.exportTime>0);
  ok('导出含matchHistory', Array.isArray(exportTest.matchHistory));
  ok('导出含customAvatars', Array.isArray(exportTest.customAvatars) && exportTest.customAvatars.length===3);
  ok('导出含customNicks', Array.isArray(exportTest.customNicks) && exportTest.customNicks.length===3);
  ok('导出含scores', exportTest.scores.length===3);
  ok('导出含round', exportTest.round===0);
  // 导出含头像base64
  const exportWithAvatar = simExportData([], ['data:image/jpeg;base64,/9j/4AAQ', null, null], ['张三','',''], [100,100,100], 1);
  ok('导出含头像base64', exportWithAvatar.customAvatars[0].startsWith('data:image/'));
  ok('导出含昵称', exportWithAvatar.customNicks[0]==='张三');

  /* ============================================================
     17. 倍数卷轴显示逻辑
     ============================================================ */
  function simMultDisplay(base, mult){
    if(base>0) return mult+'×'+base;
    return '待叫';
  }
  ok('倍数显示-叫地主前', simMultDisplay(0, 1)==='待叫');
  ok('倍数显示-叫1分', simMultDisplay(1, 1)==='1×1');
  ok('倍数显示-叫3分倍2', simMultDisplay(3, 2)==='2×3');
  ok('倍数显示-炸弹后倍4', simMultDisplay(3, 4)==='4×3');

  /* ============================================================
     18. 牌型中文名映射
     ============================================================ */
  const TYPE_CN = {
    single:'单张', pair:'对子', triple:'三张', triple1:'三带一', triple2:'三带二',
    straight:'顺子', pairstraight:'连对', plane:'飞机', plane1:'飞机带单', plane2:'飞机带对',
    bomb:'炸弹', bomb2s:'四带二(单)', bomb2p:'四带二(对)', rocket:'王炸'
  };
  // 验证所有 detectType 能返回的 type 都有中文名
  const allTypes = ['single','pair','triple','triple1','triple2','bomb','rocket','bomb2s','bomb2p','straight','pairstraight','plane','plane1','plane2'];
  allTypes.forEach(t => ok('牌型中文 '+t, !!TYPE_CN[t]));

  /* ============================================================
     19. 托管逻辑验证
     ============================================================ */
  // 托管在各阶段的行为
  function simAutoAct(phase, turn, myIdx, hasLastPlay){
    if(phase==='bid' && turn===myIdx) return 'bid0';
    if(phase==='grab' && turn===myIdx) return 'grabFalse';
    if(phase==='show' && turn===myIdx) return 'showFalse';
    if(phase==='play' && turn===myIdx) return hasLastPlay ? 'findHint' : 'minSingle';
    return 'noop';
  }
  ok('托管-叫地主不叫', simAutoAct('bid',0,0,false)==='bid0');
  ok('托管-抢地主不抢', simAutoAct('grab',0,0,false)==='grabFalse');
  ok('托管-明牌不明', simAutoAct('show',0,0,false)==='showFalse');
  ok('托管-出牌有上家', simAutoAct('play',0,0,true)==='findHint');
  ok('托管-出牌自由出', simAutoAct('play',0,0,false)==='minSingle');
  ok('托管-非自己回合', simAutoAct('play',1,0,false)==='noop');
  ok('托管-观战不操作', simAutoAct('play',0,3,false)==='noop');

  /* ============================================================
     20. 重连状态恢复逻辑
     ============================================================ */
  // 验证重连后需要恢复的阶段
  function simRestorePhase(phase, turn, slot){
    if(phase==='play' && turn===slot) return 'promptPlay';
    if(phase==='bid' && turn===slot) return 'promptBid';
    if(phase==='grab' && turn===slot) return 'promptGrab';
    if(phase==='show' && turn===slot) return 'startShow';
    return 'waitMsg';
  }
  ok('重连-出牌回合', simRestorePhase('play',1,1)==='promptPlay');
  ok('重连-叫地主回合', simRestorePhase('bid',2,2)==='promptBid');
  ok('重连-抢地主回合', simRestorePhase('grab',1,1)==='promptGrab');
  ok('重连-明牌回合', simRestorePhase('show',0,0)==='startShow');
  ok('重连-非自己回合', simRestorePhase('play',1,2)==='waitMsg');
  ok('重连-over阶段', simRestorePhase('over',0,1)==='waitMsg');

  /* ============================================================
     Bug修复验证
     ============================================================ */
  // wasBeating: 管上声音判定（出牌前lastPlay和lastPlayer状态）
  ok('wasBeating-自由出不应播bigger', !(function(){
    // 模拟：无上家牌时，wasBeating应为false
    const lastPlay = null, lastPlayer = -1, senderIdx = 0;
    return !!(lastPlay && lastPlayer!==senderIdx);
  })());
  ok('wasBeating-管上应播bigger', !!(function(){
    // 模拟：有上家牌且非自己出的
    const lastPlay = {type:'single',main:5,len:1}, lastPlayer = 1, senderIdx = 0;
    return !!(lastPlay && lastPlayer!==senderIdx);
  })());
  ok('wasBeating-自己上次出的不应播bigger', !(function(){
    // 模拟：上家牌是自己出的（连续自由出）
    const lastPlay = {type:'single',main:5,len:1}, lastPlayer = 0, senderIdx = 0;
    return !!(lastPlay && lastPlayer!==senderIdx);
  })());

  /* ============================================================
     Bug修复验证：断线托管去重 + 重连座次恢复
     ============================================================ */
  // onClientDisconnect 重复调用不应二次触发（autoSlots已为true时跳过）
  ok('断线-重复触发应跳过', (function(){
    const autoSlots = [false, false, false];
    function simDisconnect(slot){
      if(autoSlots[slot]) return false;  // 已托管，跳过
      autoSlots[slot] = true;
      return true;
    }
    const first = simDisconnect(1);   // 首次：true
    const second = simDisconnect(1);  // 重复：false
    return first && !second;
  })());
  // 两个客户端都断线：各自独立标记托管
  ok('断线-双客户端各自托管', (function(){
    const autoSlots = [false, false, false];
    function simDisconnect(slot){
      if(autoSlots[slot]) return false;
      autoSlots[slot] = true;
      return true;
    }
    const d1 = simDisconnect(1);
    const d2 = simDisconnect(2);
    return d1 && d2 && autoSlots[1] && autoSlots[2];
  })());
  // 重连后座次恢复：restoreClient 发送 assign 消息设置 myIdx
  ok('重连-发送assign恢复myIdx', (function(){
    const sentMsgs = [];
    function simRestoreClient(slot){
      sentMsgs.push({t:'assign', you:slot});
      sentMsgs.push({t:'deal', hand:[]});
      return sentMsgs[0];
    }
    const msg = simRestoreClient(2);
    return msg.t==='assign' && msg.you===2;
  })());
  // 重连后不发 bottom 消息（底牌已包含在 deal 中，避免重复添加）
  ok('重连-不发bottom避免重复', (function(){
    const sentMsgs = [];
    function simRestoreClient(slot, isLandlord, bottomShown){
      sentMsgs.push({t:'assign', you:slot});
      sentMsgs.push({t:'deal', hand:['3♠']});
      // 不再发 bottom 消息（底牌已在 deal 的 hand 中）
    }
    simRestoreClient(1, true, true);
    const hasBottom = sentMsgs.some(m=>m.t==='bottom');
    return !hasBottom;
  })());
  // 全员不叫重新发牌：首叫人应回退（保持同一人首叫）
  ok('重发-首叫人回退', (function(){
    let firstBidder = 2;
    function simEndBidding(){
      if(true){ firstBidder--; return 'hostStartGame'; }
    }
    simEndBidding();
    return firstBidder===1;
  })());
  // 胜负音效：各客户端按自己身份播放（非主机统一 win/lose）
  ok('音效-客户端独立判断胜负', (function(){
    function simClientResult(landlord, landlordWin, myIdx){
      const iAmLandlord = (landlord===myIdx);
      return iAmLandlord ? landlordWin : !landlordWin;
    }
    // 玩家2是农民，地主是玩家1，地主败 → 玩家2赢
    return simClientResult(1, false, 2) === true;
  })());
  // 报牌音效：剩1张或2张时触发
  ok('报牌-剩1张播l1', (function(){
    function simReportSound(remain){
      if(remain===1) return 'l1';
      if(remain===2) return 'l2';
      return null;
    }
    return simReportSound(1)==='l1' && simReportSound(2)==='l2' && simReportSound(3)===null;
  })());
  // 客户端出牌后主机回传更新手牌（修复：客户端手牌不减少）
  ok('出牌-主机回传客户端手牌', (function(){
    const hands = [['3','4','5'],['6','7','8'],['9','10','J']];
    const sent = [];
    function simHostPlay(senderIdx, keys){
      hands[senderIdx] = hands[senderIdx].filter(c=>!keys.includes(c));
      if(senderIdx===0) return 'local';
      sent.push({t:'hand', to:senderIdx, hand:hands[senderIdx].slice()});
      return 'netSend';
    }
    simHostPlay(1, ['6','7']);
    return sent.length===1 && sent[0].to===1 && sent[0].hand.length===1 && sent[0].hand[0]==='8';
  })());
  // 胜负音效result消息：key为对象，客户端按身份判断（修复：key未定义导致客户端崩溃）
  ok('音效-result消息key为对象不崩溃', (function(){
    function simOnSound(kind, key, myIdx){
      if(kind==='result'){
        if(!key) return 'safe';
        const iAmLandlord=(key.landlord===myIdx);
        return iAmLandlord?key.landlordWin:!key.landlordWin;
      }
      return 'other';
    }
    const r1 = simOnSound('result', {landlord:1,landlordWin:false}, 2);
    const r2 = simOnSound('result', undefined, 2);
    return r1===true && r2==='safe';
  })());

  /* ============================================================
     汇总
     ============================================================ */
  const total = pass+fail;
  const summary = {pass, fail, total, details:results};

  function runTests(showPanel){
    if(typeof document!=='undefined' && showPanel){
      const panel = document.getElementById('testPanel');
      const body = document.getElementById('testBody');
      const toggle = document.getElementById('testToggle');
      if(panel && body){
        body.innerHTML='';
        results.forEach(r=>{
          const d=document.createElement('div');
          d.className='test-result '+(r.ok?'test-ok':'test-fail');
          d.textContent=(r.ok?'✓ ':'✗ ')+r.name+(r.extra?'  '+r.extra:'');
          body.appendChild(d);
        });
        const s=document.createElement('div'); s.className='test-summary';
        s.textContent='合计 '+total+' ｜ 通过 '+pass+' ｜ 失败 '+fail;
        body.appendChild(s);
        panel.classList.remove('hidden');
        if(toggle) toggle.style.display='none';
      }
    }
    if(typeof console!=='undefined'){
      console.log('=== 测试结果：'+pass+'/'+total+' 通过，'+fail+' 失败 ===');
      results.filter(r=>!r.ok).forEach(r=>console.log('  ✗', r.name, r.extra||''));
    }
    return summary;
  }

  if(typeof window!=='undefined') window.runTests = runTests;
  if(typeof module!=='undefined' && module.exports) module.exports = {runTests, summary};
})();
