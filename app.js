// Star Chart — loads the star/constellation data, then runs the app.
(async function main() {
  const msg = document.getElementById('loadmsg');
  msg.hidden = false;
  let STARS, CONST;
  try {
    const get = url => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    [STARS, CONST] = await Promise.all([get('/data/stars.json'), get('/data/constellations.json')]);
  } catch (err) {
    msg.innerHTML = 'Could not load star data (' + (err.message || err) + ').<br>' +
      'If you opened this file directly from disk, that is why — browsers block local data fetches.<br>' +
      'Run it through Flask instead:<br><code>docker compose up --build -d</code> or <code>python app.py</code>' +
      '<br>then open <code>http://localhost:5000</code>.';
    return;
  }
  msg.remove();

  const TAU = Math.PI*2;
  const D2R = Math.PI/180;
  const canvas = document.getElementById('sky'), ctx = canvas.getContext('2d');
  const maglim = document.getElementById('maglim'), magval = document.getElementById('magval');
  const labelsChk = document.getElementById('labels'), constl = document.getElementById('constl'), tip = document.getElementById('tip'), info = document.getElementById('info');

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

  let visible = [];
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
        if (p[2] > 0.05) constLabels.push([cx+p[0]*view.scale, cy+p[1]*view.scale, c.n]);
      }
    }
    ctx.font = '10px Segoe UI, sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
    const placed = [];
    for (const [lx,ly,nm] of constLabels){
      let ok = true;
      for (const [px,py] of placed){ if ((lx-px)**2 + (ly-py)**2 < 1600){ ok=false; break; } }
      if (!ok) continue;
      placed.push([lx,ly]);
      ctx.fillStyle = 'rgba(125,150,225,0.85)';
      ctx.fillText(nm, lx, ly);
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
  canvas.addEventListener('pointerdown', e=>{ dragging=true; lx=e.clientX; ly=e.clientY; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', ()=>{ dragging=false; canvas.classList.remove('drag'); });
  canvas.addEventListener('pointermove', e=>{
    if (dragging){
      if (horizonChk.checked){
        view.az += (e.clientX-lx)/view.scale;
        view.alt += (e.clientY-ly)/view.scale;
        view.alt = Math.max(-1.55, Math.min(1.55, view.alt));
      } else {
        const sx = isSouth() ? -1 : 1;
        view.ra += sx*(e.clientX-lx)/view.scale;
        view.dec += (e.clientY-ly)/view.scale;
        view.dec = Math.max(-1.55, Math.min(1.55, view.dec));
      }
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
    }
  });
  canvas.addEventListener('click', e=>{
    if (dragged) { dragged=false; return; }
    let best=null, bd=Infinity;
    for (const [sx,sy,s] of visible){
      const d2=(e.clientX-sx)**2+(e.clientY-sy)**2;
      if (d2<144 && d2<bd){ bd=d2; best=s; }
    }
    if (best){
      info.innerHTML = best[4]
        ? '<b>'+best[4]+'</b><br>Mag '+best[2].toFixed(2)+' · B−V '+best[3].toFixed(2)+'<br>RA '+(best[0]/TAU*24).toFixed(2)+'h · Dec '+(best[1]*180/Math.PI).toFixed(1)+'°'
        : 'Unnamed star · mag '+best[2].toFixed(2)+' · B−V '+best[3].toFixed(2);
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
      const con = CONST.find(c=>c.n.toLowerCase().includes(q));
      if (con && con.l){
        if (horizonChk.checked){ view.az = con.l[0]*D2R; view.alt = con.l[1]*D2R; }
        else { view.ra = con.l[0]*D2R; view.dec = con.l[1]*D2R; }
        view.scale = Math.max(view.scale, 500); draw();
        info.innerHTML = '<b>'+con.n+'</b><br>Constellation · one of the 88 IAU figures';
        return;
      }
    }
    if (hit){
      if (horizonChk.checked){ const [haz, halt] = eqToAltAz(hit[0], hit[1]); view.az = haz; view.alt = halt; }
      else { view.ra = hit[0]; view.dec = hit[1]; }
      view.scale = Math.max(view.scale, 700); draw();
      info.innerHTML = '<b>'+hit[4]+'</b><br>Mag '+hit[2].toFixed(2)+' · B−V '+hit[3].toFixed(2)+'<br>RA '+(hit[0]/TAU*24).toFixed(2)+'h · Dec '+(hit[1]*180/Math.PI).toFixed(1)+'°';
    } else info.innerHTML = 'No star named “'+e.target.value+'” found.';
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
