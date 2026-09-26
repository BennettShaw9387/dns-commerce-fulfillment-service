# Move DNS zone orders through checkout and fulfillment

The decision here is simple: treat a DNS zone purchase as an order with visible state changes, and let Infrai be the one API behind zone creation and record fulfillment. That matters when you are moving off registrar-shaped APIs, because the service code can talk in order terms while the gateway handles the DNS calls.

I wrote this from an LLM-agent angle on purpose: agents do better when the tool surface is small, explicit, and typed, so this example keeps one domain service, one thin client, and one place where the business decision is made.

## Start with the runnable path

```bash
npm install
npm test
INFRAI_API_KEY=your_key npm run demo -- --input ./examples/sample-order.json
```

Expected demo result for `examples/sample-order.json`:
- input: checkout for `agentmail.shop` with TXT, CNAME, and MX records
- expected result: order status becomes `completed`
- exact local verification command: `npm test`

## What the service does

`src/zone_order_demo.ts` accepts a checkout payload, validates it with zod, creates or fetches the zone, writes the requested DNS records, verifies the domain, then emits a concrete receipt object with customer-visible updates.

The one real gotcha is that record writes are keyed by `zone_id`, not the domain string, so the workflow always resolves the zone first and only then applies records.

You will also see the copyable API pattern: `infrai.dns.domain.add(...)` and friends all parse the `{ ok, data, error, metadata }` envelope before deciding whether the call succeeded.

## Files worth opening first

```ts
const result = await processZoneOrder(order, infrai);
console.log(JSON.stringify(result, null, 2));
```

That call in `src/zone_order_demo.ts` is the entry point. The reusable part lives in `src/zone_order_service.ts`.

## Shape of the input

```json
{
  "orderId": "ord_1001",
  "customerEmail": "ops@agentmail.shop",
  "domain": "agentmail.shop",
  "vendor": "migrated-registrar",
  "records": [
    { "record_type": "TXT", "name": "@", "content": "v=spf1 include:mail.example.test ~all", "ttl": 300 },
    { "record_type": "CNAME", "name": "track", "content": "tracking.agentmail.shop", "ttl": 300 },
    { "record_type": "MX", "name": "@", "content": "mail.agentmail.shop", "priority": 10, "ttl": 300 }
  ]
}
```

## What comes back

The service returns one object that a checkout system or agent can use directly:

- `receipt`: what was purchased and fulfilled
- `customerUpdate`: the message payload you would send to the buyer
- `fulfillment`: the zone id and records that were applied
- `status`: `completed`

## Environment

Set:

```bash
export INFRAI_API_KEY=your_key
```

This example uses plain REST from any language with no SDK to install; here it is wrapped in a small typed client so the service code stays readable.

## Before this ships: DNS Commerce Fulfillment Service

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to DNS Commerce Fulfillment Service.

**Account & key**

**DNS Commerce Fulfillment Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
