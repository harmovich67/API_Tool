import {
  ApiRequestItem,
  AuthConfig,
  BodyConfig,
  EnvVariable,
  HttpMethod,
  KeyValueItem,
  ParsedCollection,
  SavedExampleResponse,
} from '../types/api';
import { createKV, uid } from './helpers';

const VALID_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

function normalizeMethod(m: unknown, fallback: HttpMethod = 'GET'): HttpMethod {
  const upper = String(m || fallback).toUpperCase().trim() as HttpMethod;
  return VALID_METHODS.has(upper) ? upper : fallback;
}

function emptyBody(): BodyConfig {
  return {
    mode: 'none',
    rawText: '',
    urlencoded: [],
    graphqlQuery: '',
    graphqlVariables: '{}',
  };
}

// ============================================================================
// 1. POSTMAN v2.0 / v2.1 PARSER
// ============================================================================
function parsePostmanAuth(rawAuth: any): AuthConfig | null {
  if (!rawAuth || typeof rawAuth !== 'object') return null;
  const type = String(rawAuth.type || '').toLowerCase();
  if (type === 'noauth' || !type) return { type: 'none' };

  const extractAttr = (arrOrObj: any, key: string): string => {
    if (Array.isArray(arrOrObj)) {
      const found = arrOrObj.find((x: any) => x?.key === key);
      return found?.value !== undefined ? String(found.value) : '';
    }
    if (arrOrObj && typeof arrOrObj === 'object' && key in arrOrObj) {
      return String(arrOrObj[key] ?? '');
    }
    return '';
  };

  if (type === 'bearer') {
    const token = extractAttr(rawAuth.bearer, 'token') || String(rawAuth.bearer?.token || '');
    return { type: 'bearer', bearerToken: token };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      basicUser: extractAttr(rawAuth.basic, 'username'),
      basicPass: extractAttr(rawAuth.basic, 'password'),
    };
  }
  if (type === 'apikey') {
    return {
      type: 'apikey',
      apiKeyName: extractAttr(rawAuth.apikey, 'key') || 'X-API-Key',
      apiKeyValue: extractAttr(rawAuth.apikey, 'value'),
      apiKeyIn: extractAttr(rawAuth.apikey, 'in') === 'query' ? 'query' : 'header',
    };
  }
  return null;
}

function reconstructPostmanUrl(urlField: any): { rawUrl: string; params: KeyValueItem[] } {
  if (!urlField) return { rawUrl: '', params: [] };
  if (typeof urlField === 'string') {
    return { rawUrl: urlField, params: [] };
  }
  if (typeof urlField === 'object') {
    const params: KeyValueItem[] = Array.isArray(urlField.query)
      ? urlField.query.map((q: any) =>
          createKV(
            String(q?.key ?? ''),
            String(q?.value ?? ''),
            !q?.disabled,
            String(q?.description?.content ?? q?.description ?? '')
          )
        )
      : [];

    if (typeof urlField.raw === 'string' && urlField.raw.trim()) {
      // Strip query string if query array is already structured so we don't duplicate
      const raw = urlField.raw.trim();
      if (params.length > 0 && raw.includes('?')) {
        return { rawUrl: raw.split('?')[0], params };
      }
      return { rawUrl: raw, params };
    }

    const protocol = urlField.protocol ? `${urlField.protocol}://` : '';
    const host = Array.isArray(urlField.host)
      ? urlField.host.join('.')
      : String(urlField.host || '');
    const port = urlField.port ? `:${urlField.port}` : '';
    const path = Array.isArray(urlField.path)
      ? '/' + urlField.path.join('/')
      : urlField.path
      ? `/${String(urlField.path).replace(/^\/+/, '')}`
      : '';
    return { rawUrl: `${protocol}${host}${port}${path}`, params };
  }
  return { rawUrl: '', params: [] };
}

function parsePostmanCollection(json: any, rawSizeBytes: number): ParsedCollection {
  const requests: ApiRequestItem[] = [];
  const variables: EnvVariable[] = [];

  if (Array.isArray(json.variable)) {
    for (const v of json.variable) {
      if (v?.key) {
        variables.push({
          id: uid('env'),
          key: String(v.key),
          value: String(v.value ?? ''),
          enabled: !v.disabled,
          source: 'Postman Collection',
          isSecret: /token|secret|key|pass|auth/i.test(String(v.key)),
        });
      }
    }
  }

  const rootAuth = parsePostmanAuth(json.auth) || { type: 'none' };

  function walkItems(items: any[], folderPath: string[], inheritedAuth: AuthConfig) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemAuth = parsePostmanAuth(item.auth) || inheritedAuth;

      // Folder group
      if (Array.isArray(item.item)) {
        const nextFolder = item.name ? [...folderPath, String(item.name)] : folderPath;
        walkItems(item.item, nextFolder, itemAuth);
        continue;
      }

      // Leaf Request
      if (item.request) {
        const reqObj =
          typeof item.request === 'string'
            ? { method: 'GET', url: item.request }
            : item.request;

        const method = normalizeMethod(reqObj.method, 'GET');
        const { rawUrl, params } = reconstructPostmanUrl(reqObj.url);
        const reqAuth = parsePostmanAuth(reqObj.auth) || itemAuth;

        const headers: KeyValueItem[] = Array.isArray(reqObj.header)
          ? reqObj.header.map((h: any) =>
              createKV(
                String(h?.key ?? ''),
                String(h?.value ?? ''),
                !h?.disabled,
                String(h?.description?.content ?? h?.description ?? '')
              )
            )
          : [];

        const body: BodyConfig = emptyBody();
        if (reqObj.body && typeof reqObj.body === 'object') {
          const bMode = String(reqObj.body.mode || '').toLowerCase();
          if (bMode === 'raw') {
            const rawStr = String(reqObj.body.raw ?? '');
            const lang = reqObj.body?.options?.raw?.language;
            let looksJson = lang === 'json';
            if (!looksJson && rawStr.trim()) {
              try {
                JSON.parse(rawStr);
                looksJson = true;
              } catch {
                looksJson = rawStr.trim().startsWith('{') || rawStr.trim().startsWith('[');
              }
            }
            body.mode = rawStr.trim() ? (looksJson ? 'json' : 'raw') : 'none';
            body.rawText = rawStr;
          } else if (bMode === 'urlencoded' && Array.isArray(reqObj.body.urlencoded)) {
            body.mode = 'urlencoded';
            body.urlencoded = reqObj.body.urlencoded.map((u: any) =>
              createKV(String(u?.key ?? ''), String(u?.value ?? ''), !u?.disabled)
            );
          } else if (bMode === 'formdata' && Array.isArray(reqObj.body.formdata)) {
            body.mode = 'urlencoded';
            body.urlencoded = reqObj.body.formdata
              .filter((f: any) => f?.type !== 'file')
              .map((f: any) =>
                createKV(String(f?.key ?? ''), String(f?.value ?? ''), !f?.disabled)
              );
          } else if (bMode === 'graphql' && reqObj.body.graphql) {
            body.mode = 'graphql';
            body.graphqlQuery = String(reqObj.body.graphql.query ?? '');
            body.graphqlVariables =
              typeof reqObj.body.graphql.variables === 'string'
                ? reqObj.body.graphql.variables || '{}'
                : JSON.stringify(reqObj.body.graphql.variables ?? {}, null, 2);
          }
        }

        const savedResponses: SavedExampleResponse[] = Array.isArray(item.response)
          ? item.response.map((r: any) => {
              const rHeaders: Record<string, string> = {};
              if (Array.isArray(r?.header)) {
                for (const h of r.header) {
                  if (h?.key) rHeaders[String(h.key)] = String(h.value ?? '');
                }
              }
              return {
                id: uid('saved_res'),
                name: String(r?.name || `${r?.code || 200} ${r?.status || 'Response'}`),
                status: Number(r?.code || 200),
                statusText: String(r?.status || 'OK'),
                headers: rHeaders,
                body: String(r?.body ?? ''),
              };
            })
          : [];

        const desc =
          typeof reqObj.description === 'string'
            ? reqObj.description
            : reqObj.description?.content || item.description || '';

        requests.push({
          id: uid('req'),
          name: String(item.name || rawUrl || 'Untitled Request'),
          folderPath,
          method,
          url: rawUrl,
          description: String(desc || ''),
          params,
          headers,
          auth: reqAuth,
          body,
          savedResponses,
        });
      }
    }
  }

  walkItems(json.item || [], [], rootAuth);

  return {
    id: uid('col'),
    name: String(json.info?.name || 'Postman Collection'),
    description: String(
      typeof json.info?.description === 'string'
        ? json.info.description
        : json.info?.description?.content || ''
    ),
    format: 'postman-v2',
    formatLabel: 'Postman Collection v2',
    requests,
    variables,
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// 2. OPENAPI 3.x / SWAGGER 2.0 PARSER (with $ref Schema Sample Synthesizer)
// ============================================================================
function resolveOpenApiRef(root: any, ref: string, depth = 0): any {
  if (!ref || !ref.startsWith('#/') || depth > 6) return null;
  const parts = ref.slice(2).split('/');
  let cur = root;
  for (const p of parts) {
    const key = p.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur && typeof cur === 'object' && key in cur) {
      cur = cur[key];
    } else {
      return null;
    }
  }
  return cur;
}

function synthesizeSchemaSample(root: any, schema: any, depth = 0): unknown {
  if (!schema || depth > 5) return {};
  if (schema.$ref) {
    const resolved = resolveOpenApiRef(root, schema.$ref, depth + 1);
    return resolved ? synthesizeSchemaSample(root, resolved, depth + 1) : {};
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.oneOf) && schema.oneOf[0]) {
    return synthesizeSchemaSample(root, schema.oneOf[0], depth + 1);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf[0]) {
    return synthesizeSchemaSample(root, schema.anyOf[0], depth + 1);
  }
  if (Array.isArray(schema.allOf)) {
    const merged: Record<string, unknown> = {};
    for (const sub of schema.allOf) {
      const sample = synthesizeSchemaSample(root, sub, depth + 1);
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        Object.assign(merged, sample);
      }
    }
    return merged;
  }

  const type = schema.type || (schema.properties ? 'object' : 'string');
  if (type === 'object' || schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries<any>(schema.properties || {})) {
      obj[propName] = synthesizeSchemaSample(root, propSchema, depth + 1);
    }
    return obj;
  }
  if (type === 'array') {
    return [synthesizeSchemaSample(root, schema.items || { type: 'string' }, depth + 1)];
  }
  if (type === 'integer' || type === 'number') return 1;
  if (type === 'boolean') return true;
  if (schema.format === 'email') return 'user@example.com';
  if (schema.format === 'date-time') return new Date().toISOString();
  if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
  if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
  return 'string_value';
}

function parseOpenApiCollection(json: any, rawSizeBytes: number): ParsedCollection {
  const isV3 = Boolean(json.openapi);
  const variables: EnvVariable[] = [];
  let baseUrl = '{{baseUrl}}';

  if (isV3 && Array.isArray(json.servers) && json.servers.length > 0) {
    const firstServerUrl = String(json.servers[0].url || 'https://api.example.com');
    variables.push({
      id: uid('env'),
      key: 'baseUrl',
      value: firstServerUrl.replace(/\/+$/, ''),
      enabled: true,
      source: 'OpenAPI servers[0]',
    });
  } else if (json.host) {
    const scheme = Array.isArray(json.schemes) && json.schemes[0] ? json.schemes[0] : 'https';
    const bp = json.basePath ? String(json.basePath).replace(/\/+$/, '') : '';
    variables.push({
      id: uid('env'),
      key: 'baseUrl',
      value: `${scheme}://${json.host}${bp}`,
      enabled: true,
      source: 'Swagger host',
    });
  } else {
    variables.push({
      id: uid('env'),
      key: 'baseUrl',
      value: 'https://api.example.com',
      enabled: true,
      source: 'OpenAPI default',
    });
  }

  // Detect default Auth scheme
  let defaultAuth: AuthConfig = { type: 'none' };
  const secSchemes = json.components?.securitySchemes || json.securityDefinitions || {};
  for (const [, scheme] of Object.entries<any>(secSchemes)) {
    if (scheme?.type === 'http' && scheme?.scheme === 'bearer') {
      defaultAuth = { type: 'bearer', bearerToken: '{{bearerToken}}' };
      variables.push({
        id: uid('env'),
        key: 'bearerToken',
        value: '',
        enabled: true,
        source: 'OpenAPI Security',
        isSecret: true,
      });
      break;
    } else if (scheme?.type === 'apiKey') {
      defaultAuth = {
        type: 'apikey',
        apiKeyName: String(scheme.name || 'X-API-Key'),
        apiKeyValue: '{{apiKey}}',
        apiKeyIn: scheme.in === 'query' ? 'query' : 'header',
      };
      variables.push({
        id: uid('env'),
        key: 'apiKey',
        value: '',
        enabled: true,
        source: 'OpenAPI Security',
        isSecret: true,
      });
      break;
    }
  }

  const requests: ApiRequestItem[] = [];
  const paths = json.paths || {};
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [routePath, pathObj] of Object.entries<any>(paths)) {
    if (!pathObj || typeof pathObj !== 'object') continue;
    const sharedParams = Array.isArray(pathObj.parameters) ? pathObj.parameters : [];

    for (const m of httpMethods) {
      const op = pathObj[m];
      if (!op || typeof op !== 'object') continue;

      const method = normalizeMethod(m);
      const allParams = [...sharedParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      const queryParams: KeyValueItem[] = [];
      const headers: KeyValueItem[] = [createKV('Accept', 'application/json', true)];
      const body = emptyBody();

      for (const rawParam of allParams) {
        const p = rawParam?.$ref ? resolveOpenApiRef(json, rawParam.$ref) : rawParam;
        if (!p) continue;
        const sampleVal = String(
          p.example ?? p.default ?? (p.schema ? synthesizeSchemaSample(json, p.schema) : '')
        );
        if (p.in === 'query') {
          queryParams.push(
            createKV(String(p.name || ''), sampleVal, Boolean(p.required), String(p.description || ''))
          );
        } else if (p.in === 'header') {
          headers.push(
            createKV(String(p.name || ''), sampleVal, true, String(p.description || ''))
          );
        } else if (p.in === 'body' && p.schema) {
          body.mode = 'json';
          body.rawText = JSON.stringify(synthesizeSchemaSample(json, p.schema), null, 2);
        }
      }

      // OpenAPI 3 requestBody
      const reqBody = op.requestBody?.$ref
        ? resolveOpenApiRef(json, op.requestBody.$ref)
        : op.requestBody;
      if (reqBody?.content) {
        const jsonMedia =
          reqBody.content['application/json'] ||
          Object.values<any>(reqBody.content)[0];
        if (jsonMedia) {
          const sample =
            jsonMedia.example !== undefined
              ? jsonMedia.example
              : jsonMedia.schema
              ? synthesizeSchemaSample(json, jsonMedia.schema)
              : {};
          body.mode = 'json';
          body.rawText = JSON.stringify(sample, null, 2);
        }
      }

      // Documented responses -> savedResponses so user can inspect all documented responses!
      const savedResponses: SavedExampleResponse[] = [];
      if (op.responses && typeof op.responses === 'object') {
        for (const [code, resSpecRaw] of Object.entries<any>(op.responses)) {
          const resSpec = resSpecRaw?.$ref ? resolveOpenApiRef(json, resSpecRaw.$ref) : resSpecRaw;
          let sampleBody = '';
          const media = resSpec?.content?.['application/json'];
          if (media?.example !== undefined) {
            sampleBody = JSON.stringify(media.example, null, 2);
          } else if (media?.schema) {
            sampleBody = JSON.stringify(synthesizeSchemaSample(json, media.schema), null, 2);
          } else if (resSpec?.schema) {
            sampleBody = JSON.stringify(synthesizeSchemaSample(json, resSpec.schema), null, 2);
          }
          savedResponses.push({
            id: uid('oas_res'),
            name: `${code} — ${resSpec?.description || 'Documented Response'}`,
            status: Number(code) || 200,
            statusText: String(resSpec?.description || 'OK'),
            headers: { 'content-type': 'application/json' },
            body: sampleBody,
          });
        }
      }

      const folderTag =
        Array.isArray(op.tags) && op.tags[0]
          ? [String(op.tags[0])]
          : routePath.split('/').filter(Boolean).slice(0, 1);

      requests.push({
        id: uid('req'),
        name: String(op.summary || op.operationId || `${method} ${routePath}`),
        folderPath: folderTag,
        method,
        url: `${baseUrl}${routePath.startsWith('/') ? routePath : `/${routePath}`}`,
        description: String(op.description || op.summary || ''),
        params: queryParams,
        headers,
        auth: defaultAuth,
        body,
        savedResponses,
        tags: Array.isArray(op.tags) ? op.tags.map(String) : [],
      });
    }
  }

  return {
    id: uid('col'),
    name: String(json.info?.title || 'OpenAPI Specification'),
    description: String(json.info?.description || ''),
    format: isV3 ? 'openapi-3' : 'swagger-2',
    formatLabel: isV3 ? `OpenAPI ${json.openapi}` : `Swagger ${json.swagger}`,
    requests,
    variables,
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// 3. INSOMNIA v4 EXPORT PARSER
// ============================================================================
function parseInsomniaCollection(json: any, rawSizeBytes: number): ParsedCollection {
  const resources: any[] = Array.isArray(json.resources) ? json.resources : [];
  const byId = new Map<string, any>();
  for (const r of resources) {
    if (r?._id) byId.set(r._id, r);
  }

  const variables: EnvVariable[] = [];
  let workspaceName = 'Insomnia Export';

  for (const r of resources) {
    if (r._type === 'workspace' && r.name) workspaceName = String(r.name);
    if (r._type === 'environment' && r.data && typeof r.data === 'object') {
      for (const [k, v] of Object.entries(r.data)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          variables.push({
            id: uid('env'),
            key: k,
            value: String(v),
            enabled: true,
            source: r.name || 'Insomnia Env',
            isSecret: /token|secret|key|pass/i.test(k),
          });
        }
      }
    }
  }

  const getFolderPath = (parentId: string): string[] => {
    const path: string[] = [];
    let cur = byId.get(parentId);
    let guard = 0;
    while (cur && guard++ < 10) {
      if (cur._type === 'request_group' && cur.name) {
        path.unshift(String(cur.name));
      }
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return path;
  };

  const requests: ApiRequestItem[] = [];
  for (const r of resources) {
    if (r._type !== 'request') continue;
    const method = normalizeMethod(r.method);
    const params = Array.isArray(r.parameters)
      ? r.parameters.map((p: any) => createKV(String(p?.name ?? ''), String(p?.value ?? ''), !p?.disabled))
      : [];
    const headers = Array.isArray(r.headers)
      ? r.headers.map((h: any) => createKV(String(h?.name ?? ''), String(h?.value ?? ''), !h?.disabled))
      : [];

    let auth: AuthConfig = { type: 'none' };
    if (r.authentication?.type === 'bearer') {
      auth = { type: 'bearer', bearerToken: String(r.authentication.token || '') };
    } else if (r.authentication?.type === 'basic') {
      auth = {
        type: 'basic',
        basicUser: String(r.authentication.username || ''),
        basicPass: String(r.authentication.password || ''),
      };
    }

    const body = emptyBody();
    if (r.body?.text) {
      body.rawText = String(r.body.text);
      body.mode = String(r.body.mimeType || '').includes('json') ? 'json' : 'raw';
    } else if (Array.isArray(r.body?.params)) {
      body.mode = 'urlencoded';
      body.urlencoded = r.body.params.map((p: any) =>
        createKV(String(p?.name ?? ''), String(p?.value ?? ''), !p?.disabled)
      );
    }

    // Convert Insomnia `{{ _.varName }}` to `{{varName}}`
    const cleanInsomniaTpl = (s: string) =>
      String(s || '').replace(/\{\{\s*_\.([a-zA-Z0-9_.-]+)\s*\}\}/g, '{{$1}}');

    requests.push({
      id: uid('req'),
      name: String(r.name || r.url || 'Insomnia Request'),
      folderPath: r.parentId ? getFolderPath(r.parentId) : [],
      method,
      url: cleanInsomniaTpl(r.url),
      description: String(r.description || ''),
      params,
      headers,
      auth,
      body: { ...body, rawText: cleanInsomniaTpl(body.rawText) },
    });
  }

  return {
    id: uid('col'),
    name: workspaceName,
    description: 'Imported from Insomnia v4 Export',
    format: 'insomnia-v4',
    formatLabel: 'Insomnia v4',
    requests,
    variables,
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// 4. HAR 1.2 (.har HTTP ARCHIVE) PARSER
// ============================================================================
function parseHarCollection(json: any, rawSizeBytes: number): ParsedCollection {
  const entries: any[] = Array.isArray(json.log?.entries) ? json.log.entries : [];
  const requests: ApiRequestItem[] = [];

  for (const entry of entries) {
    const req = entry?.request;
    if (!req?.url) continue;
    const method = normalizeMethod(req.method);
    let hostFolder = 'Captured Traffic';
    try {
      hostFolder = new URL(req.url).host;
    } catch {
      // ignore
    }

    const headers: KeyValueItem[] = Array.isArray(req.headers)
      ? req.headers
          .filter((h: any) => h?.name && !String(h.name).startsWith(':'))
          .map((h: any) => createKV(String(h.name), String(h.value ?? ''), true))
      : [];

    const body = emptyBody();
    if (req.postData?.text) {
      body.rawText = String(req.postData.text);
      body.mode = String(req.postData.mimeType || '').includes('json') ? 'json' : 'raw';
    }

    const savedResponses: SavedExampleResponse[] = [];
    if (entry.response) {
      const rHeaders: Record<string, string> = {};
      for (const h of entry.response.headers || []) {
        if (h?.name) rHeaders[String(h.name)] = String(h.value ?? '');
      }
      savedResponses.push({
        id: uid('har_res'),
        name: `Recorded ${entry.response.status} ${entry.response.statusText || ''}`.trim(),
        status: Number(entry.response.status || 200),
        statusText: String(entry.response.statusText || 'OK'),
        headers: rHeaders,
        body: String(entry.response.content?.text ?? ''),
      });
    }

    let shortName = req.url;
    try {
      const u = new URL(req.url);
      shortName = u.pathname + (u.search ? u.search.slice(0, 30) : '');
    } catch {
      // ignore
    }

    requests.push({
      id: uid('req'),
      name: shortName || req.url,
      folderPath: [hostFolder],
      method,
      url: String(req.url),
      params: [],
      headers,
      auth: { type: 'none' },
      body,
      savedResponses,
    });
  }

  return {
    id: uid('col'),
    name: 'HAR Captured Network Session',
    description: `Imported ${requests.length} captured HTTP transactions`,
    format: 'har-1.2',
    formatLabel: 'HAR 1.2 Archive',
    requests,
    variables: [],
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// 5. THUNDER CLIENT & HOPPSCOTCH PARSER
// ============================================================================
function parseThunderOrHoppscotch(json: any, rawSizeBytes: number): ParsedCollection {
  const isThunder = json.client === 'Thunder Client' || Array.isArray(json.requests);
  const requests: ApiRequestItem[] = [];

  if (isThunder && Array.isArray(json.requests)) {
    const folderMap = new Map<string, string>();
    for (const f of json.folders || []) {
      if (f?._id && f?.name) folderMap.set(f._id, String(f.name));
    }
    for (const r of json.requests) {
      const body = emptyBody();
      if (r.body?.raw) {
        body.mode = r.body.type === 'json' ? 'json' : 'raw';
        body.rawText = String(r.body.raw);
      }
      requests.push({
        id: uid('req'),
        name: String(r.name || r.url || 'Request'),
        folderPath: r.containerId && folderMap.has(r.containerId) ? [folderMap.get(r.containerId)!] : [],
        method: normalizeMethod(r.method),
        url: String(r.url || ''),
        params: (r.params || []).map((p: any) =>
          createKV(String(p?.name ?? ''), String(p?.value ?? ''), !p?.isDisabled)
        ),
        headers: (r.headers || []).map((h: any) =>
          createKV(String(h?.name ?? ''), String(h?.value ?? ''), !h?.isDisabled)
        ),
        auth:
          r.auth?.type === 'bearer'
            ? { type: 'bearer', bearerToken: String(r.auth.bearer || '') }
            : { type: 'none' },
        body,
      });
    }
    return {
      id: uid('col'),
      name: String(json.collectionName || 'Thunder Client Collection'),
      description: '',
      format: 'thunder-client',
      formatLabel: 'Thunder Client',
      requests,
      variables: [],
      rawJson: json,
      rawSizeBytes,
      importedAt: Date.now(),
    };
  }

  // Hoppscotch recursive folders + requests
  const walkHopp = (node: any, folderPath: string[]) => {
    for (const r of node.requests || []) {
      const body = emptyBody();
      if (r.body?.body) {
        body.rawText = String(r.body.body);
        body.mode = String(r.body.contentType || '').includes('json') ? 'json' : 'raw';
      }
      requests.push({
        id: uid('req'),
        name: String(r.name || r.endpoint || 'Request'),
        folderPath,
        method: normalizeMethod(r.method),
        url: String(r.endpoint || r.url || ''),
        params: (r.params || []).map((p: any) =>
          createKV(String(p?.key ?? ''), String(p?.value ?? ''), p?.active !== false)
        ),
        headers: (r.headers || []).map((h: any) =>
          createKV(String(h?.key ?? ''), String(h?.value ?? ''), h?.active !== false)
        ),
        auth:
          r.auth?.authType === 'bearer'
            ? { type: 'bearer', bearerToken: String(r.auth.token || '') }
            : { type: 'none' },
        body,
      });
    }
    for (const f of node.folders || []) {
      walkHopp(f, [...folderPath, String(f.name || 'Folder')]);
    }
  };

  if (Array.isArray(json)) {
    for (const rootCol of json) {
      walkHopp(rootCol, rootCol?.name ? [String(rootCol.name)] : []);
    }
  } else {
    walkHopp(json, []);
  }

  return {
    id: uid('col'),
    name: String((Array.isArray(json) ? json[0]?.name : json.name) || 'Hoppscotch Collection'),
    description: '',
    format: 'hoppscotch',
    formatLabel: 'Hoppscotch Collection',
    requests,
    variables: [],
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// 6. SMART ARBITRARY JSON / CONFIG / URL DISCOVERY PARSER
// ============================================================================
function inferMethodFromKey(keyPath: string): HttpMethod {
  const lower = keyPath.toLowerCase();
  if (/(^|[._-])(delete|remove|destroy)($|[._-])/i.test(lower)) return 'DELETE';
  if (/(^|[._-])(update|edit|put)($|[._-])/i.test(lower)) return 'PUT';
  if (/(^|[._-])(patch)($|[._-])/i.test(lower)) return 'PATCH';
  if (/(^|[._-])(create|add|post|login|signin|signup|register|submit|upload|send|token|auth)($|[._-])/i.test(lower)) {
    return 'POST';
  }
  return 'GET';
}

function parseArbitraryJsonCollection(json: any, rawSizeBytes: number, fileName = 'Custom JSON'): ParsedCollection {
  const requests: ApiRequestItem[] = [];
  const variables: EnvVariable[] = [];
  const seenUrls = new Set<string>();

  const urlRegex = /^(https?:\/\/[^\s"'<>]+|\{\{[^}]+\}\}[^\s"'<>]*|\/api\/[^\s"'<>]*)$/i;
  const embeddedUrlRegex = /https?:\/\/[^\s"'<>\\]+/gi;

  function walk(node: any, pathParts: string[]) {
    if (node === null || node === undefined) return;

    if (typeof node === 'string') {
      const trimmed = node.trim();
      const lastKey = pathParts[pathParts.length - 1] || '';

      // Detect tokens / baseUrls / secrets in arbitrary JSON
      if (/^(base_?url|api_?url|host|endpoint_?base)$/i.test(lastKey) && /^https?:\/\//i.test(trimmed)) {
        variables.push({
          id: uid('env'),
          key: lastKey,
          value: trimmed.replace(/\/+$/, ''),
          enabled: true,
          source: 'Auto-detected JSON field',
        });
      } else if (/^(access_?token|bearer|jwt|api_?key|token|secret)$/i.test(lastKey) && trimmed.length > 6) {
        variables.push({
          id: uid('env'),
          key: lastKey,
          value: trimmed,
          enabled: true,
          source: 'Auto-detected JSON credential',
          isSecret: true,
        });
      }

      if (urlRegex.test(trimmed)) {
        const method = inferMethodFromKey(pathParts.join('.'));
        const dedupKey = `${method}:${trimmed}`;
        if (!seenUrls.has(dedupKey)) {
          seenUrls.add(dedupKey);
          const resolvedUrl = trimmed.startsWith('/api/') ? `{{baseUrl}}${trimmed}` : trimmed;
          requests.push({
            id: uid('req'),
            name: pathParts.slice(-2).join(' / ') || trimmed,
            folderPath: pathParts.length > 1 ? [pathParts[0]] : ['Discovered Endpoints'],
            method,
            url: resolvedUrl,
            params: [],
            headers: [createKV('Accept', 'application/json', true)],
            auth: { type: 'none' },
            body:
              method === 'POST' || method === 'PUT' || method === 'PATCH'
                ? { ...emptyBody(), mode: 'json', rawText: '{\n  \n}' }
                : emptyBody(),
          });
        }
        return;
      }

      // Extract embedded URLs inside long text/markdown fields
      const matches = trimmed.match(embeddedUrlRegex);
      if (matches) {
        for (const m of matches) {
          const clean = m.replace(/[.,;)\]]+$/, '');
          const dedupKey = `GET:${clean}`;
          if (!seenUrls.has(dedupKey)) {
            seenUrls.add(dedupKey);
            requests.push({
              id: uid('req'),
              name: `${lastKey || 'Link'}: ${clean.slice(0, 48)}`,
              folderPath: ['Extracted Links'],
              method: 'GET',
              url: clean,
              params: [],
              headers: [],
              auth: { type: 'none' },
              body: emptyBody(),
            });
          }
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child, idx) => {
        // Check if child looks like a custom request object `{ url, method, name, headers, body }`
        if (child && typeof child === 'object' && (child.url || child.endpoint || child.href)) {
          const rawU = String(child.url || child.endpoint || child.href);
          const method = normalizeMethod(child.method, inferMethodFromKey(String(child.name || rawU)));
          const headers: KeyValueItem[] = [];
          if (child.headers && typeof child.headers === 'object' && !Array.isArray(child.headers)) {
            for (const [hk, hv] of Object.entries(child.headers)) {
              headers.push(createKV(hk, String(hv ?? ''), true));
            }
          }
          const body = emptyBody();
          if (child.body !== undefined && child.body !== null) {
            body.mode = 'json';
            body.rawText =
              typeof child.body === 'string' ? child.body : JSON.stringify(child.body, null, 2);
          }
          requests.push({
            id: uid('req'),
            name: String(child.name || child.title || `${method} ${rawU}`),
            folderPath: pathParts.length > 0 ? [pathParts[0]] : ['Endpoints'],
            method,
            url: rawU,
            description: String(child.description || ''),
            params: [],
            headers,
            auth: { type: 'none' },
            body,
          });
          seenUrls.add(`${method}:${rawU}`);
        } else {
          walk(child, [...pathParts, `[${idx}]`]);
        }
      });
      return;
    }

    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, [...pathParts, k]);
      }
    }
  }

  walk(json, []);

  return {
    id: uid('col'),
    name: fileName.replace(/\.json$/i, '') || 'Smart Extracted JSON Collection',
    description: `Intelligently extracted ${requests.length} endpoints & links from custom JSON structure`,
    format: 'custom-json',
    formatLabel: 'Smart JSON Link Discovery',
    requests,
    variables,
    rawJson: json,
    rawSizeBytes,
    importedAt: Date.now(),
  };
}

// ============================================================================
// UNIVERSAL ENTRYPOINT: Parse any JSON or raw text containing URLs
// ============================================================================
export function parseAnyCollectionInput(rawContent: string, fileName = 'Collection.json'): ParsedCollection {
  const rawSizeBytes = new Blob([rawContent]).size;
  const trimmed = rawContent.trim();

  let json: any;
  try {
    json = JSON.parse(trimmed);
  } catch {
    // Fallback: user pasted plain text / list of URLs / env file!
    const urlMatches = trimmed.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    const unique = Array.from(new Set(urlMatches.map((u) => u.replace(/[.,;)\]]+$/, ''))));
    if (unique.length === 0) {
      throw new Error('الملف ليس JSON صالح ولا يحتوي على روابط قابلة للاستخراج (Invalid JSON and no URLs found).');
    }
    return parseArbitraryJsonCollection({ extractedUrls: unique }, rawSizeBytes, fileName);
  }

  // 1. Postman v2.0 / v2.1
  if (
    (json.info && Array.isArray(json.item)) ||
    (typeof json.info?.schema === 'string' && json.info.schema.includes('postman'))
  ) {
    return parsePostmanCollection(json, rawSizeBytes);
  }

  // 2. OpenAPI 3.x / Swagger 2.0
  if ((json.openapi || json.swagger) && json.paths && typeof json.paths === 'object') {
    return parseOpenApiCollection(json, rawSizeBytes);
  }

  // 3. Insomnia v4
  if (json._type === 'export' && Array.isArray(json.resources)) {
    return parseInsomniaCollection(json, rawSizeBytes);
  }

  // 4. HAR 1.2
  if (json.log && Array.isArray(json.log.entries)) {
    return parseHarCollection(json, rawSizeBytes);
  }

  // 5. Thunder Client or Hoppscotch
  if (
    json.client === 'Thunder Client' ||
    (Array.isArray(json.requests) && (json.collectionName || json.folders)) ||
    (Array.isArray(json) && json[0] && (Array.isArray(json[0].requests) || Array.isArray(json[0].folders)))
  ) {
    return parseThunderOrHoppscotch(json, rawSizeBytes);
  }

  // 6. Arbitrary JSON / Custom structure
  return parseArbitraryJsonCollection(json, rawSizeBytes, fileName);
}

