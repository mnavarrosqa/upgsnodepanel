<template>
  <div>
    <h1 class="page-title">Dashboard</h1>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin:0 0 0.5rem; font-size:1rem;">Apps</h3>
        <p style="margin:0; font-size:1.5rem; font-weight:600;">{{ apps.length }}</p>
        <router-link to="/apps" class="btn btn-primary" style="margin-top:0.75rem;">Manage apps</router-link>
      </div>
      <div class="card">
        <h3 style="margin:0 0 0.5rem; font-size:1rem;">Server IP</h3>
        <p style="margin:0; font-size:1rem; font-family:monospace;">{{ serverIp || '—' }}</p>
        <p style="margin:0.5rem 0 0; font-size:0.8rem; color:var(--text-muted);">Use this IP to access apps by port if domain is not set</p>
      </div>
    </div>
    <div class="card">
      <h3 style="margin:0 0 1rem; font-size:1rem;">Apps at a glance</h3>
      <div v-if="apps.length === 0" style="color:var(--text-muted);">No apps yet. <router-link to="/apps">Add an app</router-link>.</div>
      <ul v-else style="list-style:none; padding:0; margin:0;">
        <li v-for="app in apps" :key="app.id" style="padding:0.5rem 0; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:1rem;">
          <span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span>
          <router-link :to="`/apps/${app.id}`">{{ app.name }}</router-link>
          <span style="color:var(--text-muted); font-size:0.875rem;">{{ app.domain || `:${app.port}` }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const apps = ref([]);
const serverIp = ref('');

onMounted(async () => {
  try {
    const [appsRes, ipRes] = await Promise.all([api.apps.list(), api.system.ip()]);
    apps.value = appsRes.apps || [];
    serverIp.value = ipRes.ip || null;
  } catch (_) {}
});
</script>
