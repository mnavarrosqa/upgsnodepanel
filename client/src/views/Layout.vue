<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">UPGS NODE PANEL</div>
      <nav class="sidebar-nav">
        <router-link to="/" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </span>
          Dashboard
        </router-link>
        <router-link to="/node" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
          </span>
          Node versions
        </router-link>
        <router-link to="/apps" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/></svg>
          </span>
          Apps
        </router-link>
        <router-link to="/maintenance" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </span>
          Maintenance
        </router-link>
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
.sidebar-nav__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sidebar-nav__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
}
a.router-link-active .sidebar-nav__icon {
  opacity: 1;
}
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
