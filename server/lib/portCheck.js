import net from 'net';
import { spawnSync } from 'child_process';

/**
 * Returns true if the port is currently in use (cannot bind), false if free.
 * Async; use when callers can await.
 */
export function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer(() => {});
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Synchronous check: returns true if port is in use, false if free.
 * Used by getAvailablePort() which must stay sync.
 */
export function isPortInUseSync(port) {
  const script =
    "const net=require('net');const p=Number(process.argv[1]);const s=net.createServer();s.once('error',()=>process.exit(1));s.once('listening',()=>s.close(()=>process.exit(0)));s.listen(p,'127.0.0.1');";
  const result = spawnSync(process.execPath, ['-e', script, String(port)], {
    encoding: 'utf-8',
    timeout: 2000,
  });
  return result.status !== 0;
}
