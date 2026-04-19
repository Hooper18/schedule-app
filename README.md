# schedule-app

课程日程管理 PWA。React + TypeScript + Vite + Tailwind v4 + Supabase。

## 本地开发

```bash
cp .env.example .env     # 填入 Supabase URL 与 anon key
npm install
npm run dev              # http://localhost:5173
```

## 数据库

建表脚本详见项目根目录的开发说明（schema：`semesters / courses /
weekly_schedule / events / academic_calendar / event_fingerprints /
scan_logs`，全部启用 RLS）。所有 SQL 在 Supabase Dashboard 执行，
代码内不建表。

## Supabase Auth 配置

Redirect URLs 需同时加入：

- 生产域名（Vercel）
- `http://localhost:5173`

## 部署（Vercel）

环境变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 目录结构

```
src/
  components/
    layout/      Header / BottomNav / Layout / ThemeToggle
    views/       TimelineView / CalendarView / CoursesView / ImportView
    shared/      EventCard / CourseCard / FilterBar
  contexts/      AuthContext
  hooks/         useSemester / useCourses / useEvents
  lib/           supabase / types / utils / theme
  pages/         Auth / Timeline / Calendar / Courses / CourseDetail / Import
```

## 主题

通过 `data-theme="light|dark"` 与 CSS 变量切换，用户偏好存 localStorage，
刷新前由 `index.html` 内的内联脚本优先应用以避免闪烁。
