<template>
  <div>
    <h1 class="page-title">Maintenance</h1>
    <p class="page-intro">Clean unused files and caches that are not required for your apps to run. Each action is safe and can free disk space.</p>
    <p v-if="loadError" class="page-error">{{ loadError }}</p>
    <div v-else class="maintenance-list">
      <section v-for="opt in options" :key="opt.id" class="card maintenance-card">
        <h2 class="card__title">{{ opt.label }}</h2>
        <p class="card__muted">{{ opt.description }}</p>
        <div v-if="opt.details && opt.details.length" class="maintenance-overview">
          <p class="maintenance-overview__summary">
            Total: <strong>{{ formatSize(opt.size) }}</strong>
            <span v-if="opt.details.length > 1"> ({{ opt.details.length }} items)</span>
          </p>
          <div class="table-wrap">
            <table class="maintenance-table">
              <thead>
                <tr>
                  <th>Path / file</th>
                  <th>Size</th>
                  <th>Owner</th>
                  <th v-if="hasAppColumn(opt)">App</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(d, i) in opt.details" :key="i">
                  <td class="maintenance-table__path" :title="d.path">{{ d.path }}</td>
                  <td>{{ formatSize(d.size) }}</td>
                  <td>{{ d.owner }}</td>
                  <td v-if="hasAppColumn(opt)">{{ d.app || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p v-else class="card__muted">Nothing to clean.</p>
        <div class="maintenance-card__actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy === opt.id || (opt.size != null && opt.size === 0)"
            @click="cleanOne(opt.id)"
          >
            {{ busy === opt.id ? 'Cleaning…' : 'Clean' }}
          </button>
          <span v-if="lastResult[opt.id]" class="maintenance-result" :class="lastResult[opt.id].ok ? 'maintenance-result--ok' : 'maintenance-result--err'">
            {{ lastResult[opt.id].message }}
            <span v-if="lastResult[opt.id].freed != null && lastResult[opt.id].freed > 0" class="maintenance-freed">
              {{ formatSize(lastResult[opt.id].freed) }} freed.
            </span>
          </span>
        </div>
      </section>
    </div>
    <div class="card" style="margin-top: 1.5rem;">
      <h2 class="card__title">Clean all</h2>
      <p class="card__muted">Run all cleanup actions above in one go.</p>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="busy === 'all' || options.length === 0 || !hasAnythingToClean"
        @click="cleanAll"
      >
        {{ busy === 'all' ? 'Cleaning…' : 'Clean all' }}
      </button>
      <p v-if="lastResult.all" class="maintenance-result" :class="lastResult.all.ok ? 'maintenance-result--ok' : 'maintenance-result--err'" style="margin-top: 0.5rem;">
        {{ lastResult.all.message }}
        <span v-if="lastResult.all.freed != null && lastResult.all.freed > 0" class="maintenance-freed">
          {{ formatSize(lastResult.all.freed) }} freed in total.
        </span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';

const options = ref([]);
const loadError = ref('');
const busy = ref(null);
const lastResult = ref({});

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i <= 1 ? 0 : 1)} ${units[i]}`;
}

function hasAppColumn(opt) {
  return opt.details && opt.details.some((d) => d.app != null && d.app !== '');
}

const hasAnythingToClean = computed(() => options.value.some((o) => o.size != null && o.size > 0));

onMounted(load);

async function load() {
  loadError.value = '';
  try {
    const data = await api.system.maintenanceOptions();
    options.value = data.options || [];
  } catch (e) {
    loadError.value = e.message || 'Failed to load maintenance options';
  }
}

async function cleanOne(id) {
  busy.value = id;
  lastResult.value = { ...lastResult.value, [id]: null };
  try {
    const data = await api.system.cleanMaintenance([id]);
    const r = (data.results || []).find((x) => x.id === id);
    if (r) {
      lastResult.value = { ...lastResult.value, [id]: { ok: r.ok, message: r.message, freed: r.freed } };
    } else {
      lastResult.value = { ...lastResult.value, [id]: { ok: false, message: 'No result returned.', freed: 0 } };
    }
    if (r && r.ok) await load();
  } catch (e) {
    lastResult.value = { ...lastResult.value, [id]: { ok: false, message: e.message || 'Clean failed.', freed: 0 } };
  } finally {
    busy.value = null;
  }
}

async function cleanAll() {
  busy.value = 'all';
  lastResult.value = { ...lastResult.value, all: null };
  try {
    const data = await api.system.cleanMaintenance(options.value.map((o) => o.id));
    const results = data.results || [];
    const failed = results.filter((r) => !r.ok);
    const ok = results.filter((r) => r.ok);
    const totalFreed = results.reduce((sum, r) => sum + (r.freed || 0), 0);
    if (failed.length === 0) {
      lastResult.value = { ...lastResult.value, all: { ok: true, message: `All ${ok.length} cleanup(s) completed.`, freed: totalFreed } };
    } else {
      lastResult.value = { ...lastResult.value, all: { ok: false, message: `${failed.length} failed: ${failed.map((r) => r.message).join('; ')}`, freed: totalFreed } };
    }
    if (failed.length === 0) await load();
  } catch (e) {
    lastResult.value = { ...lastResult.value, all: { ok: false, message: e.message || 'Clean failed.', freed: 0 } };
  } finally {
    busy.value = null;
  }
}
</script>

<style scoped>
.page-intro {
  color: var(--text-muted);
  margin: 0 0 1.5rem;
  max-width: 42rem;
}
.maintenance-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.maintenance-card .card__title {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}
.maintenance-card .card__muted {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}
.maintenance-overview {
  margin-bottom: 1rem;
}
.maintenance-overview__summary {
  font-size: 0.875rem;
  margin: 0 0 0.5rem;
  color: var(--text-muted);
}
.maintenance-overview__summary strong {
  color: var(--text);
}
.table-wrap {
  overflow-x: auto;
  margin-bottom: 0.5rem;
}
.maintenance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.maintenance-table th,
.maintenance-table td {
  padding: 0.4rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.maintenance-table th {
  color: var(--text-muted);
  font-weight: 500;
}
.maintenance-table__path {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.maintenance-card__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.maintenance-result {
  font-size: 0.875rem;
}
.maintenance-result--ok {
  color: var(--success);
}
.maintenance-result--err {
  color: var(--danger);
}
.maintenance-freed {
  font-weight: 500;
  margin-left: 0.25rem;
}
</style>
