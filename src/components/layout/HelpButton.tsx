import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import HelpModal from '../HelpModal'

export default function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg hover:bg-hover text-dim transition-colors"
        aria-label="使用教程"
      >
        <HelpCircle size={18} />
      </button>
      <HelpModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
