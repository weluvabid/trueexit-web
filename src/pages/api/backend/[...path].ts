import type { APIRoute } from 'astro';
import { proxyApiRequest } from '../../../lib/server/api';

export const GET: APIRoute = (context) => proxyApiRequest(context);
export const HEAD: APIRoute = (context) => proxyApiRequest(context);
export const POST: APIRoute = (context) => proxyApiRequest(context);
export const PUT: APIRoute = (context) => proxyApiRequest(context);
export const PATCH: APIRoute = (context) => proxyApiRequest(context);
export const DELETE: APIRoute = (context) => proxyApiRequest(context);
