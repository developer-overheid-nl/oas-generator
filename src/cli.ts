#!/usr/bin/env node
import betterAjvErrors from '@stoplight/better-ajv-errors';
import { readFileSync, writeFileSync } from 'node:fs';
import addFormats from 'ajv-formats';
import Ajv, { AnySchemaObject } from 'ajv/dist/2020';
import { populateOpenApiSpec } from './populateOas';
import schemaJson from './specs/gen/schema.json';

// Imported (not read from disk) so the CLI bundles into a single file.
const schema = schemaJson as AnySchemaObject;

const USAGE = `Usage: oas-generator [input] [options]

Generate an OpenAPI document from an OAS Generator input document.

Arguments:
  input                Path to the input JSON document. Reads from stdin when omitted.

Options:
  -o, --output <file>  Write the generated document to <file> instead of stdout.
  -h, --help           Show this help message.

Examples:
  oas-generator input.json
  oas-generator input.json -o openapi.json
  cat input.json | oas-generator > openapi.json`;

interface Args {
  input?: string;
  output?: string;
  help: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const args: Args = { help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      // Ignore the separator that `npm run`/`pnpm run` forward to the script.
      continue;
    } else if (!arg.startsWith('-')) {
      if (args.input === undefined) {
        args.input = arg;
      } else {
        throw new Error(`Unexpected argument: ${arg}.`);
      }
    } else if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '-o' || arg === '--output') {
      args.output = argv[++i];
      if (args.output === undefined) {
        throw new Error(`Missing value for ${arg}.`);
      }
    } else if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
    } else {
      throw new Error(`Unknown option: ${arg}.`);
    }
  }

  return args;
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * Validates the input document against the OAS Generator input schema.
 *
 * @param data  The parsed input document
 * @returns An array of human-readable error messages (empty when valid)
 */
const validateInput = (data: unknown): string[] => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  if (validate(data)) {
    return [];
  }

  return betterAjvErrors(schema, validate.errors ?? [], {
    propertyPath: [],
    targetValue: data,
  }).map(({ suggestion, error, path }) => {
    const message = suggestion !== undefined ? `${error}. ${suggestion}` : error;
    const location = path.replace(/^\//, '');
    return location !== '' ? `${location}: ${message}` : message;
  });
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  let raw: string;
  if (args.input !== undefined) {
    try {
      raw = readFileSync(args.input, 'utf8');
    } catch {
      throw new Error(`Could not read input file: ${args.input}`);
    }
  } else {
    raw = await readStdin();
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Input is not valid JSON: ${(error as Error).message}`);
  }

  const errors = validateInput(data);
  if (errors.length > 0) {
    process.stderr.write(`Input validation failed:\n${errors.map(error => `  - ${error}`).join('\n')}\n`);
    process.exit(1);
  }

  const output = populateOpenApiSpec(raw);

  if (args.output !== undefined) {
    writeFileSync(args.output, `${output}\n`);
    process.stderr.write(`Wrote ${args.output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
};

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
});
