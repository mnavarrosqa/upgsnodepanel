const base = '';

function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  });
}

export const api = {
  auth: {
    login: (username, password) => request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => request('/api/logout', { method: 'POST' }),
    me: () => request('/api/me'),
  },
  node: {
    versions: () => request('/api/node/versions'),
    installVersion: (version) => request('/api/node/versions', { method: 'POST', body: JSON.stringify({ version }) }),
  },
  apps: {
    list: () => request('/api/apps'),
    get: (id) => request(`/api/apps/${id}`),
    create: (data) => request('/api/apps', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/apps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/api/apps/${id}`, { method: 'DELETE' }),
    start: (id) => request(`/api/apps/${id}/start`, { method: 'POST' }),
    stop: (id) => request(`/api/apps/${id}/stop`, { method: 'POST' }),
    restart: (id) => request(`/api/apps/${id}/restart`, { method: 'POST' }),
    install: (id) => request(`/api/apps/${id}/install`, { method: 'POST' }),
    build: (id) => request(`/api/apps/${id}/build`, { method: 'POST' }),
    logs: (id, lines) => request(`/api/apps/${id}/logs?lines=${lines || 100}`),
  },
  system: {
    ip: () => request('/api/system/ip'),
  },
};
