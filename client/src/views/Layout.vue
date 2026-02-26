<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">UPGS NODE PANEL</div>
      <nav class="sidebar-nav">
        <router-link to="/">Dashboard</router-link>
        <router-link to="/node">Node versions</router-link>
        <router-link to="/apps">Apps</router-link>
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-user">{{ user }}</span>
        <button type="button" class="btn" @click="logout">Log out</button>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const user = ref('');

onMounted(async () => {
  try {
    const data = await api.auth.me();
    user.value = data.user || '';
  } catch (_) {}
});

async function logout() {
  await api.auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.sidebar-footer {
  margin-top: auto;
  padding: 1rem;
  border-top: 1px solid var(--border);
}
.sidebar-user {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.sidebar .btn {
  width: 100%;
  justify-content: center;
}
</style>
