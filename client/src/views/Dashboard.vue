<template>
  <div class="dashboard">
    <h1 class="page-title">Dashboard</h1>

    <p v-if="loadError" class="page-error">{{ loadError }}</p>

    <section class="dashboard-section">
      <h2 class="dashboard-section__title">Server</h2>
      <div class="server-grid">
        <div class="card server-card">
          <span class="server-card__label">Hostname</span>
          <span class="server-card__value server-card__value--mono">{{ serverInfo.hostname || '—' }}</span>
        </div>
        <div class="card server-card">
          <span class="server-card__label">Public IP</span>
          <span class="server-card__value server-card__value--mono">{{ serverInfo.ip || '—' }}</span>
          <span class="server-card__hint">Use this IP to access apps by port when no domain is set</span>
        </div>
        <div class="card server-card server-card--wide">
          <span class="server-card__label">Disk</span>
          <template v-if="serverInfo.disk">
            <div class="server-card__bar-wrap">
              <div class="server-card__bar" :style="{ width: diskUsedPercent + '%' }" />
            </div>
            <span class="server-card__value server-card__value--small">
              {{ formatBytes(serverInfo.disk.used) }} used · {{ formatBytes(serverInfo.disk.available) }} available
              <span class="server-card__value--muted">({{ formatBytes(serverInfo.disk.total) }} total)</span>
            </span>
          </template>
          <span v-else class="server-card__value server-card__value--muted">—</span>
        </div>
        <div class="card server-card">
          <span class="server-card__label">Memory</span>
          <template v-if="serverInfo.memory">
            <div class="server-card__bar-wrap">
              <div class="server-card__bar" :style="{ width: memoryUsedPercent + '%' }" />
            </div>
            <span class="server-card__value server-card__value--small">
              {{ formatBytes(serverInfo.memory.used) }} / {{ formatBytes(serverInfo.memory.total) }}
            </span>
          </template>
          <span v-else class="server-card__value server-card__value--muted">—</span>
        </div>
        <div class="card server-card">
          <span class="server-card__label">Swap</span>
          <template v-if="serverInfo.swap && serverInfo.swap.total > 0">
            <div class="server-card__bar-wrap">
              <div class="server-card__bar" :style="{ width: swapUsedPercent + '%' }" />
            </div>
            <span class="server-card__value server-card__value--small">
              {{ formatBytes(serverInfo.swap.used) }} / {{ formatBytes(serverInfo.swap.total) }}
            </span>
          </template>
          <span v-else class="server-card__value server-card__value--muted">No swap</span>
        </div>
      </div>
    </section>

    <section class="dashboard-section">
      <div class="dashboard-section__head">
        <h2 class="dashboard-section__title">Apps at a glance</h2>
        <router-link to="/apps" class="btn btn-primary">Manage apps</router-link>
      </div>
      <div v-if="apps.length === 0 && !loadError" class="card apps-empty">
        <p class="apps-empty__text">No apps yet. <router-link to="/apps">Add an app</router-link>.</p>
      </div>
      <div v-else class="apps-grid">
        <div v-for="app in apps" :key="app.id" class="card app-card">
          <div class="app-card__header">
            <span class="badge" :class="app.status === 'running' ? 'badge-success' : (app.status === 'unknown' ? 'badge-warn' : 'badge-muted')" :title="app.status_error ? (app.status + ': ' + app.status_error) : app.status">{{ app.status }}</span>
            <span v-if="app.status === 'running' && (app.cpu != null || app.memory != null)" class="app-card__metrics">
              <span v-if="app.cpu != null">{{ formatCpu(app.cpu) }}</span>
              <span v-if="app.cpu != null && app.memory != null"> · </span>
              <span v-if="app.memory != null">{{ formatMemory(app.memory) }}</span>
            </span>
            <span v-else-if="app.size != null" class="app-card__size">{{ formatBytes(app.size) }}</span>
          </div>
          <h3 class="app-card__name">
            <router-link :to="`/apps/${app.id}`">{{ app.name }}</router-link>
          </h3>
          <p class="app-card__access">
            <template v-if="app.domain">
              <span class="app-card__proto">{{ (app.ssl_active || app.ssl_enabled) ? 'https' : 'http' }}://</span>{{ app.domain }}
            </template>
            <template v-else>
              <span class="app-card__value--muted">{{ serverInfo.ip || '…' }}:{{ app.port }}</span>
            </template>
          </p>
          <div class="app-card__actions">
            <a
              v-if="appUrl(app)"
              :href="appUrl(app)"
              target="_blank"
              rel="noopener"
              class="btn btn-primary app-card__btn"
            >
              Open app
            </a>
            <router-link :to="`/apps/${app.id}`" class="btn app-card__btn">Manage</router-link>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const apps = ref([]);
const serverInfo = ref({
  hostname: '',
  ip: '',
  memory: null,
  swap: null,
  disk: null,
});
const loadError = ref('');

function formatBytes(bytes) {
  if (bytes == null || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatCpu(cpu) {
  if (cpu == null) return '—';
  return `${Number(cpu).toFixed(1)}%`;
}

function formatMemory(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i <= 1 ? 0 : 1)} ${units[i]}`;
}

const diskUsedPercent = computed(() => {
  const d = serverInfo.value.disk;
  if (!d || d.total === 0) return 0;
  return Math.round((d.used / d.total) * 100);
});

const memoryUsedPercent = computed(() => {
  const m = serverInfo.value.memory;
  if (!m || m.total === 0) return 0;
  return Math.round((m.used / m.total) * 100);
});

const swapUsedPercent = computed(() => {
  const s = serverInfo.value.swap;
  if (!s || s.total === 0) return 0;
  return Math.round((s.used / s.total) * 100);
});

function appUrl(app) {
  if (app.domain) {
    const proto = (app.ssl_active || app.ssl_enabled) ? 'https' : 'http';
    return `${proto}://${app.domain}`;
  }
  const ip = serverInfo.value.ip;
  if (ip && app.port) return `http://${ip}:${app.port}`;
  return null;
}

onMounted(async () => {
  loadError.value = '';
  try {
    const [appsRes, infoRes] = await Promise.all([api.apps.list(), api.system.info()]);
    apps.value = appsRes.apps || [];
    serverInfo.value = {
      hostname: infoRes.hostname ?? '',
      ip: infoRes.ip ?? '',
      memory: infoRes.memory ?? null,
      swap: infoRes.swap ?? null,
      disk: infoRes.disk ?? null,
    };
  } catch (e) {
    loadError.value = e.message || 'Failed to load dashboard';
  }
});
</script>

<style scoped>
.dashboard-section {
  margin-bottom: 2rem;
}

.dashboard-section__title {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text);
}

.dashboard-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.dashboard-section__head .dashboard-section__title {
  margin: 0;
}

.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.server-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.server-card--wide {
  grid-column: span 2;
}

@media (max-width: 640px) {
  .server-card--wide {
    grid-column: span 1;
  }
}

.server-card__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.server-card__value {
  font-size: 1rem;
  font-weight: 500;
}

.server-card__value--mono {
  font-family: ui-monospace, monospace;
}

.server-card__value--small {
  font-size: 0.875rem;
}

.server-card__value--muted {
  color: var(--text-muted);
  font-weight: 400;
}

.server-card__hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

.server-card__bar-wrap {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
  margin: 0.25rem 0;
}

.server-card__bar {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.2s ease;
}

.apps-empty {
  padding: 2rem;
  text-align: center;
}

.apps-empty__text {
  margin: 0;
  color: var(--text-muted);
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.app-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.app-card__size {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.app-card__name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
}

.app-card__name a {
  color: var(--text);
}

.app-card__name a:hover {
  color: var(--accent);
}

.app-card__access {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  word-break: break-all;
}

.app-card__proto {
  color: var(--text-muted);
}

.app-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.app-card__btn {
  flex: 1;
  min-width: 0;
  justify-content: center;
}
</style>
