import type { ReactNode } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'

interface Props {
  title: string
  children: ReactNode
  headerRight?: ReactNode
  hideNav?: boolean
}

export default function Layout({ title, children, headerRight, hideNav }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-main text-text">
      <Header title={title} right={headerRight} />
      <main className={`flex-1 ${hideNav ? '' : 'pb-20'}`}>{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  )
}
