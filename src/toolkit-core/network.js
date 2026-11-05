/*
 * Ported from it-toolbox packages/core/network.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function parseUrl(input) {
  try {
    const url = new URL(input);
    const params = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    return {
      ok: true,
      value: {
        href: url.href,
        origin: url.origin,
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        params
      }
    };
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
}
const HTTP_STATUS_CODES = [
  { code: 100, message: "Continue", description: "\u670D\u52A1\u5668\u5DF2\u6536\u5230\u8BF7\u6C42\u7684\u521D\u59CB\u90E8\u5206\uFF0C\u5BA2\u6237\u7AEF\u5E94\u7EE7\u7EED\u53D1\u9001\u5269\u4F59\u90E8\u5206", category: "informational" },
  { code: 101, message: "Switching Protocols", description: "\u670D\u52A1\u5668\u7406\u89E3\u5E76\u540C\u610F\u5BA2\u6237\u7AEF\u7684\u534F\u8BAE\u5207\u6362\u8BF7\u6C42", category: "informational" },
  { code: 102, message: "Processing", description: "\u670D\u52A1\u5668\u5DF2\u6536\u5230\u8BF7\u6C42\uFF0C\u4F46\u4ECD\u5728\u5904\u7406\u4E2D", category: "informational" },
  { code: 200, message: "OK", description: "\u8BF7\u6C42\u6210\u529F", category: "success" },
  { code: 201, message: "Created", description: "\u8BF7\u6C42\u6210\u529F\u5E76\u521B\u5EFA\u4E86\u65B0\u8D44\u6E90", category: "success" },
  { code: 202, message: "Accepted", description: "\u8BF7\u6C42\u5DF2\u63A5\u53D7\uFF0C\u4F46\u5C1A\u672A\u5904\u7406\u5B8C\u6210", category: "success" },
  { code: 204, message: "No Content", description: "\u8BF7\u6C42\u6210\u529F\uFF0C\u4F46\u65E0\u8FD4\u56DE\u5185\u5BB9", category: "success" },
  { code: 206, message: "Partial Content", description: "\u670D\u52A1\u5668\u6210\u529F\u5904\u7406\u4E86\u90E8\u5206GET\u8BF7\u6C42", category: "success" },
  { code: 300, message: "Multiple Choices", description: "\u8BF7\u6C42\u6709\u591A\u4E2A\u53EF\u80FD\u7684\u54CD\u5E94", category: "redirection" },
  { code: 301, message: "Moved Permanently", description: "\u8BF7\u6C42\u7684\u8D44\u6E90\u5DF2\u6C38\u4E45\u79FB\u52A8\u5230\u65B0\u4F4D\u7F6E", category: "redirection" },
  { code: 302, message: "Found", description: "\u8BF7\u6C42\u7684\u8D44\u6E90\u4E34\u65F6\u4ECE\u4E0D\u540C\u7684URI\u54CD\u5E94", category: "redirection" },
  { code: 304, message: "Not Modified", description: "\u8D44\u6E90\u672A\u4FEE\u6539\uFF0C\u4F7F\u7528\u7F13\u5B58\u7248\u672C", category: "redirection" },
  { code: 307, message: "Temporary Redirect", description: "\u4E34\u65F6\u91CD\u5B9A\u5411\uFF0C\u4FDD\u6301\u8BF7\u6C42\u65B9\u6CD5", category: "redirection" },
  { code: 308, message: "Permanent Redirect", description: "\u6C38\u4E45\u91CD\u5B9A\u5411\uFF0C\u4FDD\u6301\u8BF7\u6C42\u65B9\u6CD5", category: "redirection" },
  { code: 400, message: "Bad Request", description: "\u670D\u52A1\u5668\u65E0\u6CD5\u7406\u89E3\u8BF7\u6C42\u7684\u683C\u5F0F", category: "client-error" },
  { code: 401, message: "Unauthorized", description: "\u8BF7\u6C42\u9700\u8981\u8EAB\u4EFD\u9A8C\u8BC1", category: "client-error" },
  { code: 403, message: "Forbidden", description: "\u670D\u52A1\u5668\u62D2\u7EDD\u8BF7\u6C42", category: "client-error" },
  { code: 404, message: "Not Found", description: "\u8BF7\u6C42\u7684\u8D44\u6E90\u4E0D\u5B58\u5728", category: "client-error" },
  { code: 405, message: "Method Not Allowed", description: "\u8BF7\u6C42\u65B9\u6CD5\u4E0D\u88AB\u5141\u8BB8", category: "client-error" },
  { code: 408, message: "Request Timeout", description: "\u670D\u52A1\u5668\u7B49\u5F85\u8BF7\u6C42\u8D85\u65F6", category: "client-error" },
  { code: 409, message: "Conflict", description: "\u8BF7\u6C42\u4E0E\u670D\u52A1\u5668\u5F53\u524D\u72B6\u6001\u51B2\u7A81", category: "client-error" },
  { code: 410, message: "Gone", description: "\u8BF7\u6C42\u7684\u8D44\u6E90\u5DF2\u6C38\u4E45\u5220\u9664", category: "client-error" },
  { code: 413, message: "Payload Too Large", description: "\u8BF7\u6C42\u5B9E\u4F53\u8FC7\u5927", category: "client-error" },
  { code: 414, message: "URI Too Long", description: "\u8BF7\u6C42\u7684URI\u8FC7\u957F", category: "client-error" },
  { code: 415, message: "Unsupported Media Type", description: "\u4E0D\u652F\u6301\u7684\u5A92\u4F53\u7C7B\u578B", category: "client-error" },
  { code: 422, message: "Unprocessable Entity", description: "\u8BF7\u6C42\u683C\u5F0F\u6B63\u786E\uFF0C\u4F46\u8BED\u4E49\u9519\u8BEF", category: "client-error" },
  { code: 429, message: "Too Many Requests", description: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41", category: "client-error" },
  { code: 500, message: "Internal Server Error", description: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF", category: "server-error" },
  { code: 501, message: "Not Implemented", description: "\u670D\u52A1\u5668\u4E0D\u652F\u6301\u8BF7\u6C42\u7684\u529F\u80FD", category: "server-error" },
  { code: 502, message: "Bad Gateway", description: "\u7F51\u5173\u9519\u8BEF", category: "server-error" },
  { code: 503, message: "Service Unavailable", description: "\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", category: "server-error" },
  { code: 504, message: "Gateway Timeout", description: "\u7F51\u5173\u8D85\u65F6", category: "server-error" }
];
function searchHttpStatus(query) {
  const q = query.toLowerCase();
  return HTTP_STATUS_CODES.filter(
    (s) => s.code.toString() === query || s.message.toLowerCase().includes(q) || s.description.includes(q)
  );
}
const HTTP_HEADERS = [
  { name: "Accept", category: "request", description: "\u5BA2\u6237\u7AEF\u53EF\u63A5\u53D7\u7684\u54CD\u5E94\u5185\u5BB9\u7C7B\u578B", example: "Accept: text/html, application/json" },
  { name: "Accept-Encoding", category: "request", description: "\u5BA2\u6237\u7AEF\u53EF\u63A5\u53D7\u7684\u5185\u5BB9\u7F16\u7801\u65B9\u5F0F", example: "Accept-Encoding: gzip, deflate, br" },
  { name: "Accept-Language", category: "request", description: "\u5BA2\u6237\u7AEF\u53EF\u63A5\u53D7\u7684\u81EA\u7136\u8BED\u8A00", example: "Accept-Language: zh-CN, en;q=0.9" },
  { name: "Authorization", category: "request", description: "\u8EAB\u4EFD\u9A8C\u8BC1\u51ED\u636E", example: "Authorization: Bearer <token>" },
  { name: "Cache-Control", category: "general", description: "\u7F13\u5B58\u63A7\u5236\u6307\u4EE4", example: "Cache-Control: max-age=3600" },
  { name: "Content-Type", category: "entity", description: "\u8BF7\u6C42\u4F53\u7684\u5A92\u4F53\u7C7B\u578B", example: "Content-Type: application/json" },
  { name: "Content-Length", category: "entity", description: "\u8BF7\u6C42\u4F53\u7684\u5927\u5C0F\uFF08\u5B57\u8282\uFF09", example: "Content-Length: 1234" },
  { name: "Content-Encoding", category: "entity", description: "\u5185\u5BB9\u7684\u7F16\u7801\u65B9\u5F0F", example: "Content-Encoding: gzip" },
  { name: "Cookie", category: "request", description: "\u53D1\u9001\u7ED9\u670D\u52A1\u5668\u7684Cookie", example: "Cookie: session=abc123" },
  { name: "Host", category: "request", description: "\u8BF7\u6C42\u7684\u76EE\u6807\u4E3B\u673A", example: "Host: example.com" },
  { name: "User-Agent", category: "request", description: "\u5BA2\u6237\u7AEF\u4FE1\u606F", example: "User-Agent: Mozilla/5.0..." },
  { name: "Content-Security-Policy", category: "response", description: "\u5185\u5BB9\u5B89\u5168\u7B56\u7565", example: "Content-Security-Policy: default-src 'self'" },
  { name: "ETag", category: "response", description: "\u8D44\u6E90\u7684\u7248\u672C\u6807\u8BC6", example: 'ETag: "abc123"' },
  { name: "Location", category: "response", description: "\u91CD\u5B9A\u5411\u76EE\u6807URL", example: "Location: https://example.com/new" },
  { name: "Server", category: "response", description: "\u670D\u52A1\u5668\u8F6F\u4EF6\u4FE1\u606F", example: "Server: nginx/1.18.0" },
  { name: "Set-Cookie", category: "response", description: "\u8BBE\u7F6ECookie", example: "Set-Cookie: session=abc123; HttpOnly" },
  { name: "Strict-Transport-Security", category: "response", description: "HSTS\uFF0C\u5F3A\u5236\u4F7F\u7528HTTPS", example: "Strict-Transport-Security: max-age=31536000" },
  { name: "X-Content-Type-Options", category: "response", description: "\u9632\u6B62MIME\u7C7B\u578B\u55C5\u63A2", example: "X-Content-Type-Options: nosniff" },
  { name: "X-Frame-Options", category: "response", description: "\u9632\u6B62\u70B9\u51FB\u52AB\u6301", example: "X-Frame-Options: DENY" },
  { name: "X-XSS-Protection", category: "response", description: "XSS\u4FDD\u62A4", example: "X-XSS-Protection: 1; mode=block" }
];
function searchHttpHeaders(query) {
  const q = query.toLowerCase();
  return HTTP_HEADERS.filter(
    (h) => h.name.toLowerCase().includes(q) || h.description.includes(q) || h.category.includes(q)
  );
}
const MIME_TYPES = [
  { extension: ".json", mimeType: "application/json", description: "JSON \u6570\u636E" },
  { extension: ".xml", mimeType: "application/xml", description: "XML \u6587\u6863" },
  { extension: ".html", mimeType: "text/html", description: "HTML \u6587\u6863" },
  { extension: ".css", mimeType: "text/css", description: "CSS \u6837\u5F0F\u8868" },
  { extension: ".js", mimeType: "application/javascript", description: "JavaScript \u811A\u672C" },
  { extension: ".ts", mimeType: "application/typescript", description: "TypeScript \u811A\u672C" },
  { extension: ".png", mimeType: "image/png", description: "PNG \u56FE\u7247" },
  { extension: ".jpg", mimeType: "image/jpeg", description: "JPEG \u56FE\u7247" },
  { extension: ".jpeg", mimeType: "image/jpeg", description: "JPEG \u56FE\u7247" },
  { extension: ".gif", mimeType: "image/gif", description: "GIF \u56FE\u7247" },
  { extension: ".svg", mimeType: "image/svg+xml", description: "SVG \u77E2\u91CF\u56FE" },
  { extension: ".webp", mimeType: "image/webp", description: "WebP \u56FE\u7247" },
  { extension: ".ico", mimeType: "image/x-icon", description: "\u56FE\u6807\u6587\u4EF6" },
  { extension: ".pdf", mimeType: "application/pdf", description: "PDF \u6587\u6863" },
  { extension: ".zip", mimeType: "application/zip", description: "ZIP \u538B\u7F29\u5305" },
  { extension: ".tar", mimeType: "application/x-tar", description: "TAR \u5F52\u6863" },
  { extension: ".gz", mimeType: "application/gzip", description: "GZIP \u538B\u7F29" },
  { extension: ".mp3", mimeType: "audio/mpeg", description: "MP3 \u97F3\u9891" },
  { extension: ".mp4", mimeType: "video/mp4", description: "MP4 \u89C6\u9891" },
  { extension: ".webm", mimeType: "video/webm", description: "WebM \u89C6\u9891" },
  { extension: ".woff", mimeType: "font/woff", description: "WOFF \u5B57\u4F53" },
  { extension: ".woff2", mimeType: "font/woff2", description: "WOFF2 \u5B57\u4F53" },
  { extension: ".ttf", mimeType: "font/ttf", description: "TrueType \u5B57\u4F53" },
  { extension: ".otf", mimeType: "font/otf", description: "OpenType \u5B57\u4F53" },
  { extension: ".csv", mimeType: "text/csv", description: "CSV \u8868\u683C" },
  { extension: ".txt", mimeType: "text/plain", description: "\u7EAF\u6587\u672C" },
  { extension: ".md", mimeType: "text/markdown", description: "Markdown \u6587\u6863" },
  { extension: ".yaml", mimeType: "application/x-yaml", description: "YAML \u6587\u6863" },
  { extension: ".yml", mimeType: "application/x-yaml", description: "YAML \u6587\u6863" },
  { extension: ".toml", mimeType: "application/toml", description: "TOML \u6587\u6863" }
];
function searchMimeTypes(query) {
  const q = query.toLowerCase();
  return MIME_TYPES.filter(
    (m) => m.extension.includes(q) || m.mimeType.includes(q) || m.description.includes(q)
  );
}
function calculateSubnet(ip, cidr) {
  try {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return { ok: false, error: "Invalid IP address" };
    }
    if (cidr < 0 || cidr > 32) {
      return { ok: false, error: "CIDR must be between 0 and 32" };
    }
    const ipNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    const mask = cidr === 0 ? 0 : ~0 << 32 - cidr >>> 0;
    const network = (ipNum & mask) >>> 0;
    const broadcast = (network | ~mask >>> 0) >>> 0;
    const numToIp = (n) => [
      n >>> 24 & 255,
      n >>> 16 & 255,
      n >>> 8 & 255,
      n & 255
    ].join(".");
    const subnetMask = numToIp(mask);
    const totalHosts = Math.pow(2, 32 - cidr);
    const usableHosts = cidr >= 31 ? totalHosts : totalHosts - 2;
    return {
      ok: true,
      value: {
        networkAddress: numToIp(network),
        broadcastAddress: numToIp(broadcast),
        firstHost: cidr >= 31 ? numToIp(network) : numToIp(network + 1),
        lastHost: cidr >= 31 ? numToIp(broadcast) : numToIp(broadcast - 1),
        totalHosts,
        usableHosts,
        subnetMask,
        cidr
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function parseCurlCommand(cmd) {
  const normalized = cmd.replace(/\\\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const tokens = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i2 = 0; i2 < normalized.length; i2++) {
    const ch = normalized[i2];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === " " && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  const result = {
    url: "",
    method: "GET",
    headers: {},
    body: null,
    user: null,
    compressed: false,
    insecure: false
  };
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if ((token === "-H" || token === "--header") && i + 1 < tokens.length) {
      const header = tokens[++i];
      const colonIdx = header.indexOf(":");
      if (colonIdx > 0) {
        const key = header.slice(0, colonIdx).trim();
        const val = header.slice(colonIdx + 1).trim();
        result.headers[key] = val;
      }
    } else if ((token === "-X" || token === "--request") && i + 1 < tokens.length) {
      result.method = tokens[++i].toUpperCase();
    } else if ((token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") && i + 1 < tokens.length) {
      result.body = tokens[++i];
      if (result.method === "GET") result.method = "POST";
    } else if ((token === "-u" || token === "--user") && i + 1 < tokens.length) {
      result.user = tokens[++i];
    } else if (token === "--compressed") {
      result.compressed = true;
    } else if (token === "-k" || token === "--insecure") {
      result.insecure = true;
    } else if (token === "-L" || token === "--location" || token === "--include" || token === "-i" || token === "-s" || token === "--silent" || token === "-v" || token === "--verbose") {
    } else if ((token === "-o" || token === "--output" || token === "--max-time" || token === "-m" || token === "--connect-timeout") && i + 1 < tokens.length) {
      i++;
    } else if (!token.startsWith("-") && !result.url) {
      result.url = token;
    }
    i++;
  }
  return result;
}
function curlToFetch(parsed) {
  const parts = [];
  const opts = [];
  if (parsed.method !== "GET") opts.push(`  method: '${parsed.method}'`);
  const entries = Object.entries(parsed.headers);
  if (parsed.user) entries.push(["Authorization", `Basic ${btoa(parsed.user)}`]);
  if (entries.length) {
    opts.push(`  headers: {
    ${entries.map(([k, v]) => `'${k}': '${v.replace(/'/g, "\\'")}'`).join(",\n    ")}
  }`);
  }
  if (parsed.body) opts.push(`  body: '${parsed.body.replace(/'/g, "\\'")}'`);
  parts.push(`const response = await fetch('${parsed.url}'${opts.length ? `, {
${opts.join(",\n")}
}` : ""});`);
  parts.push("const data = await response.json();");
  parts.push("console.log(data);");
  return parts.join("\n");
}
function curlToAxios(parsed) {
  const entries = Object.entries(parsed.headers);
  if (parsed.user) entries.push(["Authorization", `Basic ${btoa(parsed.user)}`]);
  const opts = [`  url: '${parsed.url}'`, `  method: '${parsed.method.toLowerCase()}'`];
  if (entries.length) {
    opts.push(`  headers: {
    ${entries.map(([k, v]) => `'${k}': '${v.replace(/'/g, "\\'")}'`).join(",\n    ")}
  }`);
  }
  if (parsed.body) {
    try {
      const j = JSON.parse(parsed.body);
      opts.push(`  data: ${JSON.stringify(j, null, 2).replace(/\n/g, "\n  ")}`);
    } catch {
      opts.push(`  data: '${parsed.body.replace(/'/g, "\\'")}'`);
    }
  }
  return `const response = await axios({
${opts.join(",\n")}
});
console.log(response.data);`;
}
function curlToPython(parsed) {
  const lines = ["import requests", ""];
  const headers = { ...parsed.headers };
  if (parsed.user) headers["Authorization"] = `Basic ${btoa(parsed.user)}`;
  if (Object.keys(headers).length) {
    lines.push(`headers = {`);
    for (const [k, v] of Object.entries(headers)) lines.push(`    '${k}': '${v.replace(/'/g, "\\'")}',`);
    lines.push(`}`, "");
  }
  const method = parsed.method.toLowerCase();
  const args = [`'${parsed.url}'`];
  if (Object.keys(headers).length) args.push("headers=headers");
  if (parsed.body) {
    try {
      const j = JSON.parse(parsed.body);
      lines.push(`json_data = ${JSON.stringify(j, null, 4).replace(/\n/g, "\n")}`);
      args.push("json=json_data");
    } catch {
      lines.push(`data = '${parsed.body.replace(/'/g, "\\'")}'`);
      args.push("data=data");
    }
    lines.push("");
  }
  lines.push(`response = requests.${method}(${args.join(", ")})`);
  lines.push("print(response.json())");
  return lines.join("\n");
}
function curlToGo(parsed) {
  const lines = [
    "package main",
    "",
    "import (",
    '	"fmt"',
    '	"io"',
    '	"net/http"'
  ];
  if (parsed.body) lines.splice(4, 0, '	"strings"');
  lines.push(")", "");
  lines.push("func main() {");
  if (parsed.body) {
    lines.push(`	body := strings.NewReader(\`${parsed.body}\`)`);
    lines.push(`	req, _ := http.NewRequest("${parsed.method}", "${parsed.url}", body)`);
  } else {
    lines.push(`	req, _ := http.NewRequest("${parsed.method}", "${parsed.url}", nil)`);
  }
  const headers = { ...parsed.headers };
  if (parsed.user) headers["Authorization"] = `Basic ${btoa(parsed.user)}`;
  for (const [k, v] of Object.entries(headers)) {
    lines.push(`	req.Header.Set("${k}", "${v.replace(/"/g, '\\"')}")`);
  }
  lines.push("	client := &http.Client{}");
  lines.push("	resp, err := client.Do(req)");
  lines.push("	if err != nil { panic(err) }");
  lines.push("	defer resp.Body.Close()");
  lines.push("	body2, _ := io.ReadAll(resp.Body)");
  lines.push("	fmt.Println(string(body2))");
  lines.push("}");
  return lines.join("\n");
}
function curlToPhp(parsed) {
  const lines = [
    "<?php",
    "",
    "$ch = curl_init();",
    `curl_setopt($ch, CURLOPT_URL, '${parsed.url}');`,
    "curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);"
  ];
  if (parsed.method !== "GET") {
    lines.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${parsed.method}');`);
  }
  const headers = { ...parsed.headers };
  if (parsed.user) headers["Authorization"] = `Basic ${btoa(parsed.user)}`;
  if (Object.keys(headers).length) {
    lines.push("curl_setopt($ch, CURLOPT_HTTPHEADER, [");
    for (const [k, v] of Object.entries(headers)) lines.push(`    '${k}: ${v.replace(/'/g, "\\'")}',`);
    lines.push("]);");
  }
  if (parsed.body) {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${parsed.body.replace(/'/g, "\\'")}');`);
  }
  if (parsed.insecure) lines.push("curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);");
  lines.push("", "$response = curl_exec($ch);");
  lines.push("curl_close($ch);");
  lines.push("echo $response;");
  return lines.join("\n");
}
function convertCurl(curlCommand) {
  try {
    const trimmed = curlCommand.trim();
    if (!trimmed.toLowerCase().startsWith("curl")) {
      return { ok: false, error: 'Command must start with "curl"' };
    }
    const parsed = parseCurlCommand(trimmed);
    if (!parsed.url) {
      return { ok: false, error: "Could not find URL in cURL command" };
    }
    return {
      ok: true,
      value: {
        fetch: curlToFetch(parsed),
        axios: curlToAxios(parsed),
        python: curlToPython(parsed),
        go: curlToGo(parsed),
        php: curlToPhp(parsed)
      }
    };
  } catch (e) {
    return { ok: false, error: "Failed to parse cURL command: " + e.message };
  }
}
const TIMEZONES = [
  { value: "Asia/Shanghai", label: "\u5317\u4EAC\u65F6\u95F4 (UTC+8)", offset: 8 },
  { value: "Asia/Tokyo", label: "\u4E1C\u4EAC (UTC+9)", offset: 9 },
  { value: "Asia/Seoul", label: "\u9996\u5C14 (UTC+9)", offset: 9 },
  { value: "Asia/Singapore", label: "\u65B0\u52A0\u5761 (UTC+8)", offset: 8 },
  { value: "Asia/Hong_Kong", label: "\u9999\u6E2F (UTC+8)", offset: 8 },
  { value: "Asia/Dubai", label: "\u8FEA\u62DC (UTC+4)", offset: 4 },
  { value: "Europe/London", label: "\u4F26\u6566 (UTC+0/+1)", offset: 0 },
  { value: "Europe/Paris", label: "\u5DF4\u9ECE (UTC+1/+2)", offset: 1 },
  { value: "Europe/Berlin", label: "\u67CF\u6797 (UTC+1/+2)", offset: 1 },
  { value: "Europe/Moscow", label: "\u83AB\u65AF\u79D1 (UTC+3)", offset: 3 },
  { value: "America/New_York", label: "\u7EBD\u7EA6 (UTC-5/-4)", offset: -5 },
  { value: "America/Los_Angeles", label: "\u6D1B\u6749\u77F6 (UTC-8/-7)", offset: -8 },
  { value: "America/Chicago", label: "\u829D\u52A0\u54E5 (UTC-6/-5)", offset: -6 },
  { value: "America/Sao_Paulo", label: "\u5723\u4FDD\u7F57 (UTC-3)", offset: -3 },
  { value: "Australia/Sydney", label: "\u6089\u5C3C (UTC+10/+11)", offset: 10 },
  { value: "Pacific/Auckland", label: "\u5965\u514B\u5170 (UTC+12/+13)", offset: 12 },
  { value: "UTC", label: "UTC", offset: 0 }
];
export {
  HTTP_HEADERS,
  HTTP_STATUS_CODES,
  MIME_TYPES,
  TIMEZONES,
  calculateSubnet,
  convertCurl,
  parseUrl,
  searchHttpHeaders,
  searchHttpStatus,
  searchMimeTypes
};
