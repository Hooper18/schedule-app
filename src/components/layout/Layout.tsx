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
}

export default function Layout({
  title,
  children,
  headerRight,
  hideNav,
  showBack,
  onBack,
}: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-main text-text">
      <Header
        title={title}
        right={headerRight}
        showBack={showBack}
        onBack={onBack}
      />
      <main className={`flex-1 ${hideNav ? '' : 'pb-20'}`}>{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  )
}
