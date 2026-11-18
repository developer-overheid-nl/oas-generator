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

| Field         | Required | Description                                                    |
| ------------- | -------- | -------------------------------------------------------------- |
| `oasVersion`  | no       | OpenAPI version to generate for: `"3.1"` (default) or `"3.0"`. |
| `title`       | yes      | Title of the API.                                              |
| `description` | yes      | Description of the API.                                        |
| `contact`     | yes      | `name`, `email` and `url` of the contact.                      |
| `resources`   | yes      | Array of resources (at least one).                             |

The input is validated strictly: unknown keys at the root, in `contact` or in a
resource are rejected. Only an inline `schema` may contain any keywords, since it
is a JSON schema itself.

Each resource has a `name` and `plural`, an optional `readonly` boolean, and an
optional `schema`. A `schema` is **not allowed when `oasVersion` is `"3.0"`** and
can be either an inline JSON schema (object) or a URL string pointing to an
external JSON schema. An inline schema is added under `components/schemas` and
referenced locally; an external schema (URL) is referenced directly with a
`$ref` from the operations (no local component). When omitted, a default schema
with an `id` property is generated under `components/schemas`.

A resource can also have optional `filters`, an array of strings. Each filter
becomes an optional query parameter (type `string`) on the collection endpoint
(`GET /{plural}`), named in lowerCamelCase (`created_at` becomes `createdAt`),
with a default description. Filters must be unique, but are not checked against
the resource schema.

Collection endpoints (`GET /{plural}`) return an object with the resources
wrapped in an `items` array (`{ "items": [...] }`) instead of a bare array, so
the response can be extended later (for example with paging metadata) without a
breaking change. The wrapper is a named schema, `{Name}Collection` under
`components/schemas`.

## Development

This project uses [pnpm](https://pnpm.io/). Prepare your local environment:

- Install project dependencies: `pnpm install`
- Install VSCode extensions: Prettier, ESLint, Tailwind CSS IntelliSense
- Set VSCode default formatter to `esbenp.prettier-vscode`

Start the development server:

```bash
pnpm dev
```

### Versioning & releasing

Versioning, the changelog, and releases are driven by [Changesets](https://changesets.dev/). The package is not published to npm; a release creates a GitHub release and deploys the web UI to GitHub Pages.

1. **Add a changeset with your change.** Run `pnpm changeset`, pick the bump (`major` / `minor` / `patch`), and write a one-line summary. This creates a `.changeset/<name>.md` file; commit it with your PR. Omit only for changes that don't affect the generator or the web UI (CI, internal docs, tests).

2. **Merge the version pull request.** Every push to `main` runs the Release workflow (`.github/workflows/release.yml`). While changesets are pending, it opens or updates a `chore(release): version packages` pull request that runs `pnpm version-packages`: it consumes the pending `.changeset/*.md` files, bumps `package.json`, and prepends the summaries to `CHANGELOG.md`. Merge it when you want to release. Don't hand-edit the `version` field; Changesets owns it.

   GitHub doesn't run the Build workflow on pull requests opened by the workflow token, so the version pull request shows no checks. The release job builds, lints, and tests anyway; close and reopen the pull request if you want the checks on it.

3. **Release.** When the version pull request lands on `main`, the workflow finds a `package.json` version that has no `v<version>` tag yet. It builds, lints, and tests, creates the `v<version>` tag with a GitHub release whose notes are that version's `CHANGELOG.md` section, and deploys the web UI to GitHub Pages. Starting the workflow by hand (**Actions** → **Release** → **Run workflow** on `main`) does the same as a push. To retry a failed release, use **Re-run failed jobs**.

The build output (`docs`) is not committed; GitHub Pages must be set to deploy from **GitHub Actions**.
