// Solarsystem.js — Sun, Moon and planets — geocentric positions of Solar System bodies.
// Uses Paul Schlyter's "How to compute planetary positions" method:
// Keplerian elements + Moon perturbation terms. Accuracy ~1-2 arcmin.
// SOLAR_DATA is loaded from data/solar-system.json (same format as stars/constellations).
let SOLAR_DATA = [];

function rev360(x){ return x - Math.floor(x/360)*360; }

function solveKepler(M, e){ // M, e -> eccentric anomaly (rad)
  let E = M;
  for (let i=0;i<8;i++){ const d = (E - e*Math.sin(E) - M)/(1 - e*Math.cos(E)); E -= d; if (Math.abs(d) < 1e-9) break; }
  return E;
}

// heliocentric ecliptic rectangular coords of a planet
function solarRect(d, el){
  const [N0,Nd, i0,id, w0,wd, a, e0,ed, M0,Md] = el;
  const N = (N0+Nd*d)*Math.PI/180, i = (i0+id*d)*Math.PI/180;
  const w = (w0+wd*d)*Math.PI/180, M = (M0+Md*d)*Math.PI/180;
  const E = solveKepler(rev360(M0+Md*d)*Math.PI/180, e0+ed*d);
  const xv = a*(Math.cos(E)-e0), yv = a*Math.sqrt(1-e0*e0)*Math.sin(E);
  const r = Math.hypot(xv,yv), v = Math.atan2(yv,xv);
  const u = v + w, sini = Math.sin(i);
  return [
    r*(Math.cos(N)*Math.cos(u) - Math.sin(N)*Math.sin(u)*Math.cos(i)),
    r*(Math.sin(N)*Math.cos(u) + Math.cos(N)*Math.sin(u)*Math.cos(i)),
    r*(Math.sin(u)*sini),
    r,
  ];
}

// Sun's geocentric position; returns {ra,dec,lonsun,rsun} (radians, AU)
function sunPos(d){
  const w = 282.9404 + 4.70935e-5*d;
  const e = 0.016709 - 1.151e-9*d;
  const M = rev360(356.0470 + 0.9856002585*d)*Math.PI/180;
  const E = solveKepler(M, e);
  const xv = Math.cos(E)-e, yv = Math.sqrt(1-e*e)*Math.sin(E);
  const r = Math.hypot(xv,yv), v = Math.atan2(yv,xv);
  const lonsun = rev360(v*180/Math.PI + w)*Math.PI/180;
  const ob = (23.4393 - 4e-7*d)*Math.PI/180;
  const xe = r*Math.cos(lonsun), ye = r*Math.sin(lonsun);
  const ra = Math.atan2(ye*Math.cos(ob), xe);
  const dec = Math.asin(ye*Math.sin(ob)/r);
  return { ra: Math.atan2(Math.sin(ra), Math.cos(ra)), dec, lonsun, rsun: r };
}

function eclToEq(x, y, z, d){
  const ob = (23.4393 - 4e-7*d)*Math.PI/180;
  return [ Math.atan2(y*Math.cos(ob) - z*Math.sin(ob), x),
           Math.asin(Math.max(-1, Math.min(1, (y*Math.sin(ob) + z*Math.cos(ob)) /
             Math.sqrt(x*x + y*y + z*z)))) ];
}

// Moon: geocentric RA/Dec with the main perturbation terms
function moonPos(d){
  const N = (125.1228 - 0.0529538083*d)*Math.PI/180;
  const i = 5.1454*Math.PI/180;
  const w = (318.0634 + 0.1643573223*d)*Math.PI/180;
  const a = 60.2666, e = 0.054900;
  const M = rev360(115.3654 + 13.0649929509*d)*Math.PI/180;
  const E = solveKepler(M, e);
  const xv = a*(Math.cos(E)-e), yv = a*Math.sqrt(1-e*e)*Math.sin(E);
  let r = Math.hypot(xv,yv), v = Math.atan2(yv,xv), u = v + w;
  let x = r*(Math.cos(N)*Math.cos(u) - Math.sin(N)*Math.sin(u)*Math.cos(i));
  let y = r*(Math.sin(N)*Math.cos(u) + Math.cos(N)*Math.sin(u)*Math.cos(i));
  let z = r*(Math.sin(u)*Math.sin(i));
  // perturbations (Schlyter's terms)
  const Ls = rev360((99.0150 + 0.9856474556*d)*Math.PI/180*180/Math.PI); // mean longitude of sun
  const Lm = rev360((218.312 + 13.176396*d));
  const Ms = rev360(356.0470 + 0.9856002585*d);
  const Mm = rev360(134.963 + 13.064993*d);
  const D  = rev360(Lm - Ls);
  const F  = rev360(Lm - 93.272 - 0.001*Math.floor(d));
  const sin = a => Math.sin(a*Math.PI/180);
  const cos = a => Math.cos(a*Math.PI/180);
  const dl = -1.274*sin(Mm - 2*D) + 0.658*sin(2*D) - 0.186*sin(Ms)
             - 0.059*sin(2*Mm - 2*D) - 0.057*sin(Mm - 2*D + Ms)
             + 0.053*sin(Mm + 2*D) + 0.046*sin(2*D - Ms) + 0.041*sin(Mm - Ms)
             - 0.035*sin(D) - 0.031*sin(Mm + Ms) - 0.015*sin(2*F - 2*D) + 0.011*sin(Mm - 4*D);
  const db = -0.173*cos(F - 2*D) - 0.055*sin(Mm - F - 2*D) - 0.046*sin(Mm + F - 2*D)
             + 0.033*sin(F + 2*D) + 0.017*sin(2*Mm + F);
  const dr = -0.58*cos(Mm - 2*D) - 0.46*cos(2*D);
  const lon = Math.atan2(y,x) + dl*Math.PI/180;
  const lat = Math.asin(z/r) + db*Math.PI/180;
  r += dr;
  const xe = r*Math.cos(lat)*Math.cos(lon), ye = r*Math.cos(lat)*Math.sin(lon), ze = r*Math.sin(lat);
  const [ra, dec] = eclToEq(xe, ye, ze, d);
  return { ra: Math.atan2(Math.sin(ra), Math.cos(ra)), dec, dist: r };
}

// geocentric RA/Dec + rough magnitude for one body, day number d
function bodyPos(d, b){
  const sun = sunPos(d);
  if (b.name === 'Sun'){
    const ob = (23.4393 - 4e-7*d)*Math.PI/180;
    const xs = sun.rsun*Math.cos(sun.lonsun), ys = sun.rsun*Math.sin(sun.lonsun);
    return { ra: sun.ra, dec: sun.dec, mag: -26.7, phase: 1 };
  }
  if (b.name === 'Moon') return { ra: moonPos(d).ra, dec: moonPos(d).dec, mag: -12.7, phase: null };
  const [x,y,z,r] = solarRect(d, b.el);
  const ob = (23.4393 - 4e-7*d)*Math.PI/180;
  const lonsun = sun.lonsun, rsun = sun.rsun;
  const xs = rsun*Math.cos(lonsun), ys = rsun*Math.sin(lonsun);
  const [xg, yg, zg] = [x+xs, y+ys, z];
  const [ra0, dec] = eclToEq(xg, yg, zg, d);
  const ra = Math.atan2(Math.sin(ra0), Math.cos(ra0));
  const R = Math.sqrt(xg*xg + yg*yg + zg*zg); // geocentric distance, AU
  // phase angle + magnitude (Schlyter's formulas)
  let mag = b.H + 5*Math.log10(r*R);
  const elong = Math.acos(Math.max(-1, Math.min(1,
    (r*r + R*R - rsun*rsun) / (2*r*R) )));
  const phase = 0.5*(1 + (rsun*rsun + r*r - R*R)/(2*rsun*r)); // illuminated fraction (approx)
  const Ldeg = elong*180/Math.PI;
  if (b.name==='Mercury') mag += 0.0380*Ldeg - 0.0002454*Ldeg*Ldeg;
  else if (b.name==='Venus') mag += 0.0009*Ldeg + 0.000239*Ldeg*Ldeg;
  else if (b.name==='Mars') mag += 0.016*phase;
  else if (b.name==='Saturn') mag += 0.044*Math.abs(Math.sin(0)) - 0.5; // ring opening ignored, crude offset
  return { ra, dec, mag, phase };
}
