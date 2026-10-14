import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { populateOpenApiSpec } from './populateOas';
import schema from './specs/gen/schema.json';

const baseInput = {
  title: 'Test API',
  description: 'Test',
  contact: { name: 'Team', email: 'team@example.com', url: 'https://example.com' },
  resources: [{ name: 'repository', plural: 'repositories' }],
};

type GeneratedDocument = {
  openapi: string;
  paths: Record<
    string,
    Record<string, { responses: Record<string, { content: Record<string, { schema: unknown }> }> }>
  >;
};

const generate = (input: Record<string, unknown>): GeneratedDocument =>
  JSON.parse(populateOpenApiSpec(JSON.stringify(input))) as GeneratedDocument;

const validateInput = (input: unknown): boolean => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.validate(schema, input);
};

describe('populateOpenApiSpec', () => {
  it('defaults to OAS 3.1 when oasVersion is omitted', () => {
    expect(generate(baseInput).openapi).toBe('3.1.0');
  });

  it('still generates OAS 3.0 when requested', () => {
    expect(generate({ ...baseInput, oasVersion: '3.0' }).openapi).toBe('3.0.2');
  });

  it('honours a resource schema when oasVersion is omitted', () => {
    const output = generate({
      ...baseInput,
      resources: [{ name: 'repository', plural: 'repositories', schema: 'https://example.com/repository.json' }],
    });
    expect(output.paths['/repositories/{id}'].get.responses['200'].content['application/json'].schema).toEqual({
      $ref: 'https://example.com/repository.json',
    });
  });

  it.each(['3.0', '3.1'])('wraps the collection in an items key (OAS %s)', oasVersion => {
    const output = generate({ ...baseInput, oasVersion });
    expect(output.paths['/repositories'].get.responses['200'].content['application/json'].schema).toEqual({
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/Repository' },
        },
      },
    });
  });
});

describe('input schema', () => {
  const withSchema = {
    ...baseInput,
    resources: [{ name: 'repository', plural: 'repositories', schema: { type: 'object' } }],
  };

  it('allows a resource schema when oasVersion is omitted', () => {
    expect(validateInput(withSchema)).toBe(true);
  });

  it('allows a resource schema for OAS 3.1', () => {
    expect(validateInput({ ...withSchema, oasVersion: '3.1' })).toBe(true);
  });

  it('rejects a resource schema for OAS 3.0', () => {
    expect(validateInput({ ...withSchema, oasVersion: '3.0' })).toBe(false);
  });
});
