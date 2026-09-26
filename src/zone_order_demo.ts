import { readFile } from 'node:fs/promises';
import { createInfraiClient } from './infrai_client';
import { processZoneOrder } from './zone_order_service';

async function main() {
  const inputFlagIndex = process.argv.indexOf('--input');
  const inputPath = inputFlagIndex >= 0 ? process.argv[inputFlagIndex + 1] : 'examples/sample-order.json';

  if (!inputPath) {
    throw new Error('Pass --input <path-to-order.json>');
  }

  const raw = await readFile(inputPath, 'utf8');
  const order = JSON.parse(raw);
  const infrai = createInfraiClient();

  const result = await processZoneOrder(order, infrai);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
