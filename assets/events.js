// notcfo — Live World Events
// Keyless, no-proxy, CORS-confirmed feeds:
//   USGS (earthquakes) — CORS explicitly permissive per their own docs.
//   NASA EONET (wildfires, severe storms, volcanoes, sea/lake ice) — public, keyless.
//   GDELT GEO 2.0 (geotagged conflict/unrest mentions) — GDELT's blog states
//     Access-Control-Allow-Origin: * is set on all API output by design.
// Polymarket is deliberately NOT included here: its markets have no
// geographic coordinates, so there's no honest way to plot them as map dots.
// Refreshes every 5 minutes. Map only — no event list.

(function(){

const QUAKE_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const EONET_FEED = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25';
const GDELT_FEED = 'https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20protest%20OR%20unrest%20OR%20war%20OR%20clashes&mode=PointData&format=GeoJSON&timespan=1d';
const REFRESH_MS = 5 * 60 * 1000;

const CATS = {
  quake:    { label: 'Seismic',            color: 'var(--gold)',   dotClass: 'ev-dot-quake' },
  wildfire: { label: 'Wildfire',           color: 'var(--red)',    dotClass: 'ev-dot-wildfire' },
  volcano:  { label: 'Volcanic',           color: 'var(--red)',    dotClass: 'ev-dot-volcano' },
  storm:    { label: 'Severe storm',       color: 'var(--signal)', dotClass: 'ev-dot-storm' },
  ice:      { label: 'Sea / lake ice',     color: 'var(--signal)', dotClass: 'ev-dot-ice' },
  conflict: { label: 'Conflict & unrest',  color: 'var(--white)',  dotClass: 'ev-dot-conflict' },
  other:    { label: 'Other',              color: 'var(--quiet)',  dotClass: 'ev-dot-other' }
};
const EONET_CAT_MAP = {
  wildfires: 'wildfire', severeStorms: 'storm', volcanoes: 'volcano',
  seaLakeIce: 'ice', floods: 'storm', drought: 'other', dustHaze: 'other',
  landslides: 'other', snow: 'other', tempExtremes: 'other', manmade: 'other'
};

function $(id){ return document.getElementById(id); }

function timeAgo(ts){
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if(s < 60) return s + 's ago';
  if(s < 3600) return Math.floor(s/60) + 'm ago';
  if(s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

async function fetchQuakes(){
  const res = await fetch(QUAKE_FEED);
  if(!res.ok) throw new Error('USGS unavailable');
  const data = await res.json();
  return data.features.map(f => ({
    id: 'usgs-' + f.id,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    title: f.properties.title,
    category: 'quake',
    magnitude: f.properties.mag,
    time: f.properties.time,
    source: 'USGS'
  })).filter(e => typeof e.lat === 'number' && typeof e.lng === 'number');
}

async function fetchEonet(){
  const res = await fetch(EONET_FEED);
  if(!res.ok) throw new Error('EONET unavailable');
  const data = await res.json();
  return (data.events || []).map(e => {
    const geom = e.geometry && e.geometry[e.geometry.length - 1];
    if(!geom) return null;
    let lat, lng;
    if(geom.type === 'Point'){ lng = geom.coordinates[0]; lat = geom.coordinates[1]; }
    else if(geom.type === 'Polygon'){ lng = geom.coordinates[0][0][0]; lat = geom.coordinates[0][0][1]; }
    if(typeof lat !== 'number' || typeof lng !== 'number') return null;
    const catId = e.categories && e.categories[0] ? e.categories[0].id : null;
    return {
      id: 'eonet-' + e.id,
      lat, lng,
      title: e.title,
      category: EONET_CAT_MAP[catId] || 'other',
      magnitude: null,
      time: geom.date ? new Date(geom.date).getTime() : Date.now(),
      source: 'EONET'
    };
  }).filter(Boolean);
}

async function fetchGdelt(){
  const res = await fetch(GDELT_FEED);
  if(!res.ok) throw new Error('GDELT unavailable');
  const data = await res.json();
  return (data.features || []).map((f, i) => {
    const coords = f.geometry && f.geometry.coordinates;
    if(!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    if(typeof lat !== 'number' || typeof lng !== 'number') return null;
    const props = f.properties || {};
    return {
      id: 'gdelt-' + i + '-' + lat + '-' + lng,
      lat, lng,
      title: props.name || 'Geopolitical mention cluster',
      category: 'conflict',
      magnitude: props.count || null,
      time: Date.now(),
      source: 'GDELT'
    };
  }).filter(Boolean);
}

function project(lat, lng){
  const x = (lng + 180) / 360 * 720;
  const y = (90 - lat) / 180 * 360;
  return { x, y };
}

function renderMap(events){
  const svg = $('evMap');
  let inner = '';
  for(let lng = -180; lng <= 180; lng += 30){
    const x = (lng + 180) / 360 * 720;
    const cls = lng === 0 ? 'ev-grat-strong' : 'ev-grat';
    inner += `<line class="${cls}" x1="${x}" y1="0" x2="${x}" y2="360"/>`;
  }
  for(let lat = -90; lat <= 90; lat += 30){
    const y = (90 - lat) / 180 * 360;
    const cls = lat === 0 ? 'ev-grat-strong' : 'ev-grat';
    inner += `<line class="${cls}" x1="0" y1="${y}" x2="720" y2="${y}"/>`;
  }
  events.forEach(ev => {
    const p = project(ev.lat, ev.lng);
    const cat = CATS[ev.category] || CATS.other;
    const r = ev.category === 'quake' ? Math.max(2.5, Math.min(7, (ev.magnitude || 2) * 1.1)) : 3.5;
    const title = (ev.title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    inner += `<circle class="ev-dot ${cat.dotClass}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" opacity="0.85"><title>${title}</title></circle>`;
  });
  svg.innerHTML = inner;
}

function renderLegend(){
  const wrap = $('evLegend');
  wrap.innerHTML = '';
  Object.values(CATS).forEach(c => {
    const el = document.createElement('span');
    el.className = 'ev-legend-item';
    el.innerHTML = `<span class="ev-legend-dot" style="background:${c.color}"></span>${c.label}`;
    wrap.appendChild(el);
  });
}

let lastRefresh = 0;

async function refresh(){
  try{
    const [quakes, eonet, gdelt] = await Promise.all([
      fetchQuakes().catch(() => []),
      fetchEonet().catch(() => []),
      fetchGdelt().catch(() => [])
    ]);
    const events = quakes.concat(eonet, gdelt).sort((a,b) => b.time - a.time);
    renderMap(events);
    lastRefresh = Date.now();
    $('evUpdated').textContent = 'just now';
    $('evCount').textContent = events.length + ' events';
  }catch(e){
    $('evUpdated').textContent = 'unavailable';
  }
}

renderLegend();
refresh();
setInterval(refresh, REFRESH_MS);

setInterval(() => {
  if(!lastRefresh) return;
  const s = Math.floor((Date.now() - lastRefresh) / 1000);
  if(s > 5) $('evUpdated').textContent = timeAgo(lastRefresh);
}, 15000);

})();
