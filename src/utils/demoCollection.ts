import { ParsedCollection } from '../types/api';
import { parseAnyCollectionInput } from './collectionParser';

export const SAMPLE_POSTMAN_COLLECTION_JSON = {
  info: {
    _postman_id: 'nexus-demo-collection-v21',
    name: 'Nexus Cloud Platform API (Starter Demo)',
    description:
      'Live testable endpoints covering REST CRUD, Auth simulation, Status responses, Pagination links & Headers inspection.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'https://dummyjson.com' },
    { key: 'httpbinUrl', value: 'https://httpbin.org' },
    { key: 'userId', value: '1' },
    { key: 'demoToken', value: 'nexus_live_demo_bearer_2026' },
  ],
  item: [
    {
      name: 'Users & Products CRUD',
      item: [
        {
          name: 'List Users (Paginated)',
          request: {
            method: 'GET',
            header: [{ key: 'Accept', value: 'application/json' }],
            url: {
              raw: '{{baseUrl}}/users?limit=5',
              host: ['{{baseUrl}}'],
              path: ['users'],
              query: [{ key: 'limit', value: '5' }],
            },
            description: 'Returns paginated users including avatar image links, company info, and coordinates.',
          },
          response: [
            {
              name: '200 OK — Sample Users Payload',
              status: 'OK',
              code: 200,
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify(
                {
                  users: [
                    {
                      id: 1,
                      firstName: 'Emily',
                      lastName: 'Johnson',
                      email: 'emily.johnson@x.dummyjson.com',
                      image: 'https://dummyjson.com/icon/emilys/128',
                    },
                  ],
                  total: 208,
                  skip: 0,
                  limit: 5,
                },
                null,
                2
              ),
            },
          ],
        },
        {
          name: 'Get Single User by ID',
          request: {
            method: 'GET',
            header: [{ key: 'Accept', value: 'application/json' }],
            url: '{{baseUrl}}/users/{{userId}}',
          },
        },
        {
          name: 'Create New Product (POST JSON)',
          request: {
            method: 'POST',
            auth: {
              type: 'bearer',
              bearer: [{ key: 'token', value: '{{demoToken}}' }],
            },
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify(
                {
                  title: 'Nexus Smart API Analyzer Pro',
                  price: 199,
                  category: 'software',
                  thumbnail: 'https://dummyjson.com/icon/nexus/128',
                },
                null,
                2
              ),
            },
            url: '{{baseUrl}}/products/add',
          },
          response: [
            {
              name: '201 Created — Product Created',
              status: 'Created',
              code: 201,
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify({ id: 195, title: 'Nexus Smart API Analyzer Pro', price: 199 }, null, 2),
            },
            {
              name: '400 Bad Request — Validation Failure Example',
              status: 'Bad Request',
              code: 400,
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'title is required' }, null, 2),
            },
          ],
        },
      ],
    },
    {
      name: 'Auth & Response Diagnostics',
      item: [
        {
          name: 'Verify Bearer Auth (200 vs 401)',
          request: {
            method: 'GET',
            auth: {
              type: 'bearer',
              bearer: [{ key: 'token', value: '{{demoToken}}' }],
            },
            header: [{ key: 'Accept', value: 'application/json' }],
            url: '{{httpbinUrl}}/bearer',
            description: 'Returns 200 OK with token details when Bearer header is present, or 401 Unauthorized when missing!',
          },
        },
        {
          name: 'Inspect Echoed Headers & Payload',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'X-Client-Studio', value: 'Nexus-API-Studio' },
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify(
                {
                  action: 'analyze_links',
                  docsUrl: 'https://dummyjson.com/products/1',
                  avatarAsset: 'https://httpbin.org/image/svg',
                },
                null,
                2
              ),
            },
            url: '{{httpbinUrl}}/anything',
          },
        },
        {
          name: 'Simulate 404 Not Found Response',
          request: {
            method: 'GET',
            url: '{{httpbinUrl}}/status/404',
          },
        },
        {
          name: 'Preview Live SVG Image Response',
          request: {
            method: 'GET',
            url: '{{httpbinUrl}}/image/svg',
          },
        },
      ],
    },
  ],
};

export function loadDefaultDemoCollection(): ParsedCollection {
  return parseAnyCollectionInput(
    JSON.stringify(SAMPLE_POSTMAN_COLLECTION_JSON, null, 2),
    'Nexus-Starter-Collection.json'
  );
}
