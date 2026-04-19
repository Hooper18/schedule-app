import JSZip from 'jszip'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this to a static asset URL; pdfjs loads the worker lazily.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type FileKind = 'pptx' | 'pdf' | 'docx'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export interface ExtractResult {
  kind: FileKind
  text: string
  pageCount: number
}

function classify(file: File): FileKind | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pptx')) return 'pptx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  // Old .ppt / .doc are NOT supported — they're binary formats the browser libs can't read.
  return null
}

export function isSupported(file: File): boolean {
  return classify(file) !== null
}

export async function extractText(file: File): Promise<ExtractResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    )
  }
  const kind = classify(file)
  if (!kind) {
    throw new Error('不支持的格式：只接受 .pptx / .pdf / .docx')
  }
  const buf = await file.arrayBuffer()
  switch (kind) {
    case 'pptx':
      return extractPptx(buf)
    case 'pdf':
      return extractPdf(buf)
    case 'docx':
      return extractDocx(buf)
  }
}

async function extractPptx(buf: ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buf)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)![1], 10)
      const nb = parseInt(b.match(/slide(\d+)/)![1], 10)
      return na - nb
    })
  const parts: string[] = []
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i])!.async('text')
    const texts: string[] = []
    for (const m of xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)) {
      const t = decodeXml(m[1]).trim()
      if (t) texts.push(t)
    }
    parts.push(`--- Slide ${i + 1} ---\n${texts.join('\n')}`)
  }
  return {
    kind: 'pptx',
    text: parts.join('\n\n'),
    pageCount: slideNames.length,
  }
}

async function extractPdf(buf: ArrayBuffer): Promise<ExtractResult> {
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .filter(Boolean)
      .join(' ')
    parts.push(`--- Page ${i} ---\n${line}`)
  }
  return {
    kind: 'pdf',
    text: parts.join('\n\n'),
    pageCount: pdf.numPages,
  }
}

async function extractDocx(buf: ArrayBuffer): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return {
    kind: 'docx',
    text: result.value,
    pageCount: 1,
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function sourceFor(kind: FileKind): 'ppt_import' | 'pdf_import' | 'docx_import' {
  if (kind === 'pptx') return 'ppt_import'
  if (kind === 'pdf') return 'pdf_import'
  return 'docx_import'
}
