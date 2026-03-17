// maps-render.js v1.1
// Version 1.1: Working device activation overlays
// Google Maps integration with camera markers and orientation arcs
// See project documentation for usage and CSV format
// maps-render.js
// Renders a Google Map centered on a fixed location, with device markers and a dynamic legend.
// Expects window.DevicesJSON and window.ActionsJSON to be set by the backend, and uses localStorage for icon/zone info.
// Unified icon list for the project
const ICONS = {
  person: "🧑",
  dog: "🐕",
  cat: "🐈",
  car: "🚗",
  suv: "🚙",
  taxi: "🚕",
  police_car: "🚓",
  ambulance: "🚑",
  fire_truck: "🚒",
  delivery_truck: "🚚",
  bicycle: "🚲",
  scooter: "🛵",
  motorcycle: "🏍️",
  pickup_truck: "🛻",
  tractor: "🚜",
  kick_scooter: "🛴",
  guide_dog: "🦮",
  poodle: "🐩",
  bird: "🐦",
  owl: "🦉",
  duck: "🦆",
  eagle: "🦅",
  rooster: "🐓",
  rabbit: "🐇",
  chipmunk: "🐿️",
  hedgehog: "🦔",
  raccoon: "🦝",
  fox: "🦊",
  deer: "🦌",
  swan: "🦢",
  butterfly: "🦋",
  tree: "🌳",
  evergreen_tree: "🌲",
  palm: "🌴",
  cactus: "🌵",
  sunflower: "🌻",
  flower: "🌼",
  rose: "🌹",
  hibiscus: "🌺",
  sheaf_of_rice: "🌾",
  seedling: "🌱",
  herb: "🌿",
  clover: "🍀",
  house: "🏠",
  house_with_garden: "🏡",
  housing: "🏘️",
  office_building: "🏢",
  factory: "🏭",
  national_park: "🏞️",
  camping: "🏕️",
  motorway: "🛣️",
  railway: "🛤️",
  traffic_light: "🚦",
  construction: "🚧",
  window: "🪟",
  door: "🚪",
  bed: "🛏️",
  couch: "🛋️",
  toilet: "🚽",
  shower: "🚿",
  bathtub: "🛁",
  chair: "🪑",
  picture: "🖼️",
  fire_extinguisher: "🧯",
  broom: "🧹",
  laundry_basket: "🧺",
  toilet_paper: "🧻",
  plunger: "🪠",
  mousetrap: "🪤",
  ladder: "🪜",
  magnet: "🧲",
  mirror: "🪞",
  rain: "🌧️",
  thunderstorm: "⛈️",
  sun_behind_cloud: "🌤️",
  sun: "🌞",
  moon: "🌙",
  star: "⭐",
  lightbulb: "💡",
  plug: "🔌",
  battery: "🔋",
  stop_sign: "🛑",
  elevator: "🛗",
  bell: "🛎️",
  // Color blocks and shapes
  blue_square: "🟦",
  green_square: "🟩",
  red_square: "🟥",
  yellow_square: "🟨",
  orange_square: "🟧",
  purple_square: "🟪",
  brown_square: "🟫",
  black_large_square: "⬛",
  white_large_square: "⬜",
  orange_circle: "🟠",
  green_circle: "🟢",
  purple_circle: "🟣",
  brown_circle: "🟤",
  white_circle: "⚪",
  black_circle: "⚫",
  red_triangle_up: "🔺",
  red_triangle_down: "🔻",
  orange_diamond: "🔸",
  blue_diamond: "🔹",
  orange_diamond_large: "🔶",
  blue_diamond_large: "🔷"
};
window.activationTimeRangeMinutes = 60; // show activations within the last N minutes
const MAP_CENTER = { lat: 47.7862659664524, lng: -122.15958840769171, altitude: 20 }; // Center of map
const MAP_ZOOM = 21;
const eyeSVG = `<svg id="eye-of-horus" width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="cursor:pointer;user-select:none;"><path d="M14 4C7 4 2 14 2 14C2 14 7 24 14 24C21 24 26 14 26 14C26 14 21 4 14 4Z" stroke="#222" stroke-width="2" fill="none"/><circle cx="14" cy="14" r="4" stroke="#222" stroke-width="2" fill="none"/><path d="M6 20C8 18 10 17 14 17C18 17 20 18 22 20" stroke="#222" stroke-width="2" fill="none"/><path d="M7 8C8.5 9 10 10 14 10C18 10 19.5 9 21 8" stroke="#222" stroke-width="2" fill="none"/></svg>`;
// SVG as a string
const svgString = `
  <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" fill="#4CAF50"/>
    <path d="M12 10 Q14 14 12 18 T10 10Z" fill="#2196F3"/>
    <path d="M18 12 Q20 16 18 20 T16 12Z" fill="#2196F3"/>
    <path d="M24 10 Q26 14 24 18 T22 10Z" fill="#2196F3"/>
  </svg>
`;

// Get icons for zone and detection type from localStorage prefs
const zoneIcons = getZoneIconsFromLocalStorage();

// Parse the SVG string into an HTML element
const parser = new DOMParser();

let map;
let houselayer;
let zoneCameraData = {}; // zone coordinate data from cameras.json
// --- Custom Legend and Overlay Toggle ---
let coveragePolygons = [];
let activationPolygons = [];
let coverageVisible = true;
let lastDevicesSnapshot = '';

// --- JWT Authentication for cam2hub.local:8971 ---
const CAM2HUB_HOST = 'https://cam2hub.local:8971';
const CAM2HUB_PROXY_HOST = '/proxy';
const JWT_STORAGE_KEY = 'cam2hub_jwt_token';

// Get stored JWT token
function getStoredJWT() {
  return localStorage.getItem(JWT_STORAGE_KEY);
}

// Check if JWT token exists (check for frigate_token cookie)
function hasFrigateAuth() {
  // Check sessionStorage flag set by login modal (frigate_token is HttpOnly, so we track auth state on client)
  return sessionStorage.getItem('frigate_authenticated') === 'true';
}

// Check if JWT token exists and is valid
async function ensureJWTToken() {
  if (hasFrigateAuth()) {
    return true;
  }
  // Show login modal if no token
  await showFrigateLoginModal();
  return hasFrigateAuth();
}

async function initMap() {
  const { Map3DElement } = await google.maps.importLibrary("maps3d");
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const { LatLngAltitude } = await google.maps.importLibrary("core");

  map = new Map3DElement({
    center: MAP_CENTER,
    tilt: 67.5,
    mode: 'HYBRID',
    mapId: "1007d00d9d71cfaaa7968834"
  });

  document.getElementById('map').appendChild(map);

  try {
    // Fetch houselayer data from JSON
    const resp = await fetch('/static/mapdata/houselayer.json');
    if (!resp.ok) throw new Error('Failed to fetch houselayer.json');
    houselayer = await resp.json();
    if (!houselayer || !houselayer.cameras || typeof houselayer.cameras !== 'object') {
      throw new Error('Invalid houselayer.json format: expected { cameras: {...}, devices: {...} }');
    }
    const mapCameraData = houselayer.cameras;
    softrainsData.cameras = mapCameraData;

    // Load zone coordinate data from cameras.json (zone-to-camera mapping is in houselayer.zones)
    try {
      const zoneResp = await fetch('/static/mapdata/cameras.json');
      if (zoneResp.ok) {
        const zoneConfig = await zoneResp.json();
        zoneCameraData = (zoneConfig && zoneConfig.cameras) ? zoneConfig.cameras : {};
      }
    } catch (e) {
      console.warn('Could not load cameras.json zone coordinates:', e);
    }

    const { Marker3DElement, PinElement } = await google.maps.importLibrary('maps3d');

    // Render cameras (if using new structure with cameras object)
    const cameraData = mapCameraData;
    Object.values(cameraData).forEach(pt => {
      if (!pt || typeof pt.lat !== 'number' || typeof pt.lng !== 'number') return;
      // Use a custom SVG pin for each camera
      const pinSvgString = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="16" fill="#2196F3"></rect><circle cx="16" cy="16" r="8" fill="#fff"/></svg>`;
      const pinSvg = parser.parseFromString(pinSvgString, 'image/svg+xml').documentElement;
      const templateForSvg = document.createElement('template');
      templateForSvg.content.append(pinSvg);
      const marker = new Marker3DElement({
        position: { lat: pt.lat, lng: pt.lng, altitude: pt.altitude || 10 },
        extruded: true,
        altitudeMode: "ABSOLUTE"
      });
      marker.append(templateForSvg);
      map.append(marker);

      // Draw 3D extruded arc sector with elevation
      if (pt.orientation) {
        const { Polygon3DElement, AltitudeMode } = google.maps.maps3d;
        const baseAltitude = (pt.altitude || 10) + 5;
        const arcPath = computeGoogleArcSector(
          pt.lat,
          pt.lng,
          parseFloat(pt.orientation),
          18,
          pt.fov || 140
        ).map(coord => ({ lat: coord.lat, lng: coord.lng, altitude: baseAltitude }));
        const polygonOptions = {
          strokeColor: "#2196F3CC",
          strokeWidth: 4,
          fillColor: "#2196F380",
          drawsOccludedSegments: false,
          extruded: true,
          altitudeMode: AltitudeMode.RELATIVE_TO_GROUND
        };
        const poly3d = new Polygon3DElement(polygonOptions);
        poly3d.path = arcPath;
        map.append(poly3d);
        coveragePolygons.push(poly3d);
      }
    });

    // Render devices as 1-meter opaque cubes
    if (houselayer.devices) {
      const { Polygon3DElement, Polygon3DInteractiveElement, AltitudeMode } = google.maps.maps3d;
      const { ElevationService } = await google.maps.importLibrary("elevation");
      const elevationService = new ElevationService();

      for (const [deviceId, device] of Object.entries(houselayer.devices)) {
        if (!device.lat || !device.lng) continue;

        // Get ground elevation for this location
        let groundElevation = 0;
        try {
          const result = await elevationService.getElevationForLocations({
            locations: [{ lat: device.lat, lng: device.lng }]
          });
          if (result.results && result.results[0]) {
            groundElevation = result.results[0].elevation;
          }
        } catch (e) {
          console.warn(`Failed to get elevation for device ${deviceId}:`, e);
        }

        const cubeSize = 0.000009; // approximately 1 meter in degrees at this latitude
        const baseAltitude = groundElevation + 1; // 1 meter above ground
        const topAltitude = baseAltitude + 1; // 1 meter tall cube

        // Create cube vertices
        const lat = device.lat;
        const lng = device.lng;

        // Bottom square at 1m above ground
        const bottomSquare = [
          { lat: lat - cubeSize, lng: lng - cubeSize, altitude: baseAltitude },
          { lat: lat - cubeSize, lng: lng + cubeSize, altitude: baseAltitude },
          { lat: lat + cubeSize, lng: lng + cubeSize, altitude: baseAltitude },
          { lat: lat + cubeSize, lng: lng - cubeSize, altitude: baseAltitude },
          { lat: lat - cubeSize, lng: lng - cubeSize, altitude: baseAltitude }
        ];

        // Top square at 2m above ground
        const topSquare = [
          { lat: lat - cubeSize, lng: lng - cubeSize, altitude: topAltitude },
          { lat: lat - cubeSize, lng: lng + cubeSize, altitude: topAltitude },
          { lat: lat + cubeSize, lng: lng + cubeSize, altitude: topAltitude },
          { lat: lat + cubeSize, lng: lng - cubeSize, altitude: topAltitude },
          { lat: lat - cubeSize, lng: lng - cubeSize, altitude: topAltitude }
        ];

        const cubeColor = "#FF9800"; // Orange for devices
        const polygonOptions = {
          strokeColor: cubeColor + "FF",
          strokeWidth: 2,
          fillColor: cubeColor + "CC", // Opaque
          drawsOccludedSegments: true,
          extruded: true,
          altitudeMode: AltitudeMode.ABSOLUTE
        };

        // Draw bottom face (non-interactive)
        const bottomFace = new Polygon3DElement(polygonOptions);
        bottomFace.path = bottomSquare;
        map.append(bottomFace);

        // Draw top face (interactive for hover)
        const topFace = new Polygon3DInteractiveElement(polygonOptions);
        topFace.path = topSquare;
        map.append(topFace);

        // Add click event to show device name
        topFace.addEventListener('gmp-click', function () {
          const { PopoverElement } = google.maps.maps3d;
          const popover = new PopoverElement({
            open: true,
            positionAnchor: { lat: lat, lng: lng, altitude: topAltitude + 0.5 },
          });

          const html = `
            <div style="background:white;padding:8px 12px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
              <strong>${deviceId}</strong>
            </div>
          `;

          popover.append(parser.parseFromString(html, 'text/html').body.firstChild);
          map.append(popover);
        });

        // Draw 4 vertical faces (non-interactive)
        for (let i = 0; i < 4; i++) {
          const verticalFace = new Polygon3DElement(polygonOptions);
          verticalFace.path = [
            bottomSquare[i],
            bottomSquare[i + 1],
            topSquare[i + 1],
            topSquare[i],
            bottomSquare[i]
          ];
          map.append(verticalFace);
        }
      }
    }

    addCustomLegend();
    redrawDeviceActivations();
    lastDevicesSnapshot = JSON.stringify((softrainsData && softrainsData.devices) || {});
    setInterval(refreshDeviceActivationsFromApi, 15000);
  } catch (e) {
    console.error('Failed to load or parse houselayer.json or detection data:', e);
  }
}

async function initMapWithAuth() {
  // Ensure user is authenticated with Frigate before loading map
  await ensureJWTToken();
  await initMap();
}

initMapWithAuth();


function addCustomLegend() {
  // Eye of Horus SVG (inline, monochrome for toggle)  
  const legendDiv = document.createElement('div');
  legendDiv.className = 'map-legend custom-legend';
  legendDiv.style.background = 'rgba(255,255,255,0.85)';
  legendDiv.style.borderRadius = '8px';
  legendDiv.style.padding = '8px 16px';
  legendDiv.style.margin = '12px';
  legendDiv.style.display = 'flex';
  legendDiv.style.alignItems = 'center';
  legendDiv.style.justifyContent = 'center';
  legendDiv.innerHTML = `
    <span id="coverage-toggle-icon" style="display:inline-block;width:32px;height:32px;vertical-align:middle;">${eyeSVG}</span>
    <div style="display:inline-block;margin-left:18px;vertical-align:middle;">
      <input type="range" id="activation-slider" min="0" max="13" step="1" value="${window.activationTimeRangeMinutes}" style="vertical-align:middle;width:120px;">
      <span id="activation-slider-value" style="font-size:14px;margin-left:8px;vertical-align:middle;">${window.activationTimeRangeMinutes} min</span>
    </div>
  `;
  // Slider logic: logarithmic scale (1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72, 96, 144)
  const slider = legendDiv.querySelector('#activation-slider');
  const sliderValue = legendDiv.querySelector('#activation-slider-value');
  const logSteps = [2, 3, 6, 8, 12, 18, 24, 36, 48, 60, 72, 720, 1440, 5000];
  function sliderToMinutes(val) {
    // Map slider value (0-13) to logSteps
    return logSteps[val] || 1;
  }
  function minutesToSlider(minutes) {
    const idx = logSteps.indexOf(minutes);
    return idx !== -1 ? idx : logSteps.length - 1;
  }
  slider.value = minutesToSlider(window.activationTimeRangeMinutes);
  sliderValue.textContent = `${window.activationTimeRangeMinutes} min`;
  slider.addEventListener('input', function () {
    const minutes = sliderToMinutes(parseInt(slider.value));
    sliderValue.textContent = `${minutes} min`;
    window.activationTimeRangeMinutes = minutes;
    // Re-render device activations
    if (typeof redrawDeviceActivations === 'function') {
      redrawDeviceActivations();
    }
  });
  // For maps3d, append legendDiv to the map container
  const mapContainer = document.getElementById('map');
  if (mapContainer) {
    mapContainer.appendChild(legendDiv);
    legendDiv.style.position = 'absolute';
    legendDiv.style.top = '24px';
    legendDiv.style.right = '24px';
    legendDiv.style.zIndex = 1000;
  }
  // Add event listener to the icon
  const icon = legendDiv.querySelector('#coverage-toggle-icon');
  icon.addEventListener('click', function () {
    coverageVisible = !coverageVisible;
    coveragePolygons.forEach(poly => {
      if (poly.remove && !coverageVisible) poly.remove();
      else if (poly.setMap) poly.setMap(coverageVisible ? map : null);
    });
    // Optionally, visually indicate toggle state (e.g. opacity)
    icon.style.opacity = coverageVisible ? '1' : '0.4';
  });
}

// Compute a sector (arc) as an array of {lat, lng} points for Google Maps
function computeGoogleArcSector(lat, lng, orientation, radiusMeters, arcAngle) {
  const points = [];
  const numPoints = 32; // smoothness of arc
  const R = 6378137; // Earth radius in meters
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const startAngle = orientation - arcAngle / 2;
  const endAngle = orientation + arcAngle / 2;
  // Center point
  points.push({ lat, lng });
  for (let i = 0; i <= numPoints; i++) {
    const angle = toRad(startAngle + (endAngle - startAngle) * (i / numPoints));
    const dByR = radiusMeters / R;
    const lat1 = toRad(lat);
    const lng1 = toRad(lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(angle));
    const lng2 = lng1 + Math.atan2(Math.sin(angle) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
    points.push({ lat: toDeg(lat2), lng: toDeg(lng2) });
  }
  points.push({ lat, lng });
  return points;
}

function getZoneIconsFromLocalStorage() {
  try {
    const prefs = JSON.parse(localStorage.getItem('softrainsZoneTypePrefs') || '{}');
    if (prefs && typeof prefs === 'object') {
      // Each key is a zone name, each value is an icon
      return Object.entries(prefs).map(([name, icon]) => ({ icon, name }));
    }
  } catch (e) {
    console.error('Error parsing softrainsZoneTypePrefs from localStorage:', e);
  }
  return [];
}

function getTriggerTypesFromActions(actions) {
  const triggers = new Set();
  actions.forEach(a => {
    if (a.PrimaryAction) triggers.add(a.PrimaryAction);
    if (a.SecondaryAction) triggers.add(a.SecondaryAction);
  });
  return Array.from(triggers).filter(Boolean);
}

function getDeviceIcon(device) {
  if (device.LastTrigger.TriggerZone && zoneIcons.length) {
    const idx = zoneIcons.findIndex(z => z.name === device.LastTrigger.TriggerZone);
    if (idx !== -1) return zoneIcons[idx].icon;
  }
  // fallback
  return '📷';
}

function getZoneAngularOffsets(coords, fov = 140) {
  // coords: [x1, y1, x2, y2, ...] with x/y in [0,1]
  // Returns: [{x, y, xAngle, yAngle}]
  const result = [];
  for (let i = 0; i < coords.length; i += 2) {
    const x = coords[i];
    const y = coords[i + 1];
    const xAngle = (x - 0.5) * fov;
    const yAngle = (y - 0.5) * fov;
    result.push({ x, y, xAngle, yAngle });
  }
  return result;
}

function getDeviceActivations() {
  const devices = (softrainsData && softrainsData.devices) ? softrainsData.devices : {};
  Object.values(devices).forEach(device => {
    // for each device find out where it was last activated and by what
    let maxX = 0;
    let minX = 1;

    if (!device || !device.LastTrigger || !device.LastTrigger.TriggerZone) return;
    // Calculate time ago in mm:ss
    // Parse TriggerTime as ISO string
    const triggerDate = new Date(String(device.LastTrigger.TriggerTime));
    if (isNaN(triggerDate.getTime())) return; // skip invalid dates
    if (Date.now() - triggerDate.getTime() > (window.activationTimeRangeMinutes || 60) * 60000) return; // skip old activations

    // Find which camera has this zone    
    const camera = getCameraFromZone(device.LastTrigger.TriggerZone);
    if (camera === null) {
      console.log('No camera found for zone', device.LastTrigger.TriggerZone);
      return;
    }
    const cameraCoords =
      (houselayer && houselayer.cameras && houselayer.cameras[camera]) ||
      (softrainsData && softrainsData.cameras && softrainsData.cameras[camera]);
    if (!cameraCoords || cameraCoords.lat == null || cameraCoords.lng == null) {
      console.log('No camera coordinates found for', camera);
      return;
    }

    // Look up zone coordinates from cameras.json zone data
    const zone = zoneCameraData[camera]?.zones?.[device.LastTrigger.TriggerZone];
    if (!zone || typeof zone.coordinates !== 'string') return;
    const coords = zone.coordinates.split(',').map(Number);
    if (!coords.length) return;
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i];
      if (x > maxX) maxX = x;
      if (x < minX) minX = x;
    }
    const angleOffsets = getZoneAngularOffsets([minX, 0, maxX, 0]);

    const timeAgo = cleanUpTimeAgo(device.LastTrigger.TriggerTime);

    drawDeviceActivationZones(angleOffsets, cameraCoords, device, timeAgo);
  });
}

function clearActivationPolygons() {
  activationPolygons.forEach(poly => {
    if (poly.remove) poly.remove();
    else if (poly.setMap) poly.setMap(null);
  });
  activationPolygons = [];
}

function redrawDeviceActivations() {
  clearActivationPolygons();
  getDeviceActivations();
}

async function refreshDeviceActivationsFromApi() {
  try {
    const response = await fetch('/api?command=getAll');
    if (!response.ok) return;
    const data = await response.json();
    if (!data || typeof data !== 'object' || !data.devices) return;

    const nextSnapshot = JSON.stringify(data.devices);
    if (nextSnapshot === lastDevicesSnapshot) return;

    softrainsData = {
      ...(softrainsData || {}),
      ...data,
      cameras: (softrainsData && softrainsData.cameras) || data.cameras || {}
    };

    lastDevicesSnapshot = nextSnapshot;
    redrawDeviceActivations();
  } catch (e) {
    console.warn('Failed to refresh map activations:', e);
  }
}

function cleanUpTimeAgo(triggerDate) {
  // Accept ISO string or Date
  const now = new Date();
  let dateObj = triggerDate instanceof Date ? triggerDate : new Date(String(triggerDate));
  let diffMs = now - dateObj;
  if (!isNaN(diffMs) && diffMs >= 0) {
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    const pad = n => n.toString().padStart(2, '0');
    return `${hours}:${pad(mins)}:${pad(secs)}`;
  }
  return "--:--:--";
}

function getCameraFromZone(zoneName) {
  return (houselayer && houselayer.zones && houselayer.zones[zoneName]) || null;
}

function drawDeviceActivationZones(angleOffsets, cameraCoords, device, timeAgo = '') {
  // Use Polygon3DElement for maps3d overlays
  const { Polygon3DInteractiveElement, AltitudeMode } = google.maps.maps3d;
  const baseAltitude = (cameraCoords.altitude || 10) + 8;
  const arcPath = computeGoogleArcSector(
    cameraCoords.lat,
    cameraCoords.lng,
    cameraCoords.orientation + (angleOffsets[0].xAngle + angleOffsets[1].xAngle) / 2,
    18,
    angleOffsets[1].xAngle - angleOffsets[0].xAngle
  ).map(coord => ({ lat: coord.lat, lng: coord.lng, altitude: baseAltitude }));
  const color = getDeviceColor(device);
  const polygonOptions = {
    strokeColor: color + 'CC',
    strokeWidth: 3,
    fillColor: color + '80',
    drawsOccludedSegments: false,
    extruded: true,
    altitudeMode: AltitudeMode.RELATIVE_TO_GROUND
  };
  const poly3d = new Polygon3DInteractiveElement(polygonOptions);
  poly3d.path = arcPath;
  map.append(poly3d);
  if (!coverageVisible) {
    if (poly3d.remove) poly3d.remove();
    else if (poly3d.setMap) poly3d.setMap(null);
  }
  coveragePolygons.push(poly3d);
  activationPolygons.push(poly3d);

  // Add hover event for popup with zone and detection type icons, and time only
  if (device && device.LastTrigger) {
    // Show info popup using Marker3DInteractiveElement at arc endpoint
    // Declare infoMarker once per device activation zone
    let infoMarker = null;
    poly3d.addEventListener('gmp-click', async function () {
      // Use the last point in arcPath as the endpoint
      const endpoint = arcPath[arcPath.length - 1];
      // Change stroke color randomly
      const colors = ["#EA4335CC", "#4285F4CC", "#34A853CC", "#FBBC05CC", "#FF6D01CC", "#46BD62CC"];
      poly3d.strokeColor = colors[Math.floor(Math.random() * colors.length)];

      // Build info popup content with raw values
      const zoneName = device.LastTrigger.TriggerZone;
      const triggerType = device.LastTrigger.TriggerType;
      let zoneIcon = '';
      let typeIcon = '';

      // Try to get zone icon from localStorage preferences
      if (zoneIcons.length) {
        const z = zoneIcons.find(z => z.name.indexOf(zoneName) > -1);
        if (z) zoneIcon = z.icon;
      }
      if (!zoneIcon) zoneIcon = '📍'; // map pin for zone

      // Get trigger type icon from ICONS object
      typeIcon = ICONS[triggerType] || '❓'; // Use the actual icon or question mark if not found

      const rawZoneIcon = zoneName;
      const rawTypeIcon = triggerType;

      let snapshotUrl = '';
      if (device.LastTrigger && device.LastTrigger.TriggerID) {
        snapshotUrl = `${CAM2HUB_PROXY_HOST}/snapshot?eventId=${device.LastTrigger.TriggerID}`;
      }
      const html = `
        <div class="event-popup-container">
          <div class="event-popup-header">
            <div class="event-icons">
              <span class="event-zone-icon" title="Zone: ${rawZoneIcon}">${zoneIcon}</span>
              <span class="event-type-icon" title="Type: ${rawTypeIcon}">${typeIcon}</span>
            </div>
            <span class="event-time">${timeAgo}</span>
          </div>          
          ${snapshotUrl ? `<img src='${snapshotUrl}' class="event-snapshot" />` : ''}
        </div>
      `;

      const { PopoverElement } = google.maps.maps3d;
      const popover = new PopoverElement({
        open: true,
        positionAnchor: { lat: endpoint.lat, lng: endpoint.lng, altitude: endpoint.altitude },
      });
      popover.append(parser.parseFromString(html, 'text/html').body.firstChild);
      map.append(popover);

    });
  }
}

// Returns a color string based on a hash of the device's name
function getDeviceColor(device) {
  const name = device.LastTrigger.TriggerZone + device.DeviceId
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate color from hash
  const r = (hash >> 16) & 0xFF;
  const g = (hash >> 8) & 0xFF;
  const b = hash & 0xFF;
  // Use pastel colors for better visibility
  const pr = (r + 128) % 256;
  const pg = (g + 128) % 256;
  const pb = (b + 128) % 256;
  // Return as hex string for Google Maps compatibility
  return `#${pr.toString(16).padStart(2, '0')}${pg.toString(16).padStart(2, '0')}${pb.toString(16).padStart(2, '0')}`;
}
