<template>
  <div>
    <h1 class="page-title">Apps</h1>
    <div class="card" :class="{ 'is-disabled': creating }">
      <button type="button" class="btn btn-primary" @click="showForm = true" :disabled="creating">Add app</button>
    </div>
    <div class="card" v-if="showForm" :class="{ 'is-disabled': creating }">
      <h3 style="margin:0 0 1rem;">New app</h3>
      <div class="source-type-tabs">
        <button type="button" class="source-type-tab" :class="{ active: sourceType === 'git' }" @click="sourceType = 'git'">From Git</button>
        <button type="button" class="source-type-tab" :class="{ active: sourceType === 'zip' }" @click="sourceType = 'zip'">From ZIP</button>
      </div>
      <form @submit.prevent="create">
        <fieldset :disabled="creating">
        <div class="form-group">
          <label>Name</label>
          <input v-model="form.name" type="text" required placeholder="my-app" />
        </div>
        <template v-if="sourceType === 'git'">
        <div class="form-group">
          <label>Repository URL</label>
          <input
            v-model="form.repo_url"
            type="url"
            required
            placeholder="https://github.com/user/repo.git"
            @blur="fetchDefaultBranchIfEmpty"
          />
        </div>
        <div class="form-group">
          <label>Branch, tag, or commit</label>
          <input
            v-model="form.branch"
            type="text"
            placeholder="main, v1.0.0, or abc1234"
            @focus="fetchDefaultBranchIfEmpty"
          />
          <p class="form-hint">Use a branch name, a tag (e.g. v1.0.0), or a commit SHA.</p>
          <p v-if="branchDetected" class="domain-check domain-check--ok">{{ branchDetected }}</p>
        </div>
        <div class="form-group">
          <label>Suggest from repo</label>
          <div class="suggest-row">
            <button
              type="button"
              class="btn"
              :disabled="!form.repo_url?.trim() || suggestLoading"
              @click="suggestFromRepo"
            >
              {{ suggestLoading ? 'Fetching…' : 'Suggest from repo' }}
            </button>
            <span v-if="suggestError" class="suggest-error">{{ suggestError }}</span>
          </div>
        </div>
        </template>
        <div v-else class="form-group">
          <label>Project ZIP</label>
          <input type="file" accept=".zip" @change="onZipSelect" />
          <p class="form-hint">Upload a .zip of your Node project (must contain package.json at root or in a single root folder).</p>
        </div>
        <div class="form-group">
          <label>Use preset</label>
          <select v-model="selectedPresetId" @change="applyPreset">
            <option value="">None</option>
            <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Node version</label>
          <select v-if="nodeVersions.length" v-model="form.node_version">
            <option v-for="v in nodeVersions" :key="v" :value="v">{{ v }}</option>
          </select>
          <template v-else>
            <input v-model="form.node_version" type="text" placeholder="20" />
            <p style="margin:0.25rem 0 0; font-size:0.8rem; color:var(--text-muted);">No versions installed. <router-link to="/node">Install one</router-link> or type a version to install later.</p>
          </template>
        </div>
        <div class="form-group">
          <label>Install command</label>
          <input v-model="form.install_cmd" type="text" placeholder="npm install" />
        </div>
        <div class="form-group">
          <label>Build command (optional)</label>
          <input v-model="form.build_cmd" type="text" placeholder="npm run build" />
        </div>
        <div class="form-group">
          <label>Start command</label>
          <input v-model="form.start_cmd" type="text" placeholder="npm start" />
        </div>
        <div class="form-group">
          <label>Domain (optional)</label>
          <input
            v-model="form.domain"
            type="text"
            placeholder="app.example.com"
            @blur="checkDomain"
          />
          <p v-if="domainCheckStatus === 'checking'" class="domain-check domain-check--checking">Checking domain…</p>
          <p v-else-if="domainCheckStatus === 'ok'" class="domain-check domain-check--ok">{{ domainCheckMessage }}</p>
          <p v-else-if="domainCheckStatus === 'warn'" class="domain-check domain-check--warn">{{ domainCheckMessage }}</p>
          <p v-else-if="domainCheckStatus === 'error'" class="domain-check domain-check--error">{{ domainCheckMessage }}</p>
        </div>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input v-model="form.ssl_enabled" type="checkbox" />
            Enable SSL for this app (requires domain and cert)
          </label>
        </div>
        <div class="action-btns" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary" :disabled="creating">Create app</button>
          <button type="button" class="btn" @click="closeForm" :disabled="creating">Cancel</button>
        </div>
        </fieldset>
      </form>
      <p v-if="createError" style="margin-top:0.5rem; color:var(--danger);">{{ createError }}</p>
    </div>
    <div v-if="creating || creationDone" class="creation-overlay" @click.self="closeCreationOverlay">
      <div class="creation-modal card">
        <div v-if="creating" class="creation-progress">
          <h3 style="margin:0 0 0.5rem; font-size:1rem;">Creating app…</h3>
          <p style="margin:0 0 0.5rem; font-size:0.875rem; color:var(--text-muted);">{{ creationStep }}</p>
          <pre class="creation-logs">{{ creationLogs }}</pre>
        </div>
        <div v-else class="creation-done">
          <h3 style="margin:0 0 0.5rem; font-size:1rem;">{{ createError ? 'Creation failed' : 'App created' }}</h3>
          <p v-if="createError" style="margin:0 0 1rem; font-size:0.875rem; color:var(--danger);">{{ createError }}</p>
          <p v-else style="margin:0 0 1rem; font-size:0.875rem; color:var(--text-muted);">The app is running. You can open it from the list below.</p>
          <p v-if="creationSslWarning" style="margin:0 0 1rem; font-size:0.875rem; color:var(--warn);">SSL could not be obtained: {{ creationSslWarning }}</p>
          <pre v-if="creationLogs && (createError || creationStep)" class="creation-logs">{{ creationStep }}\n{{ creationLogs }}</pre>
          <button type="button" class="btn btn-primary" @click="closeCreationOverlay" style="margin-top:1rem;">Close</button>
        </div>
      </div>
    </div>
    <p v-if="loadError" style="color:var(--danger); margin-bottom:1rem;">{{ loadError }}</p>
    <div class="card" :class="{ 'is-disabled': creating }">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Port</th>
              <th>Size</th>
              <th>SSL</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in apps" :key="app.id">
              <td><router-link :to="`/apps/${app.id}`">{{ app.name }}</router-link></td>
              <td>{{ app.domain || '—' }}</td>
              <td>{{ app.port }}</td>
              <td>{{ formatSize(app.size) }}</td>
              <td>
                <span v-if="app.ssl_active" class="badge badge-success" title="SSL active">SSL ✓</span>
                <span v-else-if="app.ssl_enabled" class="badge badge-warn" title="Certificate pending">SSL …</span>
                <span v-else class="ssl-off">—</span>
              </td>
              <td><span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span></td>
              <td>
                <div class="list-actions">
                  <router-link :to="`/apps/${app.id}`" class="btn btn-sm">Open</router-link>
                  <button type="button" class="btn btn-sm" title="Start" :disabled="app.status === 'running' || busyId === app.id" @click="doStart(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm" title="Stop" :disabled="app.status !== 'running' || busyId === app.id" @click="doStop(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm" title="Restart" :disabled="busyId === app.id" @click="doRestart(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" title="Delete" :disabled="busyId === app.id" @click="confirmDelete(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="apps.length === 0" style="margin:0; color:var(--text-muted);">No apps. Add one above.</p>
    </div>
    <div v-if="showDeleteModal && appToDelete" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="confirm-dialog confirm-dialog--danger">
        <div class="confirm-dialog__icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <h3 class="confirm-dialog__title">Delete app</h3>
        <p class="confirm-dialog__message">Permanently delete <strong>{{ appToDelete.name }}</strong>? This cannot be undone.</p>
        <ul class="confirm-dialog__list">
          <li>Stop and remove from PM2</li>
          <li>Remove nginx config (if any)</li>
          <li>Remove app record and delete the app folder on disk</li>
        </ul>
        <p v-if="deleteError" class="confirm-dialog__error">{{ deleteError }}</p>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn" @click="closeDeleteModal" :disabled="deleting">Cancel</button>
          <button type="button" class="btn btn-danger" @click="doDelete" :disabled="deleting">{{ deleting ? 'Deleting…' : 'Delete permanently' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const apps = ref([]);
const showForm = ref(false);
const creating = ref(false);
const creationDone = ref(false);
const createError = ref('');
const creationStep = ref('');
const creationLogs = ref('');
const creationSslWarning = ref('');
const domainCheckStatus = ref('');
const domainCheckMessage = ref('');
const branchDetected = ref('');
const nodeVersions = ref([]);
const sourceType = ref('git');
const zipFile = ref(null);
const selectedPresetId = ref('');
const suggestLoading = ref(false);
const suggestError = ref('');

const presets = [
  { id: 'nuxt3', label: 'Nuxt 3', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'node .output/server/index.mjs', node_version: '20' },
  { id: 'nextjs', label: 'Next.js', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'npm start', node_version: '20' },
  { id: 'express', label: 'Express', install_cmd: 'npm install', build_cmd: '', start_cmd: 'npm start', node_version: '20' },
  { id: 'nestjs', label: 'Nest.js', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'npm run start:prod', node_version: '20' },
];

const DEFAULT_FORM = {
  name: '',
  repo_url: '',
  branch: 'main',
  node_version: '20',
  install_cmd: 'npm install',
  build_cmd: '',
  start_cmd: 'npm start',
  domain: '',
  ssl_enabled: false,
};

const form = ref({ ...DEFAULT_FORM });

function applyPreset() {
  const id = selectedPresetId.value;
  if (!id) {
    form.value.install_cmd = DEFAULT_FORM.install_cmd;
    form.value.build_cmd = DEFAULT_FORM.build_cmd;
    form.value.start_cmd = DEFAULT_FORM.start_cmd;
    form.value.node_version = nodeVersions.value[0] || DEFAULT_FORM.node_version;
    return;
  }
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  form.value.install_cmd = p.install_cmd;
  form.value.build_cmd = p.build_cmd;
  form.value.start_cmd = p.start_cmd;
  if (nodeVersions.value.includes(p.node_version)) {
    form.value.node_version = p.node_version;
  } else {
    form.value.node_version = p.node_version;
  }
  if (!form.value.name?.trim() && form.value.repo_url?.trim()) {
    try {
      const u = new URL(form.value.repo_url);
      const segs = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segs.length) form.value.name = segs[segs.length - 1];
    } catch (_) {}
  }
}

async function suggestFromRepo() {
  const url = (form.value.repo_url || '').trim();
  if (!url) return;
  suggestError.value = '';
  suggestLoading.value = true;
  try {
    const data = await api.apps.suggest({ repo_url: url, ref: form.value.branch?.trim() || undefined });
    if (data.install_cmd != null) form.value.install_cmd = data.install_cmd;
    if (data.build_cmd != null) form.value.build_cmd = data.build_cmd ?? '';
    if (data.start_cmd != null) form.value.start_cmd = data.start_cmd;
    if (data.node_version != null && (nodeVersions.value.length === 0 || nodeVersions.value.includes(data.node_version))) {
      form.value.node_version = data.node_version;
    }
  } catch (e) {
    suggestError.value = e.message || 'Could not fetch package.json';
  } finally {
    suggestLoading.value = false;
  }
}

function onZipSelect(e) {
  const f = e.target.files && e.target.files[0];
  zipFile.value = f || null;
}

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i <= 1 ? 0 : 1)} ${units[i]}`;
}

const loadError = ref('');
const busyId = ref(null);
const showDeleteModal = ref(false);
const appToDelete = ref(null);
const deleting = ref(false);
const deleteError = ref('');

async function load() {
  loadError.value = '';
  try {
    const data = await api.apps.list();
    apps.value = data.apps || [];
  } catch (e) {
    loadError.value = e.message || 'Failed to load apps';
  }
}

async function loadNodeVersions() {
  try {
    const data = await api.node.versions();
    const list = data.versions || [];
    nodeVersions.value = list;
    if (list.length && !list.includes(form.value.node_version)) {
      form.value.node_version = list[0];
    }
  } catch (_) {}
}

function closeForm() {
  showForm.value = false;
  zipFile.value = null;
  domainCheckStatus.value = '';
  domainCheckMessage.value = '';
  branchDetected.value = '';
  suggestError.value = '';
}

async function doStart(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.start(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

async function doStop(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.stop(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

async function doRestart(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.restart(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

function closeDeleteModal() {
  if (deleting.value) return;
  showDeleteModal.value = false;
  appToDelete.value = null;
  deleteError.value = '';
}

function confirmDelete(app) {
  deleteError.value = '';
  appToDelete.value = app;
  showDeleteModal.value = true;
}

async function doDelete() {
  if (!appToDelete.value) return;
  deleteError.value = '';
  deleting.value = true;
  try {
    await api.apps.remove(appToDelete.value.id);
    closeDeleteModal();
    await load();
  } catch (e) {
    deleteError.value = e.message || 'Delete failed';
  } finally {
    deleting.value = false;
  }
}

async function checkDomain() {
  const domain = (form.value.domain || '').trim();
  domainCheckStatus.value = '';
  domainCheckMessage.value = '';
  if (!domain) return;
  domainCheckStatus.value = 'checking';
  try {
    const data = await api.system.checkDomain(domain);
    domainCheckMessage.value = data.message || (data.resolves ? 'Domain resolves' : 'Domain does not resolve');
    if (data.ok && data.resolves) {
      domainCheckStatus.value = data.matches ? 'ok' : 'warn';
    } else {
      domainCheckStatus.value = 'error';
    }
  } catch (e) {
    domainCheckStatus.value = 'error';
    domainCheckMessage.value = e.message || 'Domain check failed';
  }
}

async function fetchDefaultBranchIfEmpty() {
  const url = (form.value.repo_url || '').trim();
  const branch = (form.value.branch || '').trim();
  branchDetected.value = '';
  if (!url || branch) return;
  if (!/^https?:/.test(url)) return;
  try {
    const data = await api.system.defaultBranch(url);
    if (data.branch) {
      form.value.branch = data.branch;
      branchDetected.value = `Default branch: ${data.branch}`;
    }
  } catch (_) {}
}

onMounted(() => {
  load();
  loadNodeVersions();
});

const stepLabels = {
  clone: 'Cloning repository…',
  clone_done: 'Repository ready',
  extract: 'Extracting zip…',
  extract_done: 'Extract complete',
  install: 'Running install…',
  install_done: 'Install complete',
  build: 'Running build…',
  build_done: 'Build complete',
  nginx: 'Configuring nginx…',
  ssl: 'Obtaining SSL certificate…',
  ssl_done: 'SSL ready',
  nginx_done: 'Nginx configured',
  start: 'Starting app…',
  start_done: 'App started',
};

function appendLogs(logs, stdout, stderr) {
  if (stdout && stdout.trim()) logs.push(stdout.trim());
  if (stderr && stderr.trim()) logs.push(stderr.trim());
}

function handleCreateEvent(ev) {
  if (ev.step) {
    creationStep.value = ev.message || stepLabels[ev.step] || ev.step;
    if (ev.stdout || ev.stderr) {
      const lines = creationLogs.value ? creationLogs.value.split('\n') : [];
      appendLogs(lines, ev.stdout, ev.stderr);
      creationLogs.value = lines.join('\n');
    }
    if (ev.sslError) creationLogs.value = (creationLogs.value ? creationLogs.value + '\n' : '') + ev.sslError;
  }
  if (ev.error) createError.value = ev.error;
}

async function create() {
  createError.value = '';
  creationStep.value = 'Starting…';
  creationLogs.value = '';
  creating.value = true;
  try {
    let result;
    if (sourceType.value === 'zip') {
      if (!zipFile.value) {
        createError.value = 'Please select a .zip file';
        return;
      }
      const fd = new FormData();
      fd.append('zip', zipFile.value);
      fd.append('name', form.value.name);
      fd.append('install_cmd', form.value.install_cmd || 'npm install');
      fd.append('build_cmd', form.value.build_cmd || '');
      fd.append('start_cmd', form.value.start_cmd || 'npm start');
      fd.append('node_version', form.value.node_version || '20');
      fd.append('domain', form.value.domain || '');
      fd.append('ssl_enabled', form.value.ssl_enabled ? '1' : '0');
      result = await api.apps.createFromZipWithProgress(fd, handleCreateEvent);
    } else {
      if (!form.value.repo_url || !form.value.repo_url.trim()) {
        createError.value = 'Repository URL is required';
        return;
      }
      result = await api.apps.createWithProgress(form.value, handleCreateEvent);
    }
    creationSslWarning.value = result.sslWarning || '';
    showForm.value = false;
    form.value = { ...DEFAULT_FORM, node_version: nodeVersions.value[0] || DEFAULT_FORM.node_version };
    selectedPresetId.value = '';
    suggestError.value = '';
    zipFile.value = null;
    domainCheckStatus.value = '';
    domainCheckMessage.value = '';
    branchDetected.value = '';
    load();
    creationDone.value = true;
  } catch (e) {
    createError.value = e.message || 'Create failed';
    creationDone.value = true;
  } finally {
    creating.value = false;
  }
}

function closeCreationOverlay() {
  creationDone.value = false;
  creationStep.value = '';
  creationLogs.value = '';
  createError.value = '';
  creationSslWarning.value = '';
}
</script>

<style scoped>
.source-type-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
}
.source-type-tab {
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  cursor: pointer;
}
.source-type-tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.source-type-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(99, 102, 241, 0.1);
}
.form-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
.creation-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.creation-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.creation-progress {
  flex: 1;
  min-height: 0;
}
.creation-done {
  flex: 1;
  min-height: 0;
}
.creation-logs {
  margin: 0;
  padding: 0.75rem;
  background: var(--bg);
  border-radius: var(--radius);
  font-size: 0.8rem;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}
.domain-check {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
}
.domain-check--checking {
  color: var(--text-muted);
}
.domain-check--ok {
  color: var(--success);
}
.domain-check--warn {
  color: #eab308;
}
.domain-check--error {
  color: var(--danger);
}
.suggest-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.suggest-error {
  font-size: 0.875rem;
  color: var(--danger);
}
.ssl-off {
  color: var(--text-muted);
}
.list-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.list-actions .btn-sm {
  padding: 0.35rem 0.5rem;
  min-width: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.confirm-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
}
.confirm-dialog--danger {
  border-color: var(--danger);
}
.confirm-dialog__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
.confirm-dialog__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.confirm-dialog__message {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  color: var(--text-muted);
  line-height: 1.5;
}
.confirm-dialog__message strong {
  color: var(--text);
}
.confirm-dialog__list {
  margin: 0 0 1.25rem;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.6;
}
.confirm-dialog__error {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--danger);
}
.confirm-dialog__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
