import { APPLICATION_OPENAPI_JSON_3_0_TYPE } from '../../constants';
import { schemaLinter } from '../../schemaLinter';
import { Spec, SpecResponseMapper } from '../../types';
import { handleResponse } from '../../util';
import example from './example.json';
import schema from './schema.json';

const GEN_LINTER_NAME = 'OAS Generator syntax';

const responseMapper: SpecResponseMapper = async responseText => {
  let document;

  try {
    document = JSON.parse(responseText);
  } catch {
    return Promise.resolve({ content: responseText });
  }

  const links = document.links;

  if (Array.isArray(links)) {
    const serviceDescLink = links.find(
      link => link.rel === 'service-desc' && link.type === APPLICATION_OPENAPI_JSON_3_0_TYPE
    );

    if (serviceDescLink) {
      const content = await fetch(serviceDescLink.href, {
        headers: { Accept: serviceDescLink.type },
      }).then(response => handleResponse(response, serviceDescLink.href));

      // The fetched OpenAPI document is not generator input, so it is not linted.
      return { content, linters: [] };
    }
  }

  return Promise.resolve({ content: responseText });
};

const spec: Spec = {
  name: 'Genrator',
  slug: 'gen',
  example: JSON.stringify(example, undefined, 2),
  linters: [{ name: GEN_LINTER_NAME, linter: schemaLinter(GEN_LINTER_NAME, schema) }],
  responseMapper,
};

export default spec;
