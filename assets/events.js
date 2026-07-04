// notcfo — Live World Events
// Keyless, no-proxy, CORS-confirmed feeds:
//   USGS (earthquakes), NASA EONET (wildfires/storms/volcanoes/ice),
//   GDELT GEO 2.0 (geotagged conflict/unrest mentions — GDELT's own docs
//   state Access-Control-Allow-Origin: * is set on all API output).
// Polymarket is not included: its markets have no geographic coordinates.
//
// The world outline is real public-domain Natural Earth data (via the
// standard `world-atlas` land-110m topology, loaded from jsDelivr) rendered
// with d3-geo — not hand-drawn — and every event dot is projected through
// that same projection so dots land in the correct place relative to the
// coastline. No graticule, no gridlines.

(function(){

const QUAKE_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const EONET_FEED = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25';
const GDELT_FEED = 'https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20protest%20OR%20unrest%20OR%20war%20OR%20clashes&mode=PointData&format=GeoJSON&timespan=1d';
const LAND_TOPO = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const REFRESH_MS = 5 * 60 * 1000;
const MAP_W = 720, MAP_H = 360;

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

// ---------- world outline (drawn once, real data, real projection) ----------
let projection = null; // d3 projection fn: [lng,lat] -> [x,y] in the 720x360 box, or null on failure

async function initMap(){
  try{
    if(typeof d3 === 'undefined' || typeof topojson === 'undefined'){
      throw new Error('d3-geo / topojson-client did not load');
    }
    const topo = await (await fetch(LAND_TOPO)).json();
    const land = topojson.feature(topo, topo.objects.land);
    // small inset so the 1px stroke doesn't get clipped at the frame edge
    projection = d3.geoEquirectangular().fitSize([MAP_W - 4, MAP_H - 4], land);
    projection.translate([projection.translate()[0] + 2, projection.translate()[1] + 2]);
    const pathGen = d3.geoPath(projection);
    $('evLand').setAttribute('d', pathGen(land));
  }catch(e){
    // Outline unavailable (e.g. jsDelivr blocked) — dots still plot via a
    // plain equirectangular fallback below, just without a visible coastline.
    projection = null;
  }
}

function project(lat, lng){
  if(projection){
    const p = projection([lng, lat]);
    if(p) return { x: p[0], y: p[1] };
  }
  return { x: (lng + 180) / 360 * MAP_W, y: (90 - lat) / 180 * MAP_H };
}

// ---------- feeds ----------
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

// ---------- render ----------
function renderDots(events){
  const g = $('evDots');
  let inner = '';
  events.forEach(ev => {
    const p = project(ev.lat, ev.lng);
    const cat = CATS[ev.category] || CATS.other;
    const r = ev.category === 'quake' ? Math.max(2.5, Math.min(7, (ev.magnitude || 2) * 1.1)) : 3.5;
    const title = (ev.title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    inner += `<circle class="ev-dot ${cat.dotClass}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" opacity="0.85"><title>${title}</title></circle>`;
  });
  g.innerHTML = inner;
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
    renderDots(events);
    lastRefresh = Date.now();
    $('evUpdated').textContent = 'just now';
    $('evCount').textContent = events.length + ' events';
  }catch(e){
    $('evUpdated').textContent = 'unavailable';
  }
}

renderLegend();
initMap().then(refresh);
setInterval(refresh, REFRESH_MS);

setInterval(() => {
  if(!lastRefresh) return;
  const s = Math.floor((Date.now() - lastRefresh) / 1000);
  if(s > 5) $('evUpdated').textContent = timeAgo(lastRefresh);
}, 15000);

})();
