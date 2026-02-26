<template>
  <div v-if="app">
    <p v-if="saving" class="saving-banner">Saving…</p>
    <div class="app-detail-content" :class="{ 'is-disabled': saving }">
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
      <div>
        <router-link to="/apps" style="font-size:0.875rem; color:var(--text-muted); margin-bottom:0.25rem; display:inline-block;">← Apps</router-link>
        <h1 class="page-title" style="margin:0;">{{ app.name }}</h1>
      </div>
      <div class="action-btns">
        <button type="button" class="btn" @click="doStart" :disabled="app.status === 'running' || saving" title="Run">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Run
        </button>
        <button type="button" class="btn" @click="doStop" :disabled="app.status !== 'running' || saving" title="Pause">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          Pause
        </button>
        <button type="button" class="btn" @click="doRestart" :disabled="saving" title="Restart">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Restart
        </button>
        <button type="button" class="btn btn-danger" @click="confirmDelete" :disabled="saving" title="Delete">Delete</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin:0 0 0.75rem; font-size:1rem;">Access</h3>
        <p v-if="app.domain" style="margin:0 0 0.25rem;">
          <a :href="(app.ssl_active || app.ssl_enabled) ? `https://${app.domain}` : `http://${app.domain}`" target="_blank" rel="noopener">
            {{ (app.ssl_active || app.ssl_enabled) ? 'https' : 'http' }}://{{ app.domain }}
          </a>
          <span v-if="app.ssl_active" class="badge badge-success" style="margin-left:0.5rem;">SSL ✓</span>
          <span v-else-if="app.ssl_enabled" class="badge badge-warn" style="margin-left:0.5rem;">SSL pending</span>
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
        <fieldset :disabled="saving">
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
          <label>Node version</label>
          <select v-if="nodeVersionOptions.length" v-model="edit.node_version">
            <option v-for="v in nodeVersionOptions" :key="v" :value="v">{{ v }}</option>
          </select>
          <span v-else style="font-size:0.875rem; color:var(--text-muted);">{{ app.node_version || '—' }}</span>
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
        </fieldset>
      </form>
    </div>
    <div class="card">
      <h3 style="margin:0 0 0.75rem; font-size:1rem;">Actions</h3>
      <div class="action-btns">
        <button type="button" class="btn" @click="runInstall" :disabled="busy || saving">Run install</button>
        <button type="button" class="btn" @click="runBuild" :disabled="busy || saving">Run build</button>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 0.75rem; font-size:1rem;">Environment (.env)</h3>
      <p style="margin:0 0 0.5rem; font-size:0.875rem; color:var(--text-muted);">Variables for this app. Restart the app for changes to take effect.</p>
      <textarea v-model="envContent" class="env-editor" placeholder="NODE_ENV=production&#10;PORT=3000" rows="10" spellcheck="false" :disabled="saving" />
      <div class="action-btns" style="margin-top:0.5rem;">
        <button type="button" class="btn btn-primary" @click="saveEnv" :disabled="savingEnv || saving">Save .env</button>
        <button type="button" class="btn" @click="loadEnv" :disabled="saving">Reload</button>
      </div>
      <p v-if="envError" style="margin:0.5rem 0 0; font-size:0.875rem; color:var(--danger);">{{ envError }}</p>
    </div>
    <div class="card">
      <h3 style="margin:0 0 0.75rem; font-size:1rem;">Logs</h3>
      <pre class="logs">{{ logs }}</pre>
      <button type="button" class="btn" @click="loadLogs" style="margin-top:0.5rem;" :disabled="saving">Refresh logs</button>
    </div>
    </div>
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="confirm-dialog confirm-dialog--danger">
        <div class="confirm-dialog__icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <h3 class="confirm-dialog__title">Delete app</h3>
        <p class="confirm-dialog__message">Permanently delete <strong>{{ app.name }}</strong>? This cannot be undone.</p>
        <ul class="confirm-dialog__list">
          <li>Stop and remove from PM2</li>
          <li>Remove nginx config (if any)</li>
          <li>Remove app record from the panel</li>
          <li>Delete the app folder on disk (source code, .env, everything)</li>
        </ul>
        <p v-if="deleteError" class="confirm-dialog__error">{{ deleteError }}</p>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn" @click="closeDeleteModal" :disabled="deleting">Cancel</button>
          <button type="button" class="btn btn-danger" @click="doDelete" :disabled="deleting">
            {{ deleting ? 'Deleting…' : 'Delete permanently' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <p v-else-if="loadError" style="color:var(--danger);">{{ loadError }}</p>
  <p v-else style="color:var(--text-muted);">Loading…</p>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const app = ref(null);
const edit = ref({ domain: '', ssl_enabled: false, node_version: '', install_cmd: '', build_cmd: '', start_cmd: '' });
const nodeVersions = ref([]);
const nodeVersionOptions = computed(() => {
  const list = [...nodeVersions.value];
  const current = edit.value.node_version;
  if (current && !list.includes(current)) list.push(current);
  return list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
});
const serverIp = ref('');
const logs = ref('');
const saving = ref(false);
const busy = ref(false);
const showDeleteModal = ref(false);
const deleting = ref(false);
const deleteError = ref('');
const loadError = ref('');
const envContent = ref('');
const savingEnv = ref(false);
const envError = ref('');

async function loadEnv() {
  envError.value = '';
  try {
    const data = await api.apps.env(route.params.id);
    envContent.value = data.env != null ? String(data.env) : '';
  } catch (e) {
    envContent.value = '';
    envError.value = e.message || 'Failed to load .env';
  }
}

async function saveEnv() {
  savingEnv.value = true;
  envError.value = '';
  try {
    await api.apps.updateEnv(route.params.id, envContent.value);
  } catch (e) {
    envError.value = e.message || 'Failed to save .env';
  } finally {
    savingEnv.value = false;
  }
}

async function load() {
  loadError.value = '';
  try {
    const [appRes, ipRes, versionsRes] = await Promise.all([
      api.apps.get(route.params.id),
      api.system.ip(),
      api.node.versions().catch(() => ({ versions: [] })),
    ]);
    nodeVersions.value = versionsRes.versions || [];
    app.value = appRes;
    serverIp.value = ipRes.ip || '';
    edit.value = {
      domain: appRes.domain || '',
      ssl_enabled: appRes.ssl_enabled || false,
      node_version: appRes.node_version || (nodeVersions.value[0] ?? ''),
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
  loadEnv();
});

watch(() => route.params.id, () => {
  load();
  loadEnv();
  loadLogs();
});

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
      node_version: updated.node_version || '',
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

function closeDeleteModal() {
  if (deleting.value) return;
  showDeleteModal.value = false;
  deleteError.value = '';
}

function confirmDelete() {
  deleteError.value = '';
  showDeleteModal.value = true;
}

async function doDelete() {
  deleteError.value = '';
  deleting.value = true;
  try {
    await api.apps.remove(route.params.id);
    closeDeleteModal();
    router.push('/apps');
  } catch (e) {
    deleteError.value = e.message || 'Delete failed';
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.saving-banner {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--accent);
  color: white;
  font-size: 0.875rem;
  border-radius: var(--radius);
}
.app-detail-content.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}
.env-editor {
  width: 100%;
  min-height: 160px;
  padding: 0.75rem;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  resize: vertical;
}
.env-editor:focus {
  outline: none;
  border-color: var(--accent);
}
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
.modal {
  max-width: 420px;
}
</style>
