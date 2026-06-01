import * as net from 'net';
import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { StellarService } from '../stellar/stellar.service';

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
    stellar: ProbeResult;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Optional() private readonly stellarService?: StellarService,
  ) {}

  private tcpProbe(
    host: string,
    port: number,
    timeoutMs = 3000,
  ): Promise<number> {
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

    if (uri.startsWith('mongodb+srv://')) {
      const m = uri.match(/mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)/);
      return m ? { host: m[1], port: 27017 } : null;
    }

    const m = uri.match(/mongodb:\/\/(?:[^@]+@)?([^/:?]+)(?::(\d+))?/);
    if (!m) return null;
    return { host: m[1], port: m[2] ? parseInt(m[2], 10) : 27017 };
  }

  private parseRedisTarget(): { host: string; port: number } | null {
    const uri = process.env.REDIS_URL;
    if (!uri) return null;

    const m = uri.match(/rediss?:\/\/(?:[^@]+@)?([^/:?]+)(?::(\d+))?/);
    if (!m) return null;
    return { host: m[1], port: m[2] ? parseInt(m[2], 10) : 6379 };
  }

  async checkDatabase(): Promise<ProbeResult> {
    if (!this.connection?.db) return { status: 'not_configured' };
    const start = Date.now();
    try {
      await this.connection.db.admin().ping();
      return { status: 'ok', latency_ms: Date.now() - start };
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

  async checkStellar(): Promise<ProbeResult> {
    if (!this.stellarService) return { status: 'not_configured' };

    const start = Date.now();
    try {
      await this.stellarService.getServer().serverInfo();
      return { status: 'ok', latency_ms: Date.now() - start };
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
    const [database, cache, stellar] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
      this.checkStellar(),
    ]);

    const degraded =
      database.status === 'error' || cache.status === 'error';

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      checks: { database, cache, stellar },
    };
  }
}
