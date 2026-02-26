<template>
  <div v-if="app">
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
      <div>
        <router-link to="/apps" style="font-size:0.875rem; color:var(--text-muted); margin-bottom:0.25rem; display:inline-block;">← Apps</router-link>
        <h1 class="page-title" style="margin:0;">{{ app.name }}</h1>
      </div>
      <div class="action-btns">
        <button type="button" class="btn" @click="doStart" :disabled="app.status === 'running'" title="Run">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Run
        </button>
        <button type="button" class="btn" @click="doStop" :disabled="app.status !== 'running'" title="Pause">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          Pause
        </button>
        <button type="button" class="btn" @click="doRestart" title="Restart">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Restart
        </button>
        <button type="button" class="btn btn-danger" @click="confirmDelete" title="Delete">Delete</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin:0 0 0.75rem; font-size:1rem;">Access</h3>
        <p v-if="app.domain" style="margin:0 0 0.25rem;">
          <a :href="app.ssl_enabled ? `https://${app.domain}` : `http://${app.domain}`" target="_blank" rel="noopener">
            {{ app.ssl_enabled ? 'https' : 'http' }}://{{ app.domain }}
          </a>
        </p>
        <p v-if="serverIp" style="margin:0; font-size:0.875rem; color:var(--text-muted);">
          Or by IP: <a :href="`http://${serverIp}:${app.port}`" target="_blank" rel="noopener">{{ serverIp }}:{{ app.port }}</a>
        </p>
        <p v-if="!app.domain && serverIp" style="margin:0.5rem 0 0; font-size:0.875rem; color:var(--text-muted);">Set a domain in Edit to use a friendly URL.</p>
      </div>
      <div class="card">
        <h3 style="margin:0 0 0.75rem; font-size:1rem;">Status</h3>
        <span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 1rem; font-size:1rem;">Edit</h3>
      <form @submit.prevent="save">
        <div class="form-group">
          <label>Domain</label>
          <input v-model="edit.domain" type="text" placeholder="app.example.com" />
        </div>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:0.5rem;">
            <input v-model="edit.ssl_enabled" type="checkbox" />
            Enable SSL
          </label>
        </div>
        <div class="form-group">
          <label>Install command</label>
          <input v-model="edit.install_cmd" type="text" />
        </div>
        <div class="form-group">
          <label>Build command</label>
          <input v-model="edit.build_cmd" type="text" />
        </div>
        <div class="form-group">
          <label>Start command</label>
          <input v-model="edit.start_cmd" type="text" />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="saving">Save</button>
      </form>
    </div>
    <div class="card">
      <h3 style="margin:0 0 0.75rem; font-size:1rem;">Actions</h3>
      <div class="action-btns">
        <button type="button" class="btn" @click="runInstall" :disabled="busy">Run install</button>
        <button type="button" class="btn" @click="runBuild" :disabled="busy">Run build</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 0.75rem; font-size:1rem;">Logs</h3>
      <pre class="logs">{{ logs }}</pre>
      <button type="button" class="btn" @click="loadLogs" style="margin-top:0.5rem;">Refresh logs</button>
    </div>
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="card modal">
        <p>Delete <strong>{{ app.name }}</strong>? This will stop the app, remove it from PM2 and nginx, and remove the app record. The app directory on disk may remain.</p>
        <div class="action-btns" style="margin-top:1rem;">
          <button type="button" class="btn btn-danger" @click="doDelete" :disabled="deleting">Delete</button>
          <button type="button" class="btn" @click="showDeleteModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <p v-else-if="loadError" style="color:var(--danger);">{{ loadError }}</p>
  <p v-else style="color:var(--text-muted);">Loading…</p>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const app = ref(null);
const edit = ref({ domain: '', ssl_enabled: false, install_cmd: '', build_cmd: '', start_cmd: '' });
const serverIp = ref('');
const logs = ref('');
const saving = ref(false);
const busy = ref(false);
const showDeleteModal = ref(false);
const deleting = ref(false);
const loadError = ref('');

async function load() {
  loadError.value = '';
  try {
    const [appRes, ipRes] = await Promise.all([
      api.apps.get(route.params.id),
      api.system.ip(),
    ]);
    app.value = appRes;
    serverIp.value = ipRes.ip || '';
    edit.value = {
      domain: appRes.domain || '',
      ssl_enabled: appRes.ssl_enabled || false,
      install_cmd: appRes.install_cmd || '',
      build_cmd: appRes.build_cmd || '',
      start_cmd: appRes.start_cmd || '',
    };
  } catch (e) {
    app.value = null;
    loadError.value = e.message || 'Failed to load app';
  }
}

async function loadLogs() {
  try {
    const data = await api.apps.logs(route.params.id);
    logs.value = data.logs || 'No logs';
  } catch (_) {
    logs.value = 'Failed to load logs';
  }
}

onMounted(() => {
  load();
  loadLogs();
});

watch(() => route.params.id, load);

async function doStart() {
  try {
    await api.apps.start(route.params.id);
    app.value = await api.apps.get(route.params.id);
  } catch (_) {}
}

async function doStop() {
  try {
    await api.apps.stop(route.params.id);
    app.value = await api.apps.get(route.params.id);
  } catch (_) {}
}

async function doRestart() {
  try {
    await api.apps.restart(route.params.id);
    app.value = await api.apps.get(route.params.id);
  } catch (_) {}
}

async function save() {
  saving.value = true;
  try {
    const updated = await api.apps.update(route.params.id, edit.value);
    app.value = updated;
    edit.value = {
      domain: updated.domain || '',
      ssl_enabled: updated.ssl_enabled || false,
      install_cmd: updated.install_cmd || '',
      build_cmd: updated.build_cmd || '',
      start_cmd: updated.start_cmd || '',
    };
  } finally {
    saving.value = false;
  }
}

async function runInstall() {
  busy.value = true;
  try {
    await api.apps.install(route.params.id);
  } finally {
    busy.value = false;
  }
}

async function runBuild() {
  busy.value = true;
  try {
    await api.apps.build(route.params.id);
  } finally {
    busy.value = false;
  }
}

function confirmDelete() {
  showDeleteModal.value = true;
}

async function doDelete() {
  deleting.value = true;
  try {
    await api.apps.remove(route.params.id);
    window.location.href = '/apps';
  } catch (_) {
    deleting.value = false;
  }
}
</script>

<style scoped>
.logs {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  font-size: 0.8rem;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  max-width: 420px;
}
</style>
