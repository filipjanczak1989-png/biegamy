// silnik-anim.js — wspoldzielona warstwa animacji Silnika Momentu (KM6 Slice E).
// Uzywana przez zawodnik.html (baner->animacja) i trener.html (podglad "Obejrzyj").
// Wyekstrahowane 0-roznicy z zawodnik.html (linie 4102-4482). NIE refactoruj logiki tu — to dzialajacy kod 5 animacji.
// Zaleznosci zewn.: window.escapeHtml (sb.js). Animacja 'dystans' dodatkowo: window.SilnikMomentu (js/silnik-momentu.js — tylko zawodnik).

// ── ANIMACJA WOLUMENU (Slice 4 — skóra Story, DEBUG-ONLY) ──
// Kontrakt: moment.type==='wolumen' z evidence.slupki[] (6× {label,km,peak}).
window._silnikPokazAnimacje = function(moment, imie){
  try{
    if(!moment) return;
    if(moment.type==='wolumen' && moment.evidence && moment.evidence.slupki) return _silnikRenderAnimWolumen(moment.evidence, imie);
    if(moment.type==='dystans' && moment.evidence) return _silnikRenderAnimDystans(moment.evidence, moment.suma_km, imie);
    if(moment.type==='top5' && moment.ranking) return _silnikRenderAnimTop5(moment, imie);
    if(moment.type==='najdluzszy' && moment.evidence) return _silnikRenderAnimNajdluzszy(moment.evidence, imie);
    if(moment.type==='najmocniejsza' && moment.ranking) return _silnikRenderAnimNajmocniejsza(moment, imie);
    console.warn('[silnik-anim] brak animacji dla typu:', moment.type);
  }catch(e){ console.error('[silnik-anim] błąd:', e); }
};
function _silnikZamknijAnim(){ const o=document.getElementById('silnik-anim-overlay'); if(o) o.remove(); }

// Wspólne efekty animacji (DRY — używane przez wolumen i dystans). Easingi/burst/flash/countUp identyczne jak inline.
const _silnikFx = {
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeBack: t => { const c=1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); }, // ODBICIE
  easeCount: p => 0.5 - Math.cos(p*Math.PI)/2,
  growBar(b, dur, easeFn, done){                                       // wzrost słupka (wolumen + top5)
    const t0 = performance.now();
    (function step(t){ const p=Math.min(1,(t-t0)/dur); b.el.style.height=(b.h*easeFn(p))+'px';
      if(p<1) requestAnimationFrame(step); else { b.el.style.height=b.h+'px'; if(done) done(); } })(performance.now());
    b.kmLabel.style.opacity='1';
  },
  countUp(el, target){ const t0=performance.now(), dur=950;
    (function step(t){ const p=Math.min(1,(t-t0)/dur); el.firstChild.textContent=Math.round(target*(0.5-Math.cos(p*Math.PI)/2)); if(p<1) requestAnimationFrame(step); })(performance.now()); },
  burst(cx, cy, n){ n=n||16;                                            // 16 iskier z punktu (cx,cy)
    for(let i=0;i<n;i++){ const ang=(i/n)*Math.PI*2, dist=70+Math.random()*70, p=document.createElement('div');
      p.style.cssText='position:fixed;left:'+cx+'px;top:'+cy+'px;width:7px;height:7px;border-radius:50%;background:var(--accent2,#ff7040);box-shadow:0 0 8px rgba(var(--accent-rgb,232,86,30),.9);pointer-events:none;z-index:100002;';
      document.body.appendChild(p);
      p.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},
        {transform:`translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px)) scale(.3)`,opacity:0}],
        {duration:700+Math.random()*350,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>p.remove();
    }
  },
  flash(parent){ const f=document.createElement('div'); f.style.cssText='position:absolute;inset:0;background:var(--accent,#e8561e);opacity:0;pointer-events:none;z-index:1;';
    parent.appendChild(f); f.animate([{opacity:0},{opacity:.55},{opacity:0}],{duration:520,easing:'ease-out'}).onfinish=()=>f.remove(); },
};

function _silnikRenderAnimWolumen(ev, imie){
  _silnikZamknijAnim();
  const slupki = ev.slupki || [];
  if(!slupki.length){ console.warn('[silnik-anim] brak słupków'); return; }
  const peakKm = ev.suma_km, prevMax = ev.poprzednie_max;
  const delta = Math.round((peakKm - prevMax) * 10) / 10;
  const maxKm = Math.max.apply(null, slupki.map(s=>s.km).concat(1)) * 1.1;   // headroom ~1.1
  const MAXH = 210;
  let peakIdx = slupki.findIndex(s=>s.peak); if(peakIdx < 0) peakIdx = slupki.length - 1;
  const esc = window.escapeHtml || (s=>String(s));
  const MIES = ['STYCZEŃ','LUTY','MARZEC','KWIECIEŃ','MAJ','CZERWIEC','LIPIEC','SIERPIEŃ','WRZESIEŃ','PAŹDZIERNIK','LISTOPAD','GRUDZIEŃ'];
  const miesiac = MIES[new Date().getMonth()];

  const o = document.createElement('div'); o.id='silnik-anim-overlay';
  o.style.cssText='position:fixed;inset:0;z-index:100000;overflow:hidden;background:radial-gradient(120% 75% at 50% 8%,rgba(var(--accent-rgb,232,86,30),.22),#0c0710 55%,#07070a 100%),#07070a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif;';
  o.innerHTML = `
    <button id="silnik-anim-close" aria-label="Zamknij" style="position:absolute;top:18px;right:18px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;z-index:5;">×</button>
    <div data-el="eyebrow" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent,#e8561e);">Najmocniejszy tydzień ostatnich miesięcy</div>
    <div data-el="big" style="font-family:'Bebas Neue',sans-serif;font-size:148px;line-height:.86;color:#fff;margin:6px 0 2px;text-shadow:0 0 50px rgba(var(--accent-rgb,232,86,30),.45);">0<span style="font-size:40px;color:var(--accent,#e8561e);"> km</span></div>
    <div data-el="footer" style="opacity:0;transform:translateY(10px);transition:opacity .6s,transform .6s;text-align:center;">
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:#8a8693;letter-spacing:.06em;">Poprzedni rekord ${prevMax} km · <span style="color:var(--accent2,#ff7040);">+${delta} km</span></div>
      <div style="font-family:'DM Sans',sans-serif;font-size:17px;color:#fff;margin-top:6px;font-weight:600;">${imie ? esc(imie)+', t' : 'T'}o już nie przypadek.</div>
    </div>
    <div data-el="bars" style="display:flex;align-items:flex-end;justify-content:center;gap:11px;height:${MAXH+30}px;margin-top:40px;"></div>
    <div data-el="brand" style="opacity:0;transition:opacity .8s;position:absolute;bottom:22px;left:0;right:0;text-align:center;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.3em;color:#66636e;">BIEGAMY · ${miesiac}</div>
    <button data-el="replay" style="opacity:0;pointer-events:none;transition:opacity .5s;position:absolute;bottom:50px;right:22px;width:44px;height:44px;border-radius:50%;background:rgba(var(--accent-rgb,232,86,30),.16);border:1px solid var(--accent,#e8561e);color:var(--accent,#e8561e);font-size:20px;cursor:pointer;z-index:5;">↻</button>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector('[data-el="'+s+'"]');
  o.querySelector('#silnik-anim-close').onclick = _silnikZamknijAnim;
  o.addEventListener('click', e=>{ if(e.target===o) _silnikZamknijAnim(); });

  const barsWrap = $('bars'); const barEls = [];
  slupki.forEach(s=>{
    const col = document.createElement('div');
    col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:7px;width:40px;';
    const h = Math.max(5, Math.round(s.km/maxKm*MAXH));
    col.innerHTML = `
      <div data-kmlabel style="opacity:0;transition:opacity .3s;font-family:'DM Mono',monospace;font-size:10px;color:${s.peak?'var(--accent,#e8561e)':'#8a8693'};">${s.km}</div>
      <div data-bar style="width:100%;height:0;border-radius:7px 7px 0 0;background:${s.peak?'linear-gradient(180deg,var(--accent2,#ff7040),var(--accent,#e8561e))':'rgba(255,255,255,.13)'};${s.peak?'box-shadow:0 0 26px rgba(var(--accent-rgb,232,86,30),.6);':''}"></div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:#66636e;">${s.label}</div>`;
    barsWrap.appendChild(col);
    barEls.push({ el: col.querySelector('[data-bar]'), kmLabel: col.querySelector('[data-kmlabel]'), h });
  });

  // ── CHOREOGRAFIA (Story na danych evidence.slupki) — efekty z _silnikFx ──
  const STEP=340, BAR_DUR=520, PEAK_PAUSE=200, PEAK_DUR=720;
  requestAnimationFrame(()=>{
    const eb=$('eyebrow'); eb.style.opacity='1'; eb.style.transform='translateY(0)';
    let delay=320;
    barEls.forEach((b,i)=>{ if(i===peakIdx) return; setTimeout(()=>_silnikFx.growBar(b,BAR_DUR,_silnikFx.easeOutCubic),delay); delay+=STEP; }); // słupki +340ms
    const peakStart=delay+PEAK_PAUSE;                                                                                     // peak +200ms pauza
    setTimeout(()=>{
      _silnikFx.growBar(barEls[peakIdx], PEAK_DUR, _silnikFx.easeBack, ()=>{ // PEAK z odbiciem → kulminacja
        const r=barEls[peakIdx].el.getBoundingClientRect();
        _silnikFx.burst(r.left+r.width/2, r.top, 16); _silnikFx.flash(o); _silnikFx.countUp($('big'), peakKm);
        const ft=$('footer'); ft.style.opacity='1'; ft.style.transform='translateY(0)'; $('brand').style.opacity='1';
      });
    }, peakStart);
    setTimeout(()=>{ const r=$('replay'); r.style.opacity='1'; r.style.pointerEvents='auto'; r.onclick=()=>_silnikRenderAnimWolumen(ev,imie); }, peakStart+PEAK_DUR+1300);
  });
}

// ── ANIMACJA DYSTANSU (Slice 5 — podróż przez świat, DEBUG-ONLY) ──
// Kontrakt: moment.type==='dystans', evidence={miasto,dystans_miasta:prog,kontynent,poprzednie_miasto,start,rok}, +moment.suma_km (roczna).
function _silnikRenderAnimDystans(ev, suma, imie){
  _silnikZamknijAnim();
  const SM=window.SilnikMomentu, cele=SM._dystansCele, sroda=SM._dystansSroda, hav=SM._haversineKm;
  const esc = window.escapeHtml || (s=>String(s));
  const reached = cele.find(c=>c.miasto===ev.miasto);
  if(!reached){ console.warn('[silnik-anim] nieznane miasto', ev.miasto); return; }
  const idx = cele.indexOf(reached);
  const startLabel = ev.start || 'Twój dom';

  // węzły: DOM (prog 0) + miasta trasy cele[0..idx]; pozycja wg PROGU (kumulatywna droga)
  const dots = [{ nazwa:startLabel, prog:0, kont:null, home:true }];
  let cum=0, prev=sroda;
  for(let i=0;i<=idx;i++){ cum+=hav(prev,cele[i]); prev=cele[i];
    dots.push({ nazwa:cele[i].miasto, prog:cum, kont:cele[i].kontynent, reached:(i===idx) }); }
  const reachedProg = cum || 1;
  dots.forEach(d=> d.x = Math.sqrt(d.prog/reachedProg)); // sqrt: rozluźnia gęsty klaster bliskich progów (Europa), kompresuje daleki ogon

  // etykiety: DOM + reached zawsze; po drodze = wejście w nowy kontynent (x w środku); krótka trasa = wszystkie
  let lastKont=null;
  dots.forEach(d=>{
    if(d.home || d.reached){ d.label=true; }
    else { d.label = (d.kont!==lastKont && d.x>0.1 && d.x<0.9); }
    if(d.kont!==null) lastKont=d.kont;
  });
  if(dots.length<=4) dots.forEach(d=>d.label=true);

  // mini-pasek: postęp wzdłuż CAŁEJ trasy świata (0%=dom, 100%=ostatnie miasto)
  let cw=0, pp=sroda; cele.forEach(c=>{ cw+=hav(pp,c); pp=c; });
  const totalProg=cw, frac=Math.max(0, Math.min(1, ev.dystans_miasta/totalProg));

  const W=320,H=110,PAD=30, cy=H/2, RX=PAD+(W-2*PAD);   // reached na prawym końcu (pełna szerokość)
  const dotSvg = dots.map(d=>{
    const x=PAD+d.x*(W-2*PAD), r=d.reached?7:(d.home?5:3);
    const fill=d.reached?'var(--accent,#e8561e)':(d.home?'var(--accent2,#ff7040)':'rgba(255,255,255,.38)');
    const op=d.reached?'0':'1', glow=d.reached?'filter:drop-shadow(0 0 8px var(--accent,#e8561e));':'';
    let lbl='';
    if(d.label){ const ly=d.reached?cy-13:cy+18, col=d.reached?'var(--accent,#e8561e)':(d.home?'#cfc9d6':'#8a8693'), fs=d.reached?11:9;
      lbl=`<text x="${x}" y="${ly}" fill="${col}" font-size="${fs}" font-family="DM Mono,monospace" text-anchor="middle">${esc(d.nazwa)}</text>`; }
    return `<circle ${d.reached?'data-el="reached"':''} cx="${x}" cy="${cy}" r="${r}" fill="${fill}" style="opacity:${op};${glow}"/>${lbl}`;
  }).join('');

  const o=document.createElement('div'); o.id='silnik-anim-overlay';
  o.style.cssText='position:fixed;inset:0;z-index:100000;overflow:hidden;background:radial-gradient(120% 75% at 50% 8%,rgba(var(--accent-rgb,232,86,30),.22),#0c0710 55%,#07070a 100%),#07070a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif;color:#fff;';
  o.innerHTML=`
    <button id="silnik-anim-close" style="position:absolute;top:18px;right:18px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;z-index:5;">×</button>
    <div data-el="eyebrow" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent,#e8561e);">Najdalej dotarłeś</div>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:92px;line-height:.9;margin:2px 0;">${esc(reached.miasto)}</div>
    <div data-el="sub" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;text-align:center;">
      <div style="font-size:13px;color:#cfc9d6;">${ev.dystans_miasta} km od startu · ${esc(reached.kontynent)}</div>
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent2,#ff7040);letter-spacing:.05em;margin-top:3px;">${esc(startLabel)} → ${esc(reached.miasto)}</div>
    </div>
    <svg data-el="seg" viewBox="0 0 ${W} ${H}" width="92%" style="margin:16px 0;overflow:visible;">
      <line x1="${PAD}" y1="${cy}" x2="${RX}" y2="${cy}" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
      <path data-el="line" d="M ${PAD} ${cy} L ${RX} ${cy}" stroke="var(--accent,#e8561e)" stroke-width="3" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      ${dotSvg}
      <circle data-el="runner" cx="${PAD}" cy="${cy}" r="5" fill="var(--accent2,#ff7040)" style="filter:drop-shadow(0 0 6px var(--accent,#e8561e));"/>
    </svg>
    <div data-el="big" style="font-family:'Bebas Neue',sans-serif;font-size:84px;line-height:.86;">0<span style="font-size:24px;color:var(--accent,#e8561e);"> km</span></div>
    <div data-el="foot" style="opacity:0;transition:opacity .6s;font-size:13px;color:#8a8693;">${imie?esc(imie)+', t':'T'}yle przebiegłeś w tym roku.</div>
    <div style="position:absolute;bottom:52px;left:40px;right:40px;height:3px;background:rgba(255,255,255,.12);border-radius:3px;">
      <div data-el="fill" style="position:absolute;left:0;top:0;height:3px;width:0;background:linear-gradient(90deg,var(--accent2,#ff7040),var(--accent,#e8561e));border-radius:3px;transition:width 1.1s cubic-bezier(.4,0,.2,1);"></div>
      <div data-el="mini" style="position:absolute;top:-3.5px;left:0;width:10px;height:10px;border-radius:50%;background:var(--accent,#e8561e);box-shadow:0 0 10px var(--accent,#e8561e);transition:left 1.1s cubic-bezier(.4,0,.2,1);"></div>
    </div>
    <div style="position:absolute;bottom:36px;left:40px;font-family:'DM Mono',monospace;font-size:9px;color:#66636e;">DOM</div>
    <div style="position:absolute;bottom:36px;right:40px;font-family:'DM Mono',monospace;font-size:9px;color:#66636e;">ŚWIAT</div>
    <div data-el="brand" style="opacity:0;transition:opacity .8s;position:absolute;bottom:14px;left:0;right:0;text-align:center;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;color:#66636e;">BIEGAMY · ${ev.rok||new Date().getFullYear()}</div>
    <button data-el="replay" style="opacity:0;pointer-events:none;transition:opacity .5s;position:absolute;bottom:48px;right:18px;width:42px;height:42px;border-radius:50%;background:rgba(var(--accent-rgb,232,86,30),.16);border:1px solid var(--accent,#e8561e);color:var(--accent,#e8561e);font-size:19px;cursor:pointer;z-index:5;">↻</button>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector('[data-el="'+s+'"]');
  o.querySelector('#silnik-anim-close').onclick=_silnikZamknijAnim;
  o.addEventListener('click',e=>{ if(e.target===o) _silnikZamknijAnim(); });

  // ── CHOREOGRAFIA: linia rysuje się DOM→cel, biegacz jedzie CAŁĄ trasę, cel zapala ──
  const DRAW=1300;
  requestAnimationFrame(()=>{
    $('eyebrow').style.opacity='1'; $('eyebrow').style.transform='translateY(0)';
    setTimeout(()=>{ const s=$('sub'); s.style.opacity='1'; s.style.transform='translateY(0)'; },300);
    $('line').animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:DRAW,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    $('runner').animate([{cx:PAD},{cx:RX}],{duration:DRAW,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    setTimeout(()=>{                                                  // dojazd do celu
      $('reached').style.opacity='1';
      $('reached').animate([{r:7},{r:12},{r:7}],{duration:500,easing:'ease-out'});
      const rb=$('seg').getBoundingClientRect(), scaleX=rb.width/W, scaleY=rb.height/H;
      _silnikFx.burst(rb.left+RX*scaleX, rb.top+cy*scaleY, 16);
      _silnikFx.flash(o);
      _silnikFx.countUp($('big'), suma);
      $('foot').style.opacity='1'; $('brand').style.opacity='1';
      $('fill').style.width=(frac*100).toFixed(1)+'%';
      $('mini').style.left='calc('+(frac*100).toFixed(1)+'% - 5px)';
    }, DRAW+200);
    setTimeout(()=>{ const r=$('replay'); r.style.opacity='1'; r.style.pointerEvents='auto'; r.onclick=()=>_silnikRenderAnimDystans(ev,suma,imie); }, DRAW+1800);
  });
}

// ── ANIMACJA TOP5 TYGODNI (Slice 6 — ranking, DEBUG-ONLY) ──
// Kontrakt: moment.type==='top5', moment.ranking=[{label,km,current}×5], moment.pozycja, moment.km.
function _silnikRenderAnimTop5(moment, imie){
  _silnikZamknijAnim();
  const ranking = moment.ranking || [];
  if(ranking.length < 2){ console.warn('[silnik-anim] top5 bez rankingu'); return; }
  const esc = window.escapeHtml || (s=>String(s));
  const poz = moment.pozycja, curKm = moment.km;
  const maxKm = Math.max.apply(null, ranking.map(r=>r.km).concat(1)) * 1.1;
  const MAXH = 200;
  let peakIdx = ranking.findIndex(r=>r.current); if(peakIdx<0) peakIdx = (poz-1);
  const rok = moment.rok || new Date().getFullYear();

  const o=document.createElement('div'); o.id='silnik-anim-overlay';
  o.style.cssText='position:fixed;inset:0;z-index:100000;overflow:hidden;background:radial-gradient(120% 75% at 50% 8%,rgba(var(--accent-rgb,232,86,30),.22),#0c0710 55%,#07070a 100%),#07070a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif;color:#fff;';
  o.innerHTML=`
    <button id="silnik-anim-close" style="position:absolute;top:18px;right:18px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;z-index:5;">×</button>
    <div data-el="eyebrow" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent,#e8561e);text-align:center;">Twój <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;">${poz}.</span> najmocniejszy tydzień</div>
    <div data-el="bars" style="display:flex;align-items:flex-end;justify-content:center;gap:10px;height:${MAXH+54}px;margin:22px 0 8px;"></div>
    <div data-el="big" style="font-family:'Bebas Neue',sans-serif;font-size:104px;line-height:.86;text-shadow:0 0 50px rgba(var(--accent-rgb,232,86,30),.45);">0<span style="font-size:28px;color:var(--accent,#e8561e);"> km</span></div>
    <div data-el="foot" style="opacity:0;transition:opacity .6s;font-size:14px;color:#cfc9d6;margin-top:2px;">${imie?esc(imie)+', w':'W'}szedłeś do TOP 5 — odkąd biegasz z nami.</div>
    <div data-el="brand" style="opacity:0;transition:opacity .8s;position:absolute;bottom:16px;left:0;right:0;text-align:center;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;color:#66636e;">BIEGAMY · ${rok}</div>
    <button data-el="replay" style="opacity:0;pointer-events:none;transition:opacity .5s;position:absolute;bottom:48px;right:18px;width:42px;height:42px;border-radius:50%;background:rgba(var(--accent-rgb,232,86,30),.16);border:1px solid var(--accent,#e8561e);color:var(--accent,#e8561e);font-size:19px;cursor:pointer;z-index:5;">↻</button>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector('[data-el="'+s+'"]');
  o.querySelector('#silnik-anim-close').onclick=_silnikZamknijAnim;
  o.addEventListener('click',e=>{ if(e.target===o) _silnikZamknijAnim(); });

  const barsWrap=$('bars'); const barEls=[];
  ranking.forEach((r,i)=>{
    const col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;width:46px;';
    const h=Math.max(6, Math.round(r.km/maxKm*MAXH));
    col.innerHTML=`
      <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${r.current?'var(--accent,#e8561e)':'#66636e'};">#${i+1}</div>
      <div data-kmlabel style="opacity:0;transition:opacity .3s;font-family:'DM Mono',monospace;font-size:10px;color:${r.current?'var(--accent,#e8561e)':'#8a8693'};">${r.km}</div>
      <div data-bar style="width:100%;height:0;border-radius:7px 7px 0 0;background:${r.current?'linear-gradient(180deg,var(--accent2,#ff7040),var(--accent,#e8561e))':'rgba(255,255,255,.13)'};${r.current?'box-shadow:0 0 26px rgba(var(--accent-rgb,232,86,30),.6);':''}"></div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:${r.current?'var(--accent2,#ff7040)':'#66636e'};">${r.current?'TEN':esc(r.label)}</div>`;
    barsWrap.appendChild(col);
    barEls.push({el:col.querySelector('[data-bar]'), kmLabel:col.querySelector('[data-kmlabel]'), h});
  });

  // ── CHOREOGRAFIA (efekty z _silnikFx) ──
  const STEP=300, BAR_DUR=520, PEAK_PAUSE=200, PEAK_DUR=720;
  requestAnimationFrame(()=>{
    const eb=$('eyebrow'); eb.style.opacity='1'; eb.style.transform='translateY(0)';
    let delay=320;
    barEls.forEach((b,i)=>{ if(i===peakIdx) return; setTimeout(()=>_silnikFx.growBar(b,BAR_DUR,_silnikFx.easeOutCubic),delay); delay+=STEP; });
    const peakStart=delay+PEAK_PAUSE;
    setTimeout(()=>{
      _silnikFx.growBar(barEls[peakIdx], PEAK_DUR, _silnikFx.easeBack, ()=>{
        const r=barEls[peakIdx].el.getBoundingClientRect();
        _silnikFx.burst(r.left+r.width/2, r.top, 16); _silnikFx.flash(o); _silnikFx.countUp($('big'), curKm);
        $('foot').style.opacity='1'; $('brand').style.opacity='1';
      });
    }, peakStart);
    setTimeout(()=>{ const rb=$('replay'); rb.style.opacity='1'; rb.style.pointerEvents='auto'; rb.onclick=()=>_silnikRenderAnimTop5(moment,imie); }, peakStart+PEAK_DUR+1300);
  });
}

// ── ANIMACJA NAJDŁUŻSZEGO BIEGU (Slice 7 — miara 0→rekord, DEBUG-ONLY) ──
// Kontrakt: moment.type==='najdluzszy', evidence={dystans, poprzedni_najdluzszy}.
function _silnikRenderAnimNajdluzszy(ev, imie){
  _silnikZamknijAnim();
  const esc = window.escapeHtml || (s=>String(s));
  const nlKm = ev.dystans, prevMax = ev.poprzedni_najdluzszy;
  const delta = Math.round((nlKm - prevMax)*10)/10;
  const ratio = nlKm>0 ? Math.max(0, Math.min(0.92, prevMax/nlKm)) : 0;   // pozycja ticka (clamp by zostało miejsce na "nowe")
  const W=320,H=72,PAD=30, cy=34, endX=PAD+(W-2*PAD), tickX=PAD+ratio*(W-2*PAD);

  const o=document.createElement('div'); o.id='silnik-anim-overlay';
  o.style.cssText='position:fixed;inset:0;z-index:100000;overflow:hidden;background:radial-gradient(120% 75% at 50% 8%,rgba(var(--accent-rgb,232,86,30),.22),#0c0710 55%,#07070a 100%),#07070a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif;color:#fff;';
  o.innerHTML=`
    <button id="silnik-anim-close" style="position:absolute;top:18px;right:18px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;z-index:5;">×</button>
    <div data-el="eyebrow" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent,#e8561e);">Najdłuższy bieg</div>
    <div data-el="big" style="font-family:'Bebas Neue',sans-serif;font-size:128px;line-height:.86;margin:4px 0;text-shadow:0 0 50px rgba(var(--accent-rgb,232,86,30),.45);">0<span style="font-size:32px;color:var(--accent,#e8561e);"> km</span></div>
    <svg data-el="seg" viewBox="0 0 ${W} ${H}" width="90%" style="margin:14px 0;overflow:visible;">
      <line x1="${PAD}" y1="${cy}" x2="${endX}" y2="${cy}" stroke="rgba(255,255,255,.12)" stroke-width="3"/>
      <path data-el="line" d="M ${PAD} ${cy} L ${endX} ${cy}" stroke="var(--accent,#e8561e)" stroke-width="4" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
      <line x1="${tickX}" y1="${cy-9}" x2="${tickX}" y2="${cy+9}" stroke="#8a8693" stroke-width="2"/>
      <text x="${tickX}" y="${cy+24}" fill="#8a8693" font-size="9" font-family="DM Mono,monospace" text-anchor="middle">poprzedni ${prevMax} km</text>
      <text data-el="gain" x="${(tickX+endX)/2}" y="${cy-13}" fill="var(--accent2,#ff7040)" font-size="11" font-family="DM Mono,monospace" text-anchor="middle" opacity="0">+${delta} km</text>
      <circle data-el="endpt" cx="${endX}" cy="${cy}" r="6" fill="var(--accent,#e8561e)" style="opacity:0;filter:drop-shadow(0 0 8px var(--accent,#e8561e));"/>
      <circle data-el="runner" cx="${PAD}" cy="${cy}" r="5" fill="var(--accent2,#ff7040)" style="filter:drop-shadow(0 0 6px var(--accent,#e8561e));"/>
    </svg>
    <div data-el="foot" style="opacity:0;transition:opacity .6s;font-size:14px;color:#cfc9d6;">${imie?esc(imie)+', n':'N'}ajdłuższy bieg.</div>
    <div data-el="brand" style="opacity:0;transition:opacity .8s;position:absolute;bottom:16px;left:0;right:0;text-align:center;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;color:#66636e;">BIEGAMY</div>
    <button data-el="replay" style="opacity:0;pointer-events:none;transition:opacity .5s;position:absolute;bottom:48px;right:18px;width:42px;height:42px;border-radius:50%;background:rgba(var(--accent-rgb,232,86,30),.16);border:1px solid var(--accent,#e8561e);color:var(--accent,#e8561e);font-size:19px;cursor:pointer;z-index:5;">↻</button>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector('[data-el="'+s+'"]');
  o.querySelector('#silnik-anim-close').onclick=_silnikZamknijAnim;
  o.addEventListener('click',e=>{ if(e.target===o) _silnikZamknijAnim(); });

  // lokalny count-up z 1 miejscem (NIE rusza _silnikFx.countUp — używa go 3 żywe animacje)
  function countUpDec(el, target){ const t0=performance.now(), dur=950;
    (function step(t){ const p=Math.min(1,(t-t0)/dur); const v=target*(0.5-Math.cos(p*Math.PI)/2);
      el.firstChild.textContent=(Math.round(v*10)/10).toFixed(1); if(p<1) requestAnimationFrame(step); })(performance.now()); }

  // ── CHOREOGRAFIA: miara rośnie 0→rekord, biegacz biegnie, koniec zapala (iskry+flash), liczba dolicza ──
  const DRAW=1200;
  requestAnimationFrame(()=>{
    $('eyebrow').style.opacity='1'; $('eyebrow').style.transform='translateY(0)';
    $('line').animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:DRAW,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    $('runner').animate([{cx:PAD},{cx:endX}],{duration:DRAW,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    setTimeout(()=>{
      $('endpt').style.opacity='1';
      $('endpt').animate([{r:6},{r:12},{r:6}],{duration:500,easing:'ease-out'});
      const rb=$('seg').getBoundingClientRect(), sX=rb.width/W, sY=rb.height/H;
      _silnikFx.burst(rb.left+endX*sX, rb.top+cy*sY, 16);
      _silnikFx.flash(o);
      countUpDec($('big'), nlKm);
      $('gain').setAttribute('opacity','1');
      $('foot').style.opacity='1'; $('brand').style.opacity='1';
    }, DRAW+200);
    setTimeout(()=>{ const r=$('replay'); r.style.opacity='1'; r.style.pointerEvents='auto'; r.onclick=()=>_silnikRenderAnimNajdluzszy(ev,imie); }, DRAW+1800);
  });
}

// ── ANIMACJA NAJMOCNIEJSZA ŻYCIÓWKA (Slice 8 — ranking AG%, DEBUG-ONLY) ──
// Kontrakt: moment.type==='najmocniejsza', evidence={dystans:leader, poprzedni}, ag_pct, wiek_uzyty, ranking=[{dist,ag}]desc.
function _silnikRenderAnimNajmocniejsza(moment, imie){
  _silnikZamknijAnim();
  const ranking = moment.ranking || [];
  if(ranking.length < 2){ console.warn('[silnik-anim] najmocniejsza: <2 dystanse'); return; }
  const esc = window.escapeHtml || (s=>String(s));
  const NAZWA = {'5k':'5 KM','10k':'10 KM','half':'Półmaraton','marathon':'Maraton'};
  const leader = moment.evidence.dystans, poprzedni = moment.evidence.poprzedni;
  const agLeader = moment.ag_pct, wiek = moment.wiek_uzyty;
  const maxAg = Math.max.apply(null, ranking.map(r=>r.ag).concat(1)) * 1.1;
  const MAXH = 190;
  let peakIdx = ranking.findIndex(r=>r.dist===leader); if(peakIdx<0) peakIdx = 0;

  const o=document.createElement('div'); o.id='silnik-anim-overlay';
  o.style.cssText='position:fixed;inset:0;z-index:100000;overflow:hidden;background:radial-gradient(120% 75% at 50% 8%,rgba(var(--accent-rgb,232,86,30),.22),#0c0710 55%,#07070a 100%),#07070a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif;color:#fff;';
  o.innerHTML=`
    <button id="silnik-anim-close" style="position:absolute;top:18px;right:18px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;z-index:5;">×</button>
    <div data-el="eyebrow" style="opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--accent,#e8561e);">Najmocniejsza życiówka</div>
    <div data-el="zmiana" style="opacity:0;transition:opacity .5s .2s;font-family:'DM Sans',sans-serif;font-size:15px;color:#cfc9d6;font-weight:600;margin-top:4px;">${esc(NAZWA[leader]||leader)} wyprzedziło ${esc(NAZWA[poprzedni]||poprzedni||'—')}</div>
    <div data-el="big" style="font-family:'Bebas Neue',sans-serif;font-size:120px;line-height:.86;margin:6px 0 2px;text-shadow:0 0 50px rgba(var(--accent-rgb,232,86,30),.45);">0<span style="font-size:34px;color:var(--accent,#e8561e);">%</span></div>
    <div data-el="bars" style="display:flex;align-items:flex-end;justify-content:center;gap:12px;height:${MAXH+50}px;margin-top:18px;"></div>
    <div data-el="foot" style="opacity:0;transition:opacity .6s;font-size:12px;color:#8a8693;font-family:'DM Mono',monospace;margin-top:6px;">${wiek!=null?'wg Twojego wieku '+wiek:'wg rekordu świata'}</div>
    <div data-el="brand" style="opacity:0;transition:opacity .8s;position:absolute;bottom:16px;left:0;right:0;text-align:center;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.3em;color:#66636e;">BIEGAMY</div>
    <button data-el="replay" style="opacity:0;pointer-events:none;transition:opacity .5s;position:absolute;bottom:48px;right:18px;width:42px;height:42px;border-radius:50%;background:rgba(var(--accent-rgb,232,86,30),.16);border:1px solid var(--accent,#e8561e);color:var(--accent,#e8561e);font-size:19px;cursor:pointer;z-index:5;">↻</button>`;
  document.body.appendChild(o);
  const $ = s => o.querySelector('[data-el="'+s+'"]');
  o.querySelector('#silnik-anim-close').onclick=_silnikZamknijAnim;
  o.addEventListener('click',e=>{ if(e.target===o) _silnikZamknijAnim(); });

  const barsWrap=$('bars'); const barEls=[];
  ranking.forEach(r=>{
    const peak = r.dist===leader;
    const col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;width:54px;';
    const h=Math.max(6, Math.round(r.ag/maxAg*MAXH));
    col.innerHTML=`
      <div data-kmlabel style="opacity:0;transition:opacity .3s;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${peak?'var(--accent,#e8561e)':'#8a8693'};">${r.ag}%</div>
      <div data-bar style="width:100%;height:0;border-radius:7px 7px 0 0;background:${peak?'linear-gradient(180deg,var(--accent2,#ff7040),var(--accent,#e8561e))':'rgba(255,255,255,.13)'};${peak?'box-shadow:0 0 26px rgba(var(--accent-rgb,232,86,30),.6);':''}"></div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;color:${peak?'var(--accent2,#ff7040)':'#66636e'};">${esc(NAZWA[r.dist]||r.dist)}</div>`;
    barsWrap.appendChild(col);
    barEls.push({el:col.querySelector('[data-bar]'), kmLabel:col.querySelector('[data-kmlabel]'), h});
  });

  function countUpDec(el, target){ const t0=performance.now(), dur=950;
    (function step(t){ const p=Math.min(1,(t-t0)/dur); const v=target*(0.5-Math.cos(p*Math.PI)/2);
      el.firstChild.textContent=(Math.round(v*10)/10).toFixed(1); if(p<1) requestAnimationFrame(step); })(performance.now()); }

  // ── CHOREOGRAFIA: słupki rosną, lider ostatni (odbicie+iskry+flash), big = AG% lidera ──
  const STEP=300, BAR_DUR=520, PEAK_PAUSE=200, PEAK_DUR=720;
  requestAnimationFrame(()=>{
    $('eyebrow').style.opacity='1'; $('eyebrow').style.transform='translateY(0)'; $('zmiana').style.opacity='1';
    let delay=320;
    barEls.forEach((b,i)=>{ if(i===peakIdx) return; setTimeout(()=>_silnikFx.growBar(b,BAR_DUR,_silnikFx.easeOutCubic),delay); delay+=STEP; });
    const peakStart=delay+PEAK_PAUSE;
    setTimeout(()=>{
      _silnikFx.growBar(barEls[peakIdx], PEAK_DUR, _silnikFx.easeBack, ()=>{
        const r=barEls[peakIdx].el.getBoundingClientRect();
        _silnikFx.burst(r.left+r.width/2, r.top, 16); _silnikFx.flash(o); countUpDec($('big'), agLeader);
        $('foot').style.opacity='1'; $('brand').style.opacity='1';
      });
    }, peakStart);
    setTimeout(()=>{ const rb=$('replay'); rb.style.opacity='1'; rb.style.pointerEvents='auto'; rb.onclick=()=>_silnikRenderAnimNajmocniejsza(moment,imie); }, peakStart+PEAK_DUR+1300);
  });
}


// rekonstrukcja momentu z wiersza delivered_moments: evidence + payload splaszczony do top-level (suma_km/ranking/...)
window._silnikOdtworzMoment = function(row){ return Object.assign({ type: row.type, evidence: row.evidence }, row.payload || {}); };
