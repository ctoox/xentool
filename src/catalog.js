/**
 * Tool catalog — DATA, not logic.
 *
 * Adding a tool means adding one entry here. The portal Worker's code does not
 * change. Optionally the catalog can be overridden at runtime from
 * env.CATALOG_KV (key "tools", JSON array) so a new tool can be listed without
 * redeploying the portal at all; the static list is always the safe fallback.
 *
 * host must be an exact hostname: Cloudflare Custom Domains do not support
 * wildcards and require an exact match.
 */
export const CATALOG = [
  {
    id: "paste",
    name: "Paste",
    description: "Plain-text paste with TTL",
    path: "/paste",
    host: "paste.xen.autos",
    status: "available",
  },
];

/** Shape consumed by both the JSON API and the portal page. */
export function portalTools() {
  return CATALOG.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    href: `${tool.path}/`,
    host: tool.host,
    status: tool.status,
  }));
}
