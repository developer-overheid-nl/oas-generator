import { describe, expect, it } from 'vitest';
import { findSchemaUrls, formatSchemaPreview } from './schemaLinks';

const REPOSITORY_SCHEMA_URL = 'https://example.com/repository.json';

const urlsIn = (content: string): string[] => findSchemaUrls(content).map(({ url }) => url);

describe('findSchemaUrls', () => {
  it('finds a schema URL in JSON, with its position', () => {
    const content = `{ "name": "repository", "schema": "${REPOSITORY_SCHEMA_URL}" }`;
    const [schemaUrl] = findSchemaUrls(content);
    expect(schemaUrl.url).toBe(REPOSITORY_SCHEMA_URL);
    expect(content.slice(schemaUrl.from, schemaUrl.to)).toBe(REPOSITORY_SCHEMA_URL);
  });

  it.each([
    ['unquoted', `schema: ${REPOSITORY_SCHEMA_URL}`],
    ['single quoted', `schema: '${REPOSITORY_SCHEMA_URL}'`],
    ['double quoted', `schema: "${REPOSITORY_SCHEMA_URL}"`],
    ['in a list item', `  - name: repository\n    schema: ${REPOSITORY_SCHEMA_URL}`],
  ])('finds a schema URL in YAML (%s), with its position', (_label, content) => {
    const [schemaUrl] = findSchemaUrls(content);
    expect(schemaUrl.url).toBe(REPOSITORY_SCHEMA_URL);
    expect(content.slice(schemaUrl.from, schemaUrl.to)).toBe(REPOSITORY_SCHEMA_URL);
  });

  it('finds every schema URL in the document', () => {
    const content = `resources:\n  - schema: ${REPOSITORY_SCHEMA_URL}\n  - schema: https://example.com/api.json\n`;
    expect(urlsIn(content)).toEqual([REPOSITORY_SCHEMA_URL, 'https://example.com/api.json']);
  });

  it('ignores $schema keys', () => {
    expect(urlsIn(`{ "$schema": "https://json-schema.org/draft/2020-12/schema" }`)).toEqual([]);
    expect(urlsIn(`$schema: https://json-schema.org/draft/2020-12/schema`)).toEqual([]);
  });

  it('ignores inline schemas and keys that only end in schema', () => {
    expect(urlsIn(`{ "schema": { "$ref": "${REPOSITORY_SCHEMA_URL}" } }`)).toEqual([]);
    expect(urlsIn(`{ "responseSchema": "${REPOSITORY_SCHEMA_URL}" }`)).toEqual([]);
  });

  it('ignores values that are not http(s) URLs', () => {
    expect(urlsIn(`schema: ./repository.json`)).toEqual([]);
  });
});

describe('formatSchemaPreview', () => {
  it('indents a JSON schema', () => {
    expect(formatSchemaPreview('{"type":"object"}')).toBe('{\n  "type": "object"\n}');
  });

  it('shows a YAML schema as indented JSON', () => {
    expect(formatSchemaPreview('type: object\n')).toBe('{\n  "type": "object"\n}');
  });

  it('shows content that is not a schema as-is', () => {
    expect(formatSchemaPreview('Not Found')).toBe('Not Found');
  });
});
