# xentool

Cloudflare Worker utility tool deployed on Cloudflare Workers & Pages.

## Endpoints

- `GET /` — Health check / service info
- `GET /ping` — Pong response with timestamp
- `GET /info` — Request metadata (region, country, IP)

## Development

```bash
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```
