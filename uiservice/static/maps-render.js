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
// --- Custom Legend and Overlay Toggle ---
let coveragePolygons = [];
let coverageVisible = true;

// --- JWT Authentication for cam2hub.local:8971 ---
const CAM2HUB_HOST = 'https://cam2hub.local:8971';
const CAM2HUB_PROXY_HOST = '/api/cam2hub';
const JWT_STORAGE_KEY = 'cam2hub_jwt_token';

// Get stored JWT token
function getStoredJWT() {
  return localStorage.getItem(JWT_STORAGE_KEY);
}

// Check if JWT token exists and is valid
async function ensureJWTToken() {
  const token = getStoredJWT();
  if (token) {
    return true;
  }
  // Show login modal if no token
  await showLoginModal();
  return getStoredJWT() !== null;
}

// Show login modal
async function showLoginModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'cam2hub-login-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      width: 90%;
      max-width: 400px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Camera Service Login';
    title.style.marginTop = '0';

    const userLabel = document.createElement('label');
    userLabel.textContent = 'Username:';
    userLabel.style.display = 'block';
    userLabel.style.marginBottom = '8px';
    userLabel.style.fontWeight = 'bold';

    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.placeholder = 'Enter username';
    userInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
      font-size: 14px;
    `;

    const passLabel = document.createElement('label');
    passLabel.textContent = 'Password:';
    passLabel.style.display = 'block';
    passLabel.style.marginBottom = '8px';
    passLabel.style.fontWeight = 'bold';

    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.placeholder = 'Enter password';
    passInput.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
      font-size: 14px;
    `;

    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      color: #d32f2f;
      margin-bottom: 16px;
      display: none;
      font-size: 14px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';

    const loginBtn = document.createElement('button');
    loginBtn.textContent = 'Login';
    loginBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    `;
    loginBtn.addEventListener('mouseenter', () => {
      loginBtn.style.backgroundColor = '#1976D2';
    });
    loginBtn.addEventListener('mouseleave', () => {
      loginBtn.style.backgroundColor = '#2196F3';
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 10px;
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.backgroundColor = '#d32f2f';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.backgroundColor = '#f44336';
    });

    buttonContainer.appendChild(loginBtn);
    buttonContainer.appendChild(cancelBtn);

    modalContent.appendChild(title);
    modalContent.appendChild(userLabel);
    modalContent.appendChild(userInput);
    modalContent.appendChild(passLabel);
    modalContent.appendChild(passInput);
    modalContent.appendChild(errorMsg);
    modalContent.appendChild(buttonContainer);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
    };

    loginBtn.addEventListener('click', async () => {
      const username = userInput.value.trim();
      const password = passInput.value.trim();

      if (!username || !password) {
        errorMsg.textContent = 'Please enter both username and password';
        errorMsg.style.display = 'block';
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';

      try {
        const response = await fetch(`${CAM2HUB_PROXY_HOST}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user: username,
            password: password,
          }),
          credentials: 'include',
        });

        if (response.ok) {
          // The JWT is set as a cookie by the server
          closeModal();
          resolve();
        } else {
          errorMsg.textContent = 'Login failed. Please check your credentials.';
          errorMsg.style.display = 'block';
          loginBtn.disabled = false;
          loginBtn.textContent = 'Login';
        }
      } catch (error) {
        console.error('Login error:', error);
        errorMsg.textContent = 'An error occurred. Please try again.';
        errorMsg.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
      }
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
      resolve();
    });

    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') passInput.focus();
    });

    passInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loginBtn.click();
    });

    userInput.focus();
  });
}

async function initMap() {
  /* 3d
 
    const map = new Map3DElement({
        center: { lat: 37.7704, lng: -122.3985, altitude: 500 },
        tilt: 67.5,
        mode: 'HYBRID'
    });
    */
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


  // Add points from houselayers.json and overlay detection data from cameras.json
  try {
    // Fetch camera overlay points from JSON
    const resp = await fetch('/static/mapdata/houselayer.json');
    if (!resp.ok) throw new Error('Failed to fetch houselayer.json');
    houselayer = await resp.json();

    // Fetch detection data from cameras.json
    let detectionData = {};
    try {
      const camResp = await fetch('/static/mapdata/cameras.json');
      if (camResp.ok) {
        detectionData = await camResp.json();
        softrainsData.cameras = detectionData.cameras; // make globally available for debugging
      }
    } catch (e) {
      console.warn('Could not load cameras.json for detection overlays:', e);
    }

    // Use 3D markers for each camera
    const { Marker3DElement, PinElement } = await google.maps.importLibrary('maps3d');
    Object.values(houselayer).forEach(pt => {
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
    addCustomLegend();
    getDeviceActivations();
  } catch (e) {
    console.error('Failed to load or parse houselayers.json or detection data:', e);
  }
}

initMap();


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
    if (typeof getDeviceActivations === 'function') {
      // Remove old polygons (for 3D polygons, remove from map)
      coveragePolygons.forEach(poly => {
        if (poly.remove) poly.remove();
        else if (poly.setMap) poly.setMap(null);
      });
      coveragePolygons = [];
      getDeviceActivations();
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
  if (device.LaastTrigger.TriggerZone && zoneIcons.length) {
    const idx = zoneIcons.findIndex(z => z.name === device.LaastTrigger.TriggerZone);
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
  Object.values(softrainsData.devices).forEach(device => {
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
    const cameraCoords = houselayer[camera];
    if (camera === null) {
      console.log('No camera found for zone', device.LastTrigger.TriggerZone);
      return;
    }

    // This is part of more direct mapping of target to zone coordinates
    const coords = softrainsData.cameras[camera].zones[device.LastTrigger.TriggerZone].coordinates.split(',').map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i];
      if (x > maxX) maxX = x;
      if (x < minX) minX = x;
    }
    const angleOffsets = getZoneAngularOffsets([minX, 0, maxX, 0]);

    timeAgo = cleanUpTimeAgo(device.LastTrigger.TriggerTime);

    drawDeviceActivationZones(angleOffsets, cameraCoords, device, timeAgo);
  });
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
  for (const [camName, camData] of Object.entries(softrainsData.cameras)) {
    if (camData.zones && zoneName in camData.zones) {
      return camName;
    }
  }
  return null;
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
  coveragePolygons.push(poly3d);

  // Add hover event for popup with zone and detection type icons, and time only
  if (device && device.LastTrigger) {
    // Show info popup using Marker3DInteractiveElement at arc endpoint
    // Declare infoMarker once per device activation zone
    let infoMarker = null;
    poly3d.addEventListener('gmp-click', async function () {
      // Ensure JWT token is available before making API calls
      await ensureJWTToken();

      // Use the last point in arcPath as the endpoint
      const endpoint = arcPath[arcPath.length - 1];
      // Change stroke color randomly
      const colors = ["#EA4335CC", "#4285F4CC", "#34A853CC", "#FBBC05CC", "#FF6D01CC", "#46BD62CC"];
      poly3d.strokeColor = colors[Math.floor(Math.random() * colors.length)];

      // Build info popup content with raw values
      let zoneIcon = '';
      let typeIcon = '';
      const zoneName = device.LastTrigger.TriggerZone;
      const triggerType = device.LastTrigger.TriggerType;
      let rawZoneIcon = zoneName;
      let rawTypeIcon = triggerType;
      if (zoneIcons.length) {
        const z = zoneIcons.find(z => z.name.indexOf(zoneName) > -1);
        if (z) zoneIcon = z.icon;
        typeIcon = ICONS[triggerType] || triggerType;
      }
      if (!zoneIcon) zoneIcon = '📷';
      if (!typeIcon) typeIcon = '⚡';

      let snapshotUrl = '';
      if (device.LastTrigger && device.LastTrigger.TriggerID) {
        snapshotUrl = `${CAM2HUB_PROXY_HOST}/snapshot?eventId=${device.LastTrigger.TriggerID}`;
      }
      const html = `
        <div style="min-width:100px;display:flex;align-items:center;gap:8px;font-size:1.6em;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span title="${rawZoneIcon}">${zoneIcon}</span>
            <span title="${rawTypeIcon}">${typeIcon}</span>
            <span style="font-size:0.8em;">${timeAgo}</span>
          </div>          
          ${snapshotUrl ? `<img src='${snapshotUrl}' style='margin-top:8px;max-width:180px;max-height:120px;border-radius:6px;border:1px solid #ccc;' />` : ''}
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