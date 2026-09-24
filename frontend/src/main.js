import './style.css'
import packageJson from '../package.json'

const API_URL = import.meta.env.VITE_API_URL || packageJson.config.apiUrl
const state = { conversations: [], activeId: null, messages: [], sidebarOpen: true, loading: false }
const icons = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14 0M13 6l6 6-6 6"/></svg>',
}

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><span class="brand-mark">g</span><span>groq<span class="brand-dot">.</span>chat</span></div>
      <button class="new-chat" id="new-chat">${icons.plus}<span>New chat</span><kbd>⌘ K</kbd></button>
      <div class="history-heading"><span>History</span><span class="history-count" id="history-count">0</span></div>
      <nav class="conversation-list" id="conversation-list"></nav>
      <div class="sidebar-footer"><div class="status-dot"></div><span>Groq Cloud connected</span></div>
    </aside>
    <main class="chat-panel">
      <header class="topbar">
        <button class="icon-button menu-button" id="menu-button" aria-label="Toggle chat history">${icons.menu}</button>
        <div class="model-select"><span class="model-status"></span><span>gpt-oss-20b</span><span class="chevron">⌄</span></div>
        <div class="topbar-actions"><button class="icon-button" id="clear-chat" aria-label="Clear current chat" title="Clear current chat">${icons.plus}</button><div class="avatar">Y</div></div>
      </header>
      <section class="chat-content">
        <div class="welcome" id="welcome">
          <div class="welcome-mark">${icons.spark}</div>
          <p class="eyebrow">Groq Cloud · gpt-oss-20b</p>
          <h1>What will we<br><em>make</em> today?</h1>
          <p class="welcome-copy">A fast, focused space for thinking out loud.<br>Ask anything and let’s get moving.</p>
          <div class="suggestions">
            <button class="suggestion" data-prompt="Help me plan a focused workday"><span>Plan my day</span>${icons.arrow}</button>
            <button class="suggestion" data-prompt="Explain a complex idea in simple terms"><span>Make it simple</span>${icons.arrow}</button>
            <button class="suggestion" data-prompt="Give me three creative ideas for a side project"><span>Find inspiration</span>${icons.arrow}</button>
          </div>
        </div>
        <div class="messages" id="messages"></div>
      </section>
      <div class="composer-wrap">
        <form class="composer" id="composer">
          <textarea id="message-input" rows="1" placeholder="Message gpt-oss-20b..." aria-label="Message gpt-oss-20b"></textarea>
          <div class="composer-bottom"><span class="composer-hint">Groq Cloud · Responses are generated live</span><button class="send-button" id="send-button" type="submit" aria-label="Send message">${icons.send}</button></div>
        </form>
        <p class="disclaimer">AI can make mistakes. Check important info.</p>
      </div>
    </main>
  </div>
`

const elements = { sidebar: document.querySelector('#sidebar'), list: document.querySelector('#conversation-list'), historyCount: document.querySelector('#history-count'), welcome: document.querySelector('#welcome'), messages: document.querySelector('#messages'), input: document.querySelector('#message-input'), composer: document.querySelector('#composer'), send: document.querySelector('#send-button') }

function escapeHtml(value) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]) }
function formatDate(value) { return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '' }
function renderConversations() {
  elements.historyCount.textContent = state.conversations.length
  elements.list.innerHTML = state.conversations.length ? state.conversations.map((conversation) => `<button class="conversation ${conversation.id === state.activeId ? 'active' : ''}" data-id="${conversation.id}"><span class="conversation-title">${escapeHtml(conversation.title || 'New conversation')}</span><span class="conversation-time">${formatDate(conversation.updated_at || conversation.created_at)}</span></button>`).join('') : '<p class="empty-history">Your conversations<br>will appear here.</p>'
  elements.list.querySelectorAll('.conversation').forEach((button) => button.addEventListener('click', () => loadConversation(button.dataset.id)))
}
function renderMessages() {
  elements.welcome.hidden = state.messages.length > 0
  elements.messages.innerHTML = state.messages.map((message) => `<article class="message ${message.role}"><div class="message-label">${message.role === 'user' ? 'You' : 'gpt-oss-20b'}</div><div class="message-body">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div></article>`).join('')
  elements.messages.scrollTop = elements.messages.scrollHeight
}
async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Something went wrong.')
  return response.json()
}
async function loadConversations() { try { state.conversations = await request('/conversations'); renderConversations() } catch (error) { console.warn(error.message); renderConversations() } }
async function loadConversation(id) { state.activeId = id; state.messages = await request(`/conversations/${id}/messages`); renderConversations(); renderMessages() }
function newChat() { state.activeId = null; state.messages = []; renderConversations(); renderMessages(); elements.input.focus() }
async function sendMessage(content) {
  if (!content || state.loading) return
  state.loading = true; elements.input.value = ''; elements.input.style.height = 'auto'; elements.send.disabled = true
  state.messages.push({ role: 'user', content }); renderMessages()
  const pending = { role: 'assistant', content: 'Thinking...' }; state.messages.push(pending); renderMessages()
  try {
    const result = await request('/chat', { method: 'POST', body: JSON.stringify({ conversation_id: state.activeId, message: content }) })
    state.activeId = result.conversation.id; pending.content = result.message.content; state.conversations = [result.conversation, ...state.conversations.filter((item) => item.id !== result.conversation.id)]; renderConversations(); renderMessages()
  } catch (error) { pending.content = `I couldn't reach the server. ${error.message}`; renderMessages() }
  finally { state.loading = false; elements.send.disabled = false; elements.input.focus() }
}
elements.composer.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(elements.input.value.trim()) })
elements.input.addEventListener('input', () => { elements.input.style.height = 'auto'; elements.input.style.height = `${Math.min(elements.input.scrollHeight, 140)}px` })
elements.input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); elements.composer.requestSubmit() } })
document.querySelector('#new-chat').addEventListener('click', newChat)
document.querySelector('#clear-chat').addEventListener('click', newChat)
document.querySelector('#menu-button').addEventListener('click', () => { state.sidebarOpen = !state.sidebarOpen; elements.sidebar.classList.toggle('collapsed', !state.sidebarOpen) })
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.prompt)))
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); newChat() } })
loadConversations()
