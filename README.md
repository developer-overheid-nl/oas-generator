# OAS Generator

This repository contains a generator to create an OpenAPI document compliant to the [API Design Rules](https://logius-standaarden.github.io/API-Design-Rules/).

URL: https://developer-overheid-nl.github.io/oas-generator/

## CLI

The generator can also be used from the command line. It reads an input document
(see [`src/specs/gen/example.json`](src/specs/gen/example.json) for the syntax),
validates it against the input schema ([`src/specs/gen/schema.json`](src/specs/gen/schema.json))
and writes the generated OpenAPI document.

```bash
# From a file to a file
pnpm generate input.json -o openapi.json

# From a file to stdout (use -s/--silent to keep pnpm's banner out of the output)
pnpm -s generate input.json

# From stdin to a file
cat input.json | pnpm -s generate > openapi.json
```

The input is read from the given file, or from stdin when no file is provided.
The result is written to stdout, or to the file given with `-o`/`--output`.
Use `-s`/`--silent` (or the `-o` option) when redirecting stdout, so the run banner
does not end up in the generated document.
The CLI exits with code `1` when the input is invalid and `2` on usage or I/O errors.

### Run without cloning (npx)

The CLI can be run straight from GitHub, without publishing to npm. `npx` clones
the repository, builds the CLI bundle (via the `prepare` script) and runs it:

```bash
# From a file to a file
npx github:developer-overheid-nl/oas-generator input.json -o openapi.json

# From stdin to stdout
cat input.json | npx github:developer-overheid-nl/oas-generator
```

Pin a branch or tag with a `#` suffix (e.g. `github:developer-overheid-nl/oas-generator#main`).
`npx` caches the install, so use the `#`-suffix or clear the cache to pick up changes.

### Input format

| Field | Required | Description |
| --- | --- | --- |
| `oasVersion` | no | OpenAPI version to generate for: `"3.0"` (default) or `"3.1"`. |
| `title` | yes | Title of the API. |
| `description` | yes | Description of the API. |
| `contact` | yes | `name`, `email` and `url` of the contact. |
| `resources` | yes | Array of resources (at least one). |

Each resource has a `name` and `plural`, an optional `readonly` boolean, and an
optional `schema`. A `schema` is **only allowed when `oasVersion` is `"3.1"`** and
can be either an inline JSON schema (object) or a URL string pointing to an
external JSON schema. An inline schema is added under `components/schemas` and
referenced locally; an external schema (URL) is referenced directly with a
`$ref` from the operations (no local component). When omitted, a default schema
with an `id` property is generated under `components/schemas`.

## Development

This project uses [pnpm](https://pnpm.io/). Prepare your local environment:

- Install project dependencies: `pnpm install`
- Install VSCode extensions: Prettier, ESLint, Tailwind CSS IntelliSense
- Set VSCode default formatter to `esbenp.prettier-vscode`

Start the development server:

```bash
pnpm dev
```
