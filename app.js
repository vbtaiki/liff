/* バリューブックス LIFF買取 — プロトタイプ
 * 認証はLINE Loginのみ（メール/パス不要）。customer_id を正、line_user_id を紐付け。
 * 本番: Next.js + Auth.js(LINE Provider) + LIFF + 買取API(Cloud Run/PostgreSQL)
 */

// ▼ 本番でLINE DevelopersのLIFF IDを設定。未設定ならブラウザ確認用のモックで動く。
const LIFF_ID = "";

const state = {
  profile: null,          // { userId(line), displayName, pictureUrl }
  customerId: null,       // VBの正ID（本番はAPIで発行/解決）
  isReturning: false,     // 2回目以降→本人確認スキップ
  books: 30,
  genres: [],
  box: "1",
  zip: "", addr: "", addr2: "",
  pickup: "",
  pay: "points",
  docImg: false, faceImg: false,
};

/* ---------- LIFF 初期化（LINEログインのみ） ---------- */
async function initLiff(){
  const lead = document.getElementById("heroLead");
  try{
    if (window.liff && LIFF_ID){
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()){ liff.login(); return; }
      const p = await liff.getProfile();
      state.profile = { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl };
      // 本番: POST /api/customers/resolve { lineUserId } → { customerId, isReturning, kycDone }
      resolveCustomer(state.profile.userId);
    } else {
      // ▼ ブラウザ確認用モック（LINE外）
      state.profile = { userId:"Umock_demo", displayName:"中村 大樹", pictureUrl:null };
      resolveCustomer(state.profile.userId);
    }
  }catch(e){
    console.warn("LIFF init fallback:", e);
    state.profile = { userId:"Umock_demo", displayName:"中村 大樹", pictureUrl:null };
    resolveCustomer(state.profile.userId);
  }
  if (lead && state.profile){
    lead.textContent = `${state.profile.displayName}さん、こんにちは。LINEから、かんたんに本の買取をお申し込みいただけます。`;
  }
}

/* customer_id 解決（本番はAPI。ここはモック） */
function resolveCustomer(lineUserId){
  state.customerId = "VB-" + Math.abs(hash(lineUserId)).toString(36).toUpperCase().slice(0,8);
  state.isReturning = false; // デモは新規。本番はKYC済みフラグで判定
  // プロフィールチップ
  const chip = document.getElementById("userChip");
  const nameEl = document.getElementById("userName");
  const av = document.getElementById("userAvatar");
  if (state.profile){
    nameEl.textContent = state.profile.displayName;
    if (state.profile.pictureUrl){ av.src = state.profile.pictureUrl; }
    else { av.src = avatarFallback(state.profile.displayName); }
    chip.hidden = false;
  }
  if (state.isReturning){
    document.getElementById("returningHint").hidden = false;
  }
}

/* ---------- 画面遷移 ---------- */
const order = ["welcome","step-books","step-pickup","step-payment","step-kyc","confirm","complete"];
const stepScreens = ["step-books","step-pickup","step-payment","step-kyc"];
const stepNames = { "step-books":"本の情報", "step-pickup":"集荷", "step-payment":"受取方法", "step-kyc":"本人確認" };

function show(screen){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  const el = document.querySelector(`[data-screen="${screen}"]`);
  el.classList.add("active");
  window.scrollTo({top:0,behavior:"instant"});

  // 進捗バー
  const bar = document.getElementById("stepsBar");
  const i = stepScreens.indexOf(screen);
  if (i >= 0){
    bar.hidden = false;
    document.getElementById("stepsFill").style.width = ((i+1)/4*100) + "%";
    document.getElementById("stepNow").textContent = i+1;
    document.getElementById("stepName").textContent = stepNames[screen];
  } else {
    bar.hidden = true;
  }
  if (screen === "confirm") buildSummary();
  if (screen === "complete") buildComplete();
}

function go(screen){
  // 本人確認スキップ（2回目以降）
  if (screen === "step-kyc" && state.isReturning){ show("confirm"); return; }
  show(screen);
}
function back(){
  const cur = document.querySelector(".screen.active").dataset.screen;
  let idx = order.indexOf(cur);
  let prev = order[Math.max(0, idx-1)];
  if (prev === "step-kyc" && state.isReturning) prev = "step-payment";
  show(prev);
}

/* ---------- 各種インタラクション ---------- */
function bind(){
  // next / back
  document.querySelectorAll("[data-next]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.next)));
  document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",back));

  // counter
  document.querySelectorAll("[data-count]").forEach(b=>b.addEventListener("click",()=>{
    const step = 5;
    state.books = Math.max(5, state.books + (b.dataset.count==="+"?step:-step));
    document.getElementById("bookCount").value = state.books;
  }));

  // genre chips
  document.querySelectorAll("#genreChips [data-chip]").forEach(c=>c.addEventListener("click",()=>{
    c.classList.toggle("active");
    state.genres = [...document.querySelectorAll("#genreChips .chip.active")].map(x=>x.textContent);
  }));

  // box segmented
  document.querySelectorAll("#boxSeg [data-box]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("#boxSeg .seg__btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); state.box = b.dataset.box;
    document.getElementById("boxHint").hidden = (b.dataset.box !== "kit");
  }));

  // zip search (mock)
  document.getElementById("zipBtn").addEventListener("click",()=>{
    const z = document.getElementById("zip").value.replace(/[^0-9]/g,"");
    if (z.length >= 3){ document.getElementById("addr").value = "長野県上田市中央"; }
  });
  document.querySelectorAll("#dateChips [data-date]").forEach(c=>c.addEventListener("click",()=>{
    document.querySelectorAll("#dateChips .chip").forEach(x=>x.classList.remove("active"));
    c.classList.add("active"); state.pickup = c.textContent;
  }));

  // payment toggle
  document.querySelectorAll('input[name="pay"]').forEach(r=>r.addEventListener("change",()=>{
    state.pay = document.querySelector('input[name="pay"]:checked').value;
    document.getElementById("bankFields").hidden = (state.pay !== "cash");
  }));

  // uploads
  document.querySelectorAll("[data-upload]").forEach(inp=>inp.addEventListener("change",e=>{
    const f = e.target.files[0]; if(!f) return;
    const slot = document.querySelector(`[data-slot="${inp.dataset.upload}"]`);
    const reader = new FileReader();
    reader.onload = ev=>{
      slot.classList.add("filled");
      slot.innerHTML = `<img src="${ev.target.result}" alt="" />`;
      if (inp.dataset.upload==="doc") state.docImg = true; else state.faceImg = true;
    };
    reader.readAsDataURL(f);
  }));

  // agree → submit enable
  document.getElementById("agree").addEventListener("change",e=>{
    document.getElementById("submitBtn").disabled = !e.target.checked;
  });
  document.getElementById("submitBtn").addEventListener("click",submit);
  document.getElementById("restartBtn").addEventListener("click",()=>show("welcome"));
}

/* ---------- 確認サマリー ---------- */
function buildSummary(){
  const payLabel = state.pay==="points" ? "VBポイント（+10%）" : "銀行振込";
  const rows = [
    ["お名前（LINE）", state.profile?.displayName || "—"],
    ["会員ID", state.customerId || "—"],
    ["冊数のめやす", state.books + " 冊"],
    ["ジャンル", state.genres.length? state.genres.join("・") : "未選択"],
    ["箱数", state.box==="kit" ? "集荷キットを送付" : state.box+"箱"],
    ["集荷先", (document.getElementById("addr").value||"") + " " + (document.getElementById("addr2").value||"") || "未入力"],
    ["集荷希望", state.pickup || "未選択"],
    ["受取方法", payLabel, state.pay==="points"],
    ["本人確認", state.isReturning ? "前回完了（スキップ）" : (state.docImg&&state.faceImg ? "書類・顔写真 提出済み" : "未提出")],
  ];
  document.getElementById("summary").innerHTML = rows.map(([k,v,hl])=>
    `<div class="summary__row"><span class="summary__k">${k}</span><span class="summary__v ${hl?'hl':''}">${v}</span></div>`
  ).join("");
}

/* ---------- 送信（本番: POST /api/buyback/applications） ---------- */
function submit(){
  showOverlay("お申し込みを送信しています…");
  // 本番ペイロード例：
  const payload = {
    lineUserId: state.profile?.userId,
    customerId: state.customerId,
    books: state.books, genres: state.genres, box: state.box,
    pickup: { zip: document.getElementById("zip").value, addr: document.getElementById("addr").value,
              addr2: document.getElementById("addr2").value, date: state.pickup },
    payment: state.pay,
    kyc: state.isReturning ? { reuse:true } : { doc: state.docImg, face: state.faceImg },
  };
  console.log("POST /api/buyback/applications", payload);
  setTimeout(()=>{
    hideOverlay();
    // 本番: liff.sendMessages() でトークに控えを送る / Push予約（72時間シナリオ）
    show("complete");
  }, 1400);
}

/* ---------- 完了画面 ---------- */
function buildComplete(){
  const name = state.profile?.displayName || "";
  document.getElementById("doneTitle").textContent = `${name}さん、ありがとうございました`;
  document.getElementById("doneLead").textContent =
    state.box==="kit"
    ? "集荷キット（段ボール）を発送します。届いたら本を詰めて、送るだけ。"
    : "集荷の手配をしました。本が届きしだい、1点1点ていねいに査定します。";
}

/* ---------- utils ---------- */
function showOverlay(t){ let o=document.querySelector(".overlay"); if(!o){o=document.createElement("div");o.className="overlay";o.innerHTML='<div class="spinner"></div><p></p>';document.body.appendChild(o);} o.querySelector("p").textContent=t; o.classList.add("show"); }
function hideOverlay(){ document.querySelector(".overlay")?.classList.remove("show"); }
function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return h; }
function avatarFallback(name){
  const c="#2F6B4F", t=(name||"V").slice(0,1);
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52'><rect width='52' height='52' fill='${c}'/><text x='50%' y='54%' font-size='22' fill='white' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${t}</text></svg>`;
  return "data:image/svg+xml;utf8,"+encodeURIComponent(svg);
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded",()=>{ bind(); initLiff(); });
