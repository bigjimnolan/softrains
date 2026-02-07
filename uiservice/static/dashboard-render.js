// --- Icon constants for device and action ---
const DEVICE_ICON = '🤖'; // robot head
const ACTION_ICON = '⚡'; // lightning bolt
// --- Symbol/Color/Icon helpers ---
// --- UI/Modal/Notification/Fetch helpers (from ui.js) ---

function showNotification(msg, success = true) {
  var n = document.getElementById('notification');
  n.style.display = 'block';
  n.style.background = success ? '#e0ffe0' : '#ffe0e0';
  n.textContent = msg;
  setTimeout(() => { n.style.display = 'none'; }, 3000);
}

function closeModal() {
  document.getElementById('modal-bg').style.display = 'none';
  document.getElementById('modal-content').innerHTML = '';
}

function showActionModal(mode, id, el) {
  let action = { deviceId: '', delay: '', primaryAction: '', secondaryAction: '', cameraSource: '', backoff: '' };
  if (mode === 'edit' && el) {
    let row = el.closest('tr').children;
    action.deviceId = row[0].textContent;
    action.delay = row[1].textContent;
    action.primaryAction = row[2].textContent;
    action.secondaryAction = row[3].textContent;
    action.cameraSource = row[4].textContent;
    action.backoff = row[5].textContent;
  }
  let html = `
    <h3>${mode === 'add' ? 'Add' : 'Edit'} <span class="robot-action-icon" style="font-size:1.2em;vertical-align:middle;">${DEVICE_ICON}${ACTION_ICON}</span></h3>
    <form onsubmit="submitAction(event, '${mode}', '${action.deviceId}')">
      <label>DeviceID: <input name="deviceId" value="${action.deviceId}" ${mode === 'edit' ? 'readonly' : ''}></label><br>
      <label>Delay: <input name="delay" value="${action.delay}"></label><br>
      <label>PrimaryAction: <input name="primaryAction" value="${action.primaryAction}"></label><br>
      <label>SecondaryAction: <input name="secondaryAction" value="${action.secondaryAction}"></label><br>
      <label>CameraSource: <input name="cameraSource" value="${action.cameraSource}"></label><br>
      <label>Backoff: <input name="backoff" value="${action.backoff}"></label><br>
      <button type="submit">${mode === 'add' ? 'Create' : 'Update'}</button>
    </form>
  `;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').style.display = 'block';
}

function showDeviceModal(mode, id, el) {
  let device = { deviceId: '', apiId: '', deviceUrl: '', deviceBackoff: '', notes: '' };
  if (mode === 'edit' && el) {
    let row = el.closest('tr').children;
    device.deviceId = row[0].textContent;
    device.apiId = row[1].textContent;
    device.deviceUrl = row[2].textContent;
    device.deviceBackoff = row[3].textContent;
    device.notes = row[4].textContent;
  }
  let html = `
    <h3>${mode === 'add' ? 'Add' : 'Edit'} Device</h3>
    <form onsubmit="submitDevice(event, '${mode}', '${device.deviceId}')">
      <label>DeviceId: <input name="deviceId" value="${device.deviceId}" ${mode === 'edit' ? 'readonly' : ''}></label><br>
      <label>APIId: <input name="apiId" value="${device.apiId}"></label><br>
      <label>DeviceURL: <input name="deviceUrl" value="${device.deviceUrl}"></label><br>
      <label>DeviceBackoff: <input name="deviceBackoff" value="${device.deviceBackoff}"></label><br>
      <label>Notes: <input name="notes" value="${device.notes}"></label><br>
      <button type="submit">${mode === 'add' ? 'Create' : 'Update'}</button>
    </form>
  `;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').style.display = 'block';
}

function submitAction(e, mode, id) {
  e.preventDefault();
  let form = e.target;
  let data = new URLSearchParams(new FormData(form));
  fetch(`/action?mode=${mode}`, {
    method: 'POST',
    body: data,
    credentials: 'same-origin'
  }).then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(() => {
      showNotification(`Action ${mode === 'add' ? 'created' : 'updated'} successfully!`);
      closeModal();
      setTimeout(() => location.reload(), 60000);
    })
    .catch(() => showNotification('Failed to update action', false));
}

function deleteAction(id) {
  if (!confirm('Delete this action?')) return;
  fetch(`/action?mode=delete&id=${id}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  }).then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(() => {
      showNotification('Action deleted successfully!');
      setTimeout(() => location.reload(), 60000);
    })
    .catch(() => showNotification('Failed to delete action', false));
}

function submitDevice(e, mode) {
  e.preventDefault();
  let form = e.target;
  let data = new URLSearchParams(new FormData(form));
  fetch(`/device?mode=${mode}`, {
    method: 'POST',
    body: data,
    credentials: 'same-origin'
  }).then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(() => {
      showNotification(`Device ${mode === 'add' ? 'created' : 'updated'} successfully!`);
      closeModal();
      setTimeout(() => location.reload(), 60000);
    })
    .catch(() => showNotification('Failed to update device', false));
}

function deleteDevice(id) {
  if (!confirm('Delete this device?')) return;
  fetch(`/device?mode=delete&id=${id}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  }).then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(() => {
      showNotification('Device deleted successfully!');
      setTimeout(() => location.reload(), 60000);
    })
    .catch(() => showNotification('Failed to delete device', false));
}

// Utility to deep compare two objects (simple version)
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fetchAndUpdateUI() {
  fetch('/api?command=getAll')
    .then(res => res.json())
    .then(data => {
      if (!window.softrainsData || !deepEqual(data, window.softrainsData)) {
        window.softrainsData = data;
        if (typeof renderDashboard === "function") {
          renderDashboard(window.softrainsData);
        }
        console.log("UIService API poll: data updated");
      } else {
        console.log("UIService API poll: no changes detected");
      }
    })
    .catch(err => {
      console.error("Error fetching UI data:", err);
    });
}
// Example: poll every 30 seconds
setInterval(fetchAndUpdateUI, 30000);

// Deterministic hash for consistent symbol assignment
function hashString(str) {
  str = String(str ?? ""); // Ensure str is always a string
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}


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

const colors = ["#ffb300", "#29b6f6", "#66bb6a", "#ab47bc", "#ef5350"];
const shapeKeys = ["circle", "square", "triangle", "ellipse", "diamond"];

function getSymbolForKey(key) {
  key = String(key ?? "");
  // Try direct match in ICONS
  if (ICONS[key]) {
    if (typeof ICONS[key] === "function") return ICONS[key](colors[0]);
    return ICONS[key];
  }

  // --- Random icon assignment for unknowns (session-persistent) ---
  if (!window._softrainsRandomIcons) window._softrainsRandomIcons = {};
  const randomIcons = window._softrainsRandomIcons;
  // Only consider string icons (not SVG functions)
  const iconList = Object.entries(ICONS).filter(([k, v]) => typeof v === 'string').map(([k, v]) => v);
  if (!randomIcons[key]) {
    // Assign a random icon for this key, persist for session
    randomIcons[key] = iconList[Math.floor(Math.random() * iconList.length)];
  }
  return randomIcons[key];
}

// Analog clock SVG with time label
function clockIcon(seconds, label) {
  seconds = Number(seconds) || 0;
  let angle = (seconds % 60) * 6; // 360/60
  let min = Math.floor(seconds / 60) % 60;
  let hour = Math.floor(seconds / 3600) % 12;
  let hourAngle = (hour + min / 60) * 30; // 360/12
  return `
    <span title="${label}">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="12" fill="#fffde7" stroke="#ffb300" stroke-width="2"/>
        <line x1="14" y1="14" x2="${14 + 7 * Math.sin(Math.PI * hourAngle / 180)}" y2="${14 - 7 * Math.cos(Math.PI * hourAngle / 180)}" stroke="#2e4053" stroke-width="2"/>
        <line x1="14" y1="14" x2="${14 + 10 * Math.sin(Math.PI * angle / 180)}" y2="${14 - 10 * Math.cos(Math.PI * angle / 180)}" stroke="#ef5350" stroke-width="1"/>
      </svg>
      <span style="font-size:0.9em;vertical-align:middle;">${label}</span>
    </span>
  `;
}

// Timer SVG for backoff (always 60s)
function timerIcon(label) {
  return `
    <span title="${label}">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="12" fill="#fffde7" stroke="#29b6f6" stroke-width="2"/>
        <path d="M14 14 L14 4" stroke="#29b6f6" stroke-width="2"/>
        <circle cx="14" cy="14" r="10" fill="none" stroke="#29b6f6" stroke-width="2" stroke-dasharray="62.8" stroke-dashoffset="0"/>
      </svg>
      <span style="font-size:0.9em;vertical-align:middle;">${label}</span>
    </span>
  `;
}

// Standard icons for primary/secondary actions
const actionIcons = {
  "on": "&#128994;",    // green circle
  "off": "&#128308;",   // red circle
  "open": "&#128682;",  // door
  "close": "&#128274;"  // lock
};
function getActionIcon(val) {
  val = (val || '').toLowerCase();
  if (actionIcons[val]) {
    return `<span title="${val}">${actionIcons[val]}</span>`;
  }
  // fallback: random symbol
  return `<span title="${val}">${getSymbolForKey(val)}</span>`;
}

// Camera source: double icon
function getCameraSourceIcon(val) {
  if (!val) return "";
  let [zone, obj] = val.split(':');
  zone = zone || '';
  obj = (obj || '').toLowerCase().replace(/\s+/g, '_');
  let zoneIcon = getSymbolForKey(zone);
  let objIcon = getSymbolForKey(obj);
  return `<span title="${val}" style="display:inline-flex;align-items:center;gap:0.2em;">${zoneIcon}${objIcon}</span>`;
}

// --- Renderers ---

function renderDashboard(data) {
  renderActionsTable(data.actions);
  renderDevicesTable(data.devices);
}

function renderActionsTable(actions) {
  const container = document.getElementById('actions-table-container');
  let html = `
    <h2>
      <span class="robot-action-icon" style="font-size:1.2em;vertical-align:middle;">${ACTION_ICON}</span>
      <span class="add-btn" onclick="showActionModal('add')"></span>
    </h2>
    <table class="table" id="actions-table">
      <thead>
        <tr>
          <th title="DeviceID"><span class="header-icon" aria-label="DeviceID" title="DeviceID">${DEVICE_ICON}</span></th>          
          <th title="PrimaryAction"><span class="header-icon" aria-label="PrimaryAction" title="Primary Action">&#9889;</span></th>
          <th title="SecondaryAction"><span class="header-icon" aria-label="SecondaryAction" title="Secondary Action">&#10133;</span></th>
          <th title="Delay"><span class="header-icon" aria-label="Delay" title="Delay">&#9200;</span></th>
          <th title="CameraSource"><span class="header-icon" aria-label="CameraSource" title="Camera Source">&#128247;</span></th>
          <th title="Backoff"><span class="header-icon" aria-label="Backoff" title="Backoff">&#9203;</span></th>
          <th class="actions" title="Actions"><span class="header-icon" aria-label="Actions" title="Actions">&#9881;</span></th>
          <th class="scrollpad"></th>
        </tr>
      </thead>
      <tbody>
  `;
  if (actions && actions.length > 0) {
    actions.forEach(action => {
      html += `
        <tr>
          <td class="symbol-id" title="${action.deviceId ?? ''}">${renderIconCell(action.deviceId)}</td>  
          <td class="primary-action" title="${action.primaryAction ?? ''}">${renderIconCell(action.primaryAction)}</td>
          <td class="secondary-action" title="${action.secondaryAction ?? ''}">${renderIconCell(action.secondaryAction)}</td>
          <td class="enticing-btn" title="${action.delay ?? ''}">${clockIcon(Number(action.delay), action.delay ?? '')}</td>
          <td class="camera-source" title="${action.cameraSource ?? ''}">${getCameraSourceIcon(action.cameraSource)}</td>
          <td class="enticing-btn" title="${action.backoff ?? ''}">${timerIcon(action.backoff ?? '')}</td>
          <td class="actions" style="padding-right:0;">
            <span class="edit-btn" onclick="showActionModal('edit', '${action.deviceId}', this)"></span>
            <span class="delete-btn" onclick="deleteAction('${action.deviceId}')"></span>
          </td>
          <td class="scrollpad"><span style="display:inline-block;width:24px;height:24px;opacity:0;"></span></td>
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="8">No actions found.</td></tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderDevicesTable(devicesObj) {
  const container = document.getElementById('devices-table-container');
  let html = `
    <h2>
      <span class="robot-action-icon" style="font-size:1.2em;vertical-align:middle;">${DEVICE_ICON}</span>
      <span class="add-btn" onclick="showDeviceModal('add')"></span>
    </h2>
    <table class="table" id="devices-table">
      <thead>
        <tr>
          <th class="th-deviceid" title="DeviceID"><span class="header-icon" aria-label="DeviceID" title="DeviceID">${DEVICE_ICON}</span></th>
          <th class="th-apiid" title="APIID"><span class="header-icon" aria-label="APIID" title="API ID">&#128273;</span></th>
          <th class="th-url" title="DeviceURL"><span class="header-icon" aria-label="DeviceURL" title="Device URL">&#128279;</span></th>
          <th class="th-backoff" title="DeviceBackoff"><span class="header-icon" aria-label="DeviceBackoff" title="Device Backoff">&#9203;</span></th>
          <th class="th-trigger" title="Last Trigger"><span class="header-icon" aria-label="Last Trigger" title="Last Trigger">&#9201;</span></th>
          <th class="th-actions actions" title="Actions"><span class="header-icon" aria-label="Actions" title="Actions">&#9881;</span></th>
          <th class="scrollpad"></th>
        </tr>
      </thead>
      <tbody>
  `;
  const devices = Object.values(devicesObj || {});
  // Sort by DeviceId
  if (devices.length > 0) {
    devices.forEach(dev => {
      html += `
        <tr>
          <td class="symbol-id" title="${dev.DeviceId ?? ''}">${renderIconCell(dev.DeviceId)}</td>
          <td class="symbol-id" title="${dev.APIId ?? ''}">${renderIconCell(dev.APIId)}</td>
          <td class="device-url" title="${dev.DeviceURL ?? ''}">${renderIconCell(dev.DeviceURL)}</td>
          <td class="enticing-btn" title="${dev.DeviceBackoff ?? ''}">${timerIcon(dev.DeviceBackoff ?? '')}</td>
          <td>
            <div class="last-trigger enticing-btn" title="${dev.LastTrigger?.TriggerType ?? 'No trigger info'}">
              ${dev.LastTrigger
          ? `<span class="symbol-timestamp" title="${dev.LastTrigger.TriggerTime}">${getCameraSourceIcon(dev.LastTrigger.TriggerZone + ":" + dev.LastTrigger.TriggerType)}</span>`
          : `<span class="symbol-empty"><em>No trigger info</em></span>`}
            </div>
          </td>
          <td class="actions" style="padding-right:0;">
            <span class="edit-btn" onclick="showDeviceModal('edit', '${dev.DeviceId}', this)"></span>
            <span class="delete-btn" onclick="deleteDevice('${dev.DeviceId}')"></span>
          </td>
          <td class="scrollpad"><span style="display:inline-block;width:24px;height:24px;opacity:0;"></span></td>
        </tr>
      `;
    });
  } else {
    html += `<tr><td colspan="7">No devices found.</td></tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;
}

// --- Modal logic for detection zones/types ---
function openZoneTypeModal() {

  // Gather unique values for every field in actions and devices
  const actions = window.softrainsData.actions || [];
  const devices = Object.values(window.softrainsData.devices || {});
  const prefs = JSON.parse(localStorage.getItem("softrainsZoneTypePrefs") || "{}");
  const iconChoices = Object.entries(ICONS)
    .filter(([k, v]) => typeof v === "string")
    .map(([k, v]) => ({ key: k, icon: v }));

  // Helper to collect unique values for a field from a list of objects
  function collectUnique(objs, field) {
    const set = new Set();
    objs.forEach(obj => {
      if (obj[field]) set.add(String(obj[field]));
    });
    return set;
  }

  // List of fields to manage for actions and devices
  const actionFields = ["deviceId", "delay", "primaryAction", "secondaryAction", "cameraSource", "backoff"];
  const deviceFields = ["APIId", "DeviceURL", "DeviceBackoff", "Notes"]; // Exclude DeviceId as it's same as deviceId in actions


  // --- Hardcoded icon mapping for field toggles ---
  const FIELD_ICONS = {
    deviceId: DEVICE_ICON,
    delay: '⏱️',
    primaryAction: ACTION_ICON,
    secondaryAction: '➕',
    cameraSource: '📷',
    backoff: '⏳',
    APIId: '🔑',
    DeviceURL: '🔗',
    DeviceBackoff: '⏳',
    Notes: '📝'
  };

  // --- Toggle state for each field ---
  const fieldToggles = {};
  [...actionFields, ...deviceFields].forEach(f => fieldToggles[f] = true);

  // --- Toggle filter controls ---
  let html = '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">';
  // Add power switch icon for "show all" toggle
  html += `<span id="toggle-all-fields" title="Show all fields" style="cursor:pointer;font-size:1.5em;opacity:1;transition:opacity 0.2s;">&#128268;</span>`;
  // (Removed from here; will add as a button to the right controls below)
  [...actionFields, ...deviceFields].forEach(field => {
    const icon = FIELD_ICONS[field] || '❓';
    html += `<span class="field-toggle" data-field="${field}" style="cursor:pointer;font-size:1.5em;opacity:1;transition:opacity 0.2s;">${icon}</span>`;
  });
  html += '</div>';

  // --- All mappings, grouped by field ---
  [...actionFields, ...deviceFields].forEach(field => {
    const values = field.startsWith('Device') ? collectUnique(devices, field) : collectUnique(actions, field);
    if (values.size > 0) {
      html += `<div class="field-mapping-group" data-field-group="${field}"><strong>${field}</strong><ul>`;
      values.forEach(val => {
        html += `<li>
          <span class="zone-symbol">${prefs[val] || getSymbolForKey(val)}</span>
          <span>${val}</span>
          <select data-iconkey="${val}">
            <option value="">(auto)</option>
            ${iconChoices.map(({ key, icon }) => `<option value="${key}"${prefs[val] === icon ? ' selected' : ''}>${icon}</option>`).join("")}
          </select>
        </li>`;
      });
      html += `</ul></div>`;
    }
  });

  document.getElementById("zone-type-list").innerHTML = html;
  document.getElementById("zone-type-modal").style.display = "block";

  // --- Toggle logic for field icons ---
  document.querySelectorAll('.field-toggle').forEach(toggle => {
    toggle.addEventListener('click', function () {
      const field = this.getAttribute('data-field');
      fieldToggles[field] = !fieldToggles[field];
      this.style.opacity = fieldToggles[field] ? '1' : '0.3';
      // Show/hide the mapping group
      const group = document.querySelector(`.field-mapping-group[data-field-group="${field}"]`);
      if (group) group.style.display = fieldToggles[field] ? '' : 'none';
    });
  });

  // --- Toggle all fields logic (power switch icon) ---
  const toggleAll = document.getElementById('toggle-all-fields');
  if (toggleAll) {
    let allVisible = true;
    toggleAll.addEventListener('click', function () {
      allVisible = !allVisible;
      // Set all fieldToggles and update UI
      Object.keys(fieldToggles).forEach(f => fieldToggles[f] = allVisible);
      document.querySelectorAll('.field-toggle').forEach(t => t.style.opacity = allVisible ? '1' : '0.3');
      document.querySelectorAll('.field-mapping-group').forEach(g => g.style.display = allVisible ? '' : 'none');
      // Optionally, visually indicate power switch is active
      toggleAll.style.opacity = allVisible ? '1' : '0.3';
    });
  }

  // Add gear icon button for direct ICONS edit to the right controls
  const modalList = document.getElementById('zone-type-list');
  if (modalList && !document.getElementById('edit-icons-object')) {
    const gearBtn = document.createElement('button');
    gearBtn.id = 'edit-icons-object';
    gearBtn.title = 'Edit all icons directly';
    gearBtn.innerHTML = '&#9881;'; // gear icon
    gearBtn.style.float = 'right';
    gearBtn.style.background = 'none';
    gearBtn.style.border = 'none';
    gearBtn.style.fontSize = '1.5em';
    gearBtn.style.cursor = 'pointer';
    gearBtn.style.opacity = '0.7';
    gearBtn.style.marginRight = '8px';
    gearBtn.onclick = function () {
      // Hide all other controls and groups
      document.querySelectorAll('.field-toggle').forEach(t => t.style.opacity = '0.3');
      const toggleAll = document.getElementById('toggle-all-fields');
      if (toggleAll) toggleAll.style.opacity = '0.3';
      document.querySelectorAll('.field-mapping-group').forEach(g => g.style.display = 'none');
      // Show a textarea for editing ICONS
      let existing = document.getElementById('icons-edit-area');
      if (!existing) {
        let area = document.createElement('textarea');
        area.id = 'icons-edit-area';
        area.style.width = '100%';
        area.style.height = '300px';
        area.style.margin = '16px 0';
        area.value = JSON.stringify(ICONS, null, 2);
        let saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save ICONS';
        saveBtn.style.marginRight = '8px';
        saveBtn.onclick = function () {
          try {
            let newIcons = JSON.parse(area.value);
            Object.keys(ICONS).forEach(k => delete ICONS[k]);
            Object.assign(ICONS, newIcons);
            showNotification('ICONS updated. Refresh to see changes.', true);
          } catch (e) {
            showNotification('Invalid JSON for ICONS.', false);
          }
        };
        let cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = function () {
          area.remove();
          saveBtn.remove();
          cancelBtn.remove();
          // Restore all controls
          document.querySelectorAll('.field-toggle').forEach(t => t.style.opacity = '1');
          const toggleAll = document.getElementById('toggle-all-fields');
          if (toggleAll) toggleAll.style.opacity = '1';
          document.querySelectorAll('.field-mapping-group').forEach(g => g.style.display = '');
        };
        modalList.appendChild(area);
        modalList.appendChild(saveBtn);
        modalList.appendChild(cancelBtn);
      }
    };
    modalList.prepend(gearBtn);
  }

  // Add autofill button next to clear storage button (top right)
  if (!document.getElementById('autofill-icons-btn')) {
    const autofillBtn = document.createElement('button');
    autofillBtn.id = 'autofill-icons-btn';
    autofillBtn.title = 'Auto-fill all icons';
    autofillBtn.innerHTML = '&#11035;'; // black large square as a generic icon
    autofillBtn.style.float = 'right';
    autofillBtn.style.background = 'none';
    autofillBtn.style.border = 'none';
    autofillBtn.style.fontSize = '1.5em';
    autofillBtn.style.cursor = 'pointer';
    autofillBtn.style.opacity = '0.7';
    autofillBtn.style.marginRight = '8px';
    autofillBtn.onclick = autofillAllZoneIcons;
    const modalList = document.getElementById('zone-type-list');
    if (modalList) modalList.prepend(autofillBtn);
  }
  // Auto-fill all icon selects in the Detection Zones & Types modal
  function autofillAllZoneIcons() {
    // For each select, pick a deterministic icon (not (auto))
    document.querySelectorAll('#zone-type-list select[data-iconkey]').forEach(sel => {
      if (!sel.value) {
        const key = sel.getAttribute('data-iconkey');
        // Use getSymbolForKey, but ensure it's a string icon (not a function)
        let icon = getSymbolForKey(key);
        // If getSymbolForKey returns a function, fallback to a random emoji
        if (typeof icon === 'function') {
          // fallback: pick a random emoji from ICONS
          const iconList = Object.values(ICONS).filter(v => typeof v === 'string');
          icon = iconList[Math.floor(Math.random() * iconList.length)];
        }
        // Set the select to the option with this icon
        for (let i = 0; i < sel.options.length; ++i) {
          if (sel.options[i].innerHTML === icon) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
    });
  }
}

function closeZoneTypeModal() {
  document.getElementById("zone-type-modal").style.display = "none";
}

function saveZoneTypePrefs() {
  const prefs = {};
  // For all icon selects, store icon or remove key for (auto)
  document.querySelectorAll('#zone-type-list select[data-iconkey]').forEach(sel => {
    const key = sel.getAttribute('data-iconkey');
    if (sel.value) {
      const selectedOption = sel.options[sel.selectedIndex];
      prefs[key] = selectedOption ? selectedOption.innerHTML : sel.value;
    } else {
      // Remove override for (auto)
      delete prefs[key];
    }
  });
  localStorage.setItem("softrainsZoneTypePrefs", JSON.stringify(prefs));
  closeZoneTypeModal();
  // Re-render dashboard with latest data to apply new icons
  if (typeof fetchAndUpdateUI === 'function') {
    fetchAndUpdateUI();
  } else {
    renderDashboard(window.softrainsData);
  }
}

// Optionally, update getSymbolForKey to check prefs first:
const origGetSymbolForKey = getSymbolForKey;
window.getSymbolForKey = function (key) {
  const prefs = JSON.parse(localStorage.getItem("softrainsZoneTypePrefs") || "{}");
  if (prefs[key]) return prefs[key];
  return origGetSymbolForKey(key);
};

// Place this after your DOMContentLoaded or at the end of your JS files
document.addEventListener("DOMContentLoaded", function () {
  // Theme toggle logic
  function enableSoftrainsTheme() {
    document.body.classList.add('softrains-theme');
    // Optionally hide header
    let h1 = document.querySelector('h1');
    if (h1) h1.style.display = 'none';
  }

  function disableSoftrainsTheme() {
    document.body.classList.remove('softrains-theme');
    // Optionally show header
    let h1 = document.querySelector('h1');
    if (h1) h1.style.display = '';
  }
  const themeToggle = document.getElementById('theme-toggle');
  const iconModalBtn = document.getElementById('icon-modal-btn');



  // --- Create and append clear storage button to modal ---
  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-storage-btn';
  clearBtn.title = 'Clear all local storage';
  clearBtn.innerHTML = '&#128465;';
  clearBtn.style.float = 'right';
  clearBtn.style.background = 'none';
  clearBtn.style.border = 'none';
  clearBtn.style.fontSize = '1.5em';
  clearBtn.style.cursor = 'pointer';
  clearBtn.style.opacity = '0.7';
  clearBtn.onclick = function () {
    if (confirm('Clear all local storage for this site?')) {
      localStorage.clear();
      location.reload();
    }
  };

  // When the modal opens, insert the button at the top right of the modal content
  const origOpenZoneTypeModal = openZoneTypeModal;
  window.openZoneTypeModal = function () {
    origOpenZoneTypeModal.apply(this, arguments);
    // Insert the button if not already present
    const modalList = document.getElementById('zone-type-list');
    if (modalList && !document.getElementById('clear-storage-btn')) {
      modalList.prepend(clearBtn);
    }
  };

  function updateIconBtnVisibility() {
    if (document.body.classList.contains('softrains-theme')) {
      iconModalBtn.style.display = '';
      clearBtn.style.display = '';
    } else {
      iconModalBtn.style.display = 'none';
      clearBtn.style.display = 'none';
    }
  }

  if (themeToggle && iconModalBtn) {
    themeToggle.addEventListener('change', function () {
      if (this.checked) {
        enableSoftrainsTheme();
        localStorage.setItem('softrains-theme', 'on');
      } else {
        disableSoftrainsTheme();
        localStorage.setItem('softrains-theme', 'off');
      }
      updateIconBtnVisibility();
    });

    // On load, restore theme preference
    if (window.localStorage && localStorage.getItem('softrains-theme') === 'on') {
      themeToggle.checked = true;
      enableSoftrainsTheme();
    } else {
      themeToggle.checked = false;
      disableSoftrainsTheme();
    }
    updateIconBtnVisibility();
    iconModalBtn.onclick = openZoneTypeModal;
  }
});

// Helper to render icon or fallback to text if not a valid icon key
function renderIconCell(val) {
  if (!val) return '';
  // If the value is a key in ICONS, render the icon
  if (ICONS[val]) {
    if (typeof ICONS[val] === 'function') return ICONS[val](colors[0]);
    return ICONS[val];
  }
  // Otherwise, fallback to getSymbolForKey (which will hash if not found)
  return getSymbolForKey(val);
}