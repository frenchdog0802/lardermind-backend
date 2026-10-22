import { signupBodySchema, signinBodySchema, googleLoginBodySchema } from '../schemas/auth';
import { chatResumeBodySchema } from '../schemas/chat';
import { shoppingWriteBodySchema } from '../schemas/shopping-list';
import { zodToOpenApiSchema } from './zod-json';

const errorSchema = {
  type: 'object',
  required: ['success', 'message', 'code'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    message: { type: 'string' },
    code: { type: 'string' },
    requestId: { type: 'string' },
    data: {},
  },
};

const okSchema = {
  type: 'object',
  required: ['success', 'message'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    message: { type: 'string' },
    data: {},
    requestId: { type: 'string' },
  },
};

function jsonBody(schemaName: string) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

export function buildOpenApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'LarderMind API (Cloudflare)',
      version: '0.2.0',
      description:
        'Partial spec generated from the Zod request schemas. Existing clients may omit every new field.',
    },
    paths: {
      '/api/auth/signup': {
        post: {
          operationId: 'signup',
          requestBody: jsonBody('SignupBody'),
          responses: {
            '200': { description: 'Signed up', content: { 'application/json': { schema: okSchema } } },
            '400': { description: 'Validation or signup error', content: { 'application/json': { schema: errorSchema } } },
            '429': { description: 'Rate limited', content: { 'application/json': { schema: errorSchema } } },
          },
        },
      },
      '/api/auth/signin': {
        post: {
          operationId: 'signin',
          requestBody: jsonBody('SigninBody'),
          responses: {
            '200': { description: 'Signed in', content: { 'application/json': { schema: okSchema } } },
            '400': { description: 'Validation or credentials', content: { 'application/json': { schema: errorSchema } } },
            '429': { description: 'Rate limited', content: { 'application/json': { schema: errorSchema } } },
          },
        },
      },
      '/api/auth/google-login': {
        post: {
          operationId: 'googleLogin',
          requestBody: jsonBody('GoogleLoginBody'),
          responses: {
            '200': { description: 'Signed in', content: { 'application/json': { schema: okSchema } } },
            '400': { description: 'Validation or token error', content: { 'application/json': { schema: errorSchema } } },
            '429': { description: 'Rate limited', content: { 'application/json': { schema: errorSchema } } },
          },
        },
      },
      '/api/chat/resume': {
        post: {
          operationId: 'chatResume',
          description:
            'Approve or reject the pending HITL action. interruptId is optional. Omit it to act on the current pending action. A mismatch returns 409 interrupt_mismatch. Repeating a finished resume returns the original outcome.',
          requestBody: jsonBody('ChatResumeBody'),
          responses: {
            '200': { description: 'Resume completed (including idempotent replay and expiry-as-reject)' },
            '400': { description: 'Validation or tool_args_invalid' },
            '404': { description: 'no_pending_action' },
            '409': { description: 'interrupt_mismatch, resume_in_progress, or target_missing' },
          },
        },
      },
      '/api/shopping-list': {
        get: {
          operationId: 'listShoppingList',
          responses: { '200': { description: 'Items include version' } },
        },
        post: {
          operationId: 'createShoppingListItem',
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: 'Optional. Retries with the same key return the original response.',
            },
          ],
          requestBody: jsonBody('ShoppingWriteBody'),
          responses: {
            '201': { description: 'Created or merged. Replay of an idempotent create returns this status again.' },
            '400': { description: 'Validation' },
            '409': { description: 'idempotency_key_reused or idempotency_in_progress' },
          },
        },
      },
      '/api/shopping-list/{id}': {
        put: {
          operationId: 'updateShoppingListItem',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'X-Expected-Version',
              in: 'header',
              required: false,
              schema: { type: 'integer' },
              description: 'Optional optimistic concurrency. Body version wins if both are sent and equal; disagreement is 400.',
            },
          ],
          requestBody: jsonBody('ShoppingWriteBody'),
          responses: {
            '200': { description: 'Updated' },
            '404': { description: 'Not found' },
            '409': { description: 'version_conflict — body data.current is the row' },
          },
        },
        delete: {
          operationId: 'deleteShoppingListItem',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'version', in: 'query', required: false, schema: { type: 'integer' } },
            { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
            { name: 'X-Expected-Version', in: 'header', required: false, schema: { type: 'integer' } },
          ],
          responses: {
            '200': { description: 'Deleted' },
            '404': { description: 'Not found' },
            '409': { description: 'version_conflict — body data.current is the row' },
          },
        },
      },
    },
    components: {
      schemas: {
        SignupBody: zodToOpenApiSchema(signupBodySchema),
        SigninBody: zodToOpenApiSchema(signinBodySchema),
        GoogleLoginBody: zodToOpenApiSchema(googleLoginBodySchema),
        ChatResumeBody: zodToOpenApiSchema(chatResumeBodySchema),
        ShoppingWriteBody: zodToOpenApiSchema(shoppingWriteBodySchema),
      },
    },
  };
}
