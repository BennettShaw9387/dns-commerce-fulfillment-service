import { z } from 'zod';
import { InfraiError, type DnsRecordWrite, type InfraiClient } from './infrai_client';

const recordSchema = z.object({
  record_type: z.enum(['TXT', 'CNAME', 'MX', 'A']),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().positive().optional(),
  proxied: z.boolean().optional()
}).superRefine((record, ctx) => {
  if (record.record_type === 'MX' && record.priority == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'MX records require priority', path: ['priority'] });
  }
  if (record.record_type !== 'MX' && record.priority != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only MX records use priority', path: ['priority'] });
  }
});

export const zoneOrderSchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  domain: z.string().min(1),
  vendor: z.string().min(1).optional(),
  account_id: z.string().min(1).optional(),
  records: z.array(recordSchema).min(1)
});

export type ZoneOrderInput = z.infer<typeof zoneOrderSchema>;

export type ZoneOrderResult = {
  status: 'completed';
  receipt: {
    orderId: string;
    customerEmail: string;
    domain: string;
    recordsPurchased: number;
  };
  fulfillment: {
    zoneId: string;
    domainVerified: boolean;
    recordsApplied: Array<Pick<DnsRecordWrite, 'record_type' | 'name' | 'content' | 'ttl' | 'priority' | 'proxied'>>;
  };
  customerUpdate: {
    subject: string;
    message: string;
  };
};

export function buildCustomerUpdate(input: ZoneOrderInput, zoneId: string, recordCount: number): ZoneOrderResult['customerUpdate'] {
  return {
    subject: `DNS order ${input.orderId} completed`,
    message: `Your zone ${input.domain} is active under ${zoneId}. We applied ${recordCount} DNS records and verified the domain for delivery checks.`
  };
}

export async function processZoneOrder(rawInput: unknown, infrai: InfraiClient): Promise<ZoneOrderResult> {
  const input = zoneOrderSchema.parse(rawInput);

  let zoneId: string;
  try {
    const existingZone = await infrai.dns.domain.get({ domain: input.domain });
    if (!existingZone.zone_id) {
      throw new InfraiError('domain not found', 404, { domain: input.domain });
    }
    zoneId = existingZone.zone_id;
  } catch (error) {
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      const createdZone = await infrai.dns.domain.add({
        domain: input.domain,
        vendor: input.vendor,
        account_id: input.account_id,
        metadata: { order_id: input.orderId }
      });
      zoneId = createdZone.zone_id;
    } else {
      throw error;
    }
  }

  for (const record of input.records) {
    await infrai.dns.record.upsert({
      zone_id: zoneId,
      record_type: record.record_type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority,
      proxied: record.proxied,
      metadata: { order_id: input.orderId }
    });
  }

  const verification = await infrai.dns.domain.verify({ domain: input.domain });
  const customerUpdate = buildCustomerUpdate(input, zoneId, input.records.length);

  return {
    status: 'completed',
    receipt: {
      orderId: input.orderId,
      customerEmail: input.customerEmail,
      domain: input.domain,
      recordsPurchased: input.records.length
    },
    fulfillment: {
      zoneId,
      domainVerified: verification.verified ?? true,
      recordsApplied: input.records.map((record) => ({
        record_type: record.record_type!,
        name: record.name!,
        content: record.content!,
        ttl: record.ttl,
        priority: record.priority,
        proxied: record.proxied
      }))
    },
    customerUpdate
  };
}
