const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 10000, // RSSHub 公共实例不给太多耐心，10s 足够
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.9',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.google.com/'
  }
});

// ============ 直连源（官方 RSS，url 必填） ============
const DIRECT_SOURCES = [
  { id: 'v2ex',     name: 'V2EX',       url: 'https://www.v2ex.com/feed/tab/hot.xml',    tagClass: 'v2ex' },
  { id: 'hn',       name: 'HackerNews', url: 'https://hnrss.org/frontpage',              tagClass: 'hn' },
  { id: 'ruanyf',   name: '阮一峰',     url: 'https://github.com/ruanyf/weekly/releases.atom', tagClass: 'ruanyf' },
  { id: 'openai',   name: 'OpenAI',     url: 'https://openai.com/blog/rss.xml',          tagClass: 'openai' },
  { id: 'deepmind', name: 'DeepMind',   url: 'https://deepmind.google/blog/rss.xml',     tagClass: 'deepmind' },
  { id: 'arxiv-ai', name: 'arXiv AI',   url: 'https://rss.arxiv.org/rss/cs.AI',        tagClass: 'arxiv' },
  { id: 'arxiv-ml', name: 'arXiv ML',   url: 'https://rss.arxiv.org/rss/cs.LG',        tagClass: 'arxiv' },
];

// ============ RSSHub 公共实例池 ============
const RSSHUB_INSTANCES = [
  'https://rsshub.rssforever.com',
  'https://rsshub.feeded.xyz',
  'https://hub.slarker.me',
  'https://rsshub.liumingye.cn',
  'https://rsshub-instance.zeabur.app',
  'https://rss.fatpandac.com',
  'https://rsshub.pseudoyu.com',
  'https://rsshub.friesport.ac.cn',
  'https://rsshub.atgw.io',
  'https://rsshub.rss.tips',
  'https://rsshub.mubibai.com',
  'https://rsshub.ktachibana.party',
  'https://rsshub.woodland.cafe',
  'https://rsshub.aierliz.xyz',
];

// ============ RSSHub 源（只写 route，不写完整域名） ============
const RSSHUB_SOURCES = [
  { id: 'ithome',   name: 'IT之家',     route: '/ithome/rank',                    tagClass: 'ithome' },
  { id: 'sspai',    name: '少数派',     route: '/sspai/index',                    tagClass: 'sspai' },
  { id: 'zhihu',    name: '知乎热榜',   route: '/zhihu/hotlist',                  tagClass: 'zhihu' },
  { id: 'github',   name: 'GitHub Trending', route: '/github/trending/daily/any', tagClass: 'github' },
  { id: 'solidot',  name: 'Solidot',    route: '/solidot/www',                    tagClass: 'solidot' },
  { id: 'juejin',   name: '掘金热榜',   route: '/juejin/hot/articles',            tagClass: 'juejin' },
  { id: 'cnblogs',  name: '博客园',     route: '/cnblogs/aggsite/topdiggs',       tagClass: 'cnblogs' },
  { id: 'oschina',  name: '开源中国',   route: '/oschina/news',                   tagClass: 'oschina' },
  { id: 'huxiu',    name: '虎嗅',       route: '/huxiu/article',                  tagClass: 'huxiu' },
  { id: 'kr36',     name: '36氪',       route: '/36kr/motors',                    tagClass: 'kr36' },
];

const SOURCES = [...DIRECT_SOURCES, ...RSSHUB_SOURCES];

// ============ 抓取逻辑：直连直接请求，RSSHub 轮询实例池 ============
async function fetchSource(source) {
  const urls = [];
  if (source.url) {
    urls.push(source.url);
  } else if (source.route) {
    for (const base of RSSHUB_INSTANCES) {
      urls.push(base + source.route);
    }
  }

  let lastErr = '';
  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      // 过滤掉无标题/无链接的脏数据
      const items = feed.items
        .filter(item => item.title && (item.link || item.guid))
        .map(item => ({
          title: item.title.trim(),
          link: item.link || item.guid,
          date: new Date(item.pubDate || item.isoDate || 0),
          source: source.id,
          sourceName: source.name,
          tagClass: source.tagClass,
          desc: (item.contentSnippet || item.content || '').slice(0, 220)
        }));
      console.log(`[${source.name}] 成功 (${url}) → ${items.length} 条`);
      return items;
    } catch (e) {
      lastErr = e.message;
      // 只打印失败域名，不打完整 URL 避免日志太长
      const host = new URL(url).hostname;
      console.error(`[${source.name}] ${host} 失败: ${e.message}`);
    }
  }
  console.error(`[${source.name}] 所有端点均失败，最后错误: ${lastErr}`);
  return [];
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
  
  let allItems = results.flat();
  
  const seen = new Set();
  allItems = allItems.filter(i => {
    if (!i.link || seen.has(i.link)) return false;
    seen.add(i.link);
    return true;
  });

  allItems.sort((a, b) => {
    if (isNaN(a.date)) return 1;
    if (isNaN(b.date)) return -1;
    return b.date - a.date;
  });

  const perSource = {};
  allItems = allItems.filter(i => {
    perSource[i.source] = (perSource[i.source] || 0) + 1;
    return perSource[i.source] <= 15;
  });

  const successCount = results.filter(r => r.length > 0).length;
  const buildTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const allBtns = SOURCES.map(s => 
    `<button class="btn" onclick="filter('${s.id}')">${s.name}</button>`
  ).join('');

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
.tag.ithome{background:rgba(255,102,0,.15);color:#ff6600;border-color:rgba(255,102,0,.3)}
.tag.sspai{background:rgba(66,133,244,.15);color:#4285f4;border-color:rgba(66,133,244,.3)}
.tag.zhihu{background:rgba(0,132,255,.15);color:#0084ff;border-color:rgba(0,132,255,.3)}
.tag.github{background:rgba(36,41,46,.15);color:#adbac7;border-color:rgba(36,41,46,.3)}
.tag.solidot{background:rgba(0,150,136,.15);color:#009688;border-color:rgba(0,150,136,.3)}
.tag.juejin{background:rgba(30,128,255,.15);color:#1e80ff;border-color:rgba(30,128,255,.3)}
.tag.cnblogs{background:rgba(51,51,51,.15);color:#999;border-color:rgba(51,51,51,.3)}
.tag.oschina{background:rgba(123,179,46,.15);color:#7bb32e;border-color:rgba(123,179,46,.3)}
.tag.huxiu{background:rgba(255,69,0,.15);color:#ff4500;border-color:rgba(255,69,0,.3)}
.tag.kr36{background:rgba(66,133,244,.15);color:#4285f4;border-color:rgba(66,133,244,.3)}
.empty{text-align:center;padding:60px;color:var(--text2)}
#empty-tip{display:none}
</style>
</head>
<body>
<div class="container">
<<header>
  <h1>TechDaily</h1>
  <div class="subtitle">聚合 ${SOURCES.length} 个技术源 · 每日自动更新</div>
  <div class="meta-info">
    <span><span class="status-dot"></span>构建于 ${buildTime}</span>
    <span>${successCount}/${SOURCES.length} 个源在线</span>
    <span>共 ${allItems.length} 条</span>
  </div>
</header>
<div class="controls">
  <button class="btn active" onclick="filter('all')">全部</button>
  <button class="btn" onclick="filter('ai')">AI 专题</button>
  ${allBtns}
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
<div id="empty-tip" class="empty">该分类下暂无内容</div>
</div>
<script>
function filter(type){
  document.querySelectorAll('.controls .btn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  
  const cards = Array.from(document.querySelectorAll('#grid .card'));
  const show = type==='all' ? cards : type==='ai' 
    ? cards.filter(c=>['openai','deepmind','arxiv-ai','arxiv-ml'].includes(c.dataset.source))
    : cards.filter(c=>c.dataset.source===type);
  
  cards.forEach(c=>c.style.display='none');
  show.forEach(c=>c.style.display='block');
  
  const grid = document.getElementById('grid');
  const emptyTip = document.getElementById('empty-tip');
  
  if(show.length === 0){
    grid.style.display = 'none';
    emptyTip.style.display = 'block';
    emptyTip.textContent = type==='all' ? '暂无内容' : '该分类下暂无内容';
  } else {
    grid.style.display = 'grid';
    emptyTip.style.display = 'none';
  }
}
</script>
</body>
</html>`;

  const dist = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), html, 'utf-8');
  console.log(`生成完毕: ${allItems.length} 条 → dist/index.html`);
}

main().then(() => {
  console.log('脚本执行完成，强制退出');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
