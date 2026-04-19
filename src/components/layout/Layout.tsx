import type { ReactNode } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'

interface Props {
  title: string
  children: ReactNode
  headerRight?: ReactNode
  hideNav?: boolean
  showBack?: boolean
  onBack?: () => void
  /**
   * When true, the page fills exactly the viewport height and the main
   * region clips overflow — the page-level scrollbar disappears and the
   * inner component is responsible for its own scrolling region(s) and
   * for clearing BottomNav (add `pb-24` or similar inside scroll areas).
   */
  fixedHeight?: boolean
}

export default function Layout({
  title,
  children,
  headerRight,
  hideNav,
  showBack,
  onBack,
  fixedHeight,
}: Props) {
  const rootCls = fixedHeight
    ? 'h-dvh overflow-hidden flex flex-col bg-main text-text'
    : 'min-h-screen flex flex-col bg-main text-text'
  const mainCls = fixedHeight
    ? 'flex-1 min-h-0 overflow-hidden'
    : `flex-1 ${hideNav ? '' : 'pb-20'}`
  return (
    <div className={rootCls}>
      <Header
        title={title}
        right={headerRight}
        showBack={showBack}
        onBack={onBack}
      />
      <main className={mainCls}>{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  )
}
