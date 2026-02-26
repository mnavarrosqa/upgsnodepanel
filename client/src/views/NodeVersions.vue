<template>
  <div class="node-versions">
    <h1 class="page-title">Node versions</h1>
    <section class="card">
      <h2 class="card__title">Install a version</h2>
      <p class="card__muted">Enter a version (e.g. 20, 22.1.0) or use a quick-install button. Requires nvm on the server.</p>
      <form @submit.prevent="install" class="install-form">
        <div class="form-group">
          <label for="version">Version</label>
          <input id="version" v-model="newVersion" type="text" placeholder="20" />
        </div>
        <div class="quick-install">
          <span class="quick-install__label">Quick install:</span>
          <button
            v-for="v in quickVersions"
            :key="v"
            type="button"
            class="btn btn-sm"
            :disabled="installing || versions.includes(v)"
            :title="versions.includes(v) ? 'Already installed' : `Install Node ${v}`"
            @click="installVersion(v)"
          >
            {{ v }}
          </button>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="installing">
          {{ installing ? 'Installing…' : 'Install' }}
        </button>
      </form>
      <p v-if="installError" class="card__error">{{ installError }}</p>
    </section>
    <section class="card">
      <h2 class="card__title">Installed versions</h2>
      <div v-if="versions.length" class="versions-grid">
        <div
          v-for="v in versions"
          :key="v"
          class="version-tile"
          :class="{ 'version-tile--installing': installingTarget === v }"
        >
          <span class="version-tile__label">v{{ v }}</span>
        </div>
      </div>
      <p v-else class="card__muted">No Node versions installed yet. Install one above.</p>
    </section>
    <section v-if="lastInstallLog" class="card">
      <h2 class="card__title">Last install output</h2>
      <pre class="install-log">{{ lastInstallLog }}</pre>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const versions = ref([]);
const newVersion = ref('20');
const installing = ref(false);
const installingTarget = ref('');
const installError = ref('');
const lastInstallLog = ref('');
const quickVersions = ['18', '20', '22', 'lts'];

async function load() {
  try {
    const data = await api.node.versions();
    versions.value = data.versions || [];
  } catch (_) {}
}

function buildLog(data) {
  const out = (data.stdout || '').trim();
  const err = (data.stderr || '').trim();
  if (out && err) return out + '\n' + err;
  return out || err || '';
}

async function installVersion(version) {
  installError.value = '';
  lastInstallLog.value = '';
  installing.value = true;
  installingTarget.value = version;
  try {
    const res = await fetch('/api/node/versions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      versions.value = data.versions || [];
      lastInstallLog.value = buildLog(data) || 'Install completed (no output).';
    } else {
      installError.value = data.error || 'Install failed';
      lastInstallLog.value = buildLog(data) || data.error || 'Install failed.';
    }
  } catch (e) {
    installError.value = e.message || 'Install failed';
    lastInstallLog.value = e.message || 'Install failed.';
  } finally {
    installing.value = false;
    installingTarget.value = '';
  }
}

async function install() {
  const v = newVersion.value.trim();
  if (!v) return;
  await installVersion(v);
}
</script>

<style scoped>
.card__title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}
.card__muted {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.card__error {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: var(--danger);
}
.install-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}
.install-form .form-group {
  margin-bottom: 0;
  min-width: 120px;
}
.quick-install {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.quick-install__label {
  font-size: 0.875rem;
  color: var(--text-muted);
}
.versions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.5rem;
}
.version-tile {
  padding: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: center;
}
.version-tile--installing {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}
.version-tile__label {
  font-family: ui-monospace, monospace;
  font-size: 0.9375rem;
  font-weight: 500;
}
.install-log {
  margin: 0;
  padding: 1rem;
  font-size: 0.8rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.card + .card {
  margin-top: 1rem;
}
</style>
