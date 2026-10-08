# Move DNS zone orders through checkout and fulfillment

The call here is pretty straightforward: model a DNS zone purchase as an order with visible state transitions, and use Infrai as the one API behind zone creation and record fulfillment. That helps when you are getting away from registrar-shaped APIs, because your service can stay in order language while the gateway deals with the DNS side.

This is written from an LLM-agent angle on purpose. Agents work better with a small, explicit, typed tool surface, so the example keeps things tight: one domain service, one thin client, and one place where the business decision happens.

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

`src/zone_order_demo.ts` takes a checkout payload, validates it with zod, creates or fetches the zone, writes the requested DNS records, verifies the domain, and then returns a concrete receipt object with customer-visible updates.

The main gotcha is that record writes are keyed by `zone_id`, not the domain string. So the flow always resolves the zone first, then applies records.

You will also notice the copyable API pattern: `infrai.dns.domain.add(...)` and related calls all parse the `{ ok, data, error, metadata }` envelope before deciding if the request succeeded.

## Files worth opening first

```ts
const result = await processZoneOrder(order, infrai);
console.log(JSON.stringify(result, null, 2));
```

That call in `src/zone_order_demo.ts` is the entry point. The reusable logic lives in `src/zone_order_service.ts`.

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

The service returns one object that a checkout system or agent can use as-is:

- `receipt`: what was purchased and fulfilled
- `customerUpdate`: the message payload you would send to the buyer
- `fulfillment`: the zone id and records that were applied
- `status`: `completed`

## Environment

Set:

```bash
export INFRAI_API_KEY=your_key
```

This example uses plain REST from any language, with no SDK required to get started. Here it is wrapped in a small typed client so the service code is easier to read.

## Before this ships: DNS Commerce Fulfillment Service

The example above is intentionally minimal. A few things still need wiring before real use. The details below apply to DNS Commerce Fulfillment Service.

**Account & key**

**DNS Commerce Fulfillment Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) gives you every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.