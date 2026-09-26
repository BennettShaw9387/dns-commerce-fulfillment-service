import { describe, expect, it } from 'vitest';
import { InfraiError } from '../src/infrai_client';
import { buildCustomerUpdate, processZoneOrder, zoneOrderSchema } from '../src/zone_order_service';

describe('zone order workflow', () => {
  it('rejects non-MX priority at validation time', () => {
    const result = zoneOrderSchema.safeParse({
      orderId: 'ord_bad',
      customerEmail: 'ops@example.com',
      domain: 'example.com',
      records: [
        { record_type: 'TXT', name: '@', content: 'v=spf1 ~all', priority: 10 }
      ]
    });

    expect(result.success).toBe(false);
  });

  it('creates a new zone, fulfills records, and returns a completed receipt', async () => {
    const calls: Array<{ step: string; payload: unknown }> = [];
    const infrai = {
      dns: {
        domain: {
          async get(input: { domain: string }) {
            calls.push({ step: 'get', payload: input });
            throw new InfraiError('not found', 404, { domain: input.domain });
          },
          async add(input: { domain: string; vendor?: string; account_id?: string; metadata?: Record<string, unknown> }) {
            calls.push({ step: 'add', payload: input });
            return { zone_id: 'zone_123', domain: input.domain };
          },
          async verify(input: { domain: string }) {
            calls.push({ step: 'verify', payload: input });
            return { domain: input.domain, verified: true };
          }
        },
        record: {
          async upsert(input: Record<string, unknown>) {
            calls.push({ step: 'upsert', payload: input });
            return { zone_id: 'zone_123', record_id: `rec_${calls.length}` };
          }
        }
      }
    };

    const result = await processZoneOrder({
      orderId: 'ord_1001',
      customerEmail: 'ops@agentmail.shop',
      domain: 'agentmail.shop',
      vendor: 'migrated-registrar',
      records: [
        { record_type: 'TXT', name: '@', content: 'v=spf1 include:mail.example.test ~all', ttl: 300 },
        { record_type: 'MX', name: '@', content: 'mail.agentmail.shop', priority: 10, ttl: 300 }
      ]
    }, infrai as never);

    expect(result.status).toBe('completed');
    expect(result.fulfillment.zoneId).toBe('zone_123');
    expect(result.receipt.recordsPurchased).toBe(2);
    expect(result.customerUpdate.subject).toContain('ord_1001');
    expect(calls.map((call) => call.step)).toEqual(['get', 'add', 'upsert', 'upsert', 'verify']);
    expect(calls[2].payload).toMatchObject({ zone_id: 'zone_123', record_type: 'TXT' });
  });

  it('creates a zone when lookup succeeds with an empty zone id', async () => {
    const calls: string[] = [];
    const infrai = {
      dns: {
        domain: {
          async get() {
            calls.push('get');
            return { zone_id: '', domain: 'example.com' };
          },
          async add(input: { domain: string }) {
            calls.push('add');
            return { zone_id: 'zone_created', domain: input.domain };
          },
          async verify(input: { domain: string }) {
            calls.push('verify');
            return { domain: input.domain, verified: true };
          }
        },
        record: {
          async upsert() {
            calls.push('upsert');
            return { zone_id: 'zone_created', record_id: 'rec_1' };
          }
        }
      }
    };

    const result = await processZoneOrder({
      orderId: 'ord_empty_zone',
      customerEmail: 'ops@example.com',
      domain: 'example.com',
      records: [{ record_type: 'A', name: '@', content: '203.0.113.10' }]
    }, infrai as never);

    expect(result.fulfillment.zoneId).toBe('zone_created');
    expect(calls).toEqual(['get', 'add', 'upsert', 'verify']);
  });

  it('builds a customer update with the applied record count', () => {
    const update = buildCustomerUpdate({
      orderId: 'ord_55',
      customerEmail: 'ops@example.com',
      domain: 'example.com',
      records: [
        { record_type: 'A', name: '@', content: '203.0.113.10' }
      ]
    }, 'zone_9', 1);

    expect(update.message).toContain('zone_9');
    expect(update.message).toContain('1 DNS records');
  });
});
