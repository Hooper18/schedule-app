// Content script injected into XMUM AC Online pages.
// Finds the enrolled-course timetable table, parses it into the schedule-app
// ParsedCourse JSON shape, and opens calendar.tuchenguang.com/import with the
// payload base64-encoded in the ac_data query param.

const TARGET_ORIGIN = "https://calendar.tuchenguang.com"
const BUTTON_ID = "schedule-app-import-btn"

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

injectButton()

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return
  const btn = document.createElement("button")
  btn.id = BUTTON_ID
  btn.type = "button"
  btn.textContent = "📅 导入到 Schedule App"
  btn.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "padding:12px 18px",
    "background:#3B82F6",
    "color:#fff",
    "border:none",
    "border-radius:10px",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 6px 16px rgba(0,0,0,0.25)",
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    "transition:transform 0.1s,box-shadow 0.1s",
  ].join(";")
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "translateY(-1px)"
    btn.style.boxShadow = "0 8px 20px rgba(0,0,0,0.3)"
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = ""
    btn.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)"
  })
  btn.addEventListener("click", handleImport)
  document.body.appendChild(btn)
}

function handleImport() {
  try {
    const table = findTimetableTable()
    if (!table) {
      alert("未找到课程表表格。请确认当前在课程表页面并显示了已选课程。")
      return
    }
    const courses = parseTable(table)
    if (courses.length === 0) {
      alert("解析到的课程为 0 条。请检查表格列是否和预期匹配。")
      return
    }
    const payload = { courses, source: "xmum_ac_online", parsed_at: new Date().toISOString() }
    const b64 = encodeJsonB64(payload)
    const url = `${TARGET_ORIGIN}/import?ac_data=${encodeURIComponent(b64)}`
    window.open(url, "_blank")
  } catch (err) {
    console.error("[schedule-app] import failed", err)
    alert(`导入失败：${err && err.message ? err.message : String(err)}`)
  }
}

// Find the <table> that has headers matching the enrolled-course layout.
// We don't assume a fixed CSS selector — instead we match by header text, so
// minor markup changes don't break parsing.
function findTimetableTable() {
  const tables = document.querySelectorAll("table")
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll("thead th, thead td")).map(
      (h) => norm(h.textContent),
    )
    if (headers.length === 0) {
      const firstRowCells = Array.from(
        t.querySelectorAll("tr:first-child th, tr:first-child td"),
      ).map((h) => norm(h.textContent))
      if (matchesHeaders(firstRowCells)) return t
      continue
    }
    if (matchesHeaders(headers)) return t
  }
  return null
}

function matchesHeaders(headerTexts) {
  const joined = headerTexts.join(" | ").toLowerCase()
  return (
    joined.includes("course code") &&
    joined.includes("time") &&
    joined.includes("venue")
  )
}

function parseTable(table) {
  const headers = Array.from(
    table.querySelectorAll("thead th, thead td"),
  ).map((h) => norm(h.textContent))
  const headersSource = headers.length
    ? headers
    : Array.from(
        table.querySelectorAll("tr:first-child th, tr:first-child td"),
      ).map((h) => norm(h.textContent))
  const col = indexColumns(headersSource)

  const rows = Array.from(table.querySelectorAll("tbody tr"))
  const bodyRows = rows.length
    ? rows
    : Array.from(table.querySelectorAll("tr")).slice(1)

  const byCode = new Map()
  for (const tr of bodyRows) {
    const cells = Array.from(tr.querySelectorAll("td"))
    if (cells.length === 0) continue
    const code = getCell(cells, col.code)
    if (!code) continue
    const nameRaw = getCell(cells, col.name)
    const creditStr = getCell(cells, col.credit)
    const lecturer = getCell(cells, col.lecturer) || null
    const timeVenueRaw = getCell(cells, col.timeVenue)
    const teachingWeekCol = getCell(cells, col.teachingWeek)

    const nameInfo = parseCourseName(nameRaw)
    const session = parseTimeVenue(timeVenueRaw, teachingWeekCol)
    if (session) {
      session.type = nameInfo.type
      session.group_number = nameInfo.group_number
    }

    const entry = byCode.get(code) || {
      code,
      name: nameInfo.baseName || code,
      name_full: null,
      credit: parseCredit(creditStr),
      lecturer,
      sessions: [],
    }
    if (!entry.lecturer && lecturer) entry.lecturer = lecturer
    if (!entry.credit) entry.credit = parseCredit(creditStr)
    if (session) entry.sessions.push(session)
    byCode.set(code, entry)
  }

  return Array.from(byCode.values())
}

function indexColumns(headers) {
  const find = (...needles) => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase()
      if (needles.every((n) => h.includes(n))) return i
    }
    return -1
  }
  return {
    code: find("course", "code"),
    name: find("course", "name"),
    credit: find("credit"),
    lecturer: find("lecturer"),
    timeVenue: find("time"),
    teachingWeek: find("teaching", "week"),
  }
}

function getCell(cells, idx) {
  if (idx < 0 || idx >= cells.length) return ""
  return norm(cells[idx].textContent)
}

function parseCredit(s) {
  if (!s) return null
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return Number.isInteger(n) ? n : Math.round(n)
}

// "Electronic Engineering (Lecture)" → { baseName: "Electronic Engineering", type: "lecture", group_number: null }
// "Circuits and Devices (Lab DSC) (Group 3)" → { baseName: "Circuits and Devices", type: "lab", group_number: "3" }
function parseCourseName(name) {
  if (!name) return { baseName: "", type: "other", group_number: null }
  let type = "other"
  if (/\(\s*lecture\b/i.test(name)) type = "lecture"
  else if (/\(\s*tutorial\b/i.test(name)) type = "tutorial"
  else if (/\(\s*lab\b/i.test(name)) type = "lab"
  else if (/\(\s*practical\b/i.test(name)) type = "practical"
  else if (/\(\s*seminar\b/i.test(name)) type = "seminar"

  const groupMatch = name.match(/\(\s*group\s+([^)]+?)\s*\)/i)
  const group_number = groupMatch ? groupMatch[1].trim() : null

  const baseName = name
    .replace(/\(\s*(lecture|tutorial|lab[^)]*|practical|seminar)[^)]*\)/gi, "")
    .replace(/\(\s*group\s+[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  return { baseName, type, group_number }
}

// "Wednesday 2.00pm-4.00pm(A2#G07)(Week 1-14)"
// → { day_of_week: 3, start_time: "14:00", end_time: "16:00", location: "A2#G07", teaching_weeks: "1-14" }
function parseTimeVenue(text, teachingWeekCol) {
  if (!text) return null
  const dayMatch = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  )
  if (!dayMatch) return null
  const day_of_week = DAY_NAMES.findIndex(
    (d) => d.toLowerCase() === dayMatch[1].toLowerCase(),
  )
  if (day_of_week < 0) return null

  const timeMatch = text.match(
    /(\d{1,2})[.:](\d{2})\s*(am|pm)\s*-\s*(\d{1,2})[.:](\d{2})\s*(am|pm)/i,
  )
  if (!timeMatch) return null
  const start_time = to24h(timeMatch[1], timeMatch[2], timeMatch[3])
  const end_time = to24h(timeMatch[4], timeMatch[5], timeMatch[6])

  const parens = [...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim())
  let location = null
  let weeksInline = null
  for (const p of parens) {
    if (/^week\b/i.test(p)) {
      weeksInline = p.replace(/^week\b\s*/i, "").trim()
    } else if (!location) {
      location = p
    }
  }

  const teaching_weeks =
    cleanWeeks(teachingWeekCol) || cleanWeeks(weeksInline) || "1-14"

  return {
    day_of_week,
    start_time,
    end_time,
    type: "other", // overwritten by parseCourseName result
    location,
    group_number: null, // overwritten by parseCourseName result
    teaching_weeks,
  }
}

function to24h(h, m, p) {
  let hh = parseInt(h, 10)
  const ampm = p.toLowerCase()
  if (ampm === "pm" && hh !== 12) hh += 12
  if (ampm === "am" && hh === 12) hh = 0
  return `${String(hh).padStart(2, "0")}:${m}`
}

function cleanWeeks(s) {
  if (!s) return null
  const trimmed = s.replace(/^week\b\s*/i, "").trim()
  return trimmed || null
}

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim()
}

// btoa() only handles latin-1; course names may contain CJK characters, so
// UTF-8 encode first. The decoder on the frontend reverses this.
function encodeJsonB64(obj) {
  const utf8 = new TextEncoder().encode(JSON.stringify(obj))
  let binary = ""
  for (let i = 0; i < utf8.length; i++) {
    binary += String.fromCharCode(utf8[i])
  }
  return btoa(binary)
}
