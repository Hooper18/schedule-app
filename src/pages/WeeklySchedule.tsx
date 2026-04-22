import Layout from '../components/layout/Layout'
import WeeklyScheduleView from '../components/views/WeeklyScheduleView'

export default function WeeklySchedulePage() {
  return (
    <Layout title="课表" fixedHeight>
      <WeeklyScheduleView />
    </Layout>
  )
}
