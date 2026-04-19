import JSZip from 'jszip'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
// Vite resolves this to a static asset URL; pdfjs loads the worker lazily.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type FileKind = 'pptx' | 'pdf' | 'docx'
export type ImportKind = FileKind | 'image'

export const MAX_DOC_SIZE = 10 * 1024 * 1024 // 10 MB for pptx/pdf/docx
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB for images (Anthropic cap)

export interface ExtractResult {
  kind: FileKind
  text: string
  pageCount: number
}

export interface ImageResult {
  base64: string
  mediaType: string
}

const IMAGE_EXT_TO_MEDIA: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function docKind(name: string): FileKind | null {
  if (name.endsWith('.pptx')) return 'pptx'
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  return null
}

function imageMediaType(name: string): string | null {
  const m = name.match(/\.(png|jpe?g|webp|gif)$/)
  if (!m) return null
  return IMAGE_EXT_TO_MEDIA[m[1]] ?? null
}

export function classifyFile(file: File): ImportKind | null {
  const n = file.name.toLowerCase()
  const dk = docKind(n)
  if (dk) return dk
  if (imageMediaType(n)) return 'image'
  return null
}

export function isSupported(file: File): boolean {
  return classifyFile(file) !== null
}

export function checkSize(file: File, kind: ImportKind): string | null {
  const limit = kind === 'image' ? MAX_IMAGE_SIZE : MAX_DOC_SIZE
  if (file.size > limit) {
    return `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，${kind === 'image' ? '图片' : '文档'}上限 ${limit / 1024 / 1024}MB`
  }
  return null
}

export async function extractText(file: File): Promise<ExtractResult> {
  const sizeErr = checkSize(file, docKind(file.name.toLowerCase()) ?? 'image')
  if (sizeErr) throw new Error(sizeErr)
  const kind = docKind(file.name.toLowerCase())
  if (!kind) {
    throw new Error('不支持的格式：文档只接受 .pptx / .pdf / .docx')
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

export async function readImage(file: File): Promise<ImageResult> {
  const sizeErr = checkSize(file, 'image')
  if (sizeErr) throw new Error(sizeErr)
  const mediaType = imageMediaType(file.name.toLowerCase())
  if (!mediaType) {
    throw new Error('不支持的图片格式：.png / .jpg / .jpeg / .webp / .gif')
  }
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Avoid stack overflow for large arrays — chunk into 32KB strings then btoa.
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return { base64: btoa(binary), mediaType }
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

export function sourceFor(
  kind: ImportKind,
): 'ppt_import' | 'pdf_import' | 'docx_import' | 'photo_import' {
  if (kind === 'pptx') return 'ppt_import'
  if (kind === 'pdf') return 'pdf_import'
  if (kind === 'docx') return 'docx_import'
  return 'photo_import'
}
