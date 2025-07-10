function showNotification(msg, success=true) {
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
  let action = {DeviceID:'', Delay:'', PrimaryAction:'', SecondaryAction:'', CameraSource:'', Backoff:''};
  if (mode === 'edit' && el) {
    let row = el.closest('tr').children;
    action.DeviceID = row[0].textContent;
    action.Delay = row[1].textContent;
    action.PrimaryAction = row[2].textContent;
    action.SecondaryAction = row[3].textContent;
    action.CameraSource = row[4].textContent;
    action.Backoff = row[5].textContent;
  }
  let html = `
    <h3>${mode === 'add' ? 'Add' : 'Edit'} Action</h3>
    <form onsubmit="submitAction(event, '${mode}', '${action.DeviceID}')">
      <label>DeviceID: <input name="deviceId" value="${action.DeviceID}" ${mode==='edit'?'readonly':''}></label><br>
      <label>Delay: <input name="delay" value="${action.Delay}"></label><br>
      <label>PrimaryAction: <input name="primaryAction" value="${action.PrimaryAction}"></label><br>
      <label>SecondaryAction: <input name="secondaryAction" value="${action.SecondaryAction}"></label><br>
      <label>CameraSource: <input name="cameraSource" value="${action.CameraSource}"></label><br>
      <label>Backoff: <input name="backoff" value="${action.Backoff}"></label><br>
      <button type="submit">${mode === 'add' ? 'Create' : 'Update'}</button>
    </form>
  `;
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').style.display = 'block';
}

function showDeviceModal(mode, id, el) {
  let device = {DeviceId:'', APIId:'', DeviceURL:'', DeviceBackoff:'', Notes:''};
  if (mode === 'edit' && el) {
    let row = el.closest('tr').children;
    device.DeviceId = row[0].textContent;
    device.APIId = row[1].textContent;
    device.DeviceURL = row[2].textContent;
    device.DeviceBackoff = row[3].textContent;
    device.Notes = row[4].textContent;
  }
  let html = `
    <h3>${mode === 'add' ? 'Add' : 'Edit'} Device</h3>
    <form onsubmit="submitDevice(event, '${mode}', '${device.DeviceId}')">
      <label>DeviceId: <input name="deviceId" value="${device.DeviceId}" ${mode==='edit'?'readonly':''}></label><br>
      <label>APIId: <input name="apiId" value="${device.APIId}"></label><br>
      <label>DeviceURL: <input name="deviceUrl" value="${device.DeviceURL}"></label><br>
      <label>DeviceBackoff: <input name="deviceBackoff" value="${device.DeviceBackoff}"></label><br>
      <label>Notes: <input name="notes" value="${device.Notes}"></label><br>
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

function submitDevice(e, mode, id) {
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