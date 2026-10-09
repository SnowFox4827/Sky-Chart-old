// Star Chart — loads the star/constellation data, then runs the app.
(async function main() {
  const msg = document.getElementById('loadmsg');
  msg.hidden = false;
  let STARS, CONST, SOLAR_RAW, SPECDATA, DSOS;
  try {
    const get = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    [STARS, CONST, SOLAR_RAW, SPECDATA, DSOS] = await Promise.all([
      get('/data/stars.json'), get('/data/constellations.json'), get('/data/solar-system.json'), get('/data/reference.json'), get('/data/dso.json')
    ]);
    STARS = STARS.stars; DSOS = DSOS.dso;
  } catch (err) {
    msg.innerHTML = 'Could not load star data (' + (err.message || err) + ').<br>' +
      'If you opened this file directly from disk, that is why — browsers block local data fetches.<br>' +
      'Run it through Flask instead:<br><code>docker compose up --build -d</code> or <code>python app.py</code>' +
      '<br>then open <code>http://localhost:5000</code>.';
    return;
  }
  msg.remove();

  // build SOLAR_DATA from data/solar-system.json — same [N,Nrate,i,irate,w,wrate,a,e,erate,M,Mrate] arrays
  SOLAR_DATA = SOLAR_RAW.bodies.map(p => {
    const el = p.elements;
    return { name:p.name, col:p.color, H:p.absolute_magnitude_H,
      el:[el.N.value, el.N.rate_per_day, el.i.value, el.i.rate_per_day,
          el.w.value, el.w.rate_per_day, el.a_AU,
          el.e.value, el.e.rate_per_day, el.M.value, el.M.rate_per_day] };
  });
  const mkBody = (name, col, H, facts) => ({ name, col, H, el:null, sun:name==='Sun', moon:name==='Moon', facts });
  SOLAR_DATA.push(mkBody('Sun', '#ffdf80', -26.74, SOLAR_RAW.sunFacts || []));
  SOLAR_DATA.push(mkBody('Moon', '#e8e8e8', -12.7, SOLAR_RAW.moonFacts || []));

  const TAU = Math.PI*2;
  const D2R = Math.PI/180;
  const canvas = document.getElementById('sky'), ctx = canvas.getContext('2d');
  const maglim = document.getElementById('maglim'), magval = document.getElementById('magval');
  const labelsChk = document.getElementById('labels'), constl = document.getElementById('constl'), tip = document.getElementById('tip');
  const panel = document.getElementById('infopanel'), panelTitle = document.getElementById('infoTitle'),
        panelSub = document.getElementById('infoSub'), panelStats = document.getElementById('infoStats'), panelFacts = document.getElementById('infoFacts');
  // --- auto info for any catalog star ---
  const SPECTRAL = SPECDATA.spectralClasses
    .map(c => [c.bvMax, c.letter, c.color, c.tempMin, c.tempMax, c.fact])
    .sort((a,b) => a[0]-b[0]);
  const SUN_TEMP = SPECDATA.sunTemp;
  function spectOf(bv){ for (const s of SPECTRAL) if (bv <= s[0]) return s; return SPECTRAL[SPECTRAL.length-1]; }
  let magRank = null;
  function magRankOf(s){ if (!magRank) magRank = STARS.slice().sort((a,b)=>a[2]-b[2]); return magRank.indexOf(s); }
  function starInfo(s){
    const sp = spectOf(s[3]);
    const ra = (s[0]/TAU*24), dec = s[1]*180/Math.PI;
    const rank = magRankOf(s);
    const stats = 'Mag <b>'+s[2].toFixed(2)+'</b>' + (rank>=0 ? ' · #'+(rank+1)+' of '+STARS.length+' catalog stars' : '')
      + '<br>Spectral class <b>'+sp[1]+'</b> ('+sp[2]+') · B−V '+s[3].toFixed(2)
      + '<br>Surface temp ≈ '+Math.round((sp[3]+sp[4])/2)+' K (est. from color)'
      + '<br>RA '+ra.toFixed(2)+'h · Dec '+dec.toFixed(1)+'°';
    const named = s[5] || null;
    const facts = [
      'Class ' + sp[1] + ' stars glow ' + sp[2] + ' — this one\'s B−V color index of ' + s[3].toFixed(2) + ' puts it there.',
      'Estimated surface temperature: about ' + Math.round((sp[3]+sp[4])/2) + ' kelvin. Compare the Sun\'s '+SUN_TEMP.toLocaleString()+' K.',
      'Class ' + sp[1] + ' stars ' + sp[5] + '.'
    ];
    if (named) facts.push(...named);
    else if (s[4]) facts.push('Known since antiquity under the name “'+s[4]+'”.');
    else facts.push('This star has no proper name in our catalog — it\'s catalogued by position and brightness only.');
    return [s[4] || 'Unnamed star', 'Star', stats, facts];
  }

  function showInfo(title, sub, stats, facts){
    panelTitle.textContent = title;
    panelSub.textContent = sub || '';
    panelStats.innerHTML = stats || '';
    panelFacts.innerHTML = '';
    const list = facts;
    if (list && list.length) list.forEach(f => { const li = document.createElement('li'); li.textContent = f; panelFacts.appendChild(li); });
    else panelFacts.innerHTML = '<li>More about this object coming soon — try another click!</li>';
    panel.hidden = false;
    panel.classList.add('open');
  }
  document.getElementById('infoClose').onclick = () => { panel.classList.remove('open'); setTimeout(()=>{ panel.hidden = true; }, 300); };
  document.addEventListener('keydown', e=>{ if (e.key === 'Escape' && panel.classList.contains('open')) document.getElementById('infoClose').onclick(); });

  let view = { az: 0, alt: 0.78, ra: 0, dec: 1.35, scale: 400 };
  const horizonChk = document.getElementById('horizon'), hemisChk = document.getElementById('hemis'), latIn = document.getElementById('lat'), lonIn = document.getElementById('lon'), obsTime = document.getElementById('obsTime');
  function setNow(){ const d = new Date(); obsTime.value = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  setNow();
  // local sidereal time (radians) from the observer's date + longitude
  function lst(){
    const t = obsTime.value ? Date.parse(obsTime.value) : Date.now();
    const jd = t/86400000 + 2440587.5;
    const gmst = (280.46061837 + 360.98564736629*(jd-2451545.0)) * Math.PI/180;
    return (gmst + parseFloat(lonIn.value||0)*D2R) % TAU;
  }
  function observerLat(){
    const s = isSouth() ? -1 : 1;
    return s * Math.max(-89.9, Math.min(89.9, parseFloat(latIn.value)||0)) * D2R;
  }
  let W=0, H=0, DPR = window.devicePixelRatio||1;
  const cRcache={}, noop=null;

  function resize(){ W = innerWidth; H = innerHeight;
    canvas.width = W*DPR; canvas.height = H*DPR; canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0); draw(); }
  addEventListener('resize', resize);

  // stereographic projection of (az, alt) onto the plane, view center -> (0,0)
  function projectAltAz(az, alt, cAz, cAlt){
    cAz = (cAz===undefined)? view.az : cAz;
    cAlt = (cAlt===undefined)? view.alt : cAlt;
    const ca = Math.cos(alt), x = ca*Math.cos(az), y = ca*Math.sin(az), z = Math.sin(alt);
    const cR = Math.cos(cAz), sR = Math.sin(cAz);
    const cD = Math.cos(cAlt), sD = Math.sin(cAlt);
    const x1 = cR*x + sR*y, y1 = -sR*x + cR*y;      // rotate about z by -az
    const x2 = cD*x1 + sD*z, z2 = -sD*x1 + cD*z;    // rotate about y by -alt; now center = (1,0,0)
    const k = 2/(1+x2);
    return [-k*y1, -k*z2, x2];                      // flip x: east on the left, like the real sky
  }
  // equatorial (ra, dec) -> horizon (az, alt)
  function eqToAltAz(r, dec){
    const la = observerLat(), L = lst();
    const HA = L - r;
    const ca = Math.cos(dec)*Math.cos(HA);
    return [Math.atan2(-Math.cos(dec)*Math.sin(HA), -Math.sin(la)*ca + Math.sin(dec)*Math.cos(la)),
            Math.asin(ca*Math.cos(la) + Math.sin(dec)*Math.sin(la))];
  }
  // equatorial (ra, dec) -> horizon (az, alt) -> screen
  function project(r, dec){
    if (horizonChk.checked){
      const [az, alt] = eqToAltAz(r, dec);
      return projectAltAz(az, alt);
    }
    // free equatorial view: (ra, dec) projected directly, like the classic star atlas
    if (isSouth()) return projectAltAz(r, -dec, view.ra, -view.dec);
    return projectAltAz(r, dec, view.ra, view.dec);
  }
  function starColor(bv){
    const t = Math.max(0, Math.min(1, (bv+0.3)/2.3));
    const r = Math.round(155 + 100*t), g = Math.round(180 + 40*t - 90*t*t), b = 255 - Math.round(150*t);
    return 'rgb('+r+','+g+','+b+')';
  }
  function magToRadius(m){ return Math.max(0.55, 6.2 - m*1.05); }

  const solarChk = document.getElementById('solarChk'), dsoChk = document.getElementById('dsoChk');
  let visible = [];
  let solarHits = [];
  let dsoHits = [];
  function dsoInfo(d){
    const stats = 'Type <b>'+d.type+'</b> · Mag <b>'+d.mag.toFixed(1)+'</b><br>Distance <b>'+d.dist+'</b><br>RA '+(d.ra/15).toFixed(2)+'h · Dec '+d.dec.toFixed(1)+'°';
    return [d.name, d.type.charAt(0).toUpperCase()+d.type.slice(1), stats, d.facts];
  }
  function drawDSOs(cx, cy){
    dsoHits = [];
    if (!dsoChk.checked) return;
    ctx.font = '11px Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
    const maxR2 = (Math.hypot(W/2, H/2)/view.scale + 0.2)**2;
    for (const d of DSOS){
      const pt = project(d.ra*D2R, d.dec*D2R);
      if (pt[0]*pt[0] + pt[1]*pt[1] > maxR2) continue;
      const sx = cx + pt[0]*view.scale, sy = cy + pt[1]*view.scale;
      let alpha = 1;
      if (horizonChk.checked){
        const la = observerLat(), L = lst();
        const alt = Math.asin(Math.sin(d.dec*D2R)*Math.sin(la) + Math.cos(d.dec*D2R)*Math.cos(la)*Math.cos(L - d.ra*D2R));
        if (alt < 0) alpha = 0.22;
      }
      ctx.globalAlpha = alpha;
      const r = 5.5;
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(sx,sy,0,sx,sy,r*3);
      gr.addColorStop(0, 'rgba(120,255,200,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx,sy,r*3,0,TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#7dffbe';
      ctx.beginPath(); ctx.moveTo(sx, sy-r); ctx.lineTo(sx+r*0.7, sy); ctx.lineTo(sx, sy+r); ctx.lineTo(sx-r*0.7, sy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      dsoHits.push([sx, sy, d]);
      if (labelsChk.checked){
        ctx.fillStyle = 'rgba(160,255,210,0.95)';
        ctx.fillText(d.name, sx + r + 4, sy);
      }
    }
  }
  function dayNumber(){
    const t = obsTime.value ? Date.parse(obsTime.value) : Date.now();
    return t/86400000 + 2440587.5 - 2451543.5;
  }
  const SOLAR_BODIES = SOLAR_DATA.map(p=>({name:p.name, col:p.col, el:p.el, H:p.H, facts:p.facts}));
  function drawSolar(cx, cy){
    if (!solarChk.checked) return;
    solarHits = [];
    const d = dayNumber();
    for (const p of SOLAR_BODIES){
      const pos = bodyPos(d, p);
      const pt = project(pos.ra, pos.dec);
      if (pt[0]*pt[0] + pt[1]*pt[1] > ((Math.hypot(W/2,H/2)/view.scale + 0.2)**2)) continue;
      const sx = cx + pt[0]*view.scale, sy = cy + pt[1]*view.scale;
      const r = Math.max(3.2, magToRadius(pos.mag) + 2.2);
      // dim below the horizon in horizon mode
      let alpha = 1;
      if (horizonChk.checked){
        const la = observerLat(), L = lst();
        const alt = Math.asin(Math.sin(pos.dec)*Math.sin(la) + Math.cos(pos.dec)*Math.cos(la)*Math.cos(L - pos.ra));
        if (alt < 0) alpha = 0.22;
      }
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(sx,sy,0,sx,sy,r*4);
      gr.addColorStop(0, p.col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx,sy,r*4,0,TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(sx,sy,r,0,TAU); ctx.fill();
      ctx.globalAlpha = 1;
      solarHits.push([sx, sy, p, pos]);
      if (labelsChk.checked){
        ctx.font = '11px Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(230,235,255,0.95)';
        ctx.fillText(p.name, sx + r + 4, sy - r - 2);
      }
    }
  }
  function draw(){
    ctx.fillStyle = '#05070f'; ctx.fillRect(0,0,W,H);
    const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.7);
    g.addColorStop(0,'rgba(30,40,70,0.25)'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    const lim = parseFloat(maglim.value);
    const cx = W/2, cy = H/2;
    const maxR2 = (Math.hypot(W/2, H/2)/view.scale + 0.2)**2;
    visible = [];
    const list = [];
    for (const s of STARS){
      if (s[2] > lim) continue;
      const p = project(s[0], s[1]);
      if (p[0]*p[0] + p[1]*p[1] > maxR2) continue;
      list.push([cx + p[0]*view.scale, cy + p[1]*view.scale, s]);
    }
    list.sort((a,b)=>b[2][2]-a[2][2]);
    drawGrid(cx,cy);
    if (horizonChk.checked) drawHorizon(cx,cy);
    drawConstellations(cx,cy);
    ctx.globalCompositeOperation = 'lighter';
    for (const [sx,sy,s] of list){
      const r0 = magToRadius(s[2]);
      let r = r0, col = starColor(s[3]);
      if (horizonChk.checked){
        const la = observerLat(), L = lst();
        const alt = Math.asin(Math.sin(s[1])*Math.sin(la) + Math.cos(s[1])*Math.cos(la)*Math.cos(L - s[0]));
        if (alt < 0){ r = r0*0.45; ctx.globalAlpha = 0.22; }
      }
      if (s[2] < 4.2 && r === r0){
        const gr = ctx.createRadialGradient(sx,sy,0,sx,sy,r*4);
        gr.addColorStop(0, col.replace('rgb','rgba').replace(')',',0.55)'));
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx,sy,r*4,0,TAU); ctx.fill();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx,sy,r,0,TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (s[4]) visible.push([sx,sy,s]);
    }
    ctx.globalCompositeOperation = 'source-over';
    drawSolar(cx, cy);
    drawDSOs(cx, cy);
    const placed = [];
    if (labelsChk.checked){
      ctx.font = '11px Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
      for (const [sx,sy,s] of visible){
        if (s[2] > Math.min(lim, view.scale < 160 ? 3.2 : 5.2)) continue;
        if (view.scale < 120 && s[2] > 2.2) continue;
        let ok = true;
        for (const [px,py] of placed){ if ((sx-px)**2 + (sy-py)**2 < 900){ ok=false; break; } }
        if (!ok) continue;
        placed.push([sx,sy]);
        ctx.fillStyle = 'rgba(215,225,255,0.9)';
        ctx.fillText(s[4], sx + 7, sy - 7);
      }
    }
    let azD, altD;
    if (horizonChk.checked){
      azD = ((view.az/D2R)%360+360)%360; altD = view.alt/D2R;
      ctx.fillText('AZ '+azD.toFixed(1)+'°   Alt '+altD.toFixed(1)+'°   zoom '+view.scale.toFixed(0)+'px/rad', 14, H-14);
    } else {
      azD = ((view.ra/D2R)%360+360)%360; altD = view.dec/D2R;
      ctx.fillText((isSouth()?'S·':'')+'RA '+azD.toFixed(1)+'°   Dec '+altD.toFixed(1)+'°   zoom '+view.scale.toFixed(0)+'px/rad', 14, H-14);
    }
  }
  let constLabels = [];
  function drawConstellations(cx,cy){
    constLabels = [];
    if (!constl.checked) return;
    ctx.strokeStyle = 'rgba(110,135,205,0.45)'; ctx.lineWidth = 1;
    for (const c of CONST){
      ctx.beginPath();
      for (const seg of c.s){
        let started = false;
        for (const pt of seg){
          let ra, dec;
          if (pt[0]==='s'){ ra = STARS[pt[1]][0]; dec = STARS[pt[1]][1]; }
          else { ra = pt[1]*D2R; dec = pt[2]*D2R; }
          const p = project(ra, dec);
          const x = cx+p[0]*view.scale, y = cy+p[1]*view.scale;
          if (p[2] < 0.03 || Math.abs(x)>5e3 || Math.abs(y)>5e3){ started=false; continue; }
          if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
        }
      }
      ctx.stroke();
      if (c.l){
        const p = project(c.l[0]*D2R, c.l[1]*D2R);
        if (p[2] > 0.05) constLabels.push([cx+p[0]*view.scale, cy+p[1]*view.scale, c]);
      }
    }
    ctx.font = '10px Segoe UI, sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
    const placed = [];
    for (const [lx,ly,c] of constLabels){
      let ok = true;
      for (const [px,py] of placed){ if ((lx-px)**2 + (ly-py)**2 < 1600){ ok=false; break; } }
      if (!ok) continue;
      placed.push([lx,ly]);
      ctx.fillStyle = 'rgba(125,150,225,0.85)';
      ctx.fillText(c.n, lx, ly);
    }
    ctx.textAlign = 'left';
  }
  function drawHorizon(cx,cy){
    ctx.strokeStyle = 'rgba(255,170,90,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); let started = false;
    const pts = [];
    for (let i=0; i<=720; i++){
      const A = i/720*TAU;
      const p = projectAltAz(A, 0);
      const x = cx+p[0]*view.scale, y = cy+p[1]*view.scale;
      if (p[2] < 0.03 || Math.abs(x)>5e3 || Math.abs(y)>5e3){ started=false; continue; }
      if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
      if (i%180===0 && i<720) pts.push([x,y,'NESW'[i/180]]);
    }
    ctx.stroke();
    ctx.font = '12px Segoe UI, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for (const [x,y,c] of pts){ ctx.fillStyle='rgba(255,190,120,0.9)'; ctx.fillText(c, x, y-12); }
    ctx.textAlign='left';
  }
  function drawGrid(cx,cy){
    ctx.strokeStyle = 'rgba(90,110,170,0.18)'; ctx.lineWidth = 1;
    for (let d=-60; d<=60; d+=30){
      ctx.beginPath(); let started=false;
      for (let r=0; r<=TAU+0.001; r+=TAU/240){
        const p = project(r, d*Math.PI/180);
        const x = cx+p[0]*view.scale, y = cy+p[1]*view.scale;
        if (Math.abs(x)>5e3||Math.abs(y)>5e3){ started=false; continue; }
        if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    for (let h=0; h<24; h+=2){
      ctx.beginPath(); let started=false;
      for (let d=-88; d<=88; d+=2){
        const p = project(h/24*TAU, d*Math.PI/180);
        const x = cx+p[0]*view.scale, y = cy+p[1]*view.scale;
        if (Math.abs(x)>5e3||Math.abs(y)>5e3){ started=false; continue; }
        if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }

  let dragging=false, lx=0, ly=0;
  function applyPan(dx, dy){
    if (horizonChk.checked){
      view.az += dx/view.scale;
      view.alt += dy/view.scale;
      view.alt = Math.max(-1.55, Math.min(1.55, view.alt));
    } else {
      const sx = isSouth() ? -1 : 1;
      view.ra += sx*dx/view.scale;
      view.dec += dy/view.scale;
      view.dec = Math.max(-1.55, Math.min(1.55, view.dec));
    }
  }
  // multi-touch: track active pointers for pinch-zoom
  const active = new Map();
  let pinch = null; // {dist, cx, cy}
  function pinchState(){
    const pts = [...active.values()];
    const dx = pts[0].clientX-pts[1].clientX, dy = pts[0].clientY-pts[1].clientY;
    return { dist: Math.hypot(dx,dy) || 1, cx:(pts[0].clientX+pts[1].clientX)/2, cy:(pts[0].clientY+pts[1].clientY)/2 };
  }
  canvas.addEventListener('pointerdown', e=>{
    active.set(e.pointerId, e);
    if (active.size===2){
      dragging=false; canvas.classList.remove('drag');
      pinch = pinchState();
      e.preventDefault();
    } else {
      dragging=true; lx=e.clientX; ly=e.clientY; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener('pointerup', e=>{ active.delete(e.pointerId); if (active.size<2) pinch=null; if (!active.size) dragging=false; canvas.classList.remove('drag'); });
  canvas.addEventListener('pointercancel', e=>{ active.delete(e.pointerId); if (active.size<2) pinch=null; if (!active.size) dragging=false; canvas.classList.remove('drag'); });
  canvas.addEventListener('pointermove', e=>{
    if (active.has(e.pointerId)) active.set(e.pointerId, e);
    if (pinch && active.size>=2){
      e.preventDefault();
      const now = pinchState();
      // zoom around the midpoint of the two fingers
      const k = Math.max(60, Math.min(3000, view.scale * now.dist/pinch.dist)) / view.scale;
      view.scale *= k;
      // pan by midpoint movement
      applyPan(now.cx - pinch.cx, now.cy - pinch.cy);
      pinch = now;
      draw();
    } else if (dragging){
      applyPan(e.clientX-lx, e.clientY-ly);
      lx = e.clientX; ly = e.clientY;
      draw();
    } else {
      let best=null, bd=Infinity;
      for (const [sx,sy,s] of visible){
        const d2 = (e.clientX-sx)**2 + (e.clientY-sy)**2;
        if (d2 < 144 && d2 < bd){ bd=d2; best=s; }
      }
      if (best){
        tip.style.display='block';
        tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+14)+'px';
        tip.innerHTML = '<b>'+(best[4]||'Unnamed star')+'</b><br>mag '+best[2].toFixed(2)+' · B−V '+best[3].toFixed(2);
        canvas.style.cursor='pointer';
      } else { tip.style.display='none'; canvas.style.cursor='grab'; }
      if (best) return;
      for (const [sx,sy,d] of dsoHits){
        const d2 = (e.clientX-sx)**2 + (e.clientY-sy)**2;
        if (d2 < 169){
          tip.style.display='block'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+14)+'px';
          tip.innerHTML = '<b>'+d.name+'</b><br>'+d.type+' · mag '+d.mag.toFixed(1);
          canvas.style.cursor='pointer';
          return;
        }
      }
      for (const [lx,ly,c] of constLabels){
        const dw = ctx.measureText(c.n).width/2 + 6;
        if (Math.abs(e.clientX-lx) < dw && Math.abs(e.clientY-ly) < 9){
          tip.style.display='block'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+14)+'px';
          tip.innerHTML = '<b>'+c.n+'</b><br>Constellation — click for info';
          canvas.style.cursor='pointer';
          return;
        }
      }
    }
  });
  canvas.addEventListener('click', e=>{
    if (dragged) { dragged=false; return; }
    let best=null, bestPos=null, bd=Infinity;
    for (const [sx,sy,p,pos] of solarHits){
      const d2=(e.clientX-sx)**2+(e.clientY-sy)**2;
      if (d2<225 && d2<bd){ bd=d2; best=p; bestPos=pos; }
    }
    if (best){
      const ph = bestPos.phase!=null && best.name!=='Moon' && best.name!=='Sun' ? ' · Phase '+(bestPos.phase*100).toFixed(0)+'%' : '';
      showInfo(best.name, 'Solar System body',
        'Mag <b>'+bestPos.mag.toFixed(2)+'</b>'+ph+'<br>RA '+(bestPos.ra/TAU*24).toFixed(2)+'h · Dec '+(bestPos.dec*180/Math.PI).toFixed(1)+'°',
        best.facts);
      return;
    }
    for (const [sx,sy,d] of dsoHits){
      const d2=(e.clientX-sx)**2+(e.clientY-sy)**2;
      if (d2<169 && d2<bd){ bd=d2; best=d; }
    }
    if (best){
      showInfo(...dsoInfo(best));
      return;
    }
    for (const [lx,ly,c] of constLabels){
      const dw = ctx.measureText(c.n).width/2 + 6;
      if (Math.abs(e.clientX-lx) < dw && Math.abs(e.clientY-ly) < 9){
        showInfo(c.n, 'Constellation',
          'One of the 88 official figures · '+c.s.length+' star paths',
          c.facts);
        return;
      }
    }
    for (const [sx,sy,s] of visible){
      const d2=(e.clientX-sx)**2+(e.clientY-sy)**2;
      if (d2<144 && d2<bd){ bd=d2; best=s; }
    }
    if (best){
      showInfo(...starInfo(best));
    }
  });
  let dragged=false;
  canvas.addEventListener('pointermove', e=>{ if(dragging) dragged=true; });
  canvas.addEventListener('wheel', e=>{
    e.preventDefault();
    view.scale *= Math.exp(-e.deltaY*0.0015);
    view.scale = Math.max(60, Math.min(3000, view.scale));
    draw();
  }, {passive:false});

  maglim.addEventListener('input', ()=>{ magval.textContent = maglim.value; draw(); });
  labelsChk.addEventListener('change', draw);
  hemisChk.addEventListener('click', ()=>{ hemisChk.classList.toggle('south'); draw(); });
  function isSouth(){ return hemisChk.classList.contains('south'); }
  constl.addEventListener('change', draw);
  horizonChk.addEventListener('change', draw);
  document.getElementById('night').addEventListener('change', e=>{ document.documentElement.classList.toggle('night', e.target.checked); });
  for (const el of [latIn, lonIn, obsTime]) el.addEventListener('change', draw);
  solarChk.addEventListener('change', draw);
  dsoChk.addEventListener('change', draw);
  document.getElementById('nowBtn').onclick = ()=>{ setNow(); draw(); };
  document.getElementById('north').onclick = ()=>{
    if (horizonChk.checked){ view.az=0; view.alt=Math.max(0.3,observerLat()); }
    else { view.ra=0; view.dec=isSouth()? -1.35 : 1.35; }
    view.scale=Math.max(view.scale,400); draw(); };
  document.getElementById('south').onclick = ()=>{
    if (horizonChk.checked){ view.az=Math.PI; view.alt=Math.max(0.3,-observerLat()); }
    else { view.ra=0; view.dec=isSouth()? 1.35 : -1.35; }
    view.scale=Math.max(view.scale,400); draw(); };

  document.getElementById('search').addEventListener('change', e=>{
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hit = STARS.find(s=>s[4] && s[4].toLowerCase().includes(q));
    if (!hit){
      // solar system bodies: compute their current position
      const d = (Date.now()/86400000) + 2440587.5 - 2451543.5;
      const pbody = SOLAR_BODIES.find(b=>b.name.toLowerCase().includes(q));
      if (pbody){
        const p = bodyPos(d, pbody);
        if (horizonChk.checked){ const [haz, halt] = eqToAltAz(p.ra, p.dec); view.az = haz; view.alt = halt; }
        else { view.ra = p.ra; view.dec = p.dec; }
        view.scale = Math.max(view.scale, 700); draw();
        showInfo(pbody.name, 'Solar System body',
          'Mag <b>'+p.mag.toFixed(2)+'</b><br>RA '+(p.ra/TAU*24).toFixed(2)+'h · Dec '+(p.dec*180/Math.PI).toFixed(1)+'°', pbody.facts);
        e.target.blur(); return;
      }
      const dsoHit = DSOS.find(d=>d.name.toLowerCase().includes(q));
      if (dsoHit){
        if (horizonChk.checked){ const [haz, halt] = eqToAltAz(dsoHit.ra*D2R, dsoHit.dec*D2R); view.az = haz; view.alt = halt; }
        else { view.ra = dsoHit.ra*D2R; view.dec = dsoHit.dec*D2R; }
        view.scale = Math.max(view.scale, 600); draw();
        showInfo(...dsoInfo(dsoHit));
        e.target.blur(); return;
      }
      const con = CONST.find(c=>c.n.toLowerCase().includes(q));
      if (con && con.l){
        if (horizonChk.checked){ view.az = con.l[0]*D2R; view.alt = con.l[1]*D2R; }
        else { view.ra = con.l[0]*D2R; view.dec = con.l[1]*D2R; }
        view.scale = Math.max(view.scale, 500); draw();
        showInfo(con.n, 'Constellation', 'One of the 88 IAU figures.', con.facts);
        return;
      }
    }
    if (hit){
      if (horizonChk.checked){ const [haz, halt] = eqToAltAz(hit[0], hit[1]); view.az = haz; view.alt = halt; }
      else { view.ra = hit[0]; view.dec = hit[1]; }
      view.scale = Math.max(view.scale, 700); draw();
      showInfo(...starInfo(hit));
    } else showInfo('Not found', 'No star named “'+e.target.value+'” in the catalog.');
    e.target.blur();
  });

  resize();
})();

// --- Panel (sidebar) toggle ---
(function(){
  const panel = document.querySelector('.panel');
  const btn = document.getElementById('panelToggle');
  function toggle(){
    const hidden = panel.classList.toggle('hidden');
    btn.classList.toggle('shifted', !hidden);
    btn.title = hidden ? 'Show panel (H)' : 'Hide panel (H)';
  }
  btn.onclick = toggle;
  document.addEventListener('keydown', e=>{
    if ((e.key==='h'||e.key==='H') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) toggle();
  });
})();
