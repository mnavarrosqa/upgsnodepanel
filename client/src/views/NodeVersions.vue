<template>
  <div>
    <h1 class="page-title">Node versions</h1>
    <div class="card">
      <h3 style="margin:0 0 1rem; font-size:1rem;">Install a version</h3>
      <form @submit.prevent="install" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:flex-end;">
        <div class="form-group" style="margin-bottom:0;">
          <label for="version">Version (e.g. 20, 22.1.0, lts)</label>
          <input id="version" v-model="newVersion" type="text" placeholder="20" />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="installing">Install</button>
      </form>
      <p v-if="installError" style="margin:0.5rem 0 0; color:var(--danger); font-size:0.875rem;">{{ installError }}</p>
    </div>
    <div class="card">
      <h3 style="margin:0 0 1rem; font-size:1rem;">Installed versions</h3>
      <ul v-if="versions.length" style="list-style:none; padding:0; margin:0;">
        <li v-for="v in versions" :key="v" style="padding:0.5rem 0; border-bottom:1px solid var(--border); font-family:monospace;">v{{ v }}</li>
      </ul>
      <p v-else style="margin:0; color:var(--text-muted);">No Node versions installed yet. Install one above (requires nvm on the server).</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const versions = ref([]);
const newVersion = ref('20');
const installing = ref(false);
const installError = ref('');

async function load() {
  try {
    const data = await api.node.versions();
    versions.value = data.versions || [];
  } catch (_) {}
}

onMounted(load);

async function install() {
  installError.value = '';
  installing.value = true;
  try {
    const data = await api.node.installVersion(newVersion.value.trim());
    versions.value = data.versions || [];
  } catch (e) {
    installError.value = e.message || 'Install failed';
  } finally {
    installing.value = false;
  }
}
</script>
