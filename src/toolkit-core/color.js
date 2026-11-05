/*
 * Ported from it-toolbox packages/core/color.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function parseHex(hex) {
  try {
    let h = hex.replace("#", "");
    if (h.length === 3) {
      h = h.split("").map((c) => c + c).join("");
    }
    if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
      return { ok: false, error: "Invalid hex color" };
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { ok: true, value: { r, g, b } };
  } catch {
    return { ok: false, error: "Invalid hex color" };
  }
}
function rgbToHex(rgb) {
  const toHex = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}
function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function rgbToHsv(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}
function rgbToCmyk(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}
function hslToRgb(hsl) {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p2, q2, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
      if (t < 1 / 2) return q2;
      if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
      return p2;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}
function hsvToRgb(hsv) {
  const h = hsv.h / 360;
  const s = hsv.s / 100;
  const v = hsv.v / 100;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}
function convertColor(hex) {
  const rgbResult = parseHex(hex);
  if (!rgbResult.ok) return rgbResult;
  const rgb = rgbResult.value;
  return {
    ok: true,
    value: {
      hex: rgbToHex(rgb),
      rgb,
      hsl: rgbToHsl(rgb),
      hsv: rgbToHsv(rgb),
      cmyk: rgbToCmyk(rgb)
    }
  };
}
function convertColorFromRgb(rgb) {
  return {
    hex: rgbToHex(rgb),
    rgb,
    hsl: rgbToHsl(rgb),
    hsv: rgbToHsv(rgb),
    cmyk: rgbToCmyk(rgb)
  };
}
function generateCssGradient(config) {
  const stopsStr = config.stops.map((s) => `${s.color} ${s.position}%`).join(", ");
  switch (config.type) {
    case "linear":
      return `linear-gradient(${config.angle}deg, ${stopsStr})`;
    case "radial":
      return `radial-gradient(circle, ${stopsStr})`;
    case "conic":
      return `conic-gradient(from ${config.angle}deg, ${stopsStr})`;
  }
}
function generateColorPalette(baseColor, scheme) {
  const rgb = parseHex(baseColor);
  if (!rgb.ok) return [];
  const hsl = rgbToHsl(rgb.value);
  const colors = [];
  switch (scheme) {
    case "analogous":
      colors.push(
        rgbToHex(hslToRgb({ h: (hsl.h - 30 + 360) % 360, s: hsl.s, l: hsl.l })),
        baseColor,
        rgbToHex(hslToRgb({ h: (hsl.h + 30) % 360, s: hsl.s, l: hsl.l }))
      );
      break;
    case "complementary":
      colors.push(
        baseColor,
        rgbToHex(hslToRgb({ h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l }))
      );
      break;
    case "triadic":
      colors.push(
        baseColor,
        rgbToHex(hslToRgb({ h: (hsl.h + 120) % 360, s: hsl.s, l: hsl.l })),
        rgbToHex(hslToRgb({ h: (hsl.h + 240) % 360, s: hsl.s, l: hsl.l }))
      );
      break;
    case "tetradic":
      colors.push(
        baseColor,
        rgbToHex(hslToRgb({ h: (hsl.h + 90) % 360, s: hsl.s, l: hsl.l })),
        rgbToHex(hslToRgb({ h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l })),
        rgbToHex(hslToRgb({ h: (hsl.h + 270) % 360, s: hsl.s, l: hsl.l }))
      );
      break;
  }
  return colors;
}
function getLuminance(rgb) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function getContrastRatio(foreground, background) {
  const fgRgb = parseHex(foreground);
  const bgRgb = parseHex(background);
  if (!fgRgb.ok) return { ok: false, error: "Invalid foreground color" };
  if (!bgRgb.ok) return { ok: false, error: "Invalid background color" };
  const fgLum = getLuminance(fgRgb.value);
  const bgLum = getLuminance(bgRgb.value);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return { ok: true, value: ratio };
}
function checkContrast(foreground, background) {
  const ratioResult = getContrastRatio(foreground, background);
  if (!ratioResult.ok) return ratioResult;
  const ratio = ratioResult.value;
  return {
    ok: true,
    value: {
      ratio,
      aaNormal: ratio >= 4.5,
      aaLarge: ratio >= 3,
      aaaNormal: ratio >= 7,
      aaaLarge: ratio >= 4.5
    }
  };
}
const TAILWIND_COLORS = {
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617"
  },
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
    950: "#030712"
  },
  red: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
    950: "#450a0a"
  },
  orange: {
    50: "#fff7ed",
    100: "#ffedd5",
    200: "#fed7aa",
    300: "#fdba74",
    400: "#fb923c",
    500: "#f97316",
    600: "#ea580c",
    700: "#c2410c",
    800: "#9a3412",
    900: "#7c2d12",
    950: "#431407"
  },
  yellow: {
    50: "#fefce8",
    100: "#fef9c3",
    200: "#fef08a",
    300: "#fde047",
    400: "#facc15",
    500: "#eab308",
    600: "#ca8a04",
    700: "#a16207",
    800: "#854d0e",
    900: "#713f12",
    950: "#422006"
  },
  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
    950: "#052e16"
  },
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554"
  },
  indigo: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
    950: "#1e1b4b"
  },
  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
    950: "#3b0764"
  },
  pink: {
    50: "#fdf2f8",
    100: "#fce7f3",
    200: "#fbcfe8",
    300: "#f9a8d4",
    400: "#f472b6",
    500: "#ec4899",
    600: "#db2777",
    700: "#be185d",
    800: "#9d174d",
    900: "#831843",
    950: "#500724"
  }
};
function simulateColorBlindness(hex, type) {
  const rgbResult = parseHex(hex);
  if (!rgbResult.ok) return hex;
  const { r, g, b } = rgbResult.value;
  const matrices = {
    protanopia: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
    deuteranopia: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
    tritanopia: [[0.95, 0.05, 0], [0, 0.433, 0.567], [0, 0.475, 0.525]],
    protanomaly: [[0.817, 0.183, 0], [0.333, 0.667, 0], [0, 0.125, 0.875]],
    deuteranomaly: [[0.8, 0.2, 0], [0.258, 0.742, 0], [0, 0.142, 0.858]],
    tritanomaly: [[0.967, 0.033, 0], [0, 0.733, 0.267], [0, 0.183, 0.817]],
    achromatopsia: [[0.299, 0.587, 0.114], [0.299, 0.587, 0.114], [0.299, 0.587, 0.114]],
    achromatomaly: [[0.618, 0.32, 0.062], [0.163, 0.775, 0.062], [0.163, 0.32, 0.516]]
  };
  const matrix = matrices[type];
  const newR = Math.round(matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b);
  const newG = Math.round(matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b);
  const newB = Math.round(matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b);
  return rgbToHex({ r: Math.min(255, Math.max(0, newR)), g: Math.min(255, Math.max(0, newG)), b: Math.min(255, Math.max(0, newB)) });
}
function generateBoxShadow(configs) {
  return configs.map((c) => `${c.inset ? "inset " : ""}${c.x}px ${c.y}px ${c.blur}px ${c.spread}px ${c.color}`).join(", ");
}
export {
  TAILWIND_COLORS,
  checkContrast,
  convertColor,
  convertColorFromRgb,
  generateBoxShadow,
  generateColorPalette,
  generateCssGradient,
  getContrastRatio,
  hslToRgb,
  hsvToRgb,
  parseHex,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  simulateColorBlindness
};
