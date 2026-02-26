<template>
  <div v-if="app" class="app-detail">
    <div v-if="actionFeedback.message" class="action-feedback" :class="actionFeedback.type" role="status">
      {{ actionFeedback.message }}
      <button type="button" class="action-feedback__dismiss" aria-label="Dismiss" @click="clearFeedback">×</button>
    </div>
    <p v-if="saving" class="saving-banner">Saving…</p>
    <div class="app-detail-content" :class="{ 'is-disabled': saving }">
      <header class="app-detail-header">
        <div class="app-detail-title">
          <router-link to="/apps" class="app-detail-back">← Apps</router-link>
          <h1 class="page-title">{{ app.name }}</h1>
        </div>
        <div class="app-detail-actions">
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
      </header>
      <section class="app-detail-grid app-detail-grid--top">
        <div class="card">
          <h2 class="card__title">Access</h2>
          <p v-if="app.domain" class="card__line">
            <a :href="(app.ssl_active || app.ssl_enabled) ? `https://${app.domain}` : `http://${app.domain}`" target="_blank" rel="noopener">
              {{ (app.ssl_active || app.ssl_enabled) ? 'https' : 'http' }}://{{ app.domain }}
            </a>
            <span v-if="app.ssl_active" class="badge badge-success">SSL ✓</span>
            <span v-else-if="app.ssl_enabled" class="badge badge-warn">SSL pending</span>
          </p>
          <p v-if="serverIp" class="card__muted">Or by IP: <a :href="`http://${serverIp}:${app.port}`" target="_blank" rel="noopener">{{ serverIp }}:{{ app.port }}</a></p>
          <p v-if="!app.domain && serverIp" class="card__muted">Set a domain in Edit to use a friendly URL.</p>
        </div>
        <div class="card">
          <h2 class="card__title">Status</h2>
          <span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span>
        </div>
      </section>
      <section class="card">
        <h2 class="card__title">Edit</h2>
      <form @submit.prevent="save">
        <fieldset :disabled="saving">
          <div class="form-row form-row--2">
            <div class="form-group">
              <label>Domain</label>
              <input v-model="edit.domain" type="text" placeholder="app.example.com" />
            </div>
            <div class="form-group form-group--checkbox">
              <label><input v-model="edit.ssl_enabled" type="checkbox" /> Enable SSL</label>
            </div>
          </div>
          <div class="form-row form-row--3">
            <div class="form-group">
              <label>Node version</label>
              <select v-if="nodeVersionOptions.length" v-model="edit.node_version">
                <option v-for="v in nodeVersionOptions" :key="v" :value="v">{{ v }}</option>
              </select>
              <span v-else class="form-static">{{ app.node_version || '—' }}</span>
            </div>
            <div class="form-group">
              <label>Install command</label>
              <input v-model="edit.install_cmd" type="text" placeholder="npm install" />
            </div>
            <div class="form-group">
              <label>Build command</label>
              <input v-model="edit.build_cmd" type="text" placeholder="npm run build" />
            </div>
          </div>
          <div class="form-group">
            <label>Start command</label>
            <input v-model="edit.start_cmd" type="text" placeholder="npm start" />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="saving">Save</button>
        </fieldset>
      </form>
      </section>
      <section class="card">
        <h2 class="card__title">Run commands</h2>
        <p class="card__muted">Re-run install or build in the app directory. Use after changing commands above.</p>
        <div class="action-btns">
          <button type="button" class="btn" @click="runInstall" :disabled="busy || saving">{{ busyInstall ? 'Running…' : 'Run install' }}</button>
          <button type="button" class="btn" @click="runBuild" :disabled="busy || saving">{{ busyBuild ? 'Running…' : 'Run build' }}</button>
        </div>
      </section>
      <section class="card">
        <h2 class="card__title">Environment (.env)</h2>
        <p class="card__muted">Variables for this app. Restart the app for changes to take effect.</p>
        <textarea v-model="envContent" class="env-editor" placeholder="NODE_ENV=production&#10;PORT=3000" rows="10" spellcheck="false" :disabled="saving" />
        <div class="action-btns">
          <button type="button" class="btn btn-primary" @click="saveEnv" :disabled="savingEnv || saving">Save .env</button>
          <button type="button" class="btn" @click="loadEnv" :disabled="saving">Reload</button>
        </div>
        <p v-if="envError" class="card__error">{{ envError }}</p>
      </section>
      <section class="card">
        <h2 class="card__title">Logs</h2>
        <pre class="logs">{{ logs }}</pre>
        <button type="button" class="btn" @click="loadLogs" :disabled="saving">Refresh logs</button>
      </section>
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
const showDeleteModal = ref(false);
const deleting = ref(false);
const deleteError = ref('');
const loadError = ref('');
const envContent = ref('');
const savingEnv = ref(false);
const envError = ref('');
const actionFeedback = ref({ type: 'success', message: '' });
const feedbackTimer = ref(null);
const busyInstall = ref(false);
const busyBuild = ref(false);
const busy = computed(() => busyInstall.value || busyBuild.value);

function setFeedback(type, message) {
  if (feedbackTimer.value) clearTimeout(feedbackTimer.value);
  actionFeedback.value = { type, message };
  feedbackTimer.value = setTimeout(() => {
    actionFeedback.value = { type: 'success', message: '' };
    feedbackTimer.value = null;
  }, 5000);
}

function clearFeedback() {
  if (feedbackTimer.value) clearTimeout(feedbackTimer.value);
  feedbackTimer.value = null;
  actionFeedback.value = { type: 'success', message: '' };
}

async function loadEnv() {
  envError.value = '';
  try {
    const data = await api.apps.env(route.params.id);
    envContent.value = data.env != null ? String(data.env) : '';
    setFeedback('success', '.env loaded.');
  } catch (e) {
    envContent.value = '';
    envError.value = e.message || 'Failed to load .env';
    setFeedback('error', e.message || 'Failed to load .env');
  }
}

async function saveEnv() {
  savingEnv.value = true;
  envError.value = '';
  try {
    await api.apps.updateEnv(route.params.id, envContent.value);
    setFeedback('success', '.env saved.');
  } catch (e) {
    envError.value = e.message || 'Failed to save .env';
    setFeedback('error', e.message || 'Failed to save .env');
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
    setFeedback('success', 'Logs refreshed.');
  } catch (_) {
    logs.value = 'Failed to load logs';
    setFeedback('error', 'Failed to load logs.');
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
    setFeedback('success', 'App started.');
  } catch (e) {
    setFeedback('error', e.message || 'Start failed.');
  }
}

async function doStop() {
  try {
    await api.apps.stop(route.params.id);
    app.value = await api.apps.get(route.params.id);
    setFeedback('success', 'App stopped.');
  } catch (e) {
    setFeedback('error', e.message || 'Stop failed.');
  }
}

async function doRestart() {
  try {
    await api.apps.restart(route.params.id);
    app.value = await api.apps.get(route.params.id);
    setFeedback('success', 'App restarted.');
  } catch (e) {
    setFeedback('error', e.message || 'Restart failed.');
  }
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
    setFeedback('success', 'Settings saved.');
  } catch (e) {
    setFeedback('error', e.message || 'Save failed.');
  } finally {
    saving.value = false;
  }
}

async function runInstall() {
  busyInstall.value = true;
  try {
    await api.apps.install(route.params.id);
    setFeedback('success', 'Install completed.');
  } catch (e) {
    setFeedback('error', e.message || 'Install failed.');
  } finally {
    busyInstall.value = false;
  }
}

async function runBuild() {
  busyBuild.value = true;
  try {
    await api.apps.build(route.params.id);
    setFeedback('success', 'Build completed.');
  } catch (e) {
    setFeedback('error', e.message || 'Build failed.');
  } finally {
    busyBuild.value = false;
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
.app-detail {
  position: relative;
}
.action-feedback {
  position: sticky;
  top: 0;
  z-index: 50;
  margin: 0 0 1rem;
  padding: 0.6rem 1rem;
  font-size: 0.875rem;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.action-feedback.success {
  background: rgba(34, 197, 94, 0.2);
  color: var(--success);
  border: 1px solid var(--success);
}
.action-feedback.error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  border: 1px solid var(--danger);
}
.action-feedback__dismiss {
  background: none;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.8;
  padding: 0 0.25rem;
}
.action-feedback__dismiss:hover {
  opacity: 1;
}
.saving-banner {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--accent);
  color: white;
  font-size: 0.875rem;
  border-radius: var(--radius);
}
.app-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.app-detail-title {
  min-width: 0;
}
.app-detail-back {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
  display: inline-block;
}
.app-detail-back:hover {
  color: var(--accent);
}
.app-detail-title .page-title {
  margin: 0;
}
.app-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.app-detail-grid {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}
.app-detail-grid--top {
  grid-template-columns: 1fr auto;
}
@media (max-width: 640px) {
  .app-detail-grid--top {
    grid-template-columns: 1fr;
  }
}
.card__title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}
.card__line {
  margin: 0 0 0.25rem;
}
.card__line .badge {
  margin-left: 0.5rem;
}
.card__muted {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.card__muted + .card__muted {
  margin-top: 0.25rem;
}
.card__error {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: var(--danger);
}
.card + .card,
section.card + section.card {
  margin-top: 1rem;
}
.form-row {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}
.form-row--2 {
  grid-template-columns: repeat(2, 1fr);
}
.form-row--3 {
  grid-template-columns: repeat(3, 1fr);
}
@media (max-width: 640px) {
  .form-row--2,
  .form-row--3 {
    grid-template-columns: 1fr;
  }
}
.form-group--checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-static {
  font-size: 0.875rem;
  color: var(--text-muted);
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
