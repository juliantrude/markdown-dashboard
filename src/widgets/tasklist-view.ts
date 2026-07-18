import type { TableData } from './chart-view.js'

export interface TaskItem {
  html: string
  done: boolean
}

export interface TaskProgress {
  done: number
  total: number
  percent: number
}

export function taskProgress(tasks: TaskItem[]): TaskProgress {
  const done = tasks.filter((task) => task.done).length
  const total = tasks.length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}

/** Two-category `TableData` (Done/Open counts) so the donut view can reuse chart-view's existing `mountChart(..., 'donut')` builder rather than a bespoke chart config. */
export function taskDonutData(tasks: TaskItem[]): TableData {
  const { done, total } = taskProgress(tasks)
  return { categories: ['Done', 'Open'], series: [{ label: 'Tasks', data: [done, total - done] }] }
}

/** Per-item checklist — every milestone's done/open state stays visible alongside the aggregate progress bar/donut, per ELEMENTS.md ("never a bare percentage"). */
export function renderTaskItemsHtml(tasks: TaskItem[]): string {
  const items = tasks
    .map(
      (task) => `
        <li class="task-item">
          <input type="checkbox" disabled${task.done ? ' checked' : ''}>
          <span>${task.html}</span>
        </li>
      `,
    )
    .join('')
  return `<ul class="task-list">${items}</ul>`
}

export function renderProgressBarHtml(tasks: TaskItem[]): string {
  const { done, total, percent } = taskProgress(tasks)
  return `
    <div class="progress-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar-fill" style="width: ${percent}%"></div>
    </div>
    <p class="progress-label">${percent}% complete (${done}/${total})</p>
  `
}
