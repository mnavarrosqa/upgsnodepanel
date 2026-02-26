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
    let data = {};
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {}
    }
    if (!res.ok) {
      const message = data.error || res.statusText || 'Request failed';
      throw new Error(message);
    }
    return data;
  }).catch((err) => {
    if (err instanceof Error) throw err;
    throw new Error('Network or request failed');
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
    /**
     * Create app with streaming progress. Calls onEvent({ step, message?, stdout?, stderr?, done?, app?, error? }) for each NDJSON line.
     * Resolves with the created app or rejects with error.
     */
    async createWithProgress(data, onEvent) {
      const url = `${base}/api/apps?stream=1`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok && !res.body) {
        const text = await res.text();
        let err = text;
        try {
          const j = JSON.parse(text);
          if (j.error) err = j.error;
        } catch (_) {}
        throw new Error(err);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let lastApp = null;
      let lastError = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (onEvent) onEvent(ev);
            if (ev.done && ev.app) lastApp = ev.app;
            if (ev.error) lastError = ev.error;
          } catch (_) {}
        }
      }
      if (buf.trim()) {
        try {
          const ev = JSON.parse(buf);
          if (onEvent) onEvent(ev);
          if (ev.done && ev.app) lastApp = ev.app;
          if (ev.error) lastError = ev.error;
        } catch (_) {}
      }
      if (lastError) throw new Error(lastError);
      if (lastApp) return lastApp;
      throw new Error('Create failed');
    },
    update: (id, data) => request(`/api/apps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/api/apps/${id}`, { method: 'DELETE' }),
    start: (id) => request(`/api/apps/${id}/start`, { method: 'POST' }),
    stop: (id) => request(`/api/apps/${id}/stop`, { method: 'POST' }),
    restart: (id) => request(`/api/apps/${id}/restart`, { method: 'POST' }),
    install: (id) => request(`/api/apps/${id}/install`, { method: 'POST' }),
    build: (id) => request(`/api/apps/${id}/build`, { method: 'POST' }),
    logs: (id, lines) => request(`/api/apps/${id}/logs?lines=${lines || 100}`),
    env: (id) => request(`/api/apps/${id}/env`),
    updateEnv: (id, env) => request(`/api/apps/${id}/env`, { method: 'PUT', body: JSON.stringify({ env }) }),
  },
  system: {
    ip: () => request('/api/system/ip'),
  },
};
