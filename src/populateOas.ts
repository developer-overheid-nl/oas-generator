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

  // The input only selects the major.minor; `schema` per resource is only
  // honoured for OAS 3.1, which aligns with JSON Schema 2020-12.
  const oasVersion = content.oasVersion === '3.1' ? '3.1' : '3.0';
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
    "paths": createPaths(content.resources as [], oasVersion === '3.1'),
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

const createPaths = (resources: [], allowSchema: boolean) => {
  const initialValue = {};
  return resources.reduce((obj, item) => {

    const endpointList = createEndpointList(item, allowSchema)
    const endpointSingle = createEndpointSingle(item, allowSchema)

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
}, allowSchema: boolean) {
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
              "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/headers/API-Version"
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
          "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/responses/404"
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
              "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/headers/API-Version"
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
          "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/responses/400"
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
          "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/responses/204"
        },
        "404": {
          "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/responses/404"
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
}, allowSchema: boolean) {
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
              schema: { type: string; items: { $ref: string } };
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
              "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/headers/API-Version"
            },
            "Link": {
              "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/headers/Link"
            }
          },
          "description": "OK",
          "content": {
            "application/json": {
              "schema": {
                "type": "array",
                "items": {
                  "$ref": schemaRef(item, allowSchema)
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
              "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/headers/API-Version"
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
          "$ref": "https://static.developer.overheid.nl/adr/components.yaml#/responses/400"
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
