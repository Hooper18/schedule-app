import { X } from 'lucide-react'
import { useEffect } from 'react'

type Props = {
  onClose: () => void
}

export default function TermsModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-main border border-border rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">使用条款</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-dim"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-dim space-y-3">
          <p>
            XMUM Schedule 是一个个人开发的课程日程管理工具，面向厦门大学马来西亚分校的学生，帮助整理课表、作业、小测、考试等关键节点，并集成 AI 辅助解析课件与日程。
          </p>

          <h3 className="font-semibold text-text mt-4">主要功能</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>学期课表、日历与作业/考试时间线</li>
            <li>AC Online / Moodle 一键导入课程与事件</li>
            <li>AI 辅助解析课件 PDF/PPT/Word/图片并提取评估项</li>
            <li>多终端同步（基于 Supabase 云数据库）</li>
          </ul>

          <h3 className="font-semibold text-text mt-4">费用说明</h3>
          <p>
            基础功能免费。AI 解析按实际 API 成本计价（约为供应商成本的三倍，用于覆盖代理服务器与运营费用），通过充值余额扣费，充值记录与消费明细可在账户内查看。
          </p>

          <h3 className="font-semibold text-text mt-4">免责声明</h3>
          <p>
            本应用是个人开发的非商业项目，没有公司实体，也未经过法律审核。我尽力保障数据安全（账号密码加密存储，你的课程数据仅你自己可见），但
            <span className="font-semibold text-text">
              不对任何数据丢失、服务中断、AI 解析错误或其他问题承担责任
            </span>
            ，使用即视为接受这一点。
          </p>
          <p>
            你的数据保存在 Supabase 云服务上，AI 解析通过 Anthropic Claude 完成，这两个是我使用的第三方服务。除此之外，我不会把你的数据提供给任何人，也不会用于任何商业目的。
          </p>
          <p>充值款项用于覆盖 API 与运营成本，不提供退款；如遇重大服务问题可联系开发者协商。</p>
          <p>如果你不能接受上述条款，请不要使用本应用。</p>
        </div>
      </div>
    </div>
  )
}
