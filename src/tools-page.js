import { PROTOCOL_VERSION } from "../packages/core/index.js";
import { TOKENS, BASE_CSS } from "../packages/ui/theme.js";
import { topbar } from "../packages/ui/components.js";
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

  /*
   * Toolkit core, loaded on demand from /core/<name>.js.
   *
   * One shared promise per module, so switching between two tools that need
   * the same file costs one request total. Nothing is preloaded: a tool that
   * only needs text.js should not pay for the AES or color code.
   */
  var coreCache = {};
  function core(name) {
    if (!coreCache[name]) coreCache[name] = import('/core/' + name);
    return coreCache[name];
  }

  /* A definition table for anything shaped like "field: value". */
  function kv(rows) {
    var table = h('table', { class: 'kv' });
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i]) continue;
      table.appendChild(h('tr', {},
        h('th', { text: rows[i][0] }),
        h('td', { text: rows[i][1] === '' || rows[i][1] == null ? '—' : String(rows[i][1]) })
      ));
    }
    return table;
  }

  /* Same table, with a header row — for search results and reference lists. */
  function datatable(columns, rows) {
    var table = h('table', { class: 'kv kv-data' });
    var head = h('tr', {});
    for (var i = 0; i < columns.length; i++) head.appendChild(h('th', { text: columns[i] }));
    table.appendChild(head);
    for (var r = 0; r < rows.length; r++) {
      var tr = h('tr', {});
      for (var c = 0; c < rows[r].length; c++) tr.appendChild(h('td', { text: rows[r][c] }));
      table.appendChild(tr);
    }
    return table;
  }

  /* A native select, styled like the text inputs. */
  function picker(options, value, onChange) {
    var sel = h('select', { class: 'input short' });
    for (var i = 0; i < options.length; i++) {
      sel.appendChild(h('option', { value: options[i][0], text: options[i][1] }));
    }
    sel.value = value;
    if (onChange) sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }


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

  /* ------------------------------------------------------------- CIDR --- */

  function ipToInt(ip) {
    var parts = String(ip).trim().split('.');
    if (parts.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = parseInt(parts[i], 10);
      if (isNaN(v) || v < 0 || v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  }

  function intToIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  VIEWS.cidr = function (panel) {
    var input = line('192.168.1.0/24 或 10.0.0.5 255.255.255.0', '192.168.1.0/24');
    var result = out('');
    panel.appendChild(block('网段', input));
    panel.appendChild(row(btn('计算', function () {
      var raw = input.value.trim().replace(/\s+/, ' ');
      var ip = null;
      var bits = NaN;

      if (raw.indexOf('/') > -1) {
        var seg = raw.split('/');
        ip = ipToInt(seg[0]);
        bits = parseInt(seg[1], 10);
      } else {
        var parts = raw.split(' ');
        ip = ipToInt(parts[0]);
        var mask = parts[1] ? ipToInt(parts[1]) : null;
        if (mask === null) {
          result.textContent = '格式：192.168.1.0/24 或 10.0.0.5 255.255.255.0';
          return;
        }
        bits = 0;
        var m = mask >>> 0;
        while (m & 0x80000000) { bits++; m = (m << 1) >>> 0; }
      }

      if (ip === null || isNaN(bits) || bits < 0 || bits > 32) {
        result.textContent = '无法解析，请检查 IPv4 地址与掩码位数';
        return;
      }

      var maskInt = bits === 0 ? 0 : ((0xFFFFFFFF << (32 - bits)) >>> 0);
      var network = (ip & maskInt) >>> 0;
      var broadcast = (network | (~maskInt >>> 0)) >>> 0;
      var total = Math.pow(2, 32 - bits);
      var usable;
      var range;

      if (bits >= 31) {
        usable = total;
        range = intToIp(network) + ' – ' + intToIp(broadcast);
      } else {
        usable = total - 2;
        range = intToIp(network + 1) + ' – ' + intToIp(broadcast - 1);
      }

      result.textContent = [
        'CIDR        ' + intToIp(network) + '/' + bits,
        '掩码        ' + intToIp(maskInt),
        '通配符      ' + intToIp(~maskInt >>> 0),
        '网络地址    ' + intToIp(network),
        '广播地址    ' + intToIp(broadcast),
        '可用主机    ' + range,
        '主机数      ' + usable
      ].join('\n');
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
  };

  /* ------------------------------------------------------------- Cron --- */

  function parseCronField(text, min, max) {
    var raw = String(text).trim();
    if (!raw) return null;

    var set = {};
    var chunks = raw.split(',');
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i].trim();
      if (!chunk) return null;

      var step = 1;
      var body = chunk;
      var slash = chunk.indexOf('/');
      if (slash > -1) {
        body = chunk.slice(0, slash);
        step = parseInt(chunk.slice(slash + 1), 10);
        if (isNaN(step) || step < 1) return null;
      }

      var lo;
      var hi;
      if (body === '*') { lo = min; hi = max; }
      else if (body.indexOf('-') > -1) {
        var pair = body.split('-');
        lo = parseInt(pair[0], 10);
        hi = parseInt(pair[1], 10);
      } else {
        lo = parseInt(body, 10);
        hi = slash > -1 ? max : lo;
      }

      if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) return null;
      for (var v = lo; v <= hi; v += step) set[v] = true;
    }
    return set;
  }

  function describeCronSet(set, min, max, unit) {
    var values = [];
    for (var v = min; v <= max; v++) if (set[v]) values.push(v);
    if (values.length === max - min + 1) return '每' + unit;
    if (!values.length) return '无匹配';
    if (values.length > 12) return values.length + ' 个' + unit;
    return values.join('、');
  }

  VIEWS.cron = function (panel) {
    var input = line('如 0 9 * * 1-5', '0 9 * * 1-5');
    var result = out('');
    panel.appendChild(block('表达式', input));
    panel.appendChild(block('常用', row(
      btn('每分钟', function () { input.value = '* * * * *'; }, false),
      btn('每天 9 点', function () { input.value = '0 9 * * *'; }, false),
      btn('工作日 9 点', function () { input.value = '0 9 * * 1-5'; }, false),
      btn('每 15 分钟', function () { input.value = '*/15 * * * *'; }, false)
    )));
    panel.appendChild(row(btn('解析', function () {
      var fields = input.value.trim().split(/\s+/);
      if (fields.length !== 5) {
        result.textContent = '需要 5 个字段：分 时 日 月 周';
        return;
      }

      var minute = parseCronField(fields[0], 0, 59);
      var hour = parseCronField(fields[1], 0, 23);
      var dom = parseCronField(fields[2], 1, 31);
      var month = parseCronField(fields[3], 1, 12);
      var dow = parseCronField(fields[4], 0, 6);

      if (!minute || !hour || !dom || !month || !dow) {
        result.textContent = '表达式无效：检查取值范围（分 0-59，时 0-23，日 1-31，月 1-12，周 0-6）';
        return;
      }

      var domStar = fields[2] === '*';
      var dowStar = fields[4] === '*';

      var lines = [
        '分钟    ' + describeCronSet(minute, 0, 59, '分钟'),
        '小时    ' + describeCronSet(hour, 0, 23, '小时'),
        '日期    ' + describeCronSet(dom, 1, 31, '天'),
        '月份    ' + describeCronSet(month, 1, 12, '月'),
        '星期    ' + describeCronSet(dow, 0, 6, '天')
      ];

      var cursor = new Date();
      cursor.setSeconds(0, 0);
      cursor.setMinutes(cursor.getMinutes() + 1);

      var upcoming = [];
      var guard = 0;
      while (upcoming.length < 5 && guard < 200000) {
        guard++;

        var dayOk;
        if (domStar && dowStar) dayOk = true;
        else if (domStar) dayOk = Boolean(dow[cursor.getDay()]);
        else if (dowStar) dayOk = Boolean(dom[cursor.getDate()]);
        else dayOk = Boolean(dom[cursor.getDate()]) || Boolean(dow[cursor.getDay()]);

        if (dayOk && month[cursor.getMonth() + 1] && hour[cursor.getHours()] && minute[cursor.getMinutes()]) {
          upcoming.push(cursor.toLocaleString());
        }
        cursor = new Date(cursor.getTime() + 60000);
      }

      lines.push('');
      lines.push(upcoming.length ? '接下来 ' + upcoming.length + ' 次：' : '一年内没有匹配时间：');
      for (var i = 0; i < upcoming.length; i++) lines.push('  ' + upcoming[i]);

      result.textContent = lines.join('\n');
    }, true)));
    panel.appendChild(block('结果', result));
  };

  /* ------------------------------------------------------------- Diff --- */

  function splitLines(text) {
    return String(text).replace(/\r\n/g, '\n').split('\n');
  }

  VIEWS.diff = function (panel) {
    var left = area('原始文本…');
    var right = area('修改后的文本…');
    var result = out('');
    panel.appendChild(block('原始', left));
    panel.appendChild(block('修改后', right));
    panel.appendChild(row(btn('对比', function () {
      var a = splitLines(left.value);
      var b = splitLines(right.value);
      if (a.length > 500 || b.length > 500) {
        result.textContent = '行数过多（上限 500 行），请分段比较';
        return;
      }

      var rows = a.length;
      var cols = b.length;
      var table = [];
      for (var i = 0; i <= rows; i++) {
        table.push(new Array(cols + 1));
        for (var j = 0; j <= cols; j++) table[i][j] = 0;
      }
      for (var r = rows - 1; r >= 0; r--) {
        for (var c = cols - 1; c >= 0; c--) {
          table[r][c] = a[r] === b[c]
            ? table[r + 1][c + 1] + 1
            : Math.max(table[r + 1][c], table[r][c + 1]);
        }
      }

      var output = [];
      var added = 0;
      var removed = 0;
      var x = 0;
      var y = 0;
      while (x < rows && y < cols) {
        if (a[x] === b[y]) { output.push('  ' + a[x]); x++; y++; }
        else if (table[x + 1][y] >= table[x][y + 1]) { output.push('- ' + a[x]); removed++; x++; }
        else { output.push('+ ' + b[y]); added++; y++; }
      }
      while (x < rows) { output.push('- ' + a[x]); removed++; x++; }
      while (y < cols) { output.push('+ ' + b[y]); added++; y++; }

      result.textContent = '新增 ' + added + ' 行 · 删除 ' + removed + ' 行\n\n' + output.join('\n');
    }, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('差异', result));
  };

  /* --------------------------------------------------------- Markdown --- */

  var TICK = String.fromCharCode(96);
  var INLINE_RE = new RegExp(
    '(\\*\\*[^*]+\\*\\*|\\*[^*\\n]+\\*|' + TICK + '[^' + TICK + ']+' + TICK + '|\\[[^\\]]+\\]\\([^)\\s]+\\))',
    'g'
  );

  function inlineInto(parent, text) {
    var last = 0;
    var match;
    INLINE_RE.lastIndex = 0;
    while ((match = INLINE_RE.exec(text)) !== null) {
      if (match.index > last) {
        parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      var token = match[0];
      if (token.indexOf('**') === 0) {
        parent.appendChild(h('strong', { text: token.slice(2, -2) }));
      } else if (token.charAt(0) === TICK) {
        parent.appendChild(h('code', { text: token.slice(1, -1) }));
      } else if (token.indexOf('[') === 0) {
        var mid = token.indexOf('](');
        var label = token.slice(1, mid);
        var href = token.slice(mid + 2, -1);
        if (/^https?:\/\//i.test(href)) {
          parent.appendChild(h('a', { href: href, target: '_blank', rel: 'noopener', text: label }));
        } else {
          parent.appendChild(document.createTextNode(label));
        }
      } else {
        parent.appendChild(h('em', { text: token.slice(1, -1) }));
      }
      last = match.index + token.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMarkdown(target, source) {
    target.textContent = '';
    var lines = String(source).split(/\n/);
    var list = null;
    var fence = TICK + TICK + TICK;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line.indexOf(fence) === 0) {
        var code = [];
        i++;
        while (i < lines.length && lines[i].indexOf(fence) !== 0) { code.push(lines[i]); i++; }
        list = null;
        var pre = h('pre', { class: 'code' });
        pre.appendChild(document.createTextNode(code.join('\n')));
        target.appendChild(pre);
        continue;
      }

      if (!line.trim()) { list = null; continue; }

      var heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        list = null;
        var size = heading[1].length;
        var node = h('h' + Math.min(size + 1, 5), {});
        inlineInto(node, heading[2]);
        target.appendChild(node);
        continue;
      }

      if (/^\s*([-*])\s+/.test(line)) {
        if (!list || list.tagName !== 'UL') { list = h('ul', {}); target.appendChild(list); }
        var li = h('li', {});
        inlineInto(li, line.replace(/^\s*([-*])\s+/, ''));
        list.appendChild(li);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        if (!list || list.tagName !== 'OL') { list = h('ol', {}); target.appendChild(list); }
        var oli = h('li', {});
        inlineInto(oli, line.replace(/^\s*\d+\.\s+/, ''));
        list.appendChild(oli);
        continue;
      }

      if (line.indexOf('>') === 0) {
        list = null;
        var quote = h('blockquote', {});
        inlineInto(quote, line.replace(/^>\s?/, ''));
        target.appendChild(quote);
        continue;
      }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        list = null;
        target.appendChild(h('hr', {}));
        continue;
      }

      list = null;
      var para = h('p', {});
      inlineInto(para, line);
      target.appendChild(para);
    }
  }

  VIEWS.markdown = function (panel) {
    var input = area('# 标题\n\n- 列表项\n- **加粗** 与 *斜体*\n\n> 引用');
    var preview = h('div', { class: 'md' });
    var status = h('div', { class: 'muted', text: '左侧输入，右侧实时渲染。' });
    var split = h('div', { class: 'md-split' }, input, preview);
    panel.appendChild(split);
    panel.appendChild(status);

    input.addEventListener('input', function () {
      renderMarkdown(preview, input.value);
      status.textContent = input.value.length + ' 字符 · ' + input.value.split(/\n/).length + ' 行';
    });
    renderMarkdown(preview, input.value);
    status.textContent = input.value.length + ' 字符 · ' + input.value.split(/\n/).length + ' 行';
  };

  // ---- toolkit ports ------------------------------------------------------
  //
  // Each of these is a thin UI over src/toolkit-core. The heavy lifting lives
  // in the module, which is also what the tests exercise — keep the view dumb:
  // read the input, call one function, show the result.

  VIEWS.case = async function (panel) {
    var t = await core('text.js');
    var input = area('hello world、helloWorld、hello-world…');
    input.value = 'hello world';
    var table = h('table', { class: 'kv' });
    var styles = [
      ['camel', 'camelCase'], ['pascal', 'PascalCase'], ['snake', 'snake_case'],
      ['kebab', 'kebab-case'], ['constant', 'CONSTANT_CASE'], ['title', 'Title Case'],
      ['sentence', 'Sentence case'], ['upper', 'UPPERCASE'], ['lower', 'lowercase']
    ];
    var values = {};

    function run() {
      table.replaceChildren();
      for (var i = 0; i < styles.length; i++) {
        var r = t.convertCase(input.value, styles[i][0]);
        values[styles[i][1]] = r.ok ? r.value : '';
        table.appendChild(h('tr', {},
          h('th', { text: styles[i][1] }),
          h('td', { text: r.ok ? r.value : '—' })
        ));
      }
    }
    function all() {
      var lines = [];
      for (var i = 0; i < styles.length; i++) lines.push(styles[i][1] + ': ' + values[styles[i][1]]);
      return lines.join('\n');
    }

    input.addEventListener('input', run);
    panel.appendChild(block('输入', input));
    panel.appendChild(block('结果', table));
    panel.appendChild(row(copyBtn(all)));
    run();
  };

  VIEWS.counter = async function (panel) {
    var t = await core('text.js');
    var input = area('把文本放进来，边打边算…');
    input.value = '把一段文字放进来，这里会实时统计。\n第二行也算。';
    var table = h('table', { class: 'kv' });

    function run() {
      var s = t.countText(input.value);
      var rows = [
        ['字符数', s.characters],
        ['不含空白', s.charactersNoSpaces],
        ['词数', s.words],
        ['行数', s.lines],
        ['段落数', s.paragraphs],
        ['句数', s.sentences],
        ['字节数 UTF-8', s.bytes],
        ['阅读时长', s.readingTime],
        ['朗读时长', s.speakingTime]
      ];
      table.replaceChildren();
      for (var i = 0; i < rows.length; i++) {
        table.appendChild(h('tr', {}, h('th', { text: rows[i][0] }), h('td', { text: String(rows[i][1]) })));
      }
    }

    input.addEventListener('input', run);
    panel.appendChild(block('文本', input));
    panel.appendChild(block('统计', table));
    run();
  };

  VIEWS.lines = async function (panel) {
    var t = await core('text.js');
    var input = area('每行一条…');
    input.value = 'banana\napple\nbanana\n\ncherry';
    var status = h('div', { class: 'muted', text: '按顺序点，效果会叠加。' });
    var ops = [
      ['去重', 'dedupe-lines'],
      ['升序', 'sort-lines'],
      ['降序', 'sort-lines-desc'],
      ['去空行', 'remove-empty-lines'],
      ['去首尾空格', 'trim-lines'],
      ['加行号', 'number-lines'],
      ['打乱', 'shuffle-lines'],
      ['反转', 'reverse']
    ];

    function apply(op) {
      var r = t.transformText(input.value, [op]);
      if (!r.ok) { status.textContent = r.error; return; }
      input.value = r.value;
      status.textContent = op + ' → ' + input.value.split('\n').length + ' 行';
    }

    var bar = h('div', { class: 'row' });
    for (var i = 0; i < ops.length; i++) {
      bar.appendChild((function (pair) {
        return btn(pair[0], function () { apply(pair[1]); });
      })(ops[i]));
    }

    panel.appendChild(block('文本', input));
    panel.appendChild(block('操作', bar));
    panel.appendChild(row(
      copyBtn(function () { return input.value; }),
      btn('清空', function () { input.value = ''; status.textContent = ''; }, true)
    ));
    panel.appendChild(status);
  };

  VIEWS.hex = async function (panel) {
    var e = await core('encoding.js');
    var input = area('文本或十六进制，例如 48 69');
    input.value = 'xentool';
    var sep = line('分隔符，留空表示不加', ' ');
    var result = out('');

    function run(mode) {
      var r = mode === 'encode' ? e.encodeHex(input.value, sep.value) : e.decodeHex(input.value);
      result.textContent = r.ok ? r.value : (mode === 'encode' ? '编码失败：' : '解码失败：') + r.error;
    }

    panel.appendChild(block('输入', input));
    panel.appendChild(row(sep));
    panel.appendChild(row(btn('编码', function () { run('encode'); }, true), btn('解码', function () { run('decode'); }), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run('encode');
  };

  VIEWS.unicode = async function (panel) {
    var e = await core('encoding.js');
    var input = area('字符，或 \\u4e2d 这样的码点');
    input.value = 'xentool 边缘';
    var table = h('table', { class: 'kv' });
    var result = out('');

    function run() {
      var r = e.textToUnicode(input.value);
      table.replaceChildren();
      if (!r.ok) { result.textContent = r.error; return; }
      table.appendChild(datatable(['字符', '码点', '名称'], r.value.codePoints.map(function (cp) {
        return [cp.char, cp.code, cp.name || '—'];
      })));
      result.textContent = '';
    }

    function decode() {
      var r = e.unicodeToText(input.value);
      result.textContent = r.ok ? r.value : '解码失败：' + r.error;
    }

    input.addEventListener('input', run);
    panel.appendChild(block('输入', input));
    panel.appendChild(row(btn('解码为文本', decode, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('码点', table));
    panel.appendChild(block('解码结果', result));
    run();
  };

  VIEWS.htmlent = async function (panel) {
    var e = await core('encoding.js');
    var input = area('<a href="x">链接</a> 或 &lt;a&gt;');
    input.value = '<a href="x">链接</a>';
    var result = out('');

    function run(mode) {
      var r = mode === 'encode' ? e.encodeHtmlEntities(input.value) : e.decodeHtmlEntities(input.value);
      result.textContent = r.ok ? r.value : r.error;
    }

    panel.appendChild(block('输入', input));
    panel.appendChild(row(btn('编码', function () { run('encode'); }, true), btn('解码', function () { run('decode'); }), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run('encode');
  };

  VIEWS.morse = async function (panel) {
    var e = await core('encoding.js');
    var input = area('SOS 或 ... --- ...');
    input.value = 'SOS';
    var result = out('');

    function run(mode) {
      var r = mode === 'encode' ? e.textToMorse(input.value) : e.morseToText(input.value);
      result.textContent = r.ok ? r.value : r.error;
    }

    panel.appendChild(block('输入', input));
    panel.appendChild(row(btn('编码', function () { run('encode'); }, true), btn('解码', function () { run('decode'); }), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run('encode');
  };

  VIEWS.caesar = async function (panel) {
    var e = await core('encoding.js');
    var input = area('Hello, World');
    input.value = 'Hello, World';
    var shift = line('位移', '13', 'number');
    var result = out('');

    function run(mode) {
      var n = parseInt(shift.value, 10);
      if (isNaN(n)) { result.textContent = '位移要是数字'; return; }
      var delta = mode === 'encode' ? n : -n;
      var r = n === 13 ? e.rot13(input.value) : e.caesarCipher(input.value, delta);
      result.textContent = r.ok ? r.value : r.error;
    }

    panel.appendChild(block('输入', input));
    panel.appendChild(row(shift));
    panel.appendChild(row(btn('加密', function () { run('encode'); }, true), btn('解密', function () { run('decode'); }), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run('encode');
  };

  VIEWS.escape = async function (panel) {
    var t = await core('text.js');
    var input = area('含引号、换行、反斜杠的字符串…');
    input.value = 'he said "hi"\\n\\ttab';
    var lang = 'javascript';
    var result = out('');

    function run(mode) {
      var r = mode === 'escape' ? t.escapeString(input.value, lang) : t.unescapeString(input.value);
      result.textContent = r.ok ? r.value : r.error;
    }

    panel.appendChild(block('输入', input));
    panel.appendChild(row(picker([
      ['javascript', 'JavaScript'], ['python', 'Python'], ['java', 'Java'], ['c', 'C / C++']
    ], lang, function (v) { lang = v; run('escape'); })));
    panel.appendChild(row(btn('转义', function () { run('escape'); }, true), btn('反转义', function () { run('unescape'); }), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run('escape');
  };

  VIEWS.curl = async function (panel) {
    var n = await core('network.js');
    var input = area("curl -X POST https://api.example.com/v1/items -H 'content-type: application/json' -d '{\"a\":1}'");
    input.value = "curl -X POST https://api.example.com/v1/items -H 'content-type: application/json' -d '{\"a\":1}'";
    var target = 'fetch';
    var result = out('');

    function run() {
      var r = n.convertCurl(input.value);
      result.textContent = r.ok ? r.value[target] : '解析失败：' + r.error;
    }

    panel.appendChild(block('curl 命令', input));
    panel.appendChild(row(picker([
      ['fetch', 'fetch'], ['axios', 'axios'], ['python', 'Python requests'], ['go', 'Go'], ['php', 'PHP']
    ], target, function (v) { target = v; run(); })));
    panel.appendChild(row(btn('转换', run, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    run();
  };

  VIEWS.roman = async function (panel) {
    var n = await core('number.js');
    var input = line('1994 或 MCMXCIV', '1994');
    var result = out('');
    var hint = h('div', { class: 'muted', text: '输入数字自动转罗马，输入字母自动转数字。' });

    function run() {
      var value = input.value.trim();
      if (!value) { result.textContent = ''; return; }
      var r = /^[0-9]+$/.test(value) ? n.toRoman(parseInt(value, 10)) : n.fromRoman(value.toUpperCase());
      result.textContent = r.ok ? String(r.value) : r.error;
    }

    input.addEventListener('input', run);
    panel.appendChild(block('输入', input));
    panel.appendChild(row(btn('转换', run, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    panel.appendChild(hint);
    run();
  };

  VIEWS.base = async function (panel) {
    var n = await core('number.js');
    var input = line('要转换的整数', '255');
    var from = '10';
    var to = '16';
    var result = out('');
    var table = h('table', { class: 'kv' });

    function run() {
      var r = n.convertBase(input.value.trim(), parseInt(from, 10), parseInt(to, 10));
      result.textContent = r.ok ? r.value : r.error;
      table.replaceChildren();
      var bases = [2, 8, 10, 16, 36];
      for (var i = 0; i < bases.length; i++) {
        var one = n.convertBase(input.value.trim(), parseInt(from, 10), bases[i]);
        table.appendChild(h('tr', {}, h('th', { text: bases[i] + ' 进制' }), h('td', { text: one.ok ? one.value : '—' })));
      }
    }

    input.addEventListener('input', run);
    panel.appendChild(block('输入', input));
    panel.appendChild(row(
      h('span', { class: 'muted', text: '从' }), picker([['2', '2'], ['8', '8'], ['10', '10'], ['16', '16'], ['36', '36']], from, function (v) { from = v; run(); }),
      h('span', { class: 'muted', text: '转' }), picker([['2', '2'], ['8', '8'], ['10', '10'], ['16', '16'], ['36', '36']], to, function (v) { to = v; run(); })
    ));
    panel.appendChild(row(btn('转换', run, true), copyBtn(function () { return result.textContent; })));
    panel.appendChild(block('结果', result));
    panel.appendChild(block('常用进制', table));
    run();
  };

  VIEWS.urlparse = async function (panel) {
    var n = await core('network.js');
    var input = line('粘贴完整 URL', 'https://user:pw@example.com:8443/a/b?q=1&r=2#top');
    var table = h('table', { class: 'kv' });
    var params = h('table', { class: 'kv' });

    function run() {
      var r = n.parseUrl(input.value.trim());
      table.replaceChildren();
      params.replaceChildren();
      if (!r.ok) {
        table.appendChild(h('tr', {}, h('td', { text: r.error })));
        return;
      }
      var v = r.value;
      var rows = [
        ['协议', v.protocol], ['主机', v.host], ['主机名', v.hostname],
        ['端口', v.port], ['路径', v.pathname], ['查询', v.search],
        ['锚点', v.hash], ['用户名', v.username], ['密码', v.password ? '（已隐藏）' : '']
      ];
      for (var i = 0; i < rows.length; i++) {
        table.appendChild(h('tr', {}, h('th', { text: rows[i][0] }), h('td', { text: rows[i][1] == null || rows[i][1] === '' ? '—' : String(rows[i][1]) })));
      }
      var keys = Object.keys(v.params || {});
      if (keys.length) {
        params.appendChild(h('tr', {}, h('th', { text: '参数' }), h('th', { text: '值' })));
        for (var k = 0; k < keys.length; k++) {
          params.appendChild(h('tr', {}, h('td', { text: keys[k] }), h('td', { text: String(v.params[keys[k]]) })));
        }
      }
    }

    input.addEventListener('input', run);
    panel.appendChild(block('URL', input));
    panel.appendChild(block('拆解', table));
    panel.appendChild(block('查询参数', params));
    run();
  };

  VIEWS.httpcode = async function (panel) {
    var n = await core('network.js');
    var input = line('输入 404 或 not found', '');
    var table = h('table', { class: 'kv' });
    var hint = h('div', { class: 'muted', text: '留空显示常用状态码，输入数字或关键字过滤。' });

    function run() {
      var query = input.value.trim();
      var rows = n.searchHttpStatus(query);
      // An empty query lists codes from 100 upwards, which buries the ones
      // people actually look up. Show the common set first instead.
      if (!query) {
        var common = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 405, 409, 422, 429, 500, 502, 503, 504];
        rows = common.map(function (code) {
          for (var i = 0; i < rows.length; i++) if (rows[i].code === code) return rows[i];
          return null;
        }).filter(Boolean);
      }
      table.replaceChildren();
      if (!rows || !rows.length) {
        table.appendChild(h('tr', {}, h('td', { text: '没有匹配的状态码' })));
        return;
      }
      table.appendChild(datatable(['码', '含义', '说明'], rows.slice(0, 20).map(function (r) {
        return [r.code, r.message, r.description];
      })));
    }

    input.addEventListener('input', run);
    panel.appendChild(block('查询', input));
    panel.appendChild(block('结果', table));
    panel.appendChild(hint);
    run();
  };

  VIEWS.mime = async function (panel) {
    var n = await core('network.js');
    var input = line('输入 .json 或 image', '');
    var table = h('table', { class: 'kv' });
    var hint = h('div', { class: 'muted', text: '按扩展名或 MIME 关键字过滤。' });

    function run() {
      var rows = n.searchMimeTypes(input.value.trim());
      table.replaceChildren();
      if (!rows || !rows.length) {
        table.appendChild(h('tr', {}, h('td', { text: '没有匹配的 MIME 类型' })));
        return;
      }
      table.appendChild(datatable(['扩展名', 'Content-Type', '说明'], rows.slice(0, 20).map(function (r) {
        return [r.extension, r.mimeType, r.description];
      })));
    }

    input.addEventListener('input', run);
    panel.appendChild(block('查询', input));
    panel.appendChild(block('结果', table));
    panel.appendChild(hint);
    run();
  };

  var cleanup = null;
  var renderSeq = 0;

  function render(id) {
    if (cleanup) { cleanup(); cleanup = null; }
    var tool = null;
    for (var i = 0; i < meta.length; i++) if (meta[i].id === id) tool = meta[i];
    if (!tool) tool = meta[0];
    titleEl.textContent = tool.name;
    descEl.textContent = tool.desc;
    document.title = tool.name + ' · xentool';

    /*
     * Views may be async: the ones backed by /core/*.js await an import before
     * they can build anything. Building into a detached node and swapping it
     * in at the end keeps a slow module from painting into a panel the user
     * has already navigated away from — a fast click on two tools in a row
     * would otherwise mix both UIs together.
     */
    var seq = ++renderSeq;
    var panel = document.createElement('div');
    panelEl.replaceChildren();
    var view = VIEWS[tool.id];

    var show = function (meta) {
      if (seq !== renderSeq) {
        if (typeof meta === 'function') meta();
        return;
      }
      panelEl.replaceChildren(panel);
      if (typeof meta === 'function') cleanup = meta;
    };

    if (!view) {
      panel.appendChild(h('p', { class: 'muted', text: '该工具暂未实现。' }));
      show(null);
    } else {
      Promise.resolve(view(panel)).then(show).catch(function (err) {
        if (seq !== renderSeq) return;
        panel.replaceChildren(h('p', { class: 'error', text: '模块加载失败：' + err.message }));
        show(null);
      });
    }

    // Keep both the desktop sidebar and the mobile drawer in sync: the drawer
    // is the only catalog below 900px, so a stale highlight there means the
    // user cannot tell which tool they are looking at.
    var groups = [navEl, document.getElementById('drawer-body')];
    for (var g = 0; g < groups.length; g++) {
      if (!groups[g]) continue;
      var links = groups[g].querySelectorAll('a');
      for (var j = 0; j < links.length; j++) {
        var on = links[j].getAttribute('data-id') === tool.id;
        links[j].classList.toggle('active', on);
        if (on) links[j].setAttribute('aria-current', 'page');
        else links[j].removeAttribute('aria-current');
      }
    }

    var label = document.getElementById('drawer-label');
    if (label) label.textContent = '工具目录 · ' + tool.name;
  }

  function route() {
    render((location.hash || '').replace('#', '') || 'url');
  }

  // ---- mobile drawer ------------------------------------------------------
  var drawer = document.getElementById('drawer');
  var backdrop = document.getElementById('drawer-backdrop');
  var openBtn = document.getElementById('drawer-open');
  var closeBtn = document.getElementById('drawer-close');
  var drawerBody = document.getElementById('drawer-body');

  if (drawer && drawerBody && navEl) {
    // Clone once at boot: the drawer is a second view of the same list, so
    // there is no second source of truth to keep in sync. cloneNode keeps the
    // "no innerHTML with markup" rule intact even though this source is
    // server-rendered and contains no user data.
    drawerBody.appendChild(navEl.cloneNode(true));

    var lastFocus = null;
    function openDrawer() {
      lastFocus = document.activeElement;
      drawer.classList.add('open');
      backdrop.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      setBackgroundInert(true);
      if (closeBtn) closeBtn.focus();
    }
    function closeDrawer(restore) {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      setBackgroundInert(false);
      if (restore && lastFocus && lastFocus.focus) lastFocus.focus();
    }

    /*
     * Take the page behind the drawer out of the tab order and out of the
     * accessibility tree while it is covered. The focus trap keeps the caret
     * inside the drawer; this also stops a screen reader from walking into
     * content the user cannot see. The inert attribute does both at once.
     */
    function setBackgroundInert(on) {
      var background = [document.querySelector('.x-top'), document.querySelector('.wrap')];
      for (var i = 0; i < background.length; i++) {
        if (!background[i]) continue;
        if (on) background[i].setAttribute('inert', '');
        else background[i].removeAttribute('inert');
      }
    }

    // Focus trap. Without it, Tab walks straight out of the drawer into the
    // page behind it — which is invisible under the backdrop, so a keyboard
    // user is left tabbing through content they cannot see.
    function trapFocus(e) {
      if (e.key !== 'Tab' || !drawer.classList.contains('open')) return;
      var focusable = Array.prototype.slice.call(
        drawer.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(function(el){
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    if (openBtn) openBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', function(){ closeDrawer(true); });
    if (backdrop) backdrop.addEventListener('click', function(){ closeDrawer(true); });

    drawerBody.addEventListener('click', function(e){
      if (e.target.closest('a')) closeDrawer(false);
    });

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(true);
      else trapFocus(e);
    });
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
          `<a href="#${escapeHtml(tool.id)}" data-id="${escapeHtml(tool.id)}"><span>${escapeHtml(tool.name)}</span></a>`,
      )
      .join("");
    return `<div class="group"><h2 class="group-name">${escapeHtml(cat.name)}</h2>${items}</div>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>工具台 · ${brand}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>
${TOKENS}
${BASE_CSS}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.42}
.aura .a1{width:460px;height:460px;left:-160px;top:-160px;background:rgba(34,211,238,.30)}
.aura .a2{width:420px;height:420px;right:-140px;top:-100px;background:rgba(167,139,250,.26)}
.wrap{position:relative;z-index:1;max-width:var(--content);margin:0 auto;padding:26px 24px 72px;display:grid;grid-template-columns:var(--sidebar) minmax(0,1fr);gap:28px;align-items:start}
nav{position:sticky;top:calc(var(--nav-h) + 16px);display:flex;flex-direction:column;gap:16px;max-height:calc(100dvh - var(--nav-h) - 32px);overflow-y:auto;scrollbar-width:thin}
.group-name{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 6px 10px;font-weight:500}
nav a{display:flex;align-items:center;min-height:36px;padding:0 11px;border-left:2px solid transparent;border-radius:0 8px 8px 0;color:var(--dim);text-decoration:none;font-size:13.5px;transition:background .16s var(--ease),color .16s var(--ease),border-color .16s var(--ease)}
nav a:hover{background:var(--surface-2);color:var(--ink)}
nav a.active{background:rgba(34,211,238,.11);border-left-color:var(--cyan);color:var(--cyan);font-weight:550}
nav a:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
main{min-width:0}
h1{margin:0;font-size:23px;font-weight:600;letter-spacing:-.02em}
.desc{margin:6px 0 22px;color:var(--dim);font-size:13.5px}
.block{margin-bottom:18px}
.label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:7px}
.area,.input{width:100%;background:rgba(255,255,255,.04);border:1px solid var(--line-2);border-radius:10px;color:var(--ink);font-size:var(--field-fs);padding:11px 13px;outline:none;transition:border-color .18s,box-shadow .18s;font-family:inherit}
.area{resize:vertical;min-height:120px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.6}
.input.short{width:auto;min-width:120px}
.area:focus,.input:focus{border-color:rgba(34,211,238,.5);box-shadow:0 0 0 4px rgba(34,211,238,.09)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
.btn{appearance:none;border:1px solid var(--line-2);background:var(--surface-2);color:var(--ink);padding:0 15px;height:36px;border-radius:9px;font-size:13px;cursor:pointer;transition:background .16s,border-color .16s,transform .1s;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.btn:hover{background:var(--surface-3);border-color:rgba(255,255,255,.22)}
.btn:active{transform:translateY(1px)}
.btn:focus-visible{outline:none;box-shadow:var(--sh-glow);border-color:rgba(34,211,238,.5)}
.btn.primary{background:linear-gradient(135deg,#22d3ee,#a78bfa);border-color:transparent;color:#05070b;font-weight:650;box-shadow:0 6px 18px -10px rgba(34,211,238,.85)}
.btn.primary:hover{filter:brightness(1.07)}
.out{background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:13px;font:12.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd3dc;white-space:pre-wrap;word-break:break-all;min-height:44px;margin:0;max-height:340px;overflow:auto}
.kv{width:100%;border-collapse:collapse;font-size:13px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.kv th,.kv td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.kv tr:last-child th,.kv tr:last-child td{border-bottom:0}
.kv th{color:var(--dim);font-weight:500;white-space:nowrap;width:1%;background:rgba(255,255,255,.02)}
.kv td{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
.kv-data tr:first-child th{background:rgba(255,255,255,.04);color:var(--ink-2);font-weight:600}
.error{color:#fca5a5;font-size:13px;margin:8px 0 0}
.swatch{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:#22d3ee;flex:none}
.md-split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.md-split textarea{min-height:300px}
.md{border:1px solid var(--line);border-radius:10px;background:rgba(0,0,0,.25);padding:16px;min-height:300px;max-height:520px;overflow:auto;font-size:13.5px;line-height:1.7}
.md h2,.md h3,.md h4,.md h5{margin:14px 0 8px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.md h2:first-child{margin-top:0}
.md p{margin:0 0 10px}
.md ul,.md ol{margin:0 0 10px;padding-left:22px}
.md li{margin:3px 0}
.md code{font-family:ui-monospace,monospace;font-size:12.5px;background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px}
.md pre.code{background:rgba(0,0,0,.45);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font:12.5px/1.6 ui-monospace,monospace;white-space:pre-wrap;margin:0 0 10px}
.md blockquote{margin:0 0 10px;padding:6px 0 6px 14px;border-left:2px solid rgba(34,211,238,.45);color:var(--dim)}
.md hr{border:0;border-top:1px solid var(--line);margin:16px 0}
.md a{color:var(--cyan)}
.muted{color:var(--dim);font-size:13px}

/* Mobile catalog: a 240px sidebar cannot survive 100+ tools next to a 320px
   viewport, and a horizontal strip of every tool is unusable at that count.
   Below 900px the sidebar becomes a drawer opened from a single button. */
.drawer-btn{display:none}
.drawer-backdrop{display:none;position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.55);backdrop-filter:blur(2px);opacity:0;transition:opacity .2s var(--ease)}
.drawer-backdrop.open{display:block;opacity:1}
.drawer{position:fixed;top:0;left:0;bottom:0;z-index:41;width:min(88vw,340px);transform:translateX(-100%);transition:transform .24s var(--ease);background:var(--bg-elev);border-right:1px solid var(--line);display:flex;flex-direction:column}
.drawer.open{transform:none}
.drawer__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);flex:none}
.drawer__title{font-size:13px;font-weight:600;letter-spacing:.02em}
.drawer__close{appearance:none;width:var(--tap);height:var(--tap);display:grid;place-items:center;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink-2);cursor:pointer;flex:none}
.drawer__close svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.drawer__body{flex:1;overflow-y:auto;padding:14px 10px 24px;display:flex;flex-direction:column;gap:16px}
.drawer__body a{min-height:var(--tap)}
@media (max-width:900px){
  .wrap{grid-template-columns:minmax(0,1fr);gap:18px;padding:18px 16px 56px}
  nav{display:none}
  /* The drawer holds a clone of the sidebar, so it must override the rule
     above — otherwise the drawer opens to an empty panel on every phone. */
  .drawer__body nav{display:flex;position:static;max-height:none;overflow:visible}
  .drawer-btn{display:inline-flex;align-items:center;gap:8px;height:var(--tap);padding:0 14px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface);color:var(--ink);font:500 13px/1 inherit;cursor:pointer;margin:0 0 16px;max-width:100%}
  .drawer-btn svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round}
  .drawer-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .md-split{grid-template-columns:1fr}
  h1{font-size:20px}
}
@media (max-width:640px){
  .md-split textarea,.md{min-height:220px}
}
@media (pointer:coarse){
  .btn{height:var(--tap);padding:0 16px}
  .btn.primary{height:var(--tap)}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span></div>
${topbar({ brand, back: "/", backLabel: "返回工具库" })}
<div class="wrap">
  <nav id="nav" aria-label="工具目录">${nav}</nav>
  <main>
    <button class="drawer-btn" id="drawer-open" type="button" aria-expanded="false" aria-controls="drawer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      <span id="drawer-label">工具目录</span>
    </button>
    <h1 id="title">工具台</h1>
    <p class="desc" id="desc">所有计算在浏览器本地完成，不上传、不记录。</p>
    <div id="panel"></div>
  </main>
</div>
<div class="drawer-backdrop" id="drawer-backdrop"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="工具目录" aria-hidden="true">
  <div class="drawer__head">
    <span class="drawer__title">工具目录</span>
    <button class="drawer__close" id="drawer-close" type="button" aria-label="关闭目录">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="drawer__body" id="drawer-body"></div>
</aside>
<script id="meta" type="application/json">${metaJson}</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}
