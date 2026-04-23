import { Download, AlertTriangle, Chrome, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import Modal from './shared/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

function StepSection({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 pt-1">
        <div className="shrink-0 w-8 h-8 rounded-full bg-accent text-white text-sm font-semibold flex items-center justify-center">
          {number}
        </div>
        <h3 className="text-base font-semibold text-text break-words">{title}</h3>
      </div>
      <div className="pl-0 sm:pl-11 space-y-3 text-sm text-text leading-relaxed">
        {children}
      </div>
    </section>
  )
}

function Ordered({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal list-outside pl-5 space-y-2 marker:text-dim marker:font-medium">
      {children}
    </ol>
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <div className="min-w-0 break-words leading-relaxed">{children}</div>
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-card border border-border text-[0.85em] break-all">
      {children}
    </code>
  )
}

export default function HelpModal({ open, onClose }: Props) {
  return (
    <Modal open={open} title="使用教程" onClose={onClose} size="2xl">
      <div className="space-y-7">
        {/* Prerequisite banner */}
        <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
          <Chrome size={18} className="shrink-0 mt-0.5 text-accent" />
          <div className="text-sm text-text leading-relaxed break-words">
            <div className="font-semibold">前置要求</div>
            <p className="text-xs text-dim mt-0.5">
              请使用 <span className="text-text font-medium">Edge</span> 或{' '}
              <span className="text-text font-medium">Chrome</span>{' '}
              浏览器打开本站，其他浏览器（Safari / Firefox 等）不支持本教程用到的扩展加载方式。
            </p>
          </div>
        </div>

        {/* Billing primer — AI is metered. New users need to know about the
            invite-code bootstrap path before they hit the file-import step
            and see a 402 with no context. */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Wallet size={18} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="text-sm text-text leading-relaxed break-words space-y-1">
            <div className="font-semibold">费用与初始额度</div>
            <p className="text-xs text-dim">
              AI 解析（Moodle 扫描、课件上传、快速添加、课表粘贴）按输入内容大小
              向你账户扣费，以 <span className="text-text font-medium">USD（美元）</span>
              计价，每次单独解析约 $0.01–$0.30。
            </p>
            <ul className="list-disc list-outside pl-5 text-xs text-dim space-y-0.5 marker:text-dim">
              <li>
                新用户凭邀请码可获得{' '}
                <span className="text-text font-medium">$1.00</span>{' '}
                初始额度（每账号限一次），在「右上角账户菜单 → 兑换邀请码」
                中输入即可
              </li>
              <li>
                余额不足时，添加开发者微信{' '}
                <Code>hituchenguang</Code> 充值（支持微信 / 支付宝，按当日
                汇率折算人民币）
              </li>
              <li>课程表导入、手动 CRUD、日历查看等非 AI 功能完全免费</li>
            </ul>
          </div>
        </div>

        <StepSection number={1} title="下载并安装浏览器扩展">
          <Ordered>
            <li>
              点击下方按钮下载扩展压缩包（.7z 格式）：
              <div className="mt-2">
                <a
                  href="/extensions.7z"
                  download
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90"
                >
                  <Download size={14} /> 下载扩展包 (.7z)
                </a>
              </div>
            </li>
            <li>
              用解压软件（<span className="text-text">7-Zip</span>、
              <span className="text-text">WinRAR</span>、
              <span className="text-text">Bandizip</span> 等）解压，得到两个文件夹：
              <Code>ac-online</Code> 和 <Code>moodle</Code>
            </li>
            <li>
              打开浏览器扩展管理页面：
              <ul className="list-disc list-outside pl-5 mt-1.5 space-y-1 marker:text-dim">
                <li>
                  Edge 用户：地址栏输入 <Code>edge://extensions</Code>
                </li>
                <li>
                  Chrome 用户：地址栏输入 <Code>chrome://extensions</Code>
                </li>
              </ul>
            </li>
            <li>打开页面右上角的「开发者模式」开关</li>
            <li>点击「加载已解压的扩展程序」按钮</li>
            <li>
              先选择 <Code>ac-online</Code> 文件夹，加载成功后再重复一次，选择{' '}
              <Code>moodle</Code> 文件夹
            </li>
            <li>两个扩展都显示已启用后，继续下一步</li>
          </Ordered>
        </StepSection>

        <StepSection number={2} title="导入课程表（AC Online）">
          <Ordered>
            <li>
              打开 <Code>ac.xmu.edu.my</Code> 并登录你的学生账号
            </li>
            <li>
              点击顶部菜单 <span className="text-text font-medium">Basic Info.</span> →{' '}
              <span className="text-text font-medium">Course List</span>
            </li>
            <li>
              确认学期选择正确（如 <Code>2026/04</Code>）
            </li>
            <li>
              点击页面右下角的{' '}
              <span className="text-text font-medium">「导入到 Schedule App」</span>{' '}
              按钮（蓝色悬浮按钮）
            </li>
            <li>浏览器会自动跳转到 Schedule App 的导入页面</li>
            <li>
              检查识别到的课程信息是否正确（<span className="text-text">课程代码</span>、
              <span className="text-text">时间</span>、
              <span className="text-text">教室</span>），如有错误请手动修改
            </li>
            <li>确认无误后点击保存</li>
          </Ordered>
        </StepSection>

        <StepSection number={3} title="导入 DDL（Moodle）">
          <Ordered>
            <li>
              打开 <Code>l.xmu.edu.my</Code> 并登录你的学生账号
            </li>
            <li>
              点击顶部菜单 <span className="text-text font-medium">「我的课程」</span>
            </li>
            <li>
              在课程列表左下角，将显示筛选改为{' '}
              <span className="text-text font-medium">「所有」</span>
              （确保显示全部课程，否则可能漏掉部分旧/新课程）
            </li>
            <li>
              点击页面右下角的{' '}
              <span className="text-text font-medium">「导入 DDL」</span>{' '}
              按钮（红色悬浮按钮）
            </li>
            <li>
              弹窗中会列出所有课程，先筛选出本学期的课程（
              <span className="text-text">取消勾选非本学期的旧课程</span>）
            </li>
            <li>
              对每门课程，手动选择可能包含 DDL 信息的文件（如{' '}
              <Code>Assignment</Code>、<Code>Quiz</Code>、<Code>Exam</Code>、
              <Code>Syllabus</Code>、<Code>Course Plan</Code>、<Code>Overview</Code>{' '}
              等）；不需要的文件（如 <Code>Lecture slides</Code>、
              <Code>Solutions</Code>）取消勾选
              <div className="mt-2">
                <Warn>
                  AI 自动勾选的结果不一定准确，请务必人工核查后再进入下一步。
                </Warn>
              </div>
            </li>
            <li>
              点击 <span className="text-text font-medium">「下载并继续」</span>
            </li>
            <li>
              文件会<span className="text-text">逐个串行</span>
              下载和解析（不用并行是为了避免 API 过载），请耐心等待，
              <span className="text-text">不要关闭页面</span>
            </li>
            <li>
              解析完成后，仔细核查每条 DDL 的信息：
              <div className="mt-2 space-y-2">
                <Warn>
                  重点检查<span className="font-medium"> 课程代码 </span>
                  是否正确 —— AI 有时会把 DDL 匹配到错的课程下。
                </Warn>
                <ul className="list-disc list-outside pl-5 space-y-1 marker:text-dim text-xs text-dim">
                  <li>检查截止日期、时间、类型是否准确</li>
                  <li>删除或修改不正确的条目</li>
                </ul>
              </div>
            </li>
            <li>确认无误后点击保存导入</li>
          </Ordered>
        </StepSection>

        <StepSection number={4} title="课件上传（可选）">
          <p className="text-sm text-text leading-relaxed break-words">
            如果有额外的 <Code>PDF</Code> / <Code>Word</Code> / 图片课件包含作业或考试信息，可以在{' '}
            <span className="text-text font-medium">「导入 → 课件」</span>{' '}
            标签页上传，AI 会尝试识别其中的日期和 DDL。
          </p>
          <p className="text-xs text-dim leading-relaxed break-words">
            这一步不是必需的 —— Moodle 导入通常已经覆盖绝大部分 DDL，课件上传只作为补充来源。
          </p>
        </StepSection>
      </div>
    </Modal>
  )
}
