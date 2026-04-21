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

    // Layer 2: show picker overlay for file selection, download selected
    // files + inline images, then build the enriched payload. Layer 1-only
    // payloads fall out of this flow as a degenerate case (no files chosen,
    // page text still sent through).
    setProgress(btn, null)
    await runLayer2Flow(nonEmpty)
  } catch (err) {
    console.error("[schedule-app/moodle] import failed", err)
    alert(`导入失败：${err && err.message ? err.message : String(err)}`)
  } finally {
    setProgress(document.getElementById(BUTTON_ID), null)
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
    // span.multiline often holds only "CODE Short Name"; the lecturer and
    // "YYYY/MM" semester tag usually live in sibling elements. Use the full
    // card text for semester detection.
    const detectText = (card.textContent || "").replace(/\s+/g, " ").trim()
    items.push({ url, nameHint, detectText })
  }

  if (items.length === 0) {
    alert("当前页面没有发现已选课程卡片（div.card.dashboard-card）")
    return []
  }

  console.log(
    "[schedule-app/moodle] scanDashboard collected",
    items.length,
    "course cards",
  )
  items.forEach((it, i) => {
    console.log(
      `  [${i}] nameHint="${it.nameHint}" | detectText="${it.detectText.slice(0, 160)}"`,
    )
  })

  // Filter by current semester — course cards embed a "YYYY/MM" semester tag.
  // Pick the most common tag on this dashboard as "current" and drop courses
  // tagged with any other semester. Courses without a tag are kept (unknown).
  const currentSem = detectCurrentSemester(items)
  console.log(
    "[schedule-app/moodle] detected current semester:",
    currentSem,
  )

  const { filtered, skipped } = filterCurrentSemester(items, currentSem)
  console.log(
    `[schedule-app/moodle] filter result: kept ${filtered.length}, skipped ${skipped}`,
  )
  items.forEach((it) => {
    const keep = filtered.includes(it)
    console.log(`  ${keep ? "KEEP" : "DROP"} "${it.nameHint}"`)
  })

  if (currentSem && skipped > 0) {
    setProgress(
      btn,
      `检测到当前学期: ${currentSem}，过滤掉 ${skipped} 门旧课程`,
    )
    await sleep(900)
  }

  console.log(
    "[schedule-app/moodle] starting fetch loop for",
    filtered.length,
    "courses",
  )

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

// Activity titles that look like deadlines but are really teacher-uploaded
// post-assessment artifacts. Matched case-insensitively as substrings.
const TITLE_BLACKLIST = [
  "marks",
  "solutions",
  "answers",
  "formula sheet",
  "answer key",
  "marking scheme",
  "sample answer",
]

function isBlacklistedTitle(title) {
  const lower = title.toLowerCase()
  return TITLE_BLACKLIST.some((kw) => lower.includes(kw))
}

function detectCurrentSemester(items) {
  const counts = new Map()
  for (const it of items) {
    const text = it.detectText || it.nameHint || ""
    const m = text.match(SEMESTER_REGEX)
    if (!m) continue
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  console.log(
    "[schedule-app/moodle] semester counts:",
    Object.fromEntries(counts),
  )
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
    const text = it.detectText || it.nameHint || ""
    const m = text.match(SEMESTER_REGEX)
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
      if (isBlacklistedTitle(title)) {
        console.log(
          "[schedule-app/moodle] skipping blacklisted activity:",
          title,
        )
        continue
      }

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

  // Layer 2 inputs: the main-content textContent (for Claude as context) and
  // the URLs of every pluginfile-backed <img> inside the course content (to
  // be base64-downloaded later as vision input).
  const mainContent =
    doc.querySelector("#region-main") || doc.querySelector(".course-content")
  const pageText = mainContent
    ? mainContent.textContent.replace(/\s+/g, " ").trim().slice(0, 8000)
    : ""

  const inlineImages = []
  const imgSel =
    '#region-main img[src*="pluginfile.php"], .course-content img[src*="pluginfile.php"]'
  for (const img of doc.querySelectorAll(imgSel)) {
    const src = img.src || img.getAttribute("src")
    if (src && !inlineImages.includes(src)) inlineImages.push(src)
  }

  return {
    course_code: courseCode,
    course_name: courseName,
    course_url: courseUrl,
    events,
    files,
    pageText,
    inlineImages,
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

// ---------------------------------------------------------------------------
// Layer 2: file picker overlay + download pipeline
// ---------------------------------------------------------------------------

const OVERLAY_ID = "schedule-app-moodle-overlay"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const DOWNLOAD_GAP_MS = 300
const PROBE_CONCURRENCY = 5

// File-name substring match (case-insensitive). Files matching any keyword
// are prechecked in the picker.
const AUTO_SELECT_KEYWORDS = [
  "assignment", "submission", "coursework", "assessment", "evaluation",
  "quiz", "exam", "midterm", "final", "test",
  "syllabus", "outline", "schedule", "deadline", "project",
  "rubric", "grading", "marking", "weightage",
  "course info", "course_info", "courseinformation",
  "group assignment", "individual assignment",
  "introduction", "course plan", "courseplan",
  "cover page", "coverpage", "chapter",
]

function autoSelectByKeyword(name) {
  const lower = (name || "").toLowerCase()
  const result = AUTO_SELECT_KEYWORDS.some((kw) => lower.includes(kw))
  console.log("[schedule-app/moodle] autoSelect check:", name, "→", result)
  return result
}

// Explicitly-unsupported extensions. Anything else (including entirely
// unknown types) is kept — the user can still manually opt in via the picker.
const BLOCKED_EXTS = new Set([
  "zip", "mp4", "mp3", "avi", "mov",
  "xlsx", "xls", "csv", "txt",
  "py", "m", "c",
])

// Best-effort file-extension detection with three fallback steps:
//   a) pluginfile.php URL path tail — Moodle's direct file URLs end with the
//      real filename (e.g. /pluginfile.php/123/.../slides.pptx?forcedownload=1)
//   b) anchor text (the link label may itself be the filename)
//   c) neither — return null; the picker shows this as "未知类型" and leaves
//      it user-togglable rather than hiding it.
// /mod/resource/view.php?id=X intentionally lacks any filename hint and falls
// through to case (b) / (c).
function detectExt(name, url) {
  return extFromPluginfileUrl(url) || extFromName(name) || null
}

function extFromPluginfileUrl(url) {
  if (!url || !/\/pluginfile\.php\//i.test(url)) return null
  const pathOnly = url.split("?")[0].split("#")[0]
  const lastSegment = pathOnly.split("/").pop() || ""
  let decoded = lastSegment
  try {
    decoded = decodeURIComponent(lastSegment)
  } catch {
    // keep raw
  }
  return extFromName(decoded)
}

function extFromName(name) {
  if (!name) return null
  const m = name.toLowerCase().match(/\.([a-z0-9]+)(?=$|\?|#)/)
  return m ? m[1] : null
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "大小未知"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Rough cost estimate — shown in both picker (pre-download) and ready
// overlay (post-download). Constants match the task spec. Unknown-size
// files (Moodle view.php links we deliberately didn't probe) are stubbed
// at 500 KB each so the estimate stays in the right order of magnitude
// instead of treating them as free.
const UNKNOWN_SIZE_ASSUMED_KB = 500

function estimateCostRough(selectedFiles, courses) {
  const fileSizeMB = selectedFiles.reduce((s, f) => {
    const bytes = f.sizeBytes ?? f.size ?? null
    if (bytes == null) return s + UNKNOWN_SIZE_ASSUMED_KB / 1024
    return s + bytes / 1024 / 1024
  }, 0)
  const fileInputTokens = fileSizeMB * 60000
  const pageTextChars = courses.reduce(
    (s, c) => s + (c.pageText ? c.pageText.length : 0),
    0,
  )
  const pageTextTokens = pageTextChars / 4
  const imageCount = courses.reduce(
    (s, c) => s + (c.inlineImages ? c.inlineImages.length : 0),
    0,
  )
  const imageTokens = imageCount * 1500
  const outputTokens = courses.length * 500
  const inputCost =
    ((fileInputTokens + pageTextTokens + imageTokens) / 1_000_000) * 1
  const outputCost = (outputTokens / 1_000_000) * 5
  return Math.max(0.01, inputCost + outputCost)
}

async function runLayer2Flow(courses) {
  // Course filter step: let the user drop non-class entries (生活类选修、
  // 入学材料页面等) before we burn time probing files. Keeping the full
  // courses array here means downstream courseIdx stays consistent with the
  // filtered list we pass forward.
  const filter = await showCourseFilterOverlay(courses)
  if (filter.action === "cancel") return
  courses = courses.filter((_, i) => filter.selectedIndices.has(i))
  if (courses.length === 0) return

  // Build flat file candidate list. Keep everything that isn't on the
  // block-list — unknown types (ext=null) still show up so the user can pick
  // them manually. Only files we're SURE are noise (zip / mp4 / xlsx etc.)
  // get dropped silently.
  const allFiles = []
  courses.forEach((c, ci) => {
    for (const f of c.files) {
      const ext = detectExt(f.name, f.url)
      if (ext && BLOCKED_EXTS.has(ext)) continue
      allFiles.push({
        courseIdx: ci,
        name: f.name,
        url: f.url,
        ext, // may be null for "未知类型"
        sizeBytes: null,
        // sizeDeferred=true means we chose not to probe (Moodle view.php
        // URLs don't return the real file size via HEAD). Different from
        // "probe tried and failed" — flipped in probeSizes().
        sizeDeferred: false,
        // Keyword auto-select is filename-only. Almost every Moodle resource
        // link is the ext-less view.php pattern, so gating on ext would mean
        // effectively no auto-select ever fires.
        selected: autoSelectByKeyword(f.name),
      })
    }
  })

  // Probe sizes (best effort — no size means we'll enforce the 10MB cap at
  // download time instead).
  await probeSizes(allFiles)
  for (const f of allFiles) {
    if (f.sizeBytes !== null && f.sizeBytes > MAX_FILE_BYTES) {
      f.selected = false
    }
  }

  const step1 = await showPickerOverlay(courses, allFiles)
  if (step1 === "cancel") return

  const downloads = await downloadAll(courses, allFiles)

  const step2 = await showReadyOverlay(courses, downloads)
  if (step2 === "cancel") return

  const payload = buildPayload(courses, downloads)
  await new Promise((resolve) => {
    chrome.storage.local.set(
      { moodle_import_data: JSON.stringify(payload) },
      () => resolve(),
    )
  })
  window.open(`${TARGET_ORIGIN}/import?source=moodle`, "_blank")
}

async function probeSizes(allFiles) {
  if (allFiles.length === 0) return
  const btn = document.getElementById(BUTTON_ID)
  let done = 0
  const update = () => setProgress(btn, `探测文件大小 ${done}/${allFiles.length}…`)
  update()

  const queue = [...allFiles]
  const worker = async () => {
    while (queue.length > 0) {
      const f = queue.shift()
      if (!f) break
      // /mod/resource/view.php never gives a usable size via HEAD — Moodle
      // either redirects to /pluginfile.php (and the HEAD on the redirect
      // target varies per theme) or serves an HTML wrapper whose
      // content-length describes the page, not the file. Skip up front; we
      // find out the size when we actually download the blob.
      if (/\/mod\/resource\/view\.php/i.test(f.url)) {
        f.sizeDeferred = true
        done++
        update()
        continue
      }
      try {
        const resp = await fetch(f.url, {
          method: "HEAD",
          credentials: "include",
          redirect: "follow",
        })
        if (resp.ok) {
          // Some Moodle themes return HTML for HEAD on /mod/resource/view.php
          // instead of redirecting to the file. In that case content-length
          // describes the HTML wrapper, not the actual file — useless and
          // misleading. Only trust content-length when the content-type
          // clearly isn't HTML (i.e. this really is the binary file).
          const ctype = (resp.headers.get("content-type") || "").toLowerCase()
          const looksLikeHtml = ctype.includes("text/html")
          if (!looksLikeHtml) {
            const len = resp.headers.get("content-length")
            if (len) f.sizeBytes = parseInt(len, 10)
          }
        }
      } catch {
        // leave sizeBytes null
      } finally {
        done++
        update()
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, allFiles.length) }, worker),
  )
  setProgress(btn, null)
}

function ensureSpinKeyframes() {
  if (document.getElementById("schedule-spin-style")) return
  const style = document.createElement("style")
  style.id = "schedule-spin-style"
  style.textContent =
    "@keyframes schedule-spin { to { transform: rotate(360deg); } }"
  document.head.appendChild(style)
}

function hideOverlay() {
  const el = document.getElementById(OVERLAY_ID)
  if (el) el.remove()
}

// Course filter: lets the user drop irrelevant courses (e.g., 选修、入学
// 材料) before the file picker. Resolves with
// { action: 'continue' | 'cancel', selectedIndices: Set<number> }.
function showCourseFilterOverlay(courses) {
  return new Promise((resolve) => {
    hideOverlay()
    const backdrop = document.createElement("div")
    backdrop.id = OVERLAY_ID
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "background:rgba(0,0,0,0.5)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    ].join(";")

    const panel = document.createElement("div")
    panel.style.cssText = [
      "background:#fff",
      "color:#111",
      "border-radius:12px",
      "max-height:80vh",
      "width:min(520px,92vw)",
      "display:flex",
      "flex-direction:column",
      "box-shadow:0 20px 60px rgba(0,0,0,0.4)",
      "overflow:hidden",
    ].join(";")

    const header = document.createElement("div")
    header.style.cssText =
      "padding:14px 18px;border-bottom:1px solid #eee;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center"
    const titleSpan = document.createElement("span")
    titleSpan.textContent = "📚 选择要导入的课程"
    header.appendChild(titleSpan)
    const closeBtn = document.createElement("button")
    closeBtn.textContent = "✕"
    closeBtn.style.cssText =
      "border:none;background:none;font-size:20px;cursor:pointer;color:#666;padding:0 4px"
    closeBtn.onclick = () => {
      hideOverlay()
      resolve({ action: "cancel", selectedIndices: new Set() })
    }
    header.appendChild(closeBtn)
    panel.appendChild(header)

    const hint = document.createElement("div")
    hint.style.cssText =
      "padding:10px 18px;background:#f8fafc;color:#475569;font-size:12px;border-bottom:1px solid #eee"
    hint.textContent =
      "默认全选。取消不需要导入的课程（如通识选修、非课程页面）以减少 AI 解析成本。"
    panel.appendChild(hint)

    const selected = new Set(courses.map((_, i) => i))

    const body = document.createElement("div")
    body.style.cssText = "overflow-y:auto;padding:6px 18px;flex:1"
    courses.forEach((c, i) => {
      const row = document.createElement("label")
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:10px 0;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0"
      const cb = document.createElement("input")
      cb.type = "checkbox"
      cb.checked = true
      cb.onchange = () => {
        if (cb.checked) selected.add(i)
        else selected.delete(i)
        updateFooter()
      }
      row.appendChild(cb)
      const label = document.createElement("span")
      const code = c.course_code ? `${c.course_code} · ` : ""
      label.textContent = `${code}${c.course_name || "(未命名)"}`
      label.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
      row.appendChild(label)
      const meta = document.createElement("span")
      meta.textContent = `${c.events.length} 事件 · ${c.files.length} 文件`
      meta.style.cssText = "color:#888;font-size:11px;flex-shrink:0"
      row.appendChild(meta)
      body.appendChild(row)
    })
    panel.appendChild(body)

    const footer = document.createElement("div")
    footer.style.cssText =
      "padding:12px 18px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:10px"
    const status = document.createElement("span")
    status.style.cssText = "font-size:12px;color:#666"
    footer.appendChild(status)
    const buttonGroup = document.createElement("span")
    buttonGroup.style.cssText = "display:flex;gap:8px"
    const toggleBtn = document.createElement("button")
    toggleBtn.textContent = "全选 / 反选"
    toggleBtn.style.cssText =
      "padding:8px 12px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:12px;color:#555"
    toggleBtn.onclick = () => {
      const allSelected = selected.size === courses.length
      selected.clear()
      if (!allSelected) courses.forEach((_, i) => selected.add(i))
      body.querySelectorAll("input[type=checkbox]").forEach((cb, i) => {
        cb.checked = selected.has(i)
      })
      updateFooter()
    }
    const cancelBtn = document.createElement("button")
    cancelBtn.textContent = "取消"
    cancelBtn.style.cssText =
      "padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:13px"
    cancelBtn.onclick = () => {
      hideOverlay()
      resolve({ action: "cancel", selectedIndices: new Set() })
    }
    const continueBtn = document.createElement("button")
    continueBtn.textContent = "继续 →"
    continueBtn.style.cssText =
      "padding:8px 16px;border:none;background:#10b981;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600"
    continueBtn.onclick = () => {
      hideOverlay()
      resolve({ action: "continue", selectedIndices: new Set(selected) })
    }
    buttonGroup.appendChild(toggleBtn)
    buttonGroup.appendChild(cancelBtn)
    buttonGroup.appendChild(continueBtn)
    footer.appendChild(buttonGroup)
    panel.appendChild(footer)

    const updateFooter = () => {
      status.textContent = `已选 ${selected.size}/${courses.length} 门课程`
      const empty = selected.size === 0
      continueBtn.disabled = empty
      continueBtn.style.opacity = empty ? "0.5" : "1"
      continueBtn.style.cursor = empty ? "not-allowed" : "pointer"
    }

    backdrop.appendChild(panel)
    document.body.appendChild(backdrop)
    updateFooter()
  })
}

// Picker: course-grouped file list with checkboxes. Resolves 'continue' or
// 'cancel'. Mutates allFiles[i].selected in place.
function showPickerOverlay(courses, allFiles) {
  return new Promise((resolve) => {
    hideOverlay()
    const backdrop = document.createElement("div")
    backdrop.id = OVERLAY_ID
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "background:rgba(0,0,0,0.5)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    ].join(";")

    const panel = document.createElement("div")
    panel.style.cssText = [
      "background:#fff",
      "color:#111",
      "border-radius:12px",
      "max-height:80vh",
      "width:min(720px,92vw)",
      "display:flex",
      "flex-direction:column",
      "box-shadow:0 20px 60px rgba(0,0,0,0.4)",
      "overflow:hidden",
    ].join(";")

    const header = document.createElement("div")
    header.style.cssText =
      "padding:14px 18px;border-bottom:1px solid #eee;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center"
    const titleSpan = document.createElement("span")
    titleSpan.textContent = "📋 Moodle Layer 2 · 选择要给 AI 解析的课件"
    header.appendChild(titleSpan)
    const closeBtn = document.createElement("button")
    closeBtn.textContent = "✕"
    closeBtn.style.cssText =
      "border:none;background:none;font-size:20px;cursor:pointer;color:#666;padding:0 4px"
    closeBtn.onclick = () => {
      hideOverlay()
      resolve("cancel")
    }
    header.appendChild(closeBtn)
    panel.appendChild(header)

    const body = document.createElement("div")
    body.style.cssText = "overflow-y:auto;padding:14px 18px;flex:1"

    const footerA = document.createElement("div")
    const footerB = document.createElement("div")

    const updateFooter = () => {
      const sel = allFiles.filter(
        (f) =>
          f.selected &&
          (f.sizeBytes === null || f.sizeBytes <= MAX_FILE_BYTES),
      )
      const knownBytes = sel.reduce((s, f) => s + (f.sizeBytes || 0), 0)
      const unknownCount = sel.filter((f) => f.sizeBytes === null).length
      let sizeLabel
      if (sel.length === 0) {
        sizeLabel = "0 B"
      } else if (unknownCount === sel.length) {
        sizeLabel = "大小待下载后确定"
      } else if (unknownCount > 0) {
        sizeLabel = `${formatBytes(knownBytes)} + ${unknownCount} 个待确定`
      } else {
        sizeLabel = formatBytes(knownBytes)
      }
      const coursesWithText = courses.filter(
        (c) => c.pageText && c.pageText.length > 0,
      ).length
      const images = courses.reduce(
        (s, c) => s + (c.inlineImages ? c.inlineImages.length : 0),
        0,
      )
      footerA.textContent = `已选 ${sel.length} 个文件 (${sizeLabel}) + ${coursesWithText} 门课页面文本 + ${images} 张内嵌图片`
      const cost = estimateCostRough(sel, courses)
      footerB.textContent = `预估 API 费用: ~$${cost.toFixed(2)}`
    }

    courses.forEach((c, ci) => {
      const block = document.createElement("div")
      block.style.cssText = "margin-bottom:18px"

      const h3 = document.createElement("div")
      h3.textContent = `📚 ${c.course_name || c.course_code || "未命名课程"}`
      h3.style.cssText = "font-weight:600;font-size:13px;margin-bottom:6px"
      block.appendChild(h3)

      const lines = []
      lines.push(`Layer 1: 发现 ${c.events.length} 个 DDL`)
      if (c.pageText && c.pageText.length > 0) {
        lines.push(
          `页面文本: ${c.pageText.length.toLocaleString()} 字符 ✓（自动包含）`,
        )
      }
      if (c.inlineImages && c.inlineImages.length > 0) {
        lines.push(
          `内嵌图片: ${c.inlineImages.length} 张 ✓（自动包含）`,
        )
      }
      for (const line of lines) {
        const row = document.createElement("div")
        row.textContent = line
        row.style.cssText = "font-size:12px;color:#555;margin-bottom:2px"
        block.appendChild(row)
      }

      const filesForCourse = allFiles.filter((f) => f.courseIdx === ci)
      if (filesForCourse.length > 0) {
        const label = document.createElement("div")
        label.textContent = "可下载文件:"
        label.style.cssText =
          "font-size:12px;color:#555;margin-top:6px;margin-bottom:4px"
        block.appendChild(label)
        for (const f of filesForCourse) {
          block.appendChild(makeFileRow(f, updateFooter))
        }
      } else {
        const none = document.createElement("div")
        none.textContent = "（没有符合支持格式的可下载文件）"
        none.style.cssText =
          "font-size:12px;color:#888;font-style:italic;margin-top:4px"
        block.appendChild(none)
      }

      body.appendChild(block)
    })

    panel.appendChild(body)

    const footer = document.createElement("div")
    footer.style.cssText =
      "border-top:1px solid #eee;padding:12px 18px;background:#fafafa"
    footerA.style.cssText = "font-size:12px;color:#555"
    footerB.style.cssText = "font-size:12px;color:#555;margin-top:2px"
    footer.appendChild(footerA)
    footer.appendChild(footerB)

    const actions = document.createElement("div")
    actions.style.cssText =
      "margin-top:10px;display:flex;gap:8px;justify-content:flex-end"
    const cancelBtn = document.createElement("button")
    cancelBtn.textContent = "取消"
    cancelBtn.style.cssText =
      "padding:8px 14px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#333"
    cancelBtn.onclick = () => {
      hideOverlay()
      resolve("cancel")
    }
    actions.appendChild(cancelBtn)

    const okBtn = document.createElement("button")
    okBtn.textContent = "下载并继续"
    okBtn.style.cssText =
      "padding:8px 14px;border:none;background:#10B981;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600"
    okBtn.onclick = () => {
      hideOverlay()
      resolve("continue")
    }
    actions.appendChild(okBtn)
    footer.appendChild(actions)
    panel.appendChild(footer)

    updateFooter()
    backdrop.appendChild(panel)
    document.body.appendChild(backdrop)
  })
}

function makeFileRow(f, onToggle) {
  const tooLarge = f.sizeBytes !== null && f.sizeBytes > MAX_FILE_BYTES
  const unknownType = f.ext === null

  const row = document.createElement("label")
  row.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px"
  if (tooLarge) row.style.cursor = "not-allowed"

  const cb = document.createElement("input")
  cb.type = "checkbox"
  cb.checked = !!f.selected && !tooLarge
  cb.disabled = tooLarge
  cb.style.cssText = "margin:0"
  cb.addEventListener("change", () => {
    f.selected = cb.checked
    onToggle()
  })
  row.appendChild(cb)

  const name = document.createElement("span")
  name.textContent = f.name
  name.style.cssText = [
    "flex:1",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    tooLarge ? "color:#aaa;text-decoration:line-through" : "color:#333",
  ].join(";")
  row.appendChild(name)

  const meta = document.createElement("span")
  meta.style.cssText = "font-size:11px;white-space:nowrap;flex-shrink:0"
  if (tooLarge) {
    meta.textContent = `${formatBytes(f.sizeBytes)} (超过 10MB，跳过)`
    meta.style.color = "#aaa"
  } else {
    const parts = []
    if (unknownType) parts.push("未知类型")
    if (f.sizeBytes !== null) {
      parts.push(formatBytes(f.sizeBytes))
    } else if (f.sizeDeferred) {
      parts.push("大小待下载后确定")
    } else {
      parts.push("大小未知")
    }
    meta.textContent = parts.join(" · ")
    meta.style.color = unknownType ? "#a78bfa" : "#666"
  }
  row.appendChild(meta)

  return row
}

function showProgressOverlay(initialText) {
  hideOverlay()
  ensureSpinKeyframes()
  const backdrop = document.createElement("div")
  backdrop.id = OVERLAY_ID
  backdrop.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "background:rgba(0,0,0,0.5)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
  ].join(";")

  const panel = document.createElement("div")
  panel.style.cssText = [
    "background:#fff",
    "border-radius:12px",
    "padding:24px 32px",
    "min-width:320px",
    "max-width:92vw",
    "box-shadow:0 20px 60px rgba(0,0,0,0.4)",
    "text-align:center",
  ].join(";")

  const spinner = document.createElement("div")
  spinner.style.cssText = [
    "width:32px",
    "height:32px",
    "border:3px solid #e5e7eb",
    "border-top-color:#10B981",
    "border-radius:50%",
    "margin:0 auto 12px",
    "animation:schedule-spin 0.8s linear infinite",
  ].join(";")
  panel.appendChild(spinner)

  const text = document.createElement("div")
  text.textContent = initialText
  text.style.cssText = "font-size:13px;color:#333"
  panel.appendChild(text)

  backdrop.appendChild(panel)
  document.body.appendChild(backdrop)

  return {
    setText: (t) => {
      text.textContent = t
    },
    close: () => hideOverlay(),
  }
}

async function downloadAll(courses, allFiles) {
  const filesByCourse = new Map()
  const imagesByCourse = new Map()

  const selected = allFiles.filter(
    (f) =>
      f.selected && (f.sizeBytes === null || f.sizeBytes <= MAX_FILE_BYTES),
  )
  const allImages = []
  courses.forEach((c, ci) => {
    if (!c.inlineImages) return
    for (const url of c.inlineImages) {
      allImages.push({ courseIdx: ci, url })
    }
  })

  const ov = showProgressOverlay(
    selected.length > 0 ? "准备下载课件…" : "准备下载内嵌图片…",
  )
  try {
    for (let i = 0; i < selected.length; i++) {
      const f = selected[i]
      const courseLabel =
        courses[f.courseIdx].course_code ||
        courses[f.courseIdx].course_name ||
        "课程"
      ov.setText(
        `正在下载 ${courseLabel} 课件 ${i + 1}/${selected.length}：${f.name}`,
      )
      const res = await downloadFileAsBase64(f.url)
      if (res) {
        const finalMime = res.mime || mimeFromExt(f.ext)
        // Resolve the extension now that we know the real mime. For
        // "未知类型" files (f.ext=null) this is often the first chance we
        // have to correctly classify the payload.
        const resolvedExt = f.ext || extFromMime(finalMime)
        const finalName = ensureNameHasExt(f.name, resolvedExt)
        const list = filesByCourse.get(f.courseIdx) || []
        list.push({
          name: finalName,
          data: res.data,
          mime: finalMime,
          size: res.size,
        })
        filesByCourse.set(f.courseIdx, list)
      }
      if (i < selected.length - 1) await sleep(DOWNLOAD_GAP_MS)
    }

    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i]
      ov.setText(`正在下载内嵌图片 ${i + 1}/${allImages.length}`)
      const res = await downloadFileAsBase64(img.url)
      if (res) {
        const list = imagesByCourse.get(img.courseIdx) || []
        list.push({
          data: res.data,
          mime: res.mime || "image/png",
        })
        imagesByCourse.set(img.courseIdx, list)
      }
      if (i < allImages.length - 1) await sleep(DOWNLOAD_GAP_MS)
    }
  } finally {
    ov.close()
  }

  return { filesByCourse, imagesByCourse }
}

async function downloadFileAsBase64(url) {
  try {
    const resp = await fetch(url, { credentials: "include" })
    if (resp.url && /\/login\//i.test(resp.url)) return null
    if (!resp.ok) return null
    const blob = await resp.blob()
    if (blob.size > MAX_FILE_BYTES) return null
    // Moodle occasionally serves an HTML wrapper page for /mod/resource/view.php
    // instead of redirecting to the file. We'd rather skip than feed that HTML
    // to extractText pretending it's the docx/pptx the user asked for.
    if (/^text\/html/i.test(blob.type)) {
      console.warn(
        "[schedule-app/moodle] download rejected as HTML:",
        url,
        "content-type:",
        blob.type,
      )
      return null
    }
    const data = await blobToBase64(blob)
    console.log(
      "[schedule-app/moodle] download OK:",
      url,
      "mime:",
      blob.type,
      "size:",
      blob.size,
    )
    return { data, mime: blob.type || "", size: blob.size }
  } catch (e) {
    console.warn("[schedule-app/moodle] download failed", url, e)
    return null
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r !== "string") {
        reject(new Error("reader result not a string"))
        return
      }
      resolve(r.split(",")[1] || "")
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function mimeFromExt(ext) {
  switch (ext) {
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "ppt":
      return "application/vnd.ms-powerpoint"
    case "pdf":
      return "application/pdf"
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "doc":
      return "application/msword"
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    default:
      return "application/octet-stream"
  }
}

// Reverse of mimeFromExt. Used after download on "未知类型" files: the blob's
// mime tells us the real format, so we can label the filename with the right
// extension and let the frontend's classifyFile() route it to pdfjs / mammoth
// / jszip as appropriate.
function extFromMime(mime) {
  if (!mime) return null
  const m = mime.toLowerCase()
  if (m.includes("presentationml.presentation")) return "pptx"
  if (m.includes("ms-powerpoint")) return "ppt"
  if (m.includes("wordprocessingml.document")) return "docx"
  if (m.includes("msword")) return "doc"
  if (m.includes("pdf")) return "pdf"
  if (m.includes("image/png")) return "png"
  if (m.includes("image/jpeg") || m.includes("image/jpg")) return "jpg"
  return null
}

function ensureNameHasExt(name, ext) {
  if (!ext) return name
  if (extFromName(name)) return name
  return `${name}.${ext}`
}

function showReadyOverlay(courses, downloads) {
  return new Promise((resolve) => {
    hideOverlay()
    let totalFiles = 0
    let totalBytes = 0
    for (const arr of downloads.filesByCourse.values()) {
      for (const f of arr) {
        totalFiles++
        totalBytes += f.size
      }
    }
    let totalImages = 0
    for (const arr of downloads.imagesByCourse.values()) totalImages += arr.length

    const selectedFlat = []
    for (const arr of downloads.filesByCourse.values()) {
      for (const f of arr) selectedFlat.push({ size: f.size })
    }
    const cost = estimateCostRough(selectedFlat, courses)

    const backdrop = document.createElement("div")
    backdrop.id = OVERLAY_ID
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "background:rgba(0,0,0,0.5)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif",
    ].join(";")

    const panel = document.createElement("div")
    panel.style.cssText = [
      "background:#fff",
      "border-radius:12px",
      "padding:22px 28px",
      "min-width:340px",
      "max-width:92vw",
      "box-shadow:0 20px 60px rgba(0,0,0,0.4)",
    ].join(";")

    const title = document.createElement("div")
    title.textContent = "✓ 下载完成"
    title.style.cssText =
      "font-weight:600;font-size:15px;margin-bottom:10px;color:#10B981"
    panel.appendChild(title)

    const info1 = document.createElement("div")
    info1.textContent = `已下载 ${totalFiles} 个文件 (${formatBytes(totalBytes)}) + ${totalImages} 张内嵌图片`
    info1.style.cssText = "font-size:13px;color:#333;margin-bottom:4px"
    panel.appendChild(info1)

    const info2 = document.createElement("div")
    info2.textContent = `预估 API 费用: ~$${cost.toFixed(2)}（基于实际文件大小）`
    info2.style.cssText = "font-size:12px;color:#666;margin-bottom:14px"
    panel.appendChild(info2)

    const actions = document.createElement("div")
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end"
    const cancelBtn = document.createElement("button")
    cancelBtn.textContent = "取消"
    cancelBtn.style.cssText =
      "padding:8px 14px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#333"
    cancelBtn.onclick = () => {
      hideOverlay()
      resolve("cancel")
    }
    actions.appendChild(cancelBtn)

    const okBtn = document.createElement("button")
    okBtn.textContent = "确认解析并导入"
    okBtn.style.cssText =
      "padding:8px 14px;border:none;background:#10B981;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600"
    okBtn.onclick = () => {
      hideOverlay()
      resolve("continue")
    }
    actions.appendChild(okBtn)
    panel.appendChild(actions)

    backdrop.appendChild(panel)
    document.body.appendChild(backdrop)
  })
}

function buildPayload(courses, downloads) {
  return courses.map((c, ci) => ({
    course_code: c.course_code,
    course_name: c.course_name,
    course_url: c.course_url,
    events: c.events,
    files: c.files,
    page_content: {
      text: c.pageText || "",
      images: downloads.imagesByCourse.get(ci) || [],
    },
    downloaded_files: downloads.filesByCourse.get(ci) || [],
  }))
}
