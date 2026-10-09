# Star Chart

An interactive, single-page planetarium that renders ~8,900 real stars
(right ascension, declination, magnitude and B−V color index) on an HTML
canvas — no build step, no dependencies in the browser.

## What it does

- **Real star data** — Sirius, Canopus, Vega, Betelgeuse and the rest,
  drawn with realistic colors derived from their B−V index (blue-hot to red).
- **Horizon view (default)** — an alt-azimuth projection computed from your
  latitude, longitude and observation time using local sidereal time. The
  horizon stays level across the screen, with N/E/S/W markers on it.
  Drag left/right to change heading, up/down to tilt.
- **Equatorial view** — toggle the horizon line off for a free-floating
  RA/Dec star-atlas projection; dragging pans RA/Dec instead.
- **Northern / Southern switch** — flips the sky the way each hemisphere
  sees it. In southern mode the celestial poles swap (Sigma Octantis
  instead of Polaris), constellations move the wrong way across the sky,
  and the equatorial view flips like a southern star atlas.
- **Pole buttons** — jump to the correct celestial pole in either mode.
- **Night mode** — turn the whole screen red to preserve your dark adaptation while stargazing.
- **Solar System** — live positions of the Sun, Moon and all eight planets, computed
  in the browser from Keplerian orbital elements (Paul Schlyter's method). Shows
  phase, magnitude and relative distance; click a body for details.
- **Search** — jump to any named star, constellation or Solar System body.
- **Sidebar toggle** — hide the control panel with the ☰ button or the `H` key.
- **Touch support** — pinch to zoom, two-finger pan on touch screens.
- **Controls** — magnitude limit slider, star labels, constellation lines,
  and observation date/time.

## Running it

### Locally

```bash
pip install -r requirements.txt
python app.py
```

Or simply: `PORT=8080 python app.py`

### With Docker

```bash
cp .env.example .env   # change PORT here to switch ports
docker compose up --build -d
```

Inside the container Flask always listens on 5000; `PORT` in `.env` only
controls which host port compose maps to it. Open `http://localhost:PORT`.

### Configuration (`.env`)

| Variable      | Default   | Meaning                                   |
|---------------|-----------|-------------------------------------------|
| `PORT`        | `5000`    | Host port mapped to the container's port 5000 |

## File structure

```
Sky-Chart/
├── app.py                     Flask app; serves the page, /static, /data and /health
├── Dockerfile                 container image (python:3.12-slim)
├── docker-compose.yml         reads PORT from .env and maps it
├── .env.example               copy to .env, change PORT to switch ports
├── requirements.txt           Flask
├── .gitignore
├── README.md
├── templates/
│   └── starchart.html         page shell (markup only)
├── static/
│   ├── app.js                 data loading, sky math, rendering and controls
│   ├── solarsystem.js         Solar System positions (Keplerian elements)
│   └── style.css              styles
└── data/
    ├── stars.json             ~8,920 stars: RA (rad), Dec (rad), magnitude, B−V, name
    ├── constellations.json    constellation line segments and label positions
    └── solar-system.json      orbital elements for Sun, Moon and the eight planets
```

## File details

- `templates/starchart.html` — page markup; loads `/static/style.css`, `/static/solarsystem.js` and `/static/app.js`
- `static/style.css` — styles
- `static/app.js` — fetches `/data/*.json`, then handles sky math, rendering and controls
- `static/solarsystem.js` — Kepler equation solver and geocentric positions of Solar System bodies; math only, data lives in JSON
- `data/stars.json` — ~8,920 stars: RA (radians), Dec (radians), magnitude, B−V color, name
- `data/constellations.json` — constellation line segments and label positions
- `data/solar-system.json` — orbital elements (epoch 2000.0) for the planets; the Sun follows Earth's mirrored orbit and the Moon's perturbations are hardcoded in `solarsystem.js`
- `.env.example` — copy to `.env`, change `PORT` to switch ports
- `Dockerfile`, `docker-compose.yml`

## A note on Flask

This uses Flask's built-in development server, which is fine for personal
use on your network; for anything exposed publicly, put a production
WSGI server in front of it.
