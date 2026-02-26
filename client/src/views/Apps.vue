<template>
  <div>
    <h1 class="page-title">Apps</h1>
    <div class="card" :class="{ 'is-disabled': creating }">
      <button type="button" class="btn btn-primary" @click="showForm = true" :disabled="creating">Add app</button>
    </div>
    <div class="card" v-if="showForm" :class="{ 'is-disabled': creating }">
      <h3 style="margin:0 0 1rem;">New app</h3>
      <form @submit.prevent="create">
        <fieldset :disabled="creating">
        <div class="form-group">
          <label>Name</label>
          <input v-model="form.name" type="text" required placeholder="my-app" />
        </div>
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
          <label>Branch</label>
          <input
            v-model="form.branch"
            type="text"
            placeholder="Auto (main or master)"
            @focus="fetchDefaultBranchIfEmpty"
          />
          <p v-if="branchDetected" class="domain-check domain-check--ok">{{ branchDetected }}</p>
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
    <div v-if="creating" class="card creation-progress">
      <h3 style="margin:0 0 0.5rem; font-size:1rem;">Creating app…</h3>
      <p style="margin:0 0 0.5rem; font-size:0.875rem; color:var(--text-muted);">{{ creationStep }}</p>
      <pre class="creation-logs">{{ creationLogs }}</pre>
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
              <td>{{ app.ssl_enabled ? 'Yes' : 'No' }}</td>
              <td><span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span></td>
              <td>
                <div class="action-btns">
                  <router-link :to="`/apps/${app.id}`" class="btn">Open</router-link>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="apps.length === 0" style="margin:0; color:var(--text-muted);">No apps. Add one above.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const apps = ref([]);
const showForm = ref(false);
const creating = ref(false);
const createError = ref('');
const creationStep = ref('');
const creationLogs = ref('');
const domainCheckStatus = ref('');
const domainCheckMessage = ref('');
const branchDetected = ref('');
const nodeVersions = ref([]);
const form = ref({
  name: '',
  repo_url: '',
  branch: 'main',
  node_version: '20',
  install_cmd: 'npm install',
  build_cmd: '',
  start_cmd: 'npm start',
  domain: '',
  ssl_enabled: false,
});

const loadError = ref('');

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
  domainCheckStatus.value = '';
  domainCheckMessage.value = '';
  branchDetected.value = '';
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
  install: 'Running install…',
  install_done: 'Install complete',
  build: 'Running build…',
  build_done: 'Build complete',
  nginx: 'Configuring nginx…',
  nginx_done: 'Nginx configured',
  start: 'Starting app…',
  start_done: 'App started',
};

function appendLogs(logs, stdout, stderr) {
  if (stdout && stdout.trim()) logs.push(stdout.trim());
  if (stderr && stderr.trim()) logs.push(stderr.trim());
}

async function create() {
  createError.value = '';
  creationStep.value = 'Starting…';
  creationLogs.value = '';
  creating.value = true;
  try {
    await api.apps.createWithProgress(form.value, (ev) => {
      if (ev.step) {
        creationStep.value = ev.message || stepLabels[ev.step] || ev.step;
        if (ev.stdout || ev.stderr) {
          const lines = creationLogs.value ? creationLogs.value.split('\n') : [];
          appendLogs(lines, ev.stdout, ev.stderr);
          creationLogs.value = lines.join('\n');
        }
      }
      if (ev.error) createError.value = ev.error;
    });
    showForm.value = false;
    form.value = { name: '', repo_url: '', branch: '', node_version: nodeVersions.value[0] || '20', install_cmd: 'npm install', build_cmd: '', start_cmd: 'npm start', domain: '', ssl_enabled: false };
    creationStep.value = '';
    creationLogs.value = '';
    domainCheckStatus.value = '';
    domainCheckMessage.value = '';
    branchDetected.value = '';
    load();
  } catch (e) {
    createError.value = e.message || 'Create failed';
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.creation-progress {
  margin-top: 1rem;
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
</style>
