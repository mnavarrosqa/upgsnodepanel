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
          <span class="status-pill" :class="app.status === 'running' ? 'status-pill--running' : 'status-pill--stopped'" :title="'Status: ' + app.status">
            <span class="status-pill__dot"></span>
            {{ app.status }}
          </span>
        </div>
        <div class="app-detail-actions">
          <button type="button" class="btn" @click="doStart" :disabled="app.status === 'running' || saving || busyStart" title="Run">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            {{ busyStart ? 'Starting…' : 'Run' }}
          </button>
          <button type="button" class="btn" @click="doStop" :disabled="app.status !== 'running' || saving || busyStop" title="Pause">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            {{ busyStop ? 'Stopping…' : 'Pause' }}
          </button>
          <button type="button" class="btn" @click="doRestart" :disabled="saving || busyRestart" title="Restart">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            {{ busyRestart ? 'Restarting…' : 'Restart' }}
          </button>
          <button type="button" class="btn btn-danger" @click="confirmDelete" :disabled="saving" title="Delete">Delete</button>
        </div>
      </header>

      <nav class="detail-tabs" role="tablist" aria-label="App sections">
        <button
          v-for="tab in detailTabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="['detail-tabs__tab', { 'detail-tabs__tab--active': activeTab === tab.id }]"
          @click="switchTab(tab.id)"
        >
          {{ tab.label }}
          <span v-if="getTabDirty(tab.id)" class="detail-tabs__dot" title="Unsaved changes">•</span>
        </button>
      </nav>

      <div v-show="activeTab === 'overview'" class="detail-tab-panel" role="tabpanel">
        <section class="card card--access">
          <h2 class="card__title">Access</h2>
          <div class="access-list">
            <div v-if="app.domain" class="access-row">
              <span class="access-label">Domain</span>
              <a :href="(app.ssl_active || app.ssl_enabled) ? `https://${app.domain}` : `http://${app.domain}`" target="_blank" rel="noopener" class="access-url">
                {{ (app.ssl_active || app.ssl_enabled) ? 'https' : 'http' }}://{{ app.domain }}
              </a>
              <span v-if="app.ssl_active" class="badge badge-success">SSL ✓</span>
              <span v-else-if="app.ssl_enabled" class="badge badge-warn">SSL pending</span>
            </div>
            <div v-if="serverIp" class="access-row">
              <span class="access-label">Direct (IP:port)</span>
              <a :href="`http://${serverIp}:${app.port}`" target="_blank" rel="noopener" class="access-url">{{ serverIp }}:{{ app.port }}</a>
            </div>
            <p v-if="!app.domain && serverIp" class="card__muted" style="margin:0.5rem 0 0;">Set a domain in App config to use a friendly URL.</p>
          </div>
        </section>
        <section class="card card--size">
          <h2 class="card__title">Size</h2>
          <p class="card__muted">Disk space used by this app’s directory (source, dependencies, build output).</p>
          <div class="access-list">
            <div class="access-row">
              <span class="access-label">Total</span>
              <span class="access-url">{{ formatSize(app.size) }}</span>
            </div>
            <div v-if="app.size != null" class="access-row">
              <span class="access-label">Bytes</span>
              <span class="access-url">{{ app.size.toLocaleString() }}</span>
            </div>
            <p v-if="app.size == null" class="card__muted" style="margin:0.5rem 0 0;">App directory not created yet.</p>
          </div>
        </section>
      </div>

      <div v-show="activeTab === 'config'" class="detail-tab-panel" role="tabpanel">
        <section class="card card--edit">
          <h2 class="card__title">Edit</h2>
          <form @submit.prevent="save" class="edit-form">
            <fieldset :disabled="saving">
              <div class="form-group">
                <label>Domain</label>
                <div class="domain-row">
                  <input v-model="edit.domain" type="text" placeholder="app.example.com" class="domain-row__input" />
                  <label class="domain-row__ssl">
                    <input v-model="edit.ssl_enabled" type="checkbox" />
                    <span>SSL</span>
                  </label>
                </div>
              </div>
              <div v-if="!isUploadApp" class="form-group">
                <label>Branch, tag, or commit</label>
                <input v-model="edit.branch" type="text" placeholder="main, v1.0.0, or abc1234" />
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
              <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
            </fieldset>
          </form>
        </section>
        <section v-if="!isUploadApp" class="card">
          <h2 class="card__title">Update from repo</h2>
          <p class="card__muted">Pull latest from the repo. Save first if you changed the branch above. Redeploy also runs install, build, and restart.</p>
          <div class="action-btns">
            <button type="button" class="btn" @click="doPull" :disabled="busyPull || busyRedeploy || saving">{{ busyPull ? 'Pulling…' : 'Update from repo' }}</button>
            <button type="button" class="btn btn-primary" @click="doRedeploy" :disabled="busyPull || busyRedeploy || saving">{{ busyRedeploy ? 'Redeploying…' : 'Redeploy' }}</button>
          </div>
        </section>
        <section class="card">
          <h2 class="card__title">Run commands</h2>
          <p class="card__muted">Re-run install or build in the app directory. Use after changing commands above.</p>
          <div class="action-btns">
            <button type="button" class="btn" @click="runInstall" :disabled="busy || saving">{{ busyInstall ? 'Running…' : 'Run install' }}</button>
            <button type="button" class="btn" @click="runBuild" :disabled="busy || saving">{{ busyBuild ? 'Running…' : 'Run build' }}</button>
          </div>
        </section>
      </div>

      <div v-show="activeTab === 'files'" class="detail-tab-panel" role="tabpanel">
        <section class="card card--files">
          <h2 class="card__title">File explorer</h2>
          <p class="card__muted">Browse and manage files in this app’s directory. Text files under 512 KB can be viewed and edited.</p>
          <div v-if="app.size == null" class="card__muted">App directory not created yet. Create or deploy the app first.</div>
          <template v-else>
            <div class="files-toolbar">
              <nav class="files-breadcrumb" aria-label="Current folder">
                <button type="button" class="files-breadcrumb__item" @click="fileExplorerPath = ''; loadFileList();">App root</button>
                <template v-for="(part, i) in fileExplorerBreadcrumb" :key="i">
                  <span class="files-breadcrumb__sep">/</span>
                  <button type="button" class="files-breadcrumb__item" @click="navigateToBreadcrumb(i)">{{ part }}</button>
                </template>
              </nav>
              <div class="files-actions">
                <button type="button" class="btn btn-sm" @click="openNewFileModal" :disabled="filesBusy">New file</button>
                <button type="button" class="btn btn-sm" @click="openNewFolderModal" :disabled="filesBusy">New folder</button>
                <button type="button" class="btn btn-sm" @click="loadFileList()" :disabled="filesBusy">Refresh</button>
              </div>
            </div>
            <p v-if="fileExplorerError" class="card__error">{{ fileExplorerError }}</p>
            <div v-else-if="filesBusy && !fileExplorerEntries.length" class="card__muted">Loading…</div>
            <div v-else class="table-wrap">
              <table class="files-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in fileExplorerEntries" :key="entry.path" class="files-table__row">
                    <td>
                      <button v-if="entry.isDirectory" type="button" class="files-table__link" @click="navigateInto(entry)">
                        <span class="files-table__icon" aria-hidden="true">📁</span>
                        {{ entry.name }}
                      </button>
                      <span v-else class="files-table__name">
                        <span class="files-table__icon" aria-hidden="true">📄</span>
                        {{ entry.name }}
                      </span>
                    </td>
                    <td>{{ entry.isDirectory ? '—' : formatSize(entry.size) }}</td>
                    <td>
                      <template v-if="entry.isDirectory">
                        <button type="button" class="btn btn-sm" @click="navigateInto(entry)">Open</button>
                        <button type="button" class="btn btn-sm btn-danger" @click="confirmDeleteFile(entry)" :disabled="filesBusy">Delete</button>
                      </template>
                      <template v-else>
                        <button type="button" class="btn btn-sm" @click="openViewFile(entry)" :disabled="filesBusy">View</button>
                        <button type="button" class="btn btn-sm" @click="openEditFile(entry)" :disabled="filesBusy">Edit</button>
                        <button type="button" class="btn btn-sm btn-danger" @click="confirmDeleteFile(entry)" :disabled="filesBusy">Delete</button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="!filesBusy && fileExplorerEntries.length === 0" class="card__muted">This folder is empty.</p>
          </template>
        </section>
      </div>

      <div v-show="activeTab === 'env'" class="detail-tab-panel" role="tabpanel">
        <section class="card">
          <h2 class="card__title">Environment (.env)</h2>
          <p class="card__muted">Variables for this app. Restart the app for changes to take effect.</p>
          <textarea v-model="envContent" class="env-editor" placeholder="NODE_ENV=production&#10;PORT=3000" rows="10" spellcheck="false" :disabled="saving" />
          <div class="action-btns">
            <button type="button" class="btn btn-primary" @click="saveEnv" :disabled="savingEnv || saving">{{ savingEnv ? 'Saving…' : 'Save .env' }}</button>
            <button type="button" class="btn" @click="loadEnv(true)" :disabled="saving || busyReload">{{ busyReload ? 'Reloading…' : 'Reload' }}</button>
          </div>
          <p v-if="envError" class="card__error">{{ envError }}</p>
        </section>
      </div>

      <div v-show="activeTab === 'logs'" class="detail-tab-panel" role="tabpanel">
        <section class="card card--logs">
          <div class="logs-header">
            <h2 class="card__title">Logs</h2>
            <div class="logs-actions">
              <button type="button" class="btn btn-sm" @click="copyLogs" :disabled="!logs">Copy</button>
              <button type="button" class="btn btn-sm" @click="loadLogs" :disabled="saving">Refresh</button>
            </div>
          </div>
          <pre ref="logsPre" class="logs">{{ logs }}</pre>
        </section>
      </div>
    </div>

    <div v-if="showUnsavedModal" class="modal-overlay" @click.self="cancelUnsavedSwitch">
      <div class="confirm-dialog">
        <h3 class="confirm-dialog__title">Unsaved changes</h3>
        <p class="confirm-dialog__message">You have unsaved changes in <strong>{{ unsavedModalTabLabel }}</strong>. Save changes or discard before switching tab?</p>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn" @click="cancelUnsavedSwitch">Cancel</button>
          <button type="button" class="btn" @click="discardAndSwitchTab">Discard</button>
          <button type="button" class="btn btn-primary" @click="saveAndSwitchTab">Save</button>
        </div>
      </div>
    </div>
    <div v-if="fileExplorerModal === 'view' || fileExplorerModal === 'edit'" class="modal-overlay" @click.self="closeFileModal">
      <div class="modal modal--file">
        <h3 class="modal__title">{{ fileExplorerModal === 'edit' ? 'Edit file' : 'View file' }}: {{ fileExplorerSelected && fileExplorerSelected.name }}</h3>
        <textarea v-model="fileExplorerContent" class="modal__textarea" rows="18" spellcheck="false" :readonly="fileExplorerModal === 'view'" />
        <p v-if="fileExplorerContentError" class="card__error">{{ fileExplorerContentError }}</p>
        <div class="modal__actions">
          <button v-if="fileExplorerModal === 'edit'" type="button" class="btn btn-primary" @click="saveFileContent" :disabled="filesBusy">Save</button>
          <button type="button" class="btn" @click="closeFileModal">Close</button>
        </div>
      </div>
    </div>
    <div v-if="fileExplorerModal === 'delete'" class="modal-overlay" @click.self="closeFileModal">
      <div class="confirm-dialog confirm-dialog--danger">
        <h3 class="confirm-dialog__title">Delete {{ fileExplorerSelected && (fileExplorerSelected.isDirectory ? 'folder' : 'file') }}</h3>
        <p class="confirm-dialog__message">Permanently delete <strong>{{ fileExplorerSelected && fileExplorerSelected.name }}</strong>? {{ fileExplorerSelected && fileExplorerSelected.isDirectory ? 'All contents will be removed.' : '' }}</p>
        <p v-if="fileExplorerContentError" class="confirm-dialog__error">{{ fileExplorerContentError }}</p>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn" @click="closeFileModal">Cancel</button>
          <button type="button" class="btn btn-danger" @click="doDeleteFile" :disabled="filesBusy">Delete</button>
        </div>
      </div>
    </div>
    <div v-if="fileExplorerModal === 'newFile' || fileExplorerModal === 'newFolder'" class="modal-overlay" @click.self="closeFileModal">
      <div class="modal">
        <h3 class="modal__title">{{ fileExplorerModal === 'newFolder' ? 'New folder' : 'New file' }}</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="fileExplorerNewName" type="text" :placeholder="fileExplorerModal === 'newFolder' ? 'folder-name' : 'filename.txt'" />
        </div>
        <div v-if="fileExplorerModal === 'newFile'" class="form-group">
          <label>Content (optional)</label>
          <textarea v-model="fileExplorerNewContent" rows="4" spellcheck="false" placeholder="" />
        </div>
        <p v-if="fileExplorerContentError" class="card__error">{{ fileExplorerContentError }}</p>
        <div class="modal__actions">
          <button type="button" class="btn btn-primary" @click="createFileOrFolder" :disabled="filesBusy || !fileExplorerNewName.trim()">Create</button>
          <button type="button" class="btn" @click="closeFileModal">Cancel</button>
        </div>
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
    <div v-if="toast.show" class="toast" :class="toast.type" role="status">
      {{ toast.message }}
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
const edit = ref({ domain: '', ssl_enabled: false, branch: '', node_version: '', install_cmd: '', build_cmd: '', start_cmd: '' });
const nodeVersions = ref([]);
const nodeVersionOptions = computed(() => {
  const list = [...nodeVersions.value];
  const current = edit.value.node_version;
  if (current && !list.includes(current)) list.push(current);
  return list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
});
const isUploadApp = computed(() => app.value && String(app.value.repo_url || '') === 'upload://');
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
const busyPull = ref(false);
const busyRedeploy = ref(false);
const busyStart = ref(false);
const busyStop = ref(false);
const busyRestart = ref(false);
const busyReload = ref(false);
const busy = computed(() => busyInstall.value || busyBuild.value);
const logsPre = ref(null);

const toast = ref({ show: false, type: 'success', message: '' });
let toastTimer = null;
function showToast(type, message) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { show: true, type, message };
  toastTimer = setTimeout(() => {
    toast.value.show = false;
    toastTimer = null;
  }, 4000);
}

const fileExplorerPath = ref('');
const fileExplorerEntries = ref([]);
const fileExplorerError = ref('');
const filesBusy = ref(false);
const fileExplorerModal = ref(null);
const fileExplorerSelected = ref(null);
const fileExplorerContent = ref('');
const fileExplorerContentError = ref('');
const fileExplorerNewName = ref('');
const fileExplorerNewContent = ref('');
const fileExplorerContentOriginal = ref('');
const fileExplorerBreadcrumb = computed(() => {
  const p = (fileExplorerPath.value || '').trim();
  return p ? p.split('/').filter(Boolean) : [];
});

const activeTab = ref('overview');
const pendingTab = ref(null);
const showUnsavedModal = ref(false);
const editBaseline = ref(null);
const lastLoadedEnvContent = ref('');

const detailTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'config', label: 'App config' },
  { id: 'files', label: 'File explorer' },
  { id: 'env', label: 'Env' },
  { id: 'logs', label: 'Logs' },
];

function getTabDirty(tabId) {
  if (tabId === 'config') {
    if (editBaseline.value == null) return false;
    const e = edit.value;
    const b = editBaseline.value;
    return e.domain !== b.domain || e.ssl_enabled !== b.ssl_enabled || e.branch !== b.branch ||
      e.node_version !== b.node_version || e.install_cmd !== b.install_cmd || e.build_cmd !== b.build_cmd || e.start_cmd !== b.start_cmd;
  }
  if (tabId === 'env') return envContent.value !== lastLoadedEnvContent.value;
  if (tabId === 'files') return fileExplorerModal.value === 'edit' && fileExplorerContent.value !== fileExplorerContentOriginal.value;
  return false;
}

const unsavedModalTabLabel = computed(() => {
  const t = detailTabs.find((tab) => tab.id === activeTab.value);
  return t ? t.label : '';
});

function switchTab(tabId) {
  if (activeTab.value === tabId) return;
  if (getTabDirty(activeTab.value)) {
    pendingTab.value = tabId;
    showUnsavedModal.value = true;
    return;
  }
  activeTab.value = tabId;
}

function cancelUnsavedSwitch() {
  showUnsavedModal.value = false;
  pendingTab.value = null;
}

function discardAndSwitchTab() {
  if (activeTab.value === 'config') {
    if (editBaseline.value != null) edit.value = { ...editBaseline.value };
  } else if (activeTab.value === 'env') {
    envContent.value = lastLoadedEnvContent.value;
  } else if (activeTab.value === 'files') {
    closeFileModal();
  }
  activeTab.value = pendingTab.value;
  showUnsavedModal.value = false;
  pendingTab.value = null;
}

async function saveAndSwitchTab() {
  const tab = activeTab.value;
  if (tab === 'config') {
    await save();
  } else if (tab === 'env') {
    await saveEnv();
  } else if (tab === 'files') {
    await saveFileContent();
  }
  if (!getTabDirty(tab)) {
    activeTab.value = pendingTab.value;
    showUnsavedModal.value = false;
    pendingTab.value = null;
  }
}

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i <= 1 ? 0 : 1)} ${units[i]}`;
}

function setFeedback(type, message) {
  if (feedbackTimer.value) clearTimeout(feedbackTimer.value);
  actionFeedback.value = { type, message };
  showToast(type, message);
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

async function loadEnv(showBusy = false) {
  envError.value = '';
  if (showBusy) busyReload.value = true;
  try {
    const data = await api.apps.env(route.params.id);
    const content = data.env != null ? String(data.env) : '';
    envContent.value = content;
    lastLoadedEnvContent.value = content;
    if (showBusy) setFeedback('success', '.env loaded.');
  } catch (e) {
    envContent.value = '';
    lastLoadedEnvContent.value = '';
    envError.value = e.message || 'Failed to load .env';
    if (showBusy) setFeedback('error', e.message || 'Failed to load .env');
  } finally {
    if (showBusy) busyReload.value = false;
  }
}

async function saveEnv() {
  savingEnv.value = true;
  envError.value = '';
  try {
    await api.apps.updateEnv(route.params.id, envContent.value);
    lastLoadedEnvContent.value = envContent.value;
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
      branch: appRes.branch ?? '',
      node_version: appRes.node_version || (nodeVersions.value[0] ?? ''),
      install_cmd: appRes.install_cmd || '',
      build_cmd: appRes.build_cmd || '',
      start_cmd: appRes.start_cmd || '',
    };
    editBaseline.value = { ...edit.value };
  } catch (e) {
    app.value = null;
    editBaseline.value = null;
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

async function copyLogs() {
  if (!logs.value) return;
  try {
    await navigator.clipboard.writeText(logs.value);
    setFeedback('success', 'Logs copied to clipboard.');
  } catch (_) {
    setFeedback('error', 'Copy failed.');
  }
}

async function loadFileList() {
  if (!app.value) return;
  fileExplorerError.value = '';
  filesBusy.value = true;
  try {
    const data = await api.apps.files.list(route.params.id, fileExplorerPath.value);
    fileExplorerEntries.value = data.entries || [];
  } catch (e) {
    fileExplorerError.value = e.message || 'Failed to load directory';
    fileExplorerEntries.value = [];
  } finally {
    filesBusy.value = false;
  }
}

function navigateInto(entry) {
  if (!entry.isDirectory) return;
  fileExplorerPath.value = entry.path;
  loadFileList();
}

function navigateToBreadcrumb(index) {
  const parts = fileExplorerBreadcrumb.value.slice(0, index + 1);
  fileExplorerPath.value = parts.join('/');
  loadFileList();
}

function closeFileModal() {
  fileExplorerModal.value = null;
  fileExplorerSelected.value = null;
  fileExplorerContent.value = '';
  fileExplorerContentError.value = '';
  fileExplorerNewName.value = '';
  fileExplorerNewContent.value = '';
}

async function openViewFile(entry) {
  fileExplorerSelected.value = entry;
  fileExplorerContentError.value = '';
  fileExplorerModal.value = 'view';
  filesBusy.value = true;
  try {
    const data = await api.apps.files.getContent(route.params.id, entry.path);
    fileExplorerContent.value = data.content ?? '';
  } catch (e) {
    fileExplorerContentError.value = e.message || 'Failed to load file';
    fileExplorerContent.value = '';
  } finally {
    filesBusy.value = false;
  }
}

async function openEditFile(entry) {
  fileExplorerSelected.value = entry;
  fileExplorerContentError.value = '';
  fileExplorerModal.value = 'edit';
  fileExplorerContentOriginal.value = '';
  filesBusy.value = true;
  try {
    const data = await api.apps.files.getContent(route.params.id, entry.path);
    const content = data.content ?? '';
    fileExplorerContent.value = content;
    fileExplorerContentOriginal.value = content;
  } catch (e) {
    fileExplorerContentError.value = e.message || 'Failed to load file';
    fileExplorerContent.value = '';
  } finally {
    filesBusy.value = false;
  }
}

async function saveFileContent() {
  if (!fileExplorerSelected.value) return;
  fileExplorerContentError.value = '';
  filesBusy.value = true;
  try {
    await api.apps.files.setContent(route.params.id, fileExplorerSelected.value.path, fileExplorerContent.value);
    fileExplorerContentOriginal.value = fileExplorerContent.value;
    setFeedback('success', 'File saved.');
    closeFileModal();
  } catch (e) {
    fileExplorerContentError.value = e.message || 'Failed to save';
  } finally {
    filesBusy.value = false;
  }
}

function confirmDeleteFile(entry) {
  fileExplorerSelected.value = entry;
  fileExplorerContentError.value = '';
  fileExplorerModal.value = 'delete';
}

async function doDeleteFile() {
  if (!fileExplorerSelected.value) return;
  fileExplorerContentError.value = '';
  filesBusy.value = true;
  try {
    await api.apps.files.delete(route.params.id, fileExplorerSelected.value.path);
    setFeedback('success', fileExplorerSelected.value.isDirectory ? 'Folder deleted.' : 'File deleted.');
    closeFileModal();
    loadFileList();
  } catch (e) {
    fileExplorerContentError.value = e.message || 'Delete failed';
  } finally {
    filesBusy.value = false;
  }
}

function openNewFileModal() {
  fileExplorerNewName.value = '';
  fileExplorerNewContent.value = '';
  fileExplorerContentError.value = '';
  fileExplorerModal.value = 'newFile';
}

function openNewFolderModal() {
  fileExplorerNewName.value = '';
  fileExplorerContentError.value = '';
  fileExplorerModal.value = 'newFolder';
}

async function createFileOrFolder() {
  const name = fileExplorerNewName.value.trim();
  if (!name) return;
  const base = fileExplorerPath.value ? fileExplorerPath.value + '/' : '';
  const fullPath = base + name;
  fileExplorerContentError.value = '';
  filesBusy.value = true;
  try {
    const type = fileExplorerModal.value === 'newFolder' ? 'directory' : 'file';
    const content = type === 'file' ? fileExplorerNewContent.value : '';
    await api.apps.files.create(route.params.id, fullPath, type, content);
    setFeedback('success', type === 'directory' ? 'Folder created.' : 'File created.');
    closeFileModal();
    loadFileList();
  } catch (e) {
    fileExplorerContentError.value = e.message || 'Create failed';
  } finally {
    filesBusy.value = false;
  }
}

onMounted(() => {
  load();
  loadLogs();
  loadEnv();
});

watch(() => route.params.id, () => {
  activeTab.value = 'overview';
  pendingTab.value = null;
  showUnsavedModal.value = false;
  load();
  loadEnv();
  loadLogs();
  fileExplorerPath.value = '';
});

watch([() => app.value, fileExplorerPath], () => {
  if (app.value && app.value.size != null) loadFileList();
}, { immediate: true });

async function doStart() {
  busyStart.value = true;
  try {
    await api.apps.start(route.params.id);
    app.value = await api.apps.get(route.params.id);
    setFeedback('success', 'App started.');
  } catch (e) {
    setFeedback('error', e.message || 'Start failed.');
  } finally {
    busyStart.value = false;
  }
}

async function doStop() {
  busyStop.value = true;
  try {
    await api.apps.stop(route.params.id);
    app.value = await api.apps.get(route.params.id);
    setFeedback('success', 'App stopped.');
  } catch (e) {
    setFeedback('error', e.message || 'Stop failed.');
  } finally {
    busyStop.value = false;
  }
}

async function doRestart() {
  busyRestart.value = true;
  try {
    await api.apps.restart(route.params.id);
    app.value = await api.apps.get(route.params.id);
    setFeedback('success', 'App restarted.');
  } catch (e) {
    setFeedback('error', e.message || 'Restart failed.');
  } finally {
    busyRestart.value = false;
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
      branch: updated.branch ?? '',
      node_version: updated.node_version || '',
      install_cmd: updated.install_cmd || '',
      build_cmd: updated.build_cmd || '',
      start_cmd: updated.start_cmd || '',
    };
    editBaseline.value = { ...edit.value };
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

function pullBody() {
  const b = (edit.value.branch || '').trim();
  return { branch: b || undefined };
}

async function doPull() {
  busyPull.value = true;
  try {
    const updated = await api.apps.pull(route.params.id, pullBody());
    app.value = updated;
    edit.value.branch = updated.branch ?? '';
    setFeedback('success', 'Repo updated.');
  } catch (e) {
    setFeedback('error', e.message || 'Update failed.');
  } finally {
    busyPull.value = false;
  }
}

async function doRedeploy() {
  busyRedeploy.value = true;
  try {
    const updated = await api.apps.redeploy(route.params.id, pullBody());
    app.value = updated;
    edit.value.branch = updated.branch ?? '';
    setFeedback('success', 'Redeployed: pull, install, build, restart done.');
  } catch (e) {
    setFeedback('error', e.message || 'Redeploy failed.');
  } finally {
    busyRedeploy.value = false;
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
.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 200;
  animation: toast-in 0.2s ease-out;
}
.toast.success {
  background: rgba(34, 197, 94, 0.95);
  color: white;
  border: 1px solid var(--success);
}
.toast.error {
  background: rgba(239, 68, 68, 0.95);
  color: white;
  border: 1px solid var(--danger);
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.75rem;
}
.app-detail-back {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
  display: inline-block;
  width: 100%;
}
.app-detail-back:hover {
  color: var(--accent);
}
.app-detail-title .page-title {
  margin: 0;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-weight: 500;
}
.status-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-pill--running {
  background: rgba(34, 197, 94, 0.2);
  color: var(--success);
}
.status-pill--running .status-pill__dot {
  background: var(--success);
}
.status-pill--stopped {
  background: var(--bg-hover);
  color: var(--text-muted);
}
.status-pill--stopped .status-pill__dot {
  background: var(--text-muted);
}
.app-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.card--access .card__title {
  margin-bottom: 0.75rem;
}
.access-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.access-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.access-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
  min-width: 6rem;
}
.access-url {
  font-family: ui-monospace, monospace;
  font-size: 0.9375rem;
}
.domain-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.domain-row__input {
  flex: 1;
  min-width: 180px;
}
.domain-row__ssl {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9375rem;
  cursor: pointer;
  white-space: nowrap;
}
.domain-row__ssl input {
  width: auto;
}
.edit-form .form-group {
  margin-bottom: 1rem;
}
.edit-form .form-row {
  margin-bottom: 1rem;
}
.detail-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 1.5rem;
}
.detail-tabs__tab {
  padding: 0.6rem 1.1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius);
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.detail-tabs__tab:hover {
  color: var(--text);
  background: var(--border);
}
.detail-tabs__tab.detail-tabs__tab--active {
  color: var(--text);
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.detail-tabs__dot {
  color: var(--warn);
  font-weight: 600;
  font-size: 0.75rem;
  line-height: 1;
  opacity: 0.9;
}
.detail-tab-panel {
  min-height: 0;
}
.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.logs-header .card__title {
  margin: 0;
}
.logs-actions {
  display: flex;
  gap: 0.5rem;
}
.logs-actions .btn {
  font-size: 0.875rem;
  padding: 0.35rem 0.65rem;
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
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: 320px;
  user-select: text;
  cursor: text;
}
.files-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.files-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  font-size: 0.875rem;
}
.files-breadcrumb__item {
  background: none;
  border: none;
  padding: 0.25rem 0.5rem;
  color: var(--accent);
  cursor: pointer;
  border-radius: var(--radius);
}
.files-breadcrumb__item:hover {
  background: var(--bg-hover);
  color: var(--accent-hover);
}
.files-breadcrumb__sep {
  color: var(--text-muted);
}
.files-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
.files-table__row td {
  vertical-align: middle;
}
.files-table__link,
.files-table__name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.files-table__link:hover {
  color: var(--accent);
}
.files-table__icon {
  font-size: 1rem;
}
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
}
.modal--file {
  max-width: 720px;
  width: 100%;
}
.modal__title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  word-break: break-all;
}
.modal__textarea {
  width: 100%;
  min-height: 200px;
  padding: 0.75rem;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 1rem;
  resize: vertical;
}
.modal__textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.modal__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
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
