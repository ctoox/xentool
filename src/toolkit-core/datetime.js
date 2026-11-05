/*
 * Ported from it-toolbox packages/core/datetime.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function parseTimestamp(input) {
  try {
    let date;
    const raw = typeof input === "number" ? String(input) : input.trim();
    const num = typeof input === "number" ? input : /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    if (isNaN(num)) {
      date = new Date(raw);
    } else {
      if (num > 1e12) {
        date = new Date(num);
      } else {
        date = new Date(num * 1e3);
      }
    }
    if (isNaN(date.getTime())) {
      return { ok: false, error: "Invalid timestamp or date" };
    }
    return {
      ok: true,
      value: {
        unix: Math.floor(date.getTime() / 1e3),
        unixMs: date.getTime(),
        iso: date.toISOString(),
        utc: date.toUTCString(),
        local: date.toLocaleString(),
        date
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function nowTimestamp() {
  const date = /* @__PURE__ */ new Date();
  return {
    unix: Math.floor(date.getTime() / 1e3),
    unixMs: date.getTime(),
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toLocaleString(),
    date
  };
}
function dateToTimestamp(date, unit = "s") {
  return unit === "s" ? Math.floor(date.getTime() / 1e3) : date.getTime();
}
function dateDifference(date1, date2) {
  const ms = Math.abs(date2.getTime() - date1.getTime());
  const seconds = Math.floor(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const totalDays = Math.floor(hours / 24);
  const weeks = Math.floor(totalDays / 7);
  let years = date2.getFullYear() - date1.getFullYear();
  let months = date2.getMonth() - date1.getMonth();
  let days = date2.getDate() - date1.getDate();
  if (days < 0) {
    months--;
    const prevMonth = new Date(date2.getFullYear(), date2.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days, totalDays, weeks, hours, minutes, seconds };
}
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function parseDuration(input) {
  try {
    if (/^\d+$/.test(input)) {
      return { ok: true, value: parseInt(input, 10) };
    }
    const match = input.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = match[3] ? parseInt(match[3], 10) : 0;
      return { ok: true, value: h * 3600 + m * 60 + s };
    }
    return { ok: false, error: "Invalid duration format" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function humanizeDuration(seconds) {
  if (seconds < 60) return `${seconds} \u79D2`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} \u5206\u949F`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} \u5C0F\u65F6`;
  if (seconds < 2592e3) return `${Math.floor(seconds / 86400)} \u5929`;
  if (seconds < 31536e3) return `${Math.floor(seconds / 2592e3)} \u4E2A\u6708`;
  return `${Math.floor(seconds / 31536e3)} \u5E74`;
}
function generateCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  const startPadding = firstDay.getDay();
  const prevMonth = new Date(year, month, 0);
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonth.getDate() - i);
    days.push({
      date,
      day: date.getDate(),
      isToday: false,
      isCurrentMonth: false,
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const date = new Date(year, month, i);
    days.push({
      date,
      day: i,
      isToday: date.getTime() === today.getTime(),
      isCurrentMonth: true,
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    });
  }
  const endPadding = 42 - days.length;
  for (let i = 1; i <= endPadding; i++) {
    const date = new Date(year, month + 1, i);
    days.push({
      date,
      day: i,
      isToday: false,
      isCurrentMonth: false,
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}
function getTimeZoneOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}
function zonedWallTimeToUtc(local, timeZone) {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = getTimeZoneOffset(new Date(wallAsUtc), timeZone);
  const firstGuess = wallAsUtc - firstOffset;
  const secondOffset = getTimeZoneOffset(new Date(firstGuess), timeZone);
  return new Date(wallAsUtc - secondOffset);
}
function formatInTimeZone(date, timeZone, locale = "zh-CN") {
  return date.toLocaleString(locale, { timeZone, hour12: false });
}
export {
  addDays,
  addMonths,
  addYears,
  dateDifference,
  dateToTimestamp,
  formatDuration,
  formatInTimeZone,
  generateCalendar,
  getTimeZoneOffset,
  humanizeDuration,
  nowTimestamp,
  parseDuration,
  parseTimestamp,
  zonedWallTimeToUtc
};
