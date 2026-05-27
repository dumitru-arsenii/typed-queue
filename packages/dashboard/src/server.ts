import type { TypedQueue, EnqueueOptions, JobState, ListJobsOptions } from "@typed-queue/core";
import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import type { Server as HttpsServer } from "node:https";
import { renderTypedQueueDashboardHtml } from "./spa.js";

export type TypedQueueDashboardServer = HttpServer | HttpsServer;

export type TypedQueueDashboardView = "registered" | "archived" | "dead-letter" | "all";

export interface TypedQueueDashboardOptions {
  readonly queue: TypedQueue;
  readonly path?: string;
  readonly title?: string;
}

export interface TypedQueueDashboardHandler {
  (request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export interface TypedQueueDashboardMount {
  readonly path: string;
  readonly handler: TypedQueueDashboardHandler;
  close(): void;
}

function normalizeBasePath(path = "/typed-queue"): string {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, "")
    : withLeadingSlash;
}

function routePath(pathname: string, basePath: string): string | undefined {
  if (pathname === basePath || pathname === `${basePath}/`) {
    return "/";
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return undefined;
  }

  return pathname.slice(basePath.length);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function objectBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function toNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toEnqueueOptions(value: unknown): EnqueueOptions | undefined {
  const body = objectBody(value);

  if (Object.keys(body).length === 0) {
    return undefined;
  }

  return {
    id: typeof body.id === "string" ? body.id : undefined,
    readyAt: typeof body.readyAt === "string" ? new Date(body.readyAt) : undefined,
    priority: typeof body.priority === "number" ? body.priority : undefined,
    attempts: typeof body.attempts === "number" ? body.attempts : undefined,
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    correlationId:
      typeof body.correlationId === "string" ? body.correlationId : undefined,
    traceId: typeof body.traceId === "string" ? body.traceId : undefined
  };
}

function listOptions(url: URL): ListJobsOptions {
  const state = url.searchParams.get("state") as JobState | null;

  return {
    queue: url.searchParams.get("queue") ?? undefined,
    state: state ?? undefined,
    day: url.searchParams.get("day") ?? undefined,
    limit: toNumber(url.searchParams.get("limit")),
    offset: toNumber(url.searchParams.get("offset"))
  };
}

async function routeApi(
  route: string,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  queue: TypedQueue,
): Promise<void> {
  if (request.method === "GET" && route === "/api/status") {
    sendJson(response, 200, {
      ok: true,
      queues: queue.registry.list().map((job) => job.name)
    });
    return;
  }

  if (request.method === "GET" && route === "/api/jobs") {
    const view = (url.searchParams.get("view") ?? "registered") as TypedQueueDashboardView;
    const options = listOptions(url);
    const jobs =
      view === "archived"
        ? await queue.jobs.archived(options)
        : view === "dead-letter"
          ? await queue.jobs.deadLetter(options)
          : view === "all"
            ? await queue.jobs.list(options)
            : await queue.jobs.registered(options);

    sendJson(response, 200, { jobs });
    return;
  }

  if (request.method === "POST" && route === "/api/dispatch") {
    const body = objectBody(await readJsonBody(request));
    const queueName = body.queue;

    if (typeof queueName !== "string") {
      sendJson(response, 400, { error: "queue is required" });
      return;
    }

    const receipt = await queue.enqueue(
      queueName,
      body.payload as never,
      toEnqueueOptions(body.options),
    );

    sendJson(response, 201, receipt);
    return;
  }

  if (request.method === "DELETE" && route === "/api/archives") {
    const removed = await queue.jobs.clearArchive({
      queue: url.searchParams.get("queue") ?? undefined,
      day: url.searchParams.get("day") ?? undefined
    });
    sendJson(response, 200, { removed });
    return;
  }

  const jobMatch = route.match(/^\/api\/jobs\/([^/]+)(?:\/(retry|dead-letter))?$/);

  if (jobMatch) {
    const id = decodeURIComponent(jobMatch[1] ?? "");
    const action = jobMatch[2];

    if (request.method === "GET" && !action) {
      const job = await queue.jobs.get(id);

      if (!job) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      sendJson(response, 200, job);
      return;
    }

    if (request.method === "DELETE" && !action) {
      sendJson(response, 200, await queue.jobs.remove(id));
      return;
    }

    if (request.method === "POST" && action === "retry") {
      const body = objectBody(await readJsonBody(request));
      const readyAt =
        typeof body.readyAt === "string" ? new Date(body.readyAt) : undefined;
      sendJson(response, 200, await queue.jobs.retry(id, { readyAt }));
      return;
    }

    if (request.method === "POST" && action === "dead-letter") {
      sendJson(response, 200, await queue.jobs.moveToDeadLetter(id));
      return;
    }
  }

  sendJson(response, 404, { error: "not_found" });
}

export function createTypedQueueDashboardHandler(
  options: TypedQueueDashboardOptions,
): TypedQueueDashboardHandler {
  const basePath = normalizeBasePath(options.path);
  const html = renderTypedQueueDashboardHtml({
    basePath,
    title: options.title
  });

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://typed-queue.local");
    const route = routePath(url.pathname, basePath);

    if (!route) {
      return false;
    }

    try {
      if (route.startsWith("/api/")) {
        await routeApi(route, request, response, url, options.queue);
        return true;
      }

      sendHtml(response, html);
      return true;
    } catch (error) {
      sendJson(response, 500, {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : String(error)
      });
      return true;
    }
  };
}

export function attachTypedQueueDashboard(
  server: TypedQueueDashboardServer,
  options: TypedQueueDashboardOptions,
): TypedQueueDashboardMount {
  const path = normalizeBasePath(options.path);
  const handler = createTypedQueueDashboardHandler({
    ...options,
    path
  });
  const listener = (request: IncomingMessage, response: ServerResponse) => {
    void handler(request, response);
  };

  server.on("request", listener);

  return {
    path,
    handler,
    close() {
      server.off("request", listener);
    }
  };
}
