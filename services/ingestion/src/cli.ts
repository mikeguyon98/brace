import { parseArgs } from 'node:util';
import { parseRate } from '@billing-simulator/shared';

export interface CLIArgs {
  filePath: string;
  rate: number;
  help: boolean;
}

export function parseCLIArgs(): CLIArgs {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      rate: {
        type: 'string',
        short: 'r',
        default: '1.0',
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Usage: billing_simulator <claims_file.jsonl> [options]

Arguments:
  claims_file.jsonl    Path to the JSON Lines file containing claims

Options:
  -r, --rate <number>  Claims ingestion rate per second (default: 1.0)
  -h, --help          Show this help message

Examples:
  billing_simulator claims.jsonl --rate=2.5
  billing_simulator /path/to/claims.jsonl -r 0.5
`);
    process.exit(0);
  }

  if (positionals.length === 0) {
    console.error('Error: Claims file path is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const filePath = positionals[0];
  
  let rate: number;
  try {
    rate = parseRate(values.rate!);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Invalid rate'}`);
    process.exit(1);
  }

  return {
    filePath,
    rate,
    help: false,
  };
}