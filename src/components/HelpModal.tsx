import { Download, BookOpen, FileUp, CalendarDays, GraduationCap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Modal from './shared/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

function StepHeading({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="font-semibold text-sm flex items-start gap-2">
      <Icon size={16} className="text-accent mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </h3>
  )
}

export default function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} title="使用教程" onClose={onClose}>
      <div className="space-y-5 text-sm text-text leading-relaxed">
        <section className="space-y-1.5">
          <StepHeading icon={CalendarDays}>1. 导入校历</StepHeading>
          <p className="text-dim text-xs pl-6 break-words">
            顶部进入「导入」→ 校历，粘贴学期起止日期、公假与复习考试周，后续所有事件都会按学期周次展示。
          </p>
        </section>

        <section className="space-y-1.5">
          <StepHeading icon={BookOpen}>2. 导入课程表</StepHeading>
          <p className="text-dim text-xs pl-6 break-words">
            装好 AC Online 扩展后，在 <span className="break-all">ac.xmu.edu.my</span> 学生面板点击扩展按钮，会自动跳回本站并载入课程表，确认保存即可。也可以在「导入 → 课程表」手动粘贴。
          </p>
        </section>

        <section className="space-y-1.5">
          <StepHeading icon={GraduationCap}>3. 抓取 Moodle DDL</StepHeading>
          <p className="text-dim text-xs pl-6 break-words">
            装好 Moodle 扩展后，在 <span className="break-all">l.xmu.edu.my</span> 任一课程页点「Import to Schedule」，浏览器会跳到本站「导入 → Moodle」并自动填入所有 assignment / quiz 截止时间。
          </p>
        </section>

        <section className="space-y-1.5">
          <StepHeading icon={FileUp}>4. 课件上传（可选）</StepHeading>
          <p className="text-dim text-xs pl-6 break-words">
            拖上去 PDF / Word / 图片课件，AI 会尝试识别其中提到的作业 / 考试日期作为补充来源。
          </p>
        </section>

        <section className="space-y-2 pt-3 border-t border-border">
          <StepHeading icon={Download}>浏览器扩展</StepHeading>
          <p className="text-dim text-xs pl-6 break-words">
            包含 AC Online 与 Moodle 两个 Chrome 扩展。下载后解压，在 <span className="break-all">chrome://extensions</span> 打开「开发者模式」→「加载已解压的扩展程序」分别加载两个文件夹即可。
          </p>
          <div className="pl-6 pt-1">
            <a
              href="/extensions.7z"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90"
            >
              <Download size={12} /> 下载扩展包 (.7z)
            </a>
          </div>
        </section>
      </div>
    </Modal>
  )
}
