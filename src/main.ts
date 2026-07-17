import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="dashboard">
    <h1>Dashboard</h1>
    <p id="doc-title" class="dashboard-subtitle"></p>
    <div id="content" class="dashboard-grid"></div>
  </div>
`

const docTitleEl = document.querySelector<HTMLParagraphElement>('#doc-title')!
const contentEl = document.querySelector<HTMLDivElement>('#content')!

interface Card {
  heading: string
  html: string
}

interface ContentMessage {
  type: 'content'
  title: string
  cards: Card[]
}

function isContentMessage(value: unknown): value is ContentMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'content' &&
    typeof (value as { title?: unknown }).title === 'string' &&
    Array.isArray((value as { cards?: unknown }).cards)
  )
}

function renderCards({ title, cards }: ContentMessage): void {
  docTitleEl.textContent = title
  contentEl.innerHTML = cards
    .map(
      (card) => `
        <section class="card">
          <h2 class="card-heading">${escapeHtml(card.heading)}</h2>
          <div class="card-body">${card.html}</div>
        </section>
      `,
    )
    .join('')
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

// Reconnects on drop (e.g. server restart) so live reload keeps working
// without a manual page refresh.
function connectLiveReload(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${protocol}//${location.host}/ws`)

  socket.addEventListener('message', (event) => {
    const message: unknown = JSON.parse(event.data as string)
    if (isContentMessage(message)) renderCards(message)
  })

  socket.addEventListener('close', () => {
    setTimeout(connectLiveReload, 1000)
  })
}

connectLiveReload()
