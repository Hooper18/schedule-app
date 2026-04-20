// Content script injected into XMUM Moodle (https://l.xmu.edu.my/*).
// On dashboard or course page, shows a floating "导入 DDL" button. Click:
//   - Dashboard flow: collect all course links from .dashboard-card, fetch
//     each course page serially (500ms gap), parse.
//   - Course-page flow: parse current document in place.
// Result JSON is written to chrome.storage.local and a new tab opens
// calendar.tuchenguang.com/import?source=moodle so bridge.js can forward it
// to the app.

const BUTTON_ID = "schedule-app-moodle-import-btn"
const TARGET_ORIGIN = "https://calendar.tuchenguang.com"
const FETCH_GAP_MS = 500

const IS_DASHBOARD = /^\/my\/?(courses\.php)?$/i.test(location.pathname)
const IS_COURSE_PAGE = /^\/course\/view\.php/i.test(location.pathname)

const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

if (IS_DASHBOARD || IS_COURSE_PAGE) {
  injectButton()
}

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return
  const btn = document.createElement("button")
  btn.id = BUTTON_ID
  btn.type = "button"
  btn.textContent = "📋 导入 DDL"
  btn.dataset.baseText = btn.textContent
  btn.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "padding:12px 18px",
    "background:#10B981",
    "color:#fff",
    "border:none",
    "border-radius:10px",
    "font-size:14px",
    "font-weight:600",
    "cursor:pointer",
    "box-shadow:0 6px 16px rgba(0,0,0,0.25)",
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    "transition:transform 0.1s,box-shadow 0.1s,opacity 0.1s",
  ].join(";")
  btn.addEventListener("mouseenter", () => {
    if (btn.disabled) return
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

async function handleImport() {
  const btn = document.getElementById(BUTTON_ID)
  try {
    let courses
    if (IS_DASHBOARD) {
      courses = await scanDashboard()
      if (courses === null) return // login expired alert already fired
    } else {
      const parsed = parseCourse(document, location.href, null)
      courses = parsed ? [parsed] : []
    }

    const nonEmpty = courses.filter(
      (c) => c.events.length > 0 || c.files.length > 0,
    )
    if (nonEmpty.length === 0) {
      alert("未发现任何 DDL 或课件文件")
      return
    }

    const payload = JSON.stringify(nonEmpty)
    await new Promise((resolve) => {
      chrome.storage.local.set({ moodle_import_data: payload }, () => resolve())
    })
    window.open(`${TARGET_ORIGIN}/import?source=moodle`, "_blank")
  } catch (err) {
    console.error("[schedule-app/moodle] import failed", err)
    alert(`导入失败：${err && err.message ? err.message : String(err)}`)
  } finally {
    setProgress(btn, null)
  }
}

// Collect course links from the dashboard card grid, then fetch each course
// page one at a time with a FETCH_GAP_MS gap to stay polite.
async function scanDashboard() {
  const btn = document.getElementById(BUTTON_ID)
  const cards = document.querySelectorAll("div.card.dashboard-card")
  const items = []
  const seenUrls = new Set()
  for (const card of cards) {
    const a = card.querySelector('a[href*="course/view.php"]')
    if (!a) continue
    const url = a.href
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    const nameEl = card.querySelector("span.multiline")
    const nameHint = nameEl ? nameEl.textContent.trim() : null
    items.push({ url, nameHint })
  }

  if (items.length === 0) {
    alert("当前页面没有发现已选课程卡片（div.card.dashboard-card）")
    return []
  }

  // Filter by current semester — course names embed a "YYYY/MM" semester tag.
  // Pick the most common tag on this dashboard as "current" and drop courses
  // tagged with any other semester. Courses without a tag are kept (unknown).
  const currentSem = detectCurrentSemester(items)
  const { filtered, skipped } = filterCurrentSemester(items, currentSem)
  if (currentSem && skipped > 0) {
    setProgress(
      btn,
      `检测到当前学期: ${currentSem}，过滤掉 ${skipped} 门旧课程`,
    )
    await sleep(900)
  }

  const results = []
  for (let i = 0; i < filtered.length; i++) {
    setProgress(btn, `正在扫描 ${i + 1}/${filtered.length}…`)
    const { url, nameHint } = filtered[i]
    const resp = await fetch(url, { credentials: "include" })
    const html = await resp.text()
    if (isLoginPage(html, resp.url)) {
      alert("Moodle 登录已过期，请重新登录后重试")
      return null
    }
    const parsed = parseCourse(html, url, nameHint)
    if (parsed) results.push(parsed)
    if (i < filtered.length - 1) await sleep(FETCH_GAP_MS)
  }
  return results
}

const SEMESTER_REGEX = /(\d{4}\/\d{2})/

function detectCurrentSemester(items) {
  const counts = new Map()
  for (const it of items) {
    if (!it.nameHint) continue
    const m = it.nameHint.match(SEMESTER_REGEX)
    if (!m) continue
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [sem, n] of counts) {
    if (n > bestCount) {
      best = sem
      bestCount = n
    }
  }
  return best
}

function filterCurrentSemester(items, currentSem) {
  if (!currentSem) return { filtered: items, skipped: 0 }
  const kept = []
  let skipped = 0
  for (const it of items) {
    if (!it.nameHint) {
      kept.push(it)
      continue
    }
    const m = it.nameHint.match(SEMESTER_REGEX)
    if (!m || m[1] === currentSem) {
      kept.push(it)
    } else {
      skipped++
    }
  }
  return { filtered: kept, skipped }
}

function isLoginPage(html, finalUrl) {
  if (finalUrl && /\/login\//i.test(finalUrl)) return true
  return (
    /id\s*=\s*["']loginform["']/i.test(html) ||
    /id\s*=\s*["']login["']/i.test(html)
  )
}

function parseCourse(docOrHtml, courseUrl, nameHint) {
  const doc =
    typeof docOrHtml === "string"
      ? new DOMParser().parseFromString(docOrHtml, "text/html")
      : docOrHtml

  const courseName = (nameHint || extractCourseName(doc) || "").trim()
  const codeMatch = courseName.match(/^([A-Z]{2,4}[\d.]+[*]?)/)
  const courseCode = codeMatch ? codeMatch[1] : null

  const todayIso = new Date().toISOString().slice(0, 10)

  const events = []
  const wrappers = doc.querySelectorAll("li.activity-wrapper")
  for (const w of wrappers) {
    try {
      const classes = w.className || ""
      let type
      if (classes.includes("modtype_assign")) type = "deadline"
      else if (classes.includes("modtype_quiz")) type = "quiz"
      else continue

      const nameEl = w.querySelector(".activityname .instancename")
      if (!nameEl) continue
      const clone = nameEl.cloneNode(true)
      clone.querySelectorAll(".accesshide").forEach((el) => el.remove())
      const title = (clone.textContent || "").trim()
      if (!title) continue

      const { date, time } = parseDate(w.innerHTML)
      if (date && date < todayIso) continue

      events.push({ title, type, date, time, notes: "" })
    } catch (e) {
      console.warn("[schedule-app/moodle] skipping activity", e)
    }
  }

  const files = []
  const seenFileUrls = new Set()
  const fileLinks = doc.querySelectorAll(
    'a[href*="/mod/resource/view.php"], a[href*="/pluginfile.php"]',
  )
  for (const a of fileLinks) {
    const url = a.href
    const name = (a.textContent || "").trim()
    if (!url || !name) continue
    if (seenFileUrls.has(url)) continue
    seenFileUrls.add(url)
    files.push({ name, url })
  }

  return {
    course_code: courseCode,
    course_name: courseName,
    course_url: courseUrl,
    events,
    files,
  }
}

function extractCourseName(doc) {
  const header = doc.querySelector(".page-header-headings h1")
  if (header) return header.textContent
  const anyH1 = doc.querySelector("h1")
  if (anyH1) return anyH1.textContent
  return ""
}

// Returns { date: "YYYY-MM-DD" | null, time: "HH:MM" | null }.
// Scans raw HTML — tags won't interfere because the patterns are numeric/word
// and HTML attributes rarely contain matching sequences.
function parseDate(html) {
  const slash = html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) {
    const dd = slash[1].padStart(2, "0")
    const mm = slash[2].padStart(2, "0")
    return { date: `${slash[3]}-${mm}-${dd}`, time: null }
  }

  const english = html.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i,
  )
  if (english) {
    const dd = String(english[1]).padStart(2, "0")
    const mm = String(MONTH_MAP[english[2].toLowerCase()]).padStart(2, "0")
    const yyyy = english[3]
    let time = null
    if (english[4] && english[5] && english[6]) {
      let hh = parseInt(english[4], 10)
      const mi = parseInt(english[5], 10)
      const ap = english[6].toLowerCase()
      if (ap === "pm" && hh !== 12) hh += 12
      if (ap === "am" && hh === 12) hh = 0
      time = `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`
    }
    return { date: `${yyyy}-${mm}-${dd}`, time }
  }

  return { date: null, time: null }
}

function setProgress(btn, text) {
  if (!btn) return
  if (text) {
    btn.textContent = text
    btn.disabled = true
    btn.style.opacity = "0.85"
    btn.style.cursor = "wait"
  } else {
    btn.textContent = btn.dataset.baseText || "📋 导入 DDL"
    btn.disabled = false
    btn.style.opacity = ""
    btn.style.cursor = "pointer"
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
