import { PROTOCOL_VERSION } from "../packages/core/index.js";
import { TOOLKIT, CATEGORIES } from "./toolkit.js";
import { escapeHtml } from "./portal-page.js";

/**
 * Workbench client script.
 *
 * Written with String.raw and without template literals on purpose: it is
 * embedded inside a template literal, so `${` and backticks must not appear.
 * Everything is built with DOM APIs, never innerHTML with user data.
 */
const CLIENT_JS = String.raw`
(function () {
  var meta = JSON.parse(document.getElementById('meta').textContent);
  var navEl = document.getElementById('nav');
  var titleEl = document.getElementById('title');
  var descEl = document.getElementById('desc');
  var panelEl = document.getElementById('panel');

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function area(placeholder) {
    return h('textarea', { class: 'area', rows: '7', spellcheck: 'false', placeholder: placeholder });
  }

  function line(placeholder, value, type) {
    return h('input', { class: 'input', placeholder: placeholder, value: value || '', type: type || 'text' });
  }

  function btn(label, onClick, primary) {
    return h('button', { class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: onClick, text: label });
  }

  function row() {
    var div = h('div', { class: 'row' });
    for (var i = 0; i < arguments.length; i++) div.appendChild(arguments[i]);
    return div;
  }

  function block(label, node) {
    return h('div', { class: 'block' }, h('div', { class: 'label', text: label }), node);
  }

  function out(text) {
    return h('pre', { class: 'out', text: text || '' });
  }

  function copyBtn(getText) {
    return btn('复制', function (e) {
      var t = getText();
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(t).then(function () {
        var old = e.target.textContent;
        e.target.textContent = '已复制';
        setTimeout(function () { e.target.textContent = old; }, 1200);
      });
    });
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function b64urlToUtf8(s) {
    var t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return base64ToUtf8(t);
  }

  var VIEWS = {};

  VIEWS.url = function (panel) {
    var input = area('输入 URL 或文本…');
    var result = out('');
    panel.appendChild(block('输入', input));
    panel.appendChild(row(
      btn('编码', function () { result.textContent = encodeURIComponent(input.value); }, true),
      btn('解码', function () {
        try { result.textContent = decodeURIComponent(input.value); }
        catch (e) { result.textContent = '解码失败：' + e.message; }
      }),
      copyBtn(function () { return result.textContent; })
    ));
    panel.appendChild(block('结果', result));
  };

  VIEWS.base64 = function (panel) {
    var input = area('文本或 Base64…');
    var result = out('');
    panel.appendChild(block('输入', input));
    panel.appendChild(row(
      btn('编码', function () {
        try { result.textContent = utf8ToBase64(input.value); }
        catch (e) { result.textContent = '编码失败：' + e.message; }
      }, true),
      btn('解码', function () {
        try { result.textContent = base64ToUtf8(input.value); }
        catch (e) { result.textContent = '解码失败：不是合法的 Base64'; }
      }),
      copyBtn(function () { return result.textContent; })
    ));
    panel.appendChild(block('结果', result));
  };

  VIEWS.json = function (panel) {
    var input = area('粘贴 JSON…');
    var result = out('');
    panel.appendChild(block('输入', input));
    panel.appendChild(row(
      btn('格式化', function () {
        try { result.textContent = JSON.stringify(JSON.parse(input.value), null, 2); }
        catch (e) { result.textContent = '语法错误：' + e.message; }
      }, true),
      btn('压缩', function () {
        try { result.textContent = JSON.stringify(JSON.parse(input.value)); }
        catch (e) { result.textContent = '语法错误：' + e.message; }
      }),
      btn('校验', function () {
        try { JSON.parse(input.value); result.textContent = '合法 JSON'; }
        catch (e) { result.textContent = '语法错误：' + e.message; }
      }),
      copyBtn(function () { return result.textContent; })
    ));
    panel.appendChild(block('结果', result));
  };

  VIEWS.jwt = function (panel) {
    var input = area('粘贴 JWT（三段式）…');
    var result = out('');
    panel.appendChild(block('Token', input));
    panel.appendChild(row(btn('解析', function () {
      var parts = input.value.trim().split('.');
      if (parts.length < 2) { result.textContent = '不是有效的 JWT：需要至少 header.payload 两段'; return; }
      try {
        var header = JSON.parse(b64urlToUtf8(parts[0]));
        var payload = JSON.parse(b64urlToUtf8(parts[1]));
        var lines = ['HEADER', JSON.stringify(header, null, 2), '', 'PAYLOAD', JSON.stringify(payload, null, 2)];
        if (payload.exp) {
          var exp = new Date(payload.exp * 1000);
          lines.push('', 'exp  ' + exp.toLocaleString() + (exp.getTime() < Date.now() ? '  （已过期）' : '  （有效）'));
        }
        if (payload.iat) lines.push('iat  ' + new Date(payload.iat * 1000).toLocaleString());
        result.textContent = lines.join('\n');
      } catch (e) {
        result.textContent = '解析失败：' + e.message;
      }
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('解析结果', result));
  };

  VIEWS.hash = function (panel) {
    var input = area('输入文本…');
    var result = out('');
    var algo = h('select', { class: 'input short' },
      h('option', { value: 'SHA-256', text: 'SHA-256' }),
      h('option', { value: 'SHA-1', text: 'SHA-1' }),
      h('option', { value: 'SHA-384', text: 'SHA-384' }),
      h('option', { value: 'SHA-512', text: 'SHA-512' })
    );
    panel.appendChild(block('输入', input));
    panel.appendChild(row(algo, btn('计算', function () {
      crypto.subtle.digest(algo.value, new TextEncoder().encode(input.value)).then(function (buf) {
        var arr = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
        result.textContent = hex;
      }).catch(function (e) { result.textContent = '计算失败：' + e.message; });
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('摘要', result));
  };

  VIEWS.uuid = function (panel) {
    var count = line('数量', '5', 'number');
    count.className = 'input short';
    var result = out('');
    panel.appendChild(row(count, btn('生成', function () {
      var n = Math.max(1, Math.min(100, parseInt(count.value, 10) || 1));
      var lines = [];
      for (var i = 0; i < n; i++) lines.push(crypto.randomUUID());
      result.textContent = lines.join('\n');
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
  };

  VIEWS.time = function (panel) {
    var now = out('');
    var tsInput = line('时间戳，秒或毫秒');
    var dateOut = out('');
    var dateInput = line('', '', 'datetime-local');
    var tsOut = out('');

    function tick() {
      var d = new Date();
      now.textContent = '秒    ' + Math.floor(d.getTime() / 1000) + '\n毫秒  ' + d.getTime() + '\n本地  ' + d.toLocaleString();
    }
    tick();
    var timer = setInterval(tick, 1000);

    panel.appendChild(block('当前', now));
    panel.appendChild(block('时间戳 → 日期', row(tsInput, btn('转换', function () {
      var raw = tsInput.value.trim();
      var v = parseInt(raw, 10);
      if (isNaN(v)) { dateOut.textContent = '请输入数字'; return; }
      var ms = raw.length <= 10 ? v * 1000 : v;
      var d = new Date(ms);
      if (isNaN(d.getTime())) { dateOut.textContent = '超出可解析范围'; return; }
      dateOut.textContent = d.toLocaleString() + '\nISO   ' + d.toISOString();
    }, true))));
    panel.appendChild(dateOut);
    panel.appendChild(block('日期 → 时间戳', row(dateInput, btn('转换', function () {
      if (!dateInput.value) { tsOut.textContent = '请选择日期时间'; return; }
      var ms = new Date(dateInput.value).getTime();
      tsOut.textContent = '秒    ' + Math.floor(ms / 1000) + '\n毫秒  ' + ms;
    }, true))));
    panel.appendChild(tsOut);

    return function () { clearInterval(timer); };
  };

  VIEWS.regex = function (panel) {
    var pattern = line('正则表达式，例如 \\d+');
    var flags = line('flags', 'g');
    flags.className = 'input short';
    var text = area('测试文本…');
    var result = out('');
    panel.appendChild(row(pattern, flags));
    panel.appendChild(block('测试文本', text));
    panel.appendChild(row(btn('匹配', function () {
      try {
        var re = new RegExp(pattern.value, flags.value);
        var matches = Array.from(text.value.matchAll(re));
        if (!matches.length) { result.textContent = '无匹配'; return; }
        var lines = ['共 ' + matches.length + ' 处匹配'];
        matches.slice(0, 50).forEach(function (m, i) {
          lines.push((i + 1) + '. ' + JSON.stringify(m[0]) + '  @' + m.index);
        });
        if (matches.length > 50) lines.push('… 仅显示前 50 条');
        result.textContent = lines.join('\n');
      } catch (e) {
        result.textContent = '正则无效：' + e.message;
      }
    }, true)));
    panel.appendChild(block('结果', result));
  };

  function hexToRgb(hex) {
    var m = String(hex).trim().replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var hh = 0;
    if (d !== 0) {
      if (max === r) hh = ((g - b) / d) % 6;
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
    }
    var l = (max + min) / 2;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [Math.round(hh), Math.round(s * 100), Math.round(l * 100)];
  }

  VIEWS.color = function (panel) {
    var input = line('#22d3ee 或 34,211,238', '#22d3ee');
    var swatch = h('div', { class: 'swatch' });
    var result = out('');
    panel.appendChild(row(input, swatch));
    panel.appendChild(row(btn('转换', function () {
      var raw = input.value.trim();
      var rgb = null;
      if (raw.indexOf('rgb') === 0) {
        var nums = raw.replace(/[^0-9,]/g, '').split(',');
        if (nums.length >= 3) rgb = [parseInt(nums[0], 10), parseInt(nums[1], 10), parseInt(nums[2], 10)];
      } else if (raw.indexOf(',') > -1) {
        var parts = raw.split(',');
        if (parts.length >= 3) rgb = [parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10)];
      } else {
        rgb = hexToRgb(raw);
      }
      if (!rgb || rgb.some(function (v) { return isNaN(v) || v < 0 || v > 255; })) {
        result.textContent = '无法识别，请输入 #rrggbb 或 r,g,b';
        swatch.style.background = 'transparent';
        return;
      }
      var hex = '#' + rgb.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
      var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      swatch.style.background = hex;
      result.textContent = 'HEX  ' + hex + '\nRGB  rgb(' + rgb.join(', ') + ')\nHSL  hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)';
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
  };

  var cleanup = null;

  function render(id) {
    if (cleanup) { cleanup(); cleanup = null; }
    var tool = null;
    for (var i = 0; i < meta.length; i++) if (meta[i].id === id) tool = meta[i];
    if (!tool) tool = meta[0];
    titleEl.textContent = tool.name;
    descEl.textContent = tool.desc;
    document.title = tool.name + ' · xentool';
    panelEl.innerHTML = '';
    var view = VIEWS[tool.id];
    if (view) {
      var c = view(panelEl);
      if (typeof c === 'function') cleanup = c;
    } else {
      panelEl.appendChild(h('p', { class: 'muted', text: '该工具暂未实现。' }));
    }
    var links = navEl.querySelectorAll('a');
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle('active', links[j].getAttribute('data-id') === tool.id);
    }
  }

  function route() {
    render((location.hash || '').replace('#', '') || 'url');
  }

  window.addEventListener('hashchange', route);
  route();
})();
`;

export function renderToolsPage({
  host = "tool.xen.autos",
  site = {},
  protocol = PROTOCOL_VERSION,
} = {}) {
  const brand = escapeHtml(site.name || "xentool");
  const metaJson = JSON.stringify(TOOLKIT).replace(/</g, "\\u003c");

  const nav = CATEGORIES.map((cat) => {
    const items = TOOLKIT.filter((tool) => tool.category === cat.id)
      .map(
        (tool) =>
          `<a href="#${escapeHtml(tool.id)}" data-id="${escapeHtml(tool.id)}">${escapeHtml(tool.name)}</a>`,
      )
      .join("");
    return `<div class="group"><div class="group-name">${escapeHtml(cat.name)}</div>${items}</div>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>工具台 · ${brand}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>
:root{--bg:#06070a;--ink:#e8eaf0;--dim:#8b90a0;--line:rgba(255,255,255,.09);--cyan:#22d3ee;--violet:#a78bfa;--pink:#f472b6}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.42}
.aura .a1{width:460px;height:460px;left:-160px;top:-160px;background:rgba(34,211,238,.30)}
.aura .a2{width:420px;height:420px;right:-140px;top:-100px;background:rgba(167,139,250,.26)}
.top{position:sticky;top:0;z-index:5;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(6,7,10,.6);border-bottom:1px solid var(--line)}
.top-in{max-width:1120px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:var(--ink);text-decoration:none}
.logo .badge{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:grid;place-items:center;color:#06070a;font:700 12px ui-monospace,monospace}
.back{font-size:13px;color:var(--dim);text-decoration:none;transition:color .18s}
.back:hover{color:var(--cyan)}
.wrap{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:32px 24px 72px;display:grid;grid-template-columns:230px 1fr;gap:32px;align-items:start}
nav{position:sticky;top:76px;display:flex;flex-direction:column;gap:22px}
.group-name{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 8px 10px}
nav a{display:block;padding:8px 10px;border-radius:8px;color:var(--dim);text-decoration:none;font-size:13.5px;transition:background .16s,color .16s}
nav a:hover{background:rgba(255,255,255,.05);color:var(--ink)}
nav a.active{background:rgba(34,211,238,.12);color:var(--cyan)}
main{min-width:0}
h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.desc{margin:6px 0 24px;color:var(--dim);font-size:13.5px}
.block{margin-bottom:18px}
.label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:7px}
.area,.input{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-size:13.5px;padding:11px 13px;outline:none;transition:border-color .18s,box-shadow .18s;font-family:inherit}
.area{resize:vertical;min-height:120px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.6}
.input.short{width:auto;min-width:120px}
.area:focus,.input:focus{border-color:rgba(34,211,238,.5);box-shadow:0 0 0 4px rgba(34,211,238,.09)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
.btn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--ink);padding:8px 15px;border-radius:9px;font-size:13px;cursor:pointer;transition:background .16s,border-color .16s,transform .1s}
.btn:hover{background:rgba(255,255,255,.1);border-color:var(--line-2,rgba(255,255,255,.16))}
.btn:active{transform:translateY(1px)}
.btn.primary{background:linear-gradient(135deg,rgba(34,211,238,.9),rgba(167,139,250,.9));border-color:transparent;color:#06070a;font-weight:600}
.btn.primary:hover{filter:brightness(1.06)}
.out{background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:13px;font:12.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd3dc;white-space:pre-wrap;word-break:break-all;min-height:44px;margin:0;max-height:340px;overflow:auto}
.swatch{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:#22d3ee}
.muted{color:var(--dim);font-size:13px}
@media (max-width:760px){.wrap{grid-template-columns:1fr;gap:20px;padding:20px 16px 56px}nav{position:static;flex-direction:row;overflow-x:auto;gap:8px;padding-bottom:8px}nav .group{display:flex;gap:6px;align-items:center}.group-name{display:none}nav a{white-space:nowrap}h1{font-size:20px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span></div>
<div class="top"><div class="top-in">
  <a class="logo" href="/"><span class="badge" aria-hidden="true">X</span>${brand}</a>
  <a class="back" href="/">← 返回工具库</a>
</div></div>
<div class="wrap">
  <nav id="nav">${nav}</nav>
  <main>
    <h1 id="title">工具台</h1>
    <p class="desc" id="desc">所有计算在浏览器本地完成，不上传、不记录。</p>
    <div id="panel"></div>
  </main>
</div>
<script id="meta" type="application/json">${metaJson}</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}
