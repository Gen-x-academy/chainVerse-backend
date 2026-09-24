import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProtocolAdapter } from '../protocol-adapter.inteface';
import {
  ProtocolMetadata,
  ProtocolMetadataDocument,
} from './schemas/protocol-metadata.schema';
import { QueryProtocolsDto } from './dto/query-protocols.dto';

export const PROTOCOL_ADAPTERS = 'PROTOCOL_ADAPTERS';

export interface ProtocolDiscoveryResult {
  name: string;
  type: string;
  version: string;
  supportedChains: string[];
  tvl: number;
  apy: number;
  audits: string[];
  insurance: boolean;
  description?: string;
  website?: string;
  source: 'adapter' | 'database';
}

@Injectable()
export class DeFiService {
  constructor(
    @InjectModel(ProtocolMetadata.name)
    private readonly protocolModel: Model<ProtocolMetadataDocument>,
    @Inject(PROTOCOL_ADAPTERS)
    private readonly adapters: ProtocolAdapter[],
  ) {}

  async discoverProtocols(
    query: QueryProtocolsDto,
  ): Promise<ProtocolDiscoveryResult[]> {
    const adapterResults = await this.discoverFromAdapters(query);
    const dbResults = await this.discoverFromDatabase(query);

    const merged = new Map<string, ProtocolDiscoveryResult>();

    for (const result of adapterResults) {
      merged.set(result.name, result);
    }

    for (const result of dbResults) {
      if (!merged.has(result.name)) {
        merged.set(result.name, result);
      }
    }

    return Array.from(merged.values());
  }

  async findOneByName(name: string): Promise<ProtocolDiscoveryResult> {
    const adapterResult = await this.findAdapterByName(name);
    if (adapterResult) {
      return adapterResult;
    }

    const protocol = await this.protocolModel
      .findOne({ name, isActive: true })
      .exec();
    if (!protocol) {
      throw new NotFoundException(`Protocol "${name}" not found`);
    }

    return {
      name: protocol.name,
      type: protocol.type,
      version: protocol.version,
      supportedChains: protocol.supportedChains,
      tvl: protocol.tvl,
      apy: protocol.apy,
      audits: protocol.audits,
      insurance: protocol.insurance,
      description: protocol.description,
      website: protocol.website,
      source: 'database',
    };
  }

  private async discoverFromAdapters(
    query: QueryProtocolsDto,
  ): Promise<ProtocolDiscoveryResult[]> {
    const results: ProtocolDiscoveryResult[] = [];

    for (const adapter of this.adapters) {
      try {
        const metrics = await adapter.getProtocolMetrics();
        const result: ProtocolDiscoveryResult = {
          name: adapter.name,
          type: this.inferType(adapter),
          version: '1.0.0',
          supportedChains: adapter.supportedChains,
          tvl: metrics.tvl,
          apy: metrics.apy,
          audits: metrics.audits,
          insurance: metrics.insurance,
          source: 'adapter',
        };

        if (this.matchesQuery(result, query)) {
          results.push(result);
        }
      } catch {
        // Skip adapters that fail to respond
      }
    }

    return results;
  }

  private async discoverFromDatabase(
    query: QueryProtocolsDto,
  ): Promise<ProtocolDiscoveryResult[]> {
    const filter: Record<string, unknown> = { isActive: true };

    if (query.name) {
      filter.name = { $regex: query.name, $options: 'i' };
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.chains && query.chains.length > 0) {
      filter.supportedChains = { $in: query.chains };
    }

    const protocols = await this.protocolModel.find(filter).exec();

    return protocols.map((p) => ({
      name: p.name,
      type: p.type,
      version: p.version,
      supportedChains: p.supportedChains,
      tvl: p.tvl,
      apy: p.apy,
      audits: p.audits,
      insurance: p.insurance,
      description: p.description,
      website: p.website,
      source: 'database' as const,
    }));
  }

  private async findAdapterByName(
    name: string,
  ): Promise<ProtocolDiscoveryResult | null> {
    for (const adapter of this.adapters) {
      if (adapter.name.toLowerCase() === name.toLowerCase()) {
        try {
          const metrics = await adapter.getProtocolMetrics();
          return {
            name: adapter.name,
            type: this.inferType(adapter),
            version: '1.0.0',
            supportedChains: adapter.supportedChains,
            tvl: metrics.tvl,
            apy: metrics.apy,
            audits: metrics.audits,
            insurance: metrics.insurance,
            source: 'adapter',
          };
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private inferType(adapter: ProtocolAdapter): string {
    const name = adapter.name.toLowerCase();
    if (name.includes('lend') || name.includes('borrow')) return 'lending';
    if (name.includes('swap') || name.includes('dex')) return 'dex';
    if (name.includes('yield') || name.includes('farm')) return 'yield';
    if (name.includes('stak')) return 'staking';
    return 'other';
  }

  private matchesQuery(
    result: ProtocolDiscoveryResult,
    query: QueryProtocolsDto,
  ): boolean {
    if (
      query.name &&
      !result.name.toLowerCase().includes(query.name.toLowerCase())
    ) {
      return false;
    }
    if (query.type && result.type !== query.type) {
      return false;
    }
    if (query.chains && query.chains.length > 0) {
      const hasChain = query.chains.some((c) =>
        result.supportedChains.includes(c),
      );
      if (!hasChain) return false;
    }
    return true;
  }
}
