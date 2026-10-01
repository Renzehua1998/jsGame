/* ============================================================
   cards.js - 卡牌素材坐标 + 卡牌/素材渲染辅助
   ============================================================ */
const SHEET_W = 1536, SHEET_H = 1024;
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VAL = {A:14,2:15,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
const ROWS = {
  S:{x:[18,82,146,210,273,336,399,462,525,588,651,712,773],w:[60,60,60,59,59,59,59,59,59,59,56,56,57],y:9,h:96},
  H:{x:[18,82,146,210,273,336,399,462,525,588,651,712,773],w:[60,60,60,59,59,59,59,59,59,59,56,57,57],y:105,h:96},
  D:{x:[18,82,146,210,273,336,399,462,525,588,651,712,773],w:[60,60,60,59,59,59,59,59,59,59,56,57,57],y:201,h:100},
  C:{x:[18,81,146,209,273,336,399,462,525,588,651,712,772],w:[60,61,60,60,59,59,59,59,59,59,56,57,58],y:301,h:93}
};
const JOKER = {JB:{x:17,y:403,w:110,h:154}, JR:{x:139,y:403,w:113,h:154}};
const BACK_RECT = {x:265,y:403,w:103,h:154};
const FAN_RECT  = {x:380,y:410,w:210,h:143};
const SPR = {
  char_landlord:{x:856,y:25,w:255,h:378}, char_peasant1:{x:1114,y:62,w:209,h:334}, char_peasant2:{x:1324,y:74,w:194,h:323},
  avatar_landlord:{x:1043,y:417,w:147,h:155}, avatar_peasant1:{x:1205,y:417,w:147,h:155}, avatar_peasant2:{x:1366,y:417,w:148,h:156},
  icon_bomb:{x:633,y:459,w:291,h:161}, icon_rocket:{x:933,y:467,w:117,h:176}, icon_crown:{x:1157,y:583,w:76,h:63},
  badge_landlord:{x:1263,y:590,w:104,h:54}, badge_peasant:{x:1395,y:590,w:104,h:54},
  banner_victory:{x:1074,y:662,w:221,h:108}, banner_defeat:{x:1316,y:663,w:193,h:100},
  btn_no_call:{x:20,y:581,w:131,h:83}, btn_1:{x:157,y:581,w:102,h:83}, btn_2:{x:265,y:581,w:104,h:83}, btn_3:{x:376,y:581,w:105,h:83}, btn_call_landlord:{x:489,y:582,w:132,h:83},
  btn_pass:{x:20,y:676,w:155,h:80}, btn_hint:{x:194,y:676,w:172,h:80}, btn_play:{x:384,y:677,w:187,h:79},
  icon_volume:{x:600,y:679,w:64,h:70}, icon_mute:{x:675,y:679,w:64,h:70}, icon_settings:{x:750,y:679,w:66,h:71}, icon_chat:{x:828,y:679,w:66,h:70}, icon_help:{x:907,y:679,w:66,h:71}, icon_undo:{x:986,y:679,w:67,h:71},
  player_card1:{x:16,y:779,w:213,h:119}, player_card2:{x:241,y:781,w:215,h:110}, player_card3:{x:467,y:781,w:215,h:111},
  clock_timer:{x:702,y:777,w:103,h:116}, sign_round:{x:825,y:782,w:165,h:54}, sign_score:{x:826,y:842,w:164,h:56},
  speech_bubble:{x:1349,y:783,w:146,h:77}, scroll_paper:{x:1338,y:869,w:177,h:114}
};
const TILE_RECT = {17:{x:23,y:921,w:50,h:68},16:{x:82,y:922,w:50,h:68},15:{x:142,y:921,w:50,h:68},14:{x:201,y:921,w:50,h:68},13:{x:260,y:921,w:50,h:68},12:{x:320,y:921,w:49,h:68},11:{x:379,y:921,w:50,h:68},10:{x:438,y:921,w:49,h:68},9:{x:496,y:921,w:49,h:68},8:{x:555,y:922,w:48,h:67},7:{x:612,y:921,w:46,h:68},6:{x:667,y:921,w:47,h:68},5:{x:722,y:922,w:47,h:67},4:{x:778,y:922,w:46,h:67},3:{x:833,y:921,w:46,h:68},2:{x:888,y:921,w:45,h:68},1:{x:943,y:921,w:46,h:68}};

function rectOf(card){
  if(card.suit==='J') return JOKER[card.rank];
  const r = ROWS[card.suit], idx = RANKS.indexOf(card.rank);
  return {x:r.x[idx], y:r.y, w:r.w[idx], h:r.h};
}
function cardKey(c){ return c.suit==='J' ? c.rank : c.suit+'_'+c.rank; }
function keyToCard(k){
  if(k==='JB') return {suit:'J',rank:'JB',val:16,key:'JB'};
  if(k==='JR') return {suit:'J',rank:'JR',val:17,key:'JR'};
  const [s,r] = k.split('_');
  return {suit:s, rank:r, val:RANK_VAL[r], key:k};
}
function buildDeck(){
  const d=[];
  for(const s of ['S','H','D','C']) for(const r of RANKS) d.push(keyToCard(s+'_'+r));
  d.push(keyToCard('JB')); d.push(keyToCard('JR'));
  return d;
}
function sortHand(a){ return a.slice().sort((p,q)=> q.val-p.val || (p.suit<q.suit?-1:1)); }

function makeCardEl(card, cls){
  const r = rectOf(card), s = cls==='sm'?0.42: cls==='lg'?0.6: cls==='xs'?0.34:0.62;
  const el = document.createElement('div');
  el.className = 'card ' + (cls||'');
  el.style.width  = (r.w*s)+'px';
  el.style.height = (r.h*s)+'px';
  el.style.backgroundSize = (SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  el.style.backgroundPosition = (-r.x*s)+'px '+(-r.y*s)+'px';
  el.dataset.key = cardKey(card);
  return el;
}
function makeBackEl(cls){
  const s = cls==='sm'?0.42:0.5;
  const r = BACK_RECT;
  const el = document.createElement('div');
  el.className = 'card '+(cls||'');
  el.style.width=(r.w*s)+'px'; el.style.height=(r.h*s)+'px';
  el.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  el.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  return el;
}
function makeSpriteEl(name, scale, extraClass){
  const r = SPR[name]; if(!r) return document.createElement('div');
  const s = scale||0.5;
  const el = document.createElement('div');
  el.className = 'card sprite '+(extraClass||'');
  el.style.width=(r.w*s)+'px'; el.style.height=(r.h*s)+'px';
  el.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  el.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  return el;
}
function makeTileEl(num, scale){
  const r = TILE_RECT[num]; if(!r) return null;
  const s = scale||0.5;
  const el = document.createElement('div');
  el.className='card tile';
  el.style.width=(r.w*s)+'px'; el.style.height=(r.h*s)+'px';
  el.style.backgroundSize=(SHEET_W*s)+'px '+(SHEET_H*s)+'px';
  el.style.backgroundPosition=(-r.x*s)+'px '+(-r.y*s)+'px';
  return el;
}

if(typeof window!=='undefined') window.__cards = {rectOf,cardKey,keyToCard,buildDeck,sortHand,makeCardEl,makeBackEl,makeSpriteEl,makeTileEl,SHEET_W,SHEET_H,ROWS,JOKER,BACK_RECT,FAN_RECT,SPR,TILE_RECT,RANKS,RANK_VAL};
if(typeof module!=='undefined' && module.exports){
  module.exports = {rectOf,cardKey,keyToCard,buildDeck,sortHand,SHEET_W,SHEET_H,ROWS,JOKER,BACK_RECT,FAN_RECT,SPR,TILE_RECT,RANKS,RANK_VAL};
}
