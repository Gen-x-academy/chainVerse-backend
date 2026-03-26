import { Injectable } from '@nestjs/common';
import * as net from 'net';

export type ProbeStatus = 'ok' | 'error' | 'not_configured';

export interface ProbeResult {
  status: ProbeStatus;
  latency_ms?: number;
  error?: string;
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: {
    database: ProbeResult;
    cache: ProbeResult;
  };
}

@Injectable()
export class HealthService {
  /**
   * Attempts a raw TCP connection and resolves with the round-trip latency.
   * This works regardless of which client library (if any) is installed.
   */
  private tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<number> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const socket = net.createConnection({ host, port });
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve(Date.now() - start);
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('connection timed out'));
      });
      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseMongoTarget(): { host: string; port: number } | null {
    const uri = process.env.MONGO_URI ?? process.env.MONGODB_URI;
    if (!uri) return null;

    // mongodb+srv://[user:pass@]host/db — no port in the URI itself
    if (uri.startsWith('mongodb+srv://')) {
      const m = uri.match(/mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/);
      return m ? { host: m[1], port: 27017 } : null;
    }

    // mongodb://[user:pass@]host[:port]/db
    const m = uri.match(/mongodb:\/\/(?:[^@]+@)?([^/:?]+)(?::(\d+))?/);
    if (!m) return null;
    return { host: m[1], port: m[2] ? parseInt(m[2], 10) : 27017 };
  }

  private parseRedisTarget(): { host: string; port: number } | null {
    const uri = process.env.REDIS_URL;
    if (!uri) return null;

    // redis[s]://[[user]:pass@]host[:port][/db]
    const m = uri.match(/rediss?:\/\/(?:[^@]+@)?([^/:?]+)(?::(\d+))?/);
    if (!m) return null;
    return { host: m[1], port: m[2] ? parseInt(m[2], 10) : 6379 };
  }

  async checkDatabase(): Promise<ProbeResult> {
    const target = this.parseMongoTarget();
    if (!target) return { status: 'not_configured' };

    try {
      const latency_ms = await this.tcpProbe(target.host, target.port);
      return { status: 'ok', latency_ms };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  }

  async checkCache(): Promise<ProbeResult> {
    const target = this.parseRedisTarget();
    if (!target) return { status: 'not_configured' };

    try {
      const latency_ms = await this.tcpProbe(target.host, target.port);
      return { status: 'ok', latency_ms };
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  }

  liveness() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const [database, cache] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
    ]);

    const degraded = database.status === 'error' || cache.status === 'error';

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      checks: { database, cache },
    };
  }
}
