const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'TechDaily-Bot/1.0' }
});

const SOURCES = [
  { id: 'v2ex',    name: 'V2EX',       url: 'https://www.v2ex.com/feed/tab/hot.xml', tagClass: 'v2ex' },
  { id: 'hn',      name: 'HackerNews', url: 'https://hnrss.org/frontpage',           tagClass: 'hn' },
  { id: 'ruanyf',  name: '阮一峰',     url: 'https://www.ruanyifeng.com/blog/atom.xml', tagClass: 'ruanyf' },
  { id: 'openai',  name: 'OpenAI',     url: 'https://openai.com/blog/rss.xml',        tagClass: 'openai' },
  { id: 'deepmind',name: 'DeepMind',   url: 'https://deepmind.google/blog/rss.xml',   tagClass: 'deepmind' },
  { id: 'arxiv-ai',name: 'arXiv AI',   url: 'https://rss.arxiv.org/rss/cs.AI',        tagClass: 'arxiv' },
  { id: 'arxiv-ml',name: 'arXiv ML',   url: 'https://rss.arxiv.org/rss/cs.LG',        tagClass: 'arxiv' },
  // 如需 RSSHub 源，取消下面注释：
  // { id: 'ithome',  name: 'IT之家',     url: 'https://rsshub.app/ithome/rank',         tagClass: 'ithome' },
  // { id: 'sspai',   name: '少数派',     url: 'https://rsshub.app/sspai/index',           tagClass: 'sspai' },
];

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items.map(item => ({
      title: (item.title || '无标题').trim(),
      link: item.link || item.guid || '',
      date: new Date(item.pubDate || item.isoDate || 0),
      source: source.id,
      sourceName: source.name,
      tagClass: source.tagClass,
      desc: (item.contentSnippet || item.content || '').slice(0, 220)
    }));
    return { source: source.id, ok: true, items };
  } catch (err) {
    console.error(`[${source.name}] 失败: ${err.message}`);
    return { source: source.id, ok: false, items: [] };
  }
}

function formatRelative(date) {
  if (!date || isNaN(date)) return '未知时间';
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return date.toLocaleDateString('zh-CN');
}

function escapeHtml(text) {
  return text.replace(/[&<<>"']/g, m => ({'&':'&amp;','<<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

async function main() {
  console.log('开始抓取...');
  const results = await Promise.all(SOURCES.map(fetchSource));

  let allItems = results.flatMap(r => r.items);
  
  // 去重（基于链接）
  const seen = new Set();
  allItems = allItems.filter(i => {
    if (!i.link || seen.has(i.link)) return false;
    seen.add(i.link);
    return true;
  });

  // 时间倒序，无时间的丢最后
  allItems.sort((a, b) => {
    if (isNaN(a.date)) return 1;
    if (isNaN(b.date)) return -1;
    return b.date - a.date;
  });

  // 每个源保留最新 15 条，避免 arXiv 刷屏
  const perSource = {};
  allItems = allItems.filter(i => {
    perSource[i.source] = (perSource[i.source] || 0) + 1;
    return perSource[i.source] <= 15;
  });

  const successCount = results.filter(r => r.ok).length;
  const buildTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 生成 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TechDaily - 今日技术新闻</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#c9d1d9;--text2:#8b949e;--accent:#58a6ff;--accent2:#238636;}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:20px}
header{text-align:center;padding:40px 0 20px;border-bottom:1px solid var(--border);margin-bottom:24px}
h1{font-size:2rem;margin-bottom:8px}.subtitle{color:var(--text2);font-size:.9rem}
.meta-info{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:12px;font-size:.8rem;color:var(--text2)}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent2);margin-right:4px}
.status-dot.err{background:#da3633}
.controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;align-items:center}
.btn{background:var(--card);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;transition:.2s}
.btn:hover{border-color:var(--accent);color:var(--accent)}.btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.grid{display:grid;gap:14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px;transition:.15s;text-decoration:none;color:inherit;display:block}
.card:hover{border-color:var(--accent);transform:translateY(-1px)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:12px}
.card-title{font-size:1.05rem;font-weight:600;line-height:1.4;word-break:break-word}
.card-meta{display:flex;gap:12px;font-size:.78rem;color:var(--text2);flex-wrap:wrap;align-items:center;margin-top:10px}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.72rem;font-weight:500;background:rgba(88,166,255,.15);color:var(--accent);border:1px solid rgba(88,166,255,.3)}
.tag.hn{background:rgba(255,102,0,.15);color:#ff6600;border-color:rgba(255,102,0,.3)}
.tag.v2ex{background:rgba(230,25,25,.15);color:#e61919;border-color:rgba(230,25,25,.3)}
.tag.ruanyf{background:rgba(35,134,54,.15);color:var(--accent2);border-color:rgba(35,134,54,.3)}
.tag.openai{background:rgba(16,163,127,.15);color:#10a37f;border-color:rgba(16,163,127,.3)}
.tag.deepmind{background:rgba(66,133,244,.15);color:#4285f4;border-color:rgba(66,133,244,.3)}
.tag.arxiv{background:rgba(179,27,27,.15);color:#b31b1b;border-color:rgba(179,27,27,.3)}
.empty{text-align:center;padding:60px;color:var(--text2)}
</style>
</head>
<body>
<div class="container">
<<header>
  <h1>TechDaily</h1>
  <div class="subtitle">聚合 V2EX · HN · 阮一峰 · OpenAI · DeepMind · arXiv</div>
  <div class="meta-info">
    <span><span class="status-dot"></span>构建于 ${buildTime}</span>
    <span>${successCount}/${SOURCES.length} 个源在线</span>
    <span>共 ${allItems.length} 条</span>
  </div>
</header>
<div class="controls">
  <button class="btn active" onclick="filter('all')">全部</button>
  <button class="btn" onclick="filter('v2ex')">V2EX</button>
  <button class="btn" onclick="filter('hn')">HN</button>
  <button class="btn" onclick="filter('ruanyf')">阮一峰</button>
  <button class="btn" onclick="filter('ai')">AI 专题</button>
</div>
<div id="grid" class="grid">
${allItems.length ? allItems.map(i => `
  <a class="card" href="${escapeHtml(i.link)}" target="_blank" rel="noopener" data-source="${i.source}">
    <div class="card-header">
      <div class="card-title">${escapeHtml(i.title)}</div>
    </div>
    <div class="card-meta">
      <span class="tag ${i.tagClass}">${escapeHtml(i.sourceName)}</span>
      <span>${formatRelative(i.date)}</span>
    </div>
  </a>
`).join('') : '<div class="empty">暂无内容</div>'}
</div>
</div>
<script>
const allCards = Array.from(document.querySelectorAll('.card'));
function filter(type){
  document.querySelectorAll('.controls .btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  const show = type==='all' ? allCards : type==='ai' 
    ? allCards.filter(c=>['openai','deepmind','arxiv-ai','arxiv-ml'].includes(c.dataset.source))
    : allCards.filter(c=>c.dataset.source===type);
  allCards.forEach(c=>c.style.display='none');
  show.forEach(c=>c.style.display='block');
  document.getElementById('grid').style.display = show.length?'grid':'block';
  if(!show.length) document.getElementById('grid').innerHTML = '<div class="empty">该分类下暂无内容</div>';
}
</script>
</body>
</html>`;

  const dist = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), html, 'utf-8');
  console.log(`生成完毕: ${allItems.length} 条 → dist/index.html`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
