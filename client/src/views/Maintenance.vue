<template>
  <div>
    <h1 class="page-title">Maintenance</h1>
    <p class="page-intro">Clean unused files and caches that are not required for your apps to run. Each action is safe and can free disk space.</p>
    <p v-if="loadError" class="page-error">{{ loadError }}</p>
    <div v-else class="maintenance-grid">
      <section v-for="opt in options" :key="opt.id" class="card maintenance-card">
        <h2 class="card__title">{{ opt.label }}</h2>
        <p class="card__muted">{{ opt.description }}</p>
        <div class="maintenance-card__actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy === opt.id"
            @click="cleanOne(opt.id)"
          >
            {{ busy === opt.id ? 'Cleaning…' : 'Clean' }}
          </button>
          <span v-if="lastResult[opt.id]" class="maintenance-result" :class="lastResult[opt.id].ok ? 'maintenance-result--ok' : 'maintenance-result--err'">
            {{ lastResult[opt.id].message }}
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
        :disabled="busy === 'all' || options.length === 0"
        @click="cleanAll"
      >
        {{ busy === 'all' ? 'Cleaning…' : 'Clean all' }}
      </button>
      <p v-if="lastResult.all" class="maintenance-result" :class="lastResult.all.ok ? 'maintenance-result--ok' : 'maintenance-result--err'" style="margin-top: 0.5rem;">
        {{ lastResult.all.message }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const options = ref([]);
const loadError = ref('');
const busy = ref(null);
const lastResult = ref({});

onMounted(async () => {
  loadError.value = '';
  try {
    const data = await api.system.maintenanceOptions();
    options.value = data.options || [];
  } catch (e) {
    loadError.value = e.message || 'Failed to load maintenance options';
  }
});

async function cleanOne(id) {
  busy.value = id;
  lastResult.value = { ...lastResult.value, [id]: null };
  try {
    const data = await api.system.cleanMaintenance([id]);
    const r = (data.results || []).find((x) => x.id === id);
    if (r) {
      lastResult.value = { ...lastResult.value, [id]: { ok: r.ok, message: r.message } };
    } else {
      lastResult.value = { ...lastResult.value, [id]: { ok: false, message: 'No result returned.' } };
    }
  } catch (e) {
    lastResult.value = { ...lastResult.value, [id]: { ok: false, message: e.message || 'Clean failed.' } };
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
    if (failed.length === 0) {
      lastResult.value = { ...lastResult.value, all: { ok: true, message: `All ${ok.length} cleanup(s) completed.` } };
    } else {
      lastResult.value = { ...lastResult.value, all: { ok: false, message: `${failed.length} failed: ${failed.map((r) => r.message).join('; ')}` } };
    }
  } catch (e) {
    lastResult.value = { ...lastResult.value, all: { ok: false, message: e.message || 'Clean failed.' } };
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
.maintenance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}
.maintenance-card .card__title {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}
.maintenance-card .card__muted {
  margin-bottom: 1rem;
  font-size: 0.875rem;
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
</style>
