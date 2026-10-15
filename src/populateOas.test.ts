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
    Record<
      string,
      {
        parameters?: unknown[];
        responses: Record<string, { $ref?: string; headers?: unknown; content: Record<string, { schema: unknown }> }>;
      }
    >
  >;
  components: Record<string, Record<string, unknown>>;
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
      $ref: '#/components/schemas/RepositoryCollection',
    });
    expect(output.components.schemas.RepositoryCollection).toEqual({
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

  it('wraps an external resource schema in a local collection schema', () => {
    const output = generate({
      ...baseInput,
      resources: [{ name: 'repository', plural: 'repositories', schema: 'https://example.com/repository.json' }],
    });
    expect(output.components.schemas).toEqual({
      RepositoryCollection: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: { $ref: 'https://example.com/repository.json' } } },
      },
    });
  });

  it('references the ADR 2.2 common components for OAS 3.1', () => {
    const commonComponentsUrl = 'https://static.developer.overheid.nl/openapi-components/adr/2.2/common.yaml';
    const output = generate(baseInput);
    expect(output.paths['/repositories'].get.responses['200'].headers).toEqual({
      'API-Version': { $ref: `${commonComponentsUrl}#/components/headers/API-Version` },
      Link: { $ref: `${commonComponentsUrl}#/components/headers/Link` },
    });
    expect(output.paths['/repositories'].post.responses['400']).toEqual({
      $ref: `${commonComponentsUrl}#/components/responses/BadRequest`,
    });
    expect(output.paths['/repositories/{id}'].delete.responses).toEqual({
      '204': { $ref: `${commonComponentsUrl}#/components/responses/NoContent` },
      '404': { $ref: `${commonComponentsUrl}#/components/responses/NotFound` },
    });
  });

  it('keeps referencing the legacy ADR components for OAS 3.0', () => {
    const legacyComponentsUrl = 'https://static.developer.overheid.nl/adr/components.yaml';
    const output = generate({ ...baseInput, oasVersion: '3.0' });
    expect(output.paths['/repositories'].get.responses['200'].headers).toEqual({
      'API-Version': { $ref: `${legacyComponentsUrl}#/headers/API-Version` },
      Link: { $ref: `${legacyComponentsUrl}#/headers/Link` },
    });
    expect(output.paths['/repositories'].post.responses['400']).toEqual({
      $ref: `${legacyComponentsUrl}#/responses/400`,
    });
    expect(output.paths['/repositories/{id}'].delete.responses).toEqual({
      '204': { $ref: `${legacyComponentsUrl}#/responses/204` },
      '404': { $ref: `${legacyComponentsUrl}#/responses/404` },
    });
  });

  it('references the schema component by the name it is defined under', () => {
    const output = generate({ ...baseInput, resources: [{ name: 'dataset-version', plural: 'dataset-versions' }] });
    expect(output.components.schemas).toHaveProperty('DatasetVersion');
    expect(output.paths['/dataset-versions/{id}'].get.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/DatasetVersion',
    });
  });

  it('lets PUT return 404 for a resource that does not exist', () => {
    const output = generate(baseInput);
    expect(output.paths['/repositories/{id}'].put.responses['404']).toEqual({
      $ref: 'https://static.developer.overheid.nl/openapi-components/adr/2.2/common.yaml#/components/responses/NotFound',
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

describe('filters', () => {
  const withFilters = (filters: string[]): Record<string, unknown> => ({
    ...baseInput,
    resources: [{ name: 'repository', plural: 'repositories', filters }],
  });

  it('adds each filter as a lowerCamelCase query parameter on the collection', () => {
    const output = generate(withFilters(['created_at', 'Owner Name', 'status']));
    expect(output.paths['/repositories'].get.parameters).toEqual([
      {
        name: 'createdAt',
        in: 'query',
        description: 'Filter de repositories op createdAt.',
        required: false,
        schema: { type: 'string' },
      },
      {
        name: 'ownerName',
        in: 'query',
        description: 'Filter de repositories op ownerName.',
        required: false,
        schema: { type: 'string' },
      },
      {
        name: 'status',
        in: 'query',
        description: 'Filter de repositories op status.',
        required: false,
        schema: { type: 'string' },
      },
    ]);
  });

  it('does not add filters to the single resource endpoint', () => {
    const output = generate(withFilters(['status']));
    expect(output.paths['/repositories/{id}'].get.parameters).toBeUndefined();
  });

  it('omits parameters when there are no filters', () => {
    expect(generate(baseInput).paths['/repositories'].get.parameters).toBeUndefined();
    expect(generate(withFilters([])).paths['/repositories'].get.parameters).toBeUndefined();
  });

  it('does not check filters against the resource schema', () => {
    const input = {
      ...baseInput,
      resources: [{ name: 'repository', plural: 'repositories', schema: { type: 'object' }, filters: ['unknownField'] }],
    };
    expect(validateInput(input)).toBe(true);
    expect(generate(input).paths['/repositories'].get.parameters).toHaveLength(1);
  });

  it.each([
    ['duplicate', ['status', 'status']],
    ['empty', ['']],
    ['non-string', [42]],
  ])('rejects %s filters', (_label, filters) => {
    expect(validateInput({ ...baseInput, resources: [{ name: 'repository', plural: 'repositories', filters }] })).toBe(false);
  });
});
