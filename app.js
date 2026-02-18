// app.js (без import/module — працює при відкритті index.html з file://)

const TOPICS = window.PDR_TOPICS || [];
const QUESTIONS = window.PDR_QUESTIONS || [];

if (!TOPICS.length || !QUESTIONS.length) {
  console.error("Не завантажились питання. Перевір, що підключено data/questions.js ПЕРЕД app.js");
}

const LS = {
  profile: "pdrq_profile_v1",
  attempts: "pdrq_attempts_v1",
};

const $ = (id) => document.getElementById(id);
const fmt2 = (n) => String(n).padStart(2, "0");
const nowIso = () => new Date().toISOString();

function loadJSON(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch{ return fallback; }
}
function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function groupByTopic(questions){
  const m=new Map();
  for(const q of questions){
    if(!m.has(q.topic)) m.set(q.topic, []);
    m.get(q.topic).push(q);
  }
  return m;
}

/* =========================
   FIX: unique questions
   ========================= */

// нормалізація тексту питання для уникнення дублювань
function normalizeQuestionText(s){
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’'"]/g, "")      // прибираємо різні апострофи/лапки
    .replace(/[()]/g, "")
    .trim();
}

// повертає масив унікальних питань (по id + по нормалізованому тексту питання)
function uniqueQuestions(list){
  const seenId = new Set();
  const seenText = new Set();
  const out = [];

  for (const q of list) {
    if (!q) continue;
    if (seenId.has(q.id)) continue;

    const nt = normalizeQuestionText(q.question);
    if (nt && seenText.has(nt)) continue;

    seenId.add(q.id);
    if (nt) seenText.add(nt);
    out.push(q);
  }
  return out;
}

// вибір N випадкових УНІКАЛЬНИХ питань з пулу
function pickUniqueRandomQuestions(pool, n){
  const uniqPool = uniqueQuestions(pool);
  const picked = shuffle(uniqPool).slice(0, n);
  return picked;
}

const state = {
  view:"home",
  mode:null, // exam|topic|learn
  topic:null,
  questions:[],
  answers:new Map(),
  idx:0,
  timer:null,
  secondsLeft:0,
  startedAt:null,
  finishedAt:null,
  name:"",
};

const copFrames = {
  neutral:["assets/cop/idle_1.png","assets/cop/idle_2.png"],
  happy:["assets/cop/idle_1.png","assets/cop/idle_2.png"],
  angry:["assets/cop/idle_1.png","assets/cop/idle_2.png"],
};
let copAnim = { kind:"neutral", i:0, t:null };

function setCop(kind, line){
  const img=$("copImg");
  if(!img) return;
  copAnim.kind=kind; copAnim.i=0;
  if(line) $("copLine").textContent = line;
  img.src = copFrames[kind][0];
  if(copAnim.t) clearInterval(copAnim.t);
  copAnim.t=setInterval(()=>{
    copAnim.i=(copAnim.i+1)%copFrames[copAnim.kind].length;
    img.src=copFrames[copAnim.kind][copAnim.i];
  }, 380);
}

function setCopHomeAnim(){
  const img=$("copImgHome");
  if(!img) return;
  let i=0;
  setInterval(()=>{ i=(i+1)%2; img.src=copFrames.neutral[i]; }, 450);
}

function showView(which){
  ["viewHome","viewTest","viewResult","viewStats"].forEach(v=>$(v).classList.add("hidden"));
  if(which==="home") $("viewHome").classList.remove("hidden");
  if(which==="test") $("viewTest").classList.remove("hidden");
  if(which==="result") $("viewResult").classList.remove("hidden");
  if(which==="stats") $("viewStats").classList.remove("hidden");
  state.view=which;
}

function ensureName(){
  const name = $("inpName").value.trim() || "Гість";
  state.name=name;
  saveJSON(LS.profile,{name});
  return name;
}
function loadProfile(){
  const p=loadJSON(LS.profile,{name:""});
  if(p?.name) $("inpName").value=p.name;
  state.name=p?.name||"";
}

function startTimer(){
  stopTimer();
  tickTimer();
  state.timer=setInterval(()=>{
    state.secondsLeft--;
    tickTimer();
    if(state.secondsLeft<=0) finishTest(true);
  },1000);
}
function stopTimer(){ if(state.timer){clearInterval(state.timer); state.timer=null;} }
function tickTimer(){
  const s=Math.max(0,state.secondsLeft);
  $("timer").textContent = `${fmt2(Math.floor(s/60))}:${fmt2(s%60)}`;
}

/* =========================
   Start modes
   ========================= */

function startExam(){
  ensureName();
  state.mode="exam";
  state.topic="Випадкові";

  // FIX: унікальні питання в межах тесту
  state.questions = pickUniqueRandomQuestions(QUESTIONS, 20);

  state.answers=new Map();
  state.idx=0;
  state.startedAt=nowIso();
  state.finishedAt=null;
  state.secondsLeft=20*60;

  $("pillMode").textContent="🎮 Іспит";
  $("pillTopic").textContent="🎲 20 унікальних";
  $("learnExplain").classList.add("hidden");

  showView("test");
  setCop("neutral","“Іспит: без підказок і реакцій.”");
  startTimer();
  renderQuestion();
}

function startLearn(){
  ensureName();
  state.mode="learn";
  state.topic="Випадкові";

  // FIX: унікальні питання в межах тесту
  state.questions = pickUniqueRandomQuestions(QUESTIONS, 20);

  state.answers=new Map();
  state.idx=0;
  state.startedAt=nowIso();
  state.finishedAt=null;
  state.secondsLeft=0;

  $("pillMode").textContent="📚 Навчання";
  $("pillTopic").textContent="🎲 20 унікальних";
  $("timer").textContent="∞";
  $("learnExplain").classList.remove("hidden");

  showView("test");
  setCop("happy","“Навчання: відповів — отримав пояснення.”");
  stopTimer();
  renderQuestion();
}

function openTopics(){ $("topicPicker").classList.remove("hidden"); renderTopicList(); }
function closeTopics(){ $("topicPicker").classList.add("hidden"); }

function startTopic(topicId){
  ensureName();
  state.mode="topic";
  state.topic=topicId;

  const pool = QUESTIONS.filter(q=>q.topic===topicId);

  // FIX: унікальні питання навіть в межах теми
  state.questions = pickUniqueRandomQuestions(pool, Math.min(20, pool.length));

  state.answers=new Map();
  state.idx=0;
  state.startedAt=nowIso();
  state.finishedAt=null;
  state.secondsLeft=0;

  $("pillMode").textContent="🧩 Тема";
  $("pillTopic").textContent=`📌 ${topicId}`;
  $("timer").textContent="∞";
  $("learnExplain").classList.add("hidden");

  showView("test");
  setCop("neutral","“Тренуй тему. Результат побачиш у фіналі.”");
  stopTimer();
  renderQuestion();
}

function renderTopicList(){
  const list=$("topicList");
  list.innerHTML="";
  const grouped=groupByTopic(QUESTIONS);
  for(const t of TOPICS){
    const count=grouped.get(t.id)?.length||0;
    const el=document.createElement("div");
    el.className="topicCard";
    el.innerHTML=`
      <div class="topicTitle">${t.title}</div>
      <div class="topicDesc">${t.desc}</div>
      <div class="topicMeta">
        <span class="pill">Питань: <b>${count}</b></span>
        <span class="pill">Режим: тренування</span>
      </div>`;
    el.addEventListener("click",()=>{ closeTopics(); startTopic(t.id); });
    list.appendChild(el);
  }
}

/* =========================
   Render question
   ========================= */

function renderQuestion(){
  const q=state.questions[state.idx];
  if(!q) return;

  const total=state.questions.length;
  $("qIndex").textContent=`Питання ${state.idx+1}/${total}`;
  $("qText").textContent=q.question;

  const answered=state.answers.size;
  $("progressFill").style.width=`${(answered/total)*100}%`;
  $("miniAnswered").textContent=String(answered);
  $("miniLeft").textContent=String(Math.max(0,total-answered));

  if(q.image){
    $("qImageWrap").classList.remove("hidden");
    $("qImage").src=q.image;
  }else{
    $("qImageWrap").classList.add("hidden");
  }

  const selected=state.answers.get(q.id);
  const wrap=$("answers");
  wrap.innerHTML="";
  q.options.forEach((opt,i)=>{
    const a=document.createElement("div");
    a.className="answer"+(selected===i?" selected":"");
    const key=["1","2","3","4"][i] || String(i+1);
    a.innerHTML=`<div class="answerKey">${key}</div><div class="answerText">${opt}</div>`;
    a.addEventListener("click",()=>selectAnswer(i));
    wrap.appendChild(a);
  });

  if(state.mode==="learn"){
    const has=state.answers.has(q.id);
    $("learnExplain").classList.toggle("hidden", !has);
    if(has){
      $("learnText").textContent=q.explanation;
      const pick=state.answers.get(q.id);
      if(pick===q.correctIndex) setCop("happy","“О! Оце вже схоже на водія.”");
      else setCop("angry","“Нє-нє-нє. Перечитай пояснення.”");
    }else{
      setCop("neutral","“Вибирай відповідь. Потім поясню.”");
    }
  }else{
    setCop("neutral", state.mode==="exam" ? "“Тримай фокус. Підказок нема.”" : "“Тренуйся. Оцінка — у кінці.”");
    $("learnExplain").classList.add("hidden");
  }

  $("btnPrev").disabled = state.idx===0;
  $("btnNext").textContent = state.idx===total-1 ? "Останнє →" : "Далі →";
  $("btnFinish").classList.toggle("hidden", state.idx!==total-1);
  renderGrid();
}

function selectAnswer(i){
  const q=state.questions[state.idx];
  state.answers.set(q.id,i);
  renderQuestion();
}

function next(){
  const total=state.questions.length;
  if(state.idx<total-1){ state.idx++; renderQuestion(); }
  else finishTest(false);
}
function prev(){ if(state.idx>0){ state.idx--; renderQuestion(); } }

/* =========================
   Finish / Results
   ========================= */

function finishTest(byTimeout){
  stopTimer();
  state.finishedAt=nowIso();

  let correct=0;
  const mistakesByTopic={};
  for(const q of state.questions){
    const a=state.answers.get(q.id);
    if(a===q.correctIndex) correct++;
    else mistakesByTopic[q.topic]=(mistakesByTopic[q.topic]||0)+1;
  }
  const total=state.questions.length;
  const wrong=total-correct;
  const passed=wrong<=2;
  const percent=Math.round((correct/total)*100);

  const attempts=loadJSON(LS.attempts,[]);
  attempts.unshift({
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2),
    date: new Date().toLocaleString("uk-UA"),
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    mode: state.mode,
    topic: state.topic,
    total, correct, wrong, percent, passed,
    byTimeout: !!byTimeout,
    name: state.name,
    weakTopics: Object.entries(mistakesByTopic).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({topic:k,mistakes:v})),
  });
  saveJSON(LS.attempts, attempts);

  renderResult({correct,total,wrong,passed,percent,byTimeout});
  showView("result");
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function renderResult(meta){
  const {correct,total,wrong,passed,percent,byTimeout}=meta;
  $("resScore").textContent=`${correct}/${total}`;
  $("resPercent").textContent=`${percent}%`;
  $("resTitle").textContent = passed ? "✅ Іспит складено" : "❌ Іспит не складено";
  $("resMeta").textContent = `${state.name} · ${new Date().toLocaleString("uk-UA")}` + (byTimeout ? " · час вийшов" : "");
  $("resBadge").textContent = passed ? "Вітаємо! Права майже в кишені 🪪" : "Перездача. Без паніки — просто ще раз 💢";
  $("resBg").src = passed ? "assets/bg/pass.png" : "assets/bg/fail.png";

  const passLines=[
    "Ти реально непогано зайшов. Ще пару тренувань — і екзаменатор буде плакати від гордості.",
    "Легенда. Тепер — не “як-небудь”, а чітко за правилами.",
    "Рівень ‘Водій+’. Не розслабляйся — але це вже круто.",
  ];
  const failLines=[
    "Нічого страшного. Це не поразка — це туторіал, який ти пропустив.",
    "Зроби коло по слабких темах — і повернешся сюди вже з перемогою.",
    "Сьогодні штраф — завтра диплом. Погнали тренуватися.",
  ];
  $("motivation").textContent = passed ? passLines[Math.floor(Math.random()*passLines.length)]
                                       : failLines[Math.floor(Math.random()*failLines.length)];

  const list=$("reviewList");
  list.innerHTML="";
  state.questions.forEach((q,idx)=>{
    const userA=state.answers.get(q.id);
    const userText = userA===undefined ? "— (не відповів)" : q.options[userA];
    const correctText=q.options[q.correctIndex];
    const el=document.createElement("div");
    el.className="review";
    el.innerHTML=`
      <div class="reviewTop">
        <div class="reviewQ">${idx+1}. ${escapeHtml(q.question)}</div>
        <div class="reviewMeta">Тема: ${escapeHtml(q.topic)}</div>
      </div>
      <div class="reviewAns">
        <div><b>Твоя відповідь:</b> ${escapeHtml(userText)}</div>
        <div><b>Правильна відповідь:</b> ${escapeHtml(correctText)}</div>
      </div>
      <div class="reviewExp">${escapeHtml(q.explanation)}</div>
    `;
    list.appendChild(el);
  });

  buildResultCardCanvas({passed, correct, total, percent});
}

async function buildResultCardCanvas({passed, correct, total, percent}){
  const canvas=$("resCanvas");
  const ctx=canvas.getContext("2d");
  const bg=new Image();
  bg.src = passed ? "assets/bg/pass.png" : "assets/bg/fail.png";
  try{ await bg.decode(); }catch{}
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bg,0,0,canvas.width,canvas.height);

  ctx.fillStyle="rgba(0,0,0,0.55)";
  roundRect(ctx,80,120,1040,500,26); ctx.fill();

  ctx.fillStyle="rgba(255,255,255,0.95)";
  ctx.font="900 58px 'Press Start 2P', monospace";
  ctx.fillText(passed ? "ПОСВІДЧЕННЯ" : "ПЕРЕЗДАЧА",130,210);

  ctx.font="600 22px 'Press Start 2P', monospace";
  ctx.fillStyle="rgba(255,255,255,0.90)";
  const dt=new Date().toLocaleString("uk-UA");
  ctx.fillText(`Ім’я: ${state.name}`,130,275);
  ctx.fillText(`Дата: ${dt}`,130,315);
  ctx.fillText(`Результат: ${correct}/${total} (${percent}%)`,130,355);

  const verdict = passed ? "СКЛАДЕНО" : "НЕ СКЛАДЕНО";
  ctx.font="900 28px 'Press Start 2P', monospace";
  ctx.fillStyle = passed ? "rgba(124,255,214,0.95)" : "rgba(255,120,120,0.95)";
  ctx.fillText(verdict,130,420);

  ctx.font="500 16px 'Press Start 2P', monospace";
  ctx.fillStyle="rgba(255,255,255,0.70)";
  ctx.fillText("PDR Quest • навчальний тренажер",130,580);
}

function roundRect(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function downloadCanvas(){
  const canvas=$("resCanvas");
  const a=document.createElement("a");
  a.download=`PDR_Quest_${state.name.replaceAll(" ","_")}_${Date.now()}.png`;
  a.href=canvas.toDataURL("image/png");
  a.click();
}

/* ===== Grid & Stats ===== */

function renderGrid(){
  const grid=$("grid");
  grid.innerHTML="";
  const total=state.questions.length;
  for(let i=0;i<total;i++){
    const q=state.questions[i];
    const b=document.createElement("button");
    b.className="gridBtn" + (state.answers.has(q.id)?" answered":"") + (i===state.idx?" current":"");
    b.textContent=String(i+1);
    b.addEventListener("click",()=>{
      state.idx=i;
      $("gridModal").classList.add("hidden");
      renderQuestion();
    });
    grid.appendChild(b);
  }
}

function renderStats(){
  const attempts=loadJSON(LS.attempts,[]);
  $("stAttempts").textContent=String(attempts.length);
  if(attempts.length){
    const best=attempts.reduce((a,b)=> (b.correct>a.correct?b:a), attempts[0]);
    $("stBest").textContent=`${best.correct}/${best.total} (${best.percent}%)`;
    $("stLast").textContent=`${attempts[0].correct}/${attempts[0].total} (${attempts[0].percent}%)`;
  }else{
    $("stBest").textContent="—";
    $("stLast").textContent="—";
  }

  const agg={};
  for(const att of attempts){
    for(const wt of (att.weakTopics||[])){
      agg[wt.topic]=(agg[wt.topic]||0)+wt.mistakes;
    }
  }
  const rows=Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const weak=$("weakTopics");
  weak.innerHTML="";
  if(!rows.length){
    weak.innerHTML=`<div class="muted">Ще немає даних. Пройди кілька тестів — і я покажу слабкі теми.</div>`;
  }else{
    const max=rows[0][1]||1;
    for(const [topic,val] of rows){
      const el=document.createElement("div");
      el.className="weakRow";
      el.innerHTML=`
        <div class="weakName">${escapeHtml(topic)}</div>
        <div class="weakBar"><div class="weakFill" style="width:${Math.round((val/max)*100)}%"></div></div>
        <div class="weakVal">${val}</div>`;
      weak.appendChild(el);
    }
  }

  const hist=$("history");
  hist.innerHTML="";
  if(!attempts.length){
    hist.innerHTML=`<div class="muted">Історія порожня.</div>`;
  }else{
    attempts.slice(0,20).forEach(att=>{
      const el=document.createElement("div");
      el.className="histItem";
      el.innerHTML=`
        <div class="histLeft">
          <div class="histTitle">${att.passed?"✅":"❌"} ${att.correct}/${att.total} (${att.percent}%)</div>
          <div class="histMeta">${escapeHtml(att.date)} · ${att.mode==="exam"?"Іспит":att.mode==="learn"?"Навчання":"Тема"} · ${escapeHtml(att.topic)}</div>
        </div>
        <div class="histRight">${att.wrong} помил.</div>`;
      hist.appendChild(el);
    });
  }
}

function resetAll(){
  if(!confirm("Точно скинути ім’я та всю історію спроб?")) return;
  localStorage.removeItem(LS.profile);
  localStorage.removeItem(LS.attempts);
  loadProfile();
  alert("Готово. Дані очищено.");
}

/* ===== Bindings ===== */

function bindUI(){
  $("btnExam").addEventListener("click", startExam);
  $("btnLearn").addEventListener("click", startLearn);
  $("btnTopics").addEventListener("click", openTopics);
  $("btnCloseTopics").addEventListener("click", closeTopics);

  $("btnPrev").addEventListener("click", prev);
  $("btnNext").addEventListener("click", next);
  $("btnFinish").addEventListener("click", ()=>finishTest(false));

  $("btnGrid").addEventListener("click", ()=> $("gridModal").classList.remove("hidden"));
  $("btnCloseGrid").addEventListener("click", ()=> $("gridModal").classList.add("hidden"));
  $("gridModal").addEventListener("click", (e)=>{ if(e.target===$("gridModal")) $("gridModal").classList.add("hidden"); });

  $("btnHome").addEventListener("click", ()=>{ showView("home"); closeTopics(); });
  $("btnDownloadCard").addEventListener("click", downloadCanvas);

  $("btnStats").addEventListener("click", ()=>{ renderStats(); showView("stats"); });
  $("btnCloseStats").addEventListener("click", ()=> showView("home"));

  $("btnReset").addEventListener("click", resetAll);

  window.addEventListener("keydown",(e)=>{
    if(state.view!=="test") return;
    if(e.key==="ArrowLeft"){ e.preventDefault(); prev(); }
    if(e.key==="ArrowRight"){ e.preventDefault(); next(); }
    if(["1","2","3","4"].includes(e.key)){
      const idx=Number(e.key)-1;
      const q=state.questions[state.idx];
      if(q && idx<q.options.length) selectAnswer(idx);
    }
  });
}

function init(){
  loadProfile();
  bindUI();
  showView("home");
  setCopHomeAnim();
}
document.addEventListener("DOMContentLoaded", init);
