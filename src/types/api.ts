export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type Language = 'ar' | 'en';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey';
  bearerToken?: string;
  basicUser?: string;
  basicPass?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
}

export interface BodyConfig {
  mode: 'none' | 'json' | 'urlencoded' | 'raw' | 'graphql';
  rawText: string;
  urlencoded: KeyValueItem[];
  graphqlQuery: string;
  graphqlVariables: string;
}

export interface SavedExampleResponse {
  id: string;
  name: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface ApiRequestItem {
  id: string;
  name: string;
  folderPath: string[];
  method: HttpMethod;
  url: string;
  description?: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  body: BodyConfig;
  savedResponses?: SavedExampleResponse[];
  tags?: string[];
}

export interface EnvVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  source?: string;
  isSecret?: boolean;
}

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  raw: string;
}

export interface TimingBreakdown {
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
}

export interface RedirectHop {
  status: number;
  from: string;
  to: string;
  durationMs: number;
}

export interface TlsInfo {
  authorized: boolean;
  authorizationError?: string | null;
  protocol: string;
  cipher: string;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
}

export interface ProxyExecutionResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  setCookies: ParsedCookie[];
  bodyText: string;
  bodyJson?: unknown;
  isBase64?: boolean;
  truncated?: boolean;
  contentType: string;
  sizeBytes: number;
  compressedBytes?: number;
  timings: TimingBreakdown;
  redirects: RedirectHop[];
  tls?: TlsInfo | null;
  finalUrl: string;
  timestamp: number;
  requestSnapshot?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
}

export interface HistoryEntry {
  id: string;
  requestName: string;
  requestId?: string;
  method: HttpMethod;
  url: string;
  result: ProxyExecutionResult;
}

export interface LinkProbeResult {
  url: string;
  finalUrl: string;
  ok: boolean;
  status: number;
  statusText: string;
  error?: string;
  errorCode?: string;
  latencyMs: number;
  contentType: string;
  server: string;
  redirectCount: number;
  tlsAuthorized: boolean | null;
  tlsProtocol: string;
}

export type LinkCategory =
  | 'endpoint'
  | 'base-server'
  | 'webhook'
  | 'asset'
  | 'docs-auth'
  | 'response-link';

export interface ExtractedLink {
  id: string;
  rawUrl: string;
  resolvedUrl: string;
  protocol: string;
  host: string;
  pathname: string;
  pathSegments: string[];
  pathParams: string[];
  queryKeys: string[];
  variables: string[];
  category: LinkCategory;
  sources: string[];
  methods: HttpMethod[];
  requestIds: string[];
  isSecure: boolean;
  isLocalhost: boolean;
  hasUnresolvedVars: boolean;
  probeResult?: LinkProbeResult;
}

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'secret' | 'transport' | 'auth' | 'variables' | 'architecture';
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  location: string;
  requestId?: string;
  decodedJwt?: {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
    isExpired?: boolean;
    expiresAt?: string;
  };
}

export interface ResourceTreeNode {
  segment: string;
  fullPath: string;
  methods: HttpMethod[];
  requestIds: string[];
  children: ResourceTreeNode[];
}

export type CollectionFormat =
  | 'postman-v2'
  | 'openapi-3'
  | 'swagger-2'
  | 'insomnia-v4'
  | 'har-1.2'
  | 'hoppscotch'
  | 'thunder-client'
  | 'custom-json';

export interface ParsedCollection {
  id: string;
  name: string;
  description: string;
  format: CollectionFormat;
  formatLabel: string;
  requests: ApiRequestItem[];
  variables: EnvVariable[];
  rawJson: unknown;
  rawSizeBytes: number;
  importedAt: number;
}

export interface CollectionAnalysis {
  healthScore: number;
  totalRequests: number;
  totalFolders: number;
  methodCounts: Record<HttpMethod, number>;
  authBreakdown: Record<string, number>;
  uniqueHosts: string[];
  links: ExtractedLink[];
  findings: SecurityFinding[];
  unresolvedVariables: string[];
  discoveredVariables: string[];
  resourceTreesByHost: Record<string, ResourceTreeNode[]>;
  savedResponsesCount: number;
}

export interface ScenarioTestCase {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  expectedBehaviorAr: string;
  expectedBehaviorEn: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  category: 'happy' | 'no-auth' | 'bad-token' | 'malformed-body' | 'wrong-method' | 'cors-preflight' | 'query-fuzz';
}

export interface ScenarioRunOutcome {
  scenario: ScenarioTestCase;
  status: 'pending' | 'running' | 'done';
  result?: ProxyExecutionResult;
  verdict?: 'pass' | 'warn' | 'fail';
  verdictAr?: string;
  verdictEn?: string;
}

export interface BatchRunItemOutcome {
  request: ApiRequestItem;
  resolvedUrl: string;
  status: 'pending' | 'running' | 'done';
  result?: ProxyExecutionResult;
}

