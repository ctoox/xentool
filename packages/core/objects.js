/**
 * Durable Object classes.
 *
 * Both are deliberately written as plain classes taking `(state, env)` rather
 * than extending `DurableObject` from "cloudflare:workers": that import only
 * resolves inside the Workers runtime, and a module that fails to import also
 * fails under `node --test`, taking the whole suite with it.
 *
 * They close the one gap KV cannot: KV has no atomic increment and is
 * eventually consistent, so short-link clicks are best-effort. A Counter DO
 * serialises every increment through a single object, which is exact.
 */

/* -------------------------------------------------------------- Counter --- */

/**
 * One counter per object name. Storage layout: { value: number }.
 * Routes:
 *   GET ?op=inc   increment and return  (default)
 *   GET ?op=peek  read without changing
 *   GET ?op=reset zero it
 */
export class Counter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get("op") || "inc";

    let value = (await this.state.storage.get("value")) || 0;

    if (op === "inc") {
      value += 1;
      await this.state.storage.put("value", value);
    } else if (op === "reset") {
      value = 0;
      await this.state.storage.put("value", value);
    }

    return jsonResponse({ value, op });
  }
}

/* ----------------------------------------------------------------- Room --- */

/**
 * Broadcast room over WebSockets.
 *
 * Uses the hibernation API (`acceptWebSocket`) so an idle room costs nothing:
 * the object is evicted while sockets stay open, and messages wake it up.
 * Close codes: 1000 normal, 1011 internal. The last 50 messages are replayed
 * to a client that reconnects, which makes the room usable as a scratch pad.
 */
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.history = [];
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") !== "websocket") {
      return jsonResponse({
        room: url.pathname,
        clients: this.state.getWebSockets().length,
        history: this.history.length,
        hint: "Connect with a WebSocket upgrade to join.",
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);

    for (const message of this.history) {
      try {
        server.send(message);
      } catch {
        // socket closed between accept and replay
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (text.length > 4000) {
      ws.send(JSON.stringify({ type: "error", message: "message too long" }));
      return;
    }

    const payload = JSON.stringify({ type: "message", at: Date.now(), body: text });
    this.history.push(payload);
    if (this.history.length > 50) this.history.shift();

    for (const client of this.state.getWebSockets()) {
      try {
        client.send(payload);
      } catch {
        // a dead socket must not break the broadcast
      }
    }
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1000 ? 1000 : 1000, "bye");
    } catch {
      // already closed
    }
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "internal error");
    } catch {
      // already closed
    }
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
