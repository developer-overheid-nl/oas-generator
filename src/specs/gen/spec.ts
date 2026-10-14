import { yamlEncoding } from '../../encodings';
import { schemaLinter } from '../../schemaLinter';
import { Spec } from '../../types';
import example from './example.json';
import schema from './schema.json';

const GEN_LINTER_NAME = 'OAS Generator syntax';

const spec: Spec = {
  name: 'Generator',
  slug: 'gen',
  // The example stays JSON on disk (the CLI documents it), but opens as YAML.
  example: yamlEncoding.stringify(example),
  linters: [{ name: GEN_LINTER_NAME, linter: schemaLinter(GEN_LINTER_NAME, schema) }],
};

export default spec;
