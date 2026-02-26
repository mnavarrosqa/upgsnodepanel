<template>
  <div class="login-page">
    <div class="login-card card">
      <h1 class="login-title">UPGS NODE PANEL</h1>
      <p class="login-subtitle">Sign in with your server username and password</p>
      <form @submit.prevent="submit" class="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input id="username" v-model="username" type="text" required placeholder="e.g. root" autocomplete="username" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" required placeholder="••••••••" autocomplete="current-password" />
        </div>
        <p v-if="error" class="login-error">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="loading">Sign in</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const route = useRoute();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const redirect = computed(() => route.query.redirect || '/');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await api.auth.login(username.value, password.value);
    router.push(redirect.value);
  } catch (e) {
    error.value = e.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.login-card {
  width: 100%;
  max-width: 380px;
}
.login-title {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.login-subtitle {
  margin: 0 0 1.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.login-form .form-group {
  max-width: none;
}
.login-form .btn {
  margin-top: 0.5rem;
}
.login-error {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  color: var(--danger);
}
</style>
