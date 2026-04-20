// Injected into calendar.tuchenguang.com/import*.
// When the URL has ?source=moodle, pull the scan payload that content.js
// wrote to chrome.storage.local and postMessage it to the page so ImportView's
// listener can pick it up. Posts twice (immediate + 500ms) to defend against
// the React listener not being registered yet.

if (new URLSearchParams(location.search).get("source") === "moodle") {
  chrome.storage.local.get("moodle_import_data", (result) => {
    const raw = result && result.moodle_import_data
    if (!raw) return
    let payload
    try {
      payload = JSON.parse(raw)
    } catch (err) {
      console.error("[schedule-app/moodle-bridge] payload parse failed", err)
      return
    }
    chrome.storage.local.remove("moodle_import_data")

    const deliver = () => {
      window.postMessage({ type: "MOODLE_IMPORT_DATA", payload }, "*")
    }
    deliver()
    setTimeout(deliver, 500)
  })
}
