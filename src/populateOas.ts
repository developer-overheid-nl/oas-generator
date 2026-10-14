import { kebabCase, upperCamelCase } from 'case-anything'

export const populateOpenApiSpec = (inputJson: string) => {
  const content = JSON.parse(inputJson) as {
    oasVersion?: '3.0' | '3.1';
    title: string;
    description: string;
    contact: {
      name: string;
      email: string;
      url: string;
    };
    resources: {
      name: string;
      plural: string;
      readonly?: boolean;
      schema?: Record<string, unknown> | string;
    }[];
  };

  // The input only selects the major.minor and defaults to 3.1; `schema` per
  // resource is only honoured for OAS 3.1, which aligns with JSON Schema 2020-12.
  const oasVersion = content.oasVersion === '3.0' ? '3.0' : '3.1';
  const openapi = oasVersion === '3.1' ? '3.1.0' : '3.0.2';

  return JSON.stringify({
    "openapi": openapi,
    "info": {
      "title": content.title,
      "description": content.description,
      "version": "1.0.0",
      "contact": {
        "name": content.contact.name,
        "email": content.contact.email,
        "url": content.contact.url
      }
    },
    "servers": [
      {
        "url": "@TODO: Add server URL",
      }
    ],
    "tags": content.resources.map(resource => {
      const tag = toUppercase(resource['plural']);
      return { "name": tag, "description": `Alle API operaties die bij ${resource['plural']} horen.` }
    }),
    "paths": createPaths(content.resources as [], oasVersion === '3.1', createComponentRefs(oasVersion)),
    "components": {
      "schemas": createSchemas(content.resources as [], oasVersion === '3.1'),
      "parameters": {
        "id": {
          "name": "id",
          "in": "path",
          "description": "id",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      }
    }
  }, undefined, 2)
}

type ComponentRefs = {
  apiVersionHeader: string;
  linkHeader: string;
  noContent: string;
  badRequest: string;
  notFound: string;
};

const LEGACY_COMPONENTS_URL = 'https://static.developer.overheid.nl/adr/components.yaml';
const COMMON_COMPONENTS_URL = 'https://static.developer.overheid.nl/openapi-components/adr/2.2/common.yaml';

/**
 * Returns the `$ref` targets for the shared ADR components. OAS 3.1 uses the
 * ADR 2.2 components, whose schemas are JSON Schema 2020-12 and therefore not
 * valid in OAS 3.0; OAS 3.0 keeps referencing the legacy components.
 */
const createComponentRefs = (oasVersion: '3.0' | '3.1'): ComponentRefs => {
  if (oasVersion === '3.0') {
    return {
      apiVersionHeader: `${LEGACY_COMPONENTS_URL}#/headers/API-Version`,
      linkHeader: `${LEGACY_COMPONENTS_URL}#/headers/Link`,
      noContent: `${LEGACY_COMPONENTS_URL}#/responses/204`,
      badRequest: `${LEGACY_COMPONENTS_URL}#/responses/400`,
      notFound: `${LEGACY_COMPONENTS_URL}#/responses/404`,
    };
  }
  return {
    apiVersionHeader: `${COMMON_COMPONENTS_URL}#/components/headers/API-Version`,
    linkHeader: `${COMMON_COMPONENTS_URL}#/components/headers/Link`,
    noContent: `${COMMON_COMPONENTS_URL}#/components/responses/NoContent`,
    badRequest: `${COMMON_COMPONENTS_URL}#/components/responses/BadRequest`,
    notFound: `${COMMON_COMPONENTS_URL}#/components/responses/NotFound`,
  };
};

const toUppercase = (string: string) => {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

/**
 * Returns the `$ref` target for a resource's schema. An external schema (a URL)
 * is referenced directly; otherwise the local component is referenced.
 */
const schemaRef = (item: { name: string; schema?: Record<string, unknown> | string }, allowSchema: boolean): string => {
  if (allowSchema && typeof item['schema'] === 'string') {
    return item['schema'];
  }
  return `#/components/schemas/${toUppercase(item['name'])}`;
};

const createPaths = (resources: [], allowSchema: boolean, componentRefs: ComponentRefs) => {
  const initialValue = {};
  return resources.reduce((obj, item) => {

    const endpointList = createEndpointList(item, allowSchema, componentRefs)
    const endpointSingle = createEndpointSingle(item, allowSchema, componentRefs)

    const pluralKebabCase = kebabCase(item['plural']);

    return {
      ...obj,
      [`/${pluralKebabCase}`]: endpointList,
      [`/${pluralKebabCase}/{id}`]: endpointSingle,
    };
  }, initialValue);
};

const createEndpointSingle = function (item: {
  name: string;
  plural: string;
  readonly?: boolean;
  schema?: Record<string, unknown> | string;
}, allowSchema: boolean, componentRefs: ComponentRefs) {
  const endpointSingle: {
    parameters: { $ref: string }[];
    get: {
      operationId: string;
      description: string;
      summary: string;
      tags: string[];
      responses: {
        "200": {
          headers: { "API-Version": { $ref: string } };
          description: string;
          content: { "application/json": { schema: { $ref: string } } };
        };
        "404": { $ref: string };
      };
    };
    put?: {
      operationId: string;
      description: string;
      summary: string;
      tags: string[];
      responses: {
        "200": {
          headers: { "API-Version": { $ref: string } };
          description: string;
          content: { "application/json": { schema: { $ref: string } } };
        };
        "400": { $ref: string };
        "404": { $ref: string };
      };
    };
    delete?: {
      operationId: string;
      description: string;
      summary: string;
      tags: string[];
      responses: {
        "204": { $ref: string };
        "404": { $ref: string };
      };
    };
  } = {
    "parameters": [
      {
        "$ref": "#/components/parameters/id"
      }
    ],
    "get": {
      "operationId": `retrieve${upperCamelCase(item['name'])}`,
      "description": `${toUppercase(item['name'])} ophalen`,
      "summary": `${toUppercase(item['name'])} ophalen`,
      "tags": [
        toUppercase(item['plural']),
      ],
      "responses": {
        "200": {
          "headers": {
            "API-Version": {
              "$ref": componentRefs.apiVersionHeader
            }
          },
          "description": "OK",
          "content": {
            "application/json": {
              "schema": {
                "$ref": schemaRef(item, allowSchema)
              }
            }
          }
        },
        "404": {
          "$ref": componentRefs.notFound
        }
      }
    }
  }

  if (!item.readonly) {
    endpointSingle["put"] = {
      "operationId": `edit${upperCamelCase(item['name'])}`,
      "description": `${toUppercase(item['name'])} wijzigen`,
      "summary": `${toUppercase(item['name'])} wijzigen`,
      "tags": [
        toUppercase(item['plural']),
      ],
      "responses": {
        "200": {
          "headers": {
            "API-Version": {
              "$ref": componentRefs.apiVersionHeader
            }
          },
          "description": "OK",
          "content": {
            "application/json": {
              "schema": {
                "$ref": schemaRef(item, allowSchema)
              }
            }
          }
        },
        "400": {
          "$ref": componentRefs.badRequest
        },
        "404": {
          "$ref": componentRefs.notFound
        }
      }
    }
    endpointSingle["delete"] = {
      "operationId": `remove${upperCamelCase(item['name'])}`,
      "description": `${toUppercase(item['name'])} verwijderen`,
      "summary": `${toUppercase(item['name'])} verwijderen`,
      "tags": [
        toUppercase(item['plural']),
      ],
      "responses": {
        "204": {
          "$ref": componentRefs.noContent
        },
        "404": {
          "$ref": componentRefs.notFound
        }
      }
    }
  }

  return endpointSingle;
}

const createEndpointList = function (item: {
  name: string;
  plural: string;
  readonly?: boolean;
  schema?: Record<string, unknown> | string;
}, allowSchema: boolean, componentRefs: ComponentRefs) {
  const endpointList: {
    get: {
      operationId: string;
      description: string;
      summary: string;
      tags: string[];
      responses: {
        "200": {
          headers: {
            "API-Version": { $ref: string };
            Link: { $ref: string };
          };
          description: string;
          content: {
            "application/json": {
              schema: {
                type: string;
                required: string[];
                properties: { items: { type: string; items: { $ref: string } } };
              };
            };
          };
        };
      };
    };
    post?: {
      operationId: string;
      description: string;
      summary: string;
      tags: string[];
      responses: {
        "201": {
          headers: {
            "API-Version": { $ref: string };
          };
          description: string;
          content: {
            "application/json": {
              schema: { $ref: string };
            };
          };
        };
        "400": { $ref: string };
      };
    };
  } = {
    "get": {
      "operationId": `list${upperCamelCase(item['plural'])}`,
      "description": `Endpoint om alle ${item['plural']} op te halen. @TODO: Voeg hier eventueel extra informatie toe over het filteren, pagineren, etc.`,
      "summary": `Alle ${item['plural']} ophalen`,
      "tags": [
        toUppercase(item['plural'])
      ],
      "responses": {
        "200": {
          "headers": {
            "API-Version": {
              "$ref": componentRefs.apiVersionHeader
            },
            "Link": {
              "$ref": componentRefs.linkHeader
            }
          },
          "description": "OK",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["items"],
                "properties": {
                  "items": {
                    "type": "array",
                    "items": {
                      "$ref": schemaRef(item, allowSchema)
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
  }

  if (!item.readonly) {
    endpointList["post"] = {
      "operationId": `create${upperCamelCase(item['name'])}`,
      "description": `Nieuwe ${item['name']} aanmaken`,
      "summary": `Nieuwe ${item['name']} aanmaken`,
      "tags": [
        toUppercase(item['plural']),
      ],
      "responses": {
        "201": {
          "headers": {
            "API-Version": {
              "$ref": componentRefs.apiVersionHeader
            }
          },
          "description": "Created",
          "content": {
            "application/json": {
              "schema": {
                "$ref": schemaRef(item, allowSchema)
              }
            }
          }
        },
        "400": {
          "$ref": componentRefs.badRequest
        }
      }
    }
  }

  return endpointList

}

const createSchemas = (resources: [], allowSchema: boolean) => {
  const initialValue = {};
  return resources.reduce((obj, item) => {

    const schema = item['schema'];

    // An external JSON schema (a URL) is referenced directly from the
    // operations, so it does not get a local component.
    if (allowSchema && typeof schema === 'string') {
      return obj;
    }

    // Inline JSON schema is used as-is; otherwise a default schema is generated.
    const objSchema =
      allowSchema && schema && typeof schema === 'object'
        ? schema
        : {
            properties: {
              id: {
                type: "string",
                format: "uuid",
              }
            }
          };

    return {
      ...obj,
      [`${upperCamelCase(item['name'])}`]: objSchema,
    };
  }, initialValue);
};

export default populateOpenApiSpec;
