/**
 * 物流工单控制台 - 全栈服务（零依赖，Node 内置模块）
 * 职责：静态托管 / 用户与权限 / 工单 CRUD / haishuoclaw 通知代理与转工单
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HAISHI_KEY_FILE = path.join(os.homedir(), '.workbuddy', 'haishuoclaw.keys.json');
const HAISHI_API = 'https://haishuoclaw.haishuohb.com/api/notify';
// 固定签名密钥：多实例/冷启动环境下保证 token 一致可验证（非安全敏感，仅防篡改）
const TOKEN_SECRET = 'logi-ticket-console-v2-fixed-key';

/* ---------------- 存储 ---------------- */
function freshDb() {
  return {
    users: [],
    tickets: seedTickets(),
    sessions: {},
    settings: { haishuoclawKeys: {} },
    meta: { createdAt: new Date().toISOString() }
  };
}
function dOff(n){const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function tmsg(group,sender,time,content){return {group,sender,time,content}}
function seedTickets(){
  const mk=(id,title,status,assignee,group,customer,vehicle,order,dueOffset,evidence,contradictions,crossGroup,needsVerify,priority,version,raw,timeline,history,notes)=>({
    id,title,status,assignee,assigneeId:'U-ADMIN',group,customer,vehicle,order,dueOffset,createdOffset:-1,
    evidence,contradictions,crossGroup,needsVerify,priority,version,raw,timeline,history,notes,source:'seed',createdBy:'U-ADMIN'
  });
  return [
    mk('GD-2026-0001','和记火锅液蜡配送延迟，客户称未收到','overdue','李伟','油小将-郑州配送群','和记火锅','豫A·8F621','DD20261116001',-1,
      ['证-2026-1116-001'],['司机称 09:50 已送达，客户 11:20 仍反馈未收到，说法冲突待核实'],true,true,'高',3,
      [tmsg('油小将-郑州配送群','王铁锤','11-16 09:32','@李伟 和记火锅那单液蜡，客户说还没到，查下车豫A·8F621的位置'),tmsg('和记火锅对接群','客户-孙经理','11-16 11:20','油还没送到，下午宴席要用')],
      [{time:'11-16 09:32',type:'创建',content:'从群聊提炼事项'},{time:'11-16 11:45',type:'矛盾',content:'发现送达说法冲突'},{time:'11-16 14:10',type:'转派',content:'跨群转派跟进'}],
      [{v:1,time:'11-16 09:35',change:'工单创建',snapshot:{status:'pending',assignee:'李伟',title:'和记火锅液蜡配送延迟'}},{v:3,time:'11-16 14:10',change:'合并消息并置逾期',snapshot:{status:'overdue',assignee:'李伟',title:'和记火锅液蜡配送延迟，客户称未收到'}}],
      '当前状态以工单记录为准；送达情况待核实。'),
    mk('GD-2026-0002','豫A·3K529 车辆轨迹异常，定位与群内说法不符','verify','赵磊','海硕物流调度群','鼎盛粮油','豫A·3K529','DD20261115027',1,
      ['证-2026-1116-007'],[],false,true,'中',2,
      [tmsg('海硕物流调度群','赵磊','11-16 15:02','豫A·3K529 轨迹显示下午2点在仓库，但司机说到客户那了，这个轨迹要核实')],
      [{time:'11-16 15:02',type:'创建',content:'提炼轨迹异常，标记待核实'}],
      [{v:1,time:'11-16 15:02',change:'工单创建',snapshot:{status:'verify',assignee:'赵磊'}}],
      '物流轨迹属外部核验信息，未确认前不作为事实。'),
    mk('GD-2026-0003','金水湾酒店植物油送货单据与客户联不一致','pending','张敏','油小将-郑州配送群','金水湾酒店','豫V·2D318','DD20261114009',2,
      ['证-2026-1114-002'],['客户联 20 桶，回单 18 桶，差异待核实'],true,true,'高',2,
      [tmsg('油小将-郑州配送群','张敏','11-14 10:20','金水湾酒店说单据不对，客户联20桶，回单18桶')],
      [{time:'11-14 10:20',type:'创建',content:'提炼单据不符事项'},{time:'11-14 10:35',type:'转派',content:'跨群核对'}],
      [{v:1,time:'11-14 10:20',change:'工单创建',snapshot:{status:'pending',assignee:'张敏'}}],'数量差异需以签收单原件核实。'),
    mk('GD-2026-0004','中通转运破损件理赔资料待补齐','due','王铁锤','中通-郑州转运群','豫粮商贸','','DD20261113044',0,
      ['证-2026-1115-011'],[],false,false,'中',1,
      [tmsg('中通-郑州转运群','王铁锤','11-15 16:40','豫粮商贸那票破损件，理赔资料还差签收照片，今天要补齐')],
      [{time:'11-15 16:40',type:'创建',content:'提炼理赔事项'}],[{v:1,time:'11-15 16:40',change:'工单创建',snapshot:{status:'due',assignee:'王铁锤'}}],''),
    mk('GD-2026-0005','聚仙楼液蜡报价争议，客户要求复核单价','verify','陈静','油小将-郑州配送群','聚仙楼','','',2,
      [],['群内报价 6800/吨 与报价单 6900/吨 不一致，需外部核价'],false,true,'中',2,
      [tmsg('油小将-郑州配送群','客户-聚仙楼','11-16 08:50','上次群里说的价格不是6800吗，怎么单子上6900？')],
      [{time:'11-16 08:50',type:'创建',content:'提炼报价争议'}],[{v:1,time:'11-16 08:50',change:'工单创建',snapshot:{status:'verify',assignee:'陈静'}}],'价格属需外部核验信息。'),
    mk('GD-2026-0006','韵达拦截件超时未处理，客户催办','overdue','李伟','韵达-售后处理群','金水湾酒店','','',-2,
      ['证-2026-1113-009'],[],true,false,'高',3,
      [tmsg('韵达-售后处理群','李伟','11-13 17:00','金水湾酒店那票拦截件客户催了，今天必须处理')],
      [{time:'11-13 17:00',type:'创建',content:'提炼拦截件事项'},{time:'11-15 10:00',type:'转派',content:'跨群转派'}],
      [{v:1,time:'11-13 17:00',change:'工单创建',snapshot:{status:'due',assignee:'李伟'}}],''),
    mk('GD-2026-0007','郑东新区食堂灶具点火故障待上门','pending','刘洋','海硕物流调度群','郑东新区食堂','豫A·6Q187','',3,
      ['证-2026-1116-020'],[],false,false,'中',1,
      [tmsg('海硕物流调度群','刘洋','11-16 13:20','郑东新区食堂灶具打不着火，约了后天上门')],
      [{time:'11-16 13:20',type:'创建',content:'提炼上门维修事项'}],[],''),
    mk('GD-2026-0008','鼎盛粮油订单重复下单，已撤销一单','done','王铁锤','海硕物流调度群','鼎盛粮油','','DD20261114009',-2,
      ['证-2026-1113-004'],[],false,false,'低',2,
      [tmsg('海硕物流调度群','张敏','11-13 09:10','鼎盛粮油重复下了一单，撤销一个')],
      [{time:'11-13 09:10',type:'创建',content:'提炼重复下单'},{time:'11-13 09:30',type:'完成',content:'撤销并关闭'}],
      [{v:1,time:'11-13 09:10',change:'工单创建',snapshot:{status:'pending',assignee:'张敏'}}],''),
    mk('GD-2026-0009','液蜡批次质量待检，暂缓出库','pending','赵磊','海硕物流调度群','豫粮商贸','','DD20261117002',1,
      ['证-2026-1117-001'],[],false,true,'高',1,
      [tmsg('海硕物流调度群','赵磊','今天 10:05','新到那批液蜡先别出库，等质检结果，属待核实')],
      [{time:'今天 10:05',type:'创建',content:'提炼质量待检事项'}],[],'质检结果未出前，质量状态待核实。'),
    mk('GD-2026-0010','小火锅燃料应急补货已送达','done','刘洋','油小将-郑州配送群','和记火锅','豫A·6Q187','DD20261117002',-1,
      ['证-2026-1115-018'],[],false,false,'低',2,
      [tmsg('油小将-郑州配送群','客户-孙经理','11-15 16:00','小火锅燃料快没了，今晚能补吗')],
      [{time:'11-15 16:00',type:'创建',content:'提炼应急补货'},{time:'11-15 18:30',type:'完成',content:'送达签收'}],[],'')
  ];
}
let db;
function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // 兼容旧结构
      db.sessions = db.sessions || {};
      db.settings = db.settings || {};
      db.settings.haishuoclawKeys = db.settings.haishuoclawKeys || {};
      db.users = db.users || [];
      db.tickets = db.tickets || [];
      return;
    }
  } catch (e) {
    console.error('[db] load failed, starting fresh:', e.message);
  }
  db = freshDb();
  // 默认管理员
  const { salt, hash } = hashPassword('admin123');
  db.users.push({
    id: 'U-ADMIN', username: 'admin', name: '系统管理员',
    role: 'admin', phone: '', salt, passwordHash: hash,
    allowedGroups: [], active: true, createdAt: new Date().toISOString()
  });
  saveDb();
}
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (e) { console.error('[db] save failed:', e.message); }
  }, 120);
}

/* ---------------- 加密与会话 ---------------- */
function hashPassword(pwd, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pwd), salt, 64).toString('hex') };
}
function verifyPassword(pwd, user) {
  try {
    const h = crypto.scryptSync(String(pwd), user.salt, 64).toString('hex');
    return h === user.passwordHash;
  } catch (e) { return false; }
}
// 无状态 token： userId.expiry.signature —— 不依赖存储，适配多实例/冷启动
function makeToken(userId) {
  const exp = Date.now() + 7 * 24 * 3600 * 1000;
  const payload = userId + '.' + exp;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 24);
  return payload + '.' + sig;
}
function parseToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Date.now() > Number(exp)) return null;
  const expect = crypto.createHmac('sha256', TOKEN_SECRET).update(userId + '.' + exp).digest('hex').slice(0, 24);
  if (sig !== expect) return null;
  return userId;
}
function userFromReq(req, url) {
  // 注意：分享网关会注入自己的 Bearer JWT（eyJ...），不能拿它当应用 token。
  // 应用统一用 query 参数 token 认证。
  let token = '';
  if (req._url) token = req._url.searchParams.get('token') || '';
  if (!token) {
    const auth = (req.headers.authorization || '');
    if (auth.startsWith('Bearer ') && !auth.slice(7).startsWith('eyJ')) token = auth.slice(7);
  }
  if (!token) return null;
  const userId = parseToken(token);
  if (!userId) return null;
  const u = db.users.find(x => x.id === userId && x.active);
  return u || null;
}
function requireAuth(req, res) {
  const u = userFromReq(req);
  if (!u) { sendJson(res, 401, { error: '未登录或登录已过期' }); return null; }
  return u;
}
function requireAdmin(req, res) {
  const u = requireAuth(req, res);
  if (!u) return null;
  if (u.role !== 'admin') { sendJson(res, 403, { error: '需要管理员权限' }); return null; }
  return u;
}
function publicUser(u) {
  const { salt, passwordHash, ...rest } = u;
  return rest;
}

/* ---------------- 数据权限 ---------------- */
function canSeeTicket(user, ticket) {
  if (user.role === 'admin') return true;
  // 普通成员：仅看指派给自己的，或自己所在群组的
  if (ticket.assigneeId === user.id) return true;
  if (ticket.assignee === user.name) return true;
  if (user.allowedGroups && user.allowedGroups.length) {
    return user.allowedGroups.includes(ticket.group);
  }
  return true; // 未配置可见群组则默认全部可见
}

/* ---------------- HTTP 工具 ---------------- */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not Found'); }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/* ---------------- haishuoclaw 密钥 ---------------- */
function syncLocalKeys() {
  // 首次部署时把本机密钥文件导入（发布沙箱无此文件，可在后台页面配置）
  try {
    if (fs.existsSync(HAISHI_KEY_FILE)) {
      const local = JSON.parse(fs.readFileSync(HAISHI_KEY_FILE, 'utf8'));
      let changed = false;
      for (const k of Object.keys(local || {})) {
        if (!db.settings.haishuoclawKeys[k]) { db.settings.haishuoclawKeys[k] = local[k]; changed = true; }
      }
      if (changed) saveDb();
    }
  } catch (e) { console.error('[haishi] key import failed:', e.message); }
}
async function fetchNotifications(phone, opts = {}) {
  const keys = db.settings.haishuoclawKeys || {};
  const key = phone ? keys[phone] : (Object.values(keys)[0]);
  if (!key) throw new Error('未配置 haishuoclaw 密钥，请在后台「通知设置」中填写');
  const params = new URLSearchParams({ key, limit: String(opts.limit || 100) });
  if (opts.keyword) params.set('keyword', opts.keyword);
  if (opts.since) params.set('since', opts.since);
  const url = HAISHI_API + '?' + params.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error('haishuoclaw 返回 ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/* ---------------- 通知 -> 工单提炼规则 ---------------- */
function extractFromNotification(n, fallbackPhone) {
  const text = String(n.msg || n.data?.msg || n.content || '').replace(/\s+/g, ' ').trim();
  const cleanTitle = text.replace(/^(com\.[\w.]+|UID[:：]\s*\d+|Redmi\s+\w+|[\d-]{10}\s[\d:]{8})/g, '').replace(/\s+/g, ' ').trim() || text;
  const plate = (text.match(/[京沪粤豫鲁冀苏浙皖鄂湘川渝][A-Z]·?[A-Z0-9]{5,6}/) || [])[0] || '';
  const order = (text.match(/(?:订单|单号|DD)[号]?[:：\s#]*([A-Za-z0-9]{8,})/) || [])[1] || '';
  const customer = (text.match(/([\u4e00-\u9fa5]{2,8}(?:酒店|火锅|粮油|食堂|商贸|饭庄))/) || [])[1] || '';
  const verify = /核实|确认|待查|轨迹|定位|质量/.test(text);
  const urgent = /逾期|超时|催|投诉|急|赶紧|再不/.test(text);
  const conflict = /不一致|没收到|说法|争议/.test(text);
  const ts = n.ts || n.time || '';
  let time = '';
  if (ts) {
    const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts);
    if (!isNaN(d.getTime())) time = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return {
    title: cleanTitle.slice(0, 40) || '未命名通知事项',
    source: 'haishuoclaw',
    phone: n.phone || fallbackPhone || '',
    notifyId: n.id || '',
    app: n.app || n.package || '',
    time,
    vehicle: plate,
    order,
    customer,
    needsVerify: verify,
    status: verify ? 'verify' : (urgent ? 'overdue' : 'pending'),
    priority: urgent ? '高' : '中',
    contradictions: conflict ? ['通知内容中存在争议表述，待核实'] : [],
    rawText: text,
    raw: [{
      group: 'haishuoclaw · ' + (n.phone || ''),
      sender: n.app || '手机通知',
      time: time || String(ts),
      content: text
    }]
  };
}

/* ---------------- 路由 ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') return sendJson(res, 204, {});

  // 版本诊断
  if (p === '/api/version') return sendJson(res, 200, { version: '2.2.0', tokenMode: 'query', ts: Date.now() });

  // 登录
  if (p === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const user = db.users.find(u => u.username === String(body.username || '').trim());
    if (!user || !user.active || !verifyPassword(body.password || '', user)) {
      return sendJson(res, 401, { error: '账号或密码错误' });
    }
    const token = makeToken(user.id);
    return sendJson(res, 200, { token, user: publicUser(user) });
  }
  if (p === '/api/logout' && method === 'POST') {
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/api/me') {
    const u = requireAuth(req, res);
    if (u) sendJson(res, 200, { user: publicUser(u) });
    return;
  }

  // 批量同步（前端整体保存，按 id upsert + 删除服务端已不存在的）
  if (p === '/api/tickets/sync' && method === 'POST') {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    if (!Array.isArray(b.tickets)) return sendJson(res, 400, { error: 'tickets 必须是数组' });
    const incoming = b.tickets;
    const ids = new Set(incoming.map(t => t.id));
    // 删除本地已不存在的（仅删除当前用户可见范围内的）
    db.tickets = db.tickets.filter(t => ids.has(t.id) || !canSeeTicket(u, t));
    // upsert
    for (const t of incoming) {
      const idx = db.tickets.findIndex(x => x.id === t.id);
      const rec = {
        id: t.id, title: t.title || '未命名事项',
        status: t.status || 'pending', assignee: t.assignee || u.name,
        assigneeId: t.assigneeId || u.id, group: t.group || '',
        customer: t.customer || '', vehicle: t.vehicle || '', order: t.order || '',
        dueOffset: Number(t.dueOffset || 0), createdOffset: Number(t.createdOffset || 0),
        evidence: t.evidence || [], contradictions: t.contradictions || [],
        crossGroup: !!t.crossGroup, needsVerify: !!t.needsVerify,
        priority: t.priority || '中', version: t.version || 1,
        raw: t.raw || [], timeline: t.timeline || [], history: t.history || [],
        notes: t.notes || '', source: t.source || 'web',
        createdBy: t.createdBy || u.id, updatedAt: new Date().toISOString()
      };
      if (idx >= 0) db.tickets[idx] = { ...db.tickets[idx], ...rec };
      else db.tickets.push(rec);
    }
    saveDb();
    return sendJson(res, 200, { ok: true, count: db.tickets.length });
  }

  // 工单
  if (p === '/api/tickets' && method === 'GET') {
    const u = requireAuth(req, res); if (!u) return;
    return sendJson(res, 200, { tickets: db.tickets.filter(t => canSeeTicket(u, t)) });
  }
  if (p === '/api/tickets' && method === 'POST') {
    const u = requireAuth(req, res); if (!u) return;
    const b = await readBody(req);
    const id = b.id || ('GD-' + new Date().getFullYear() + '-' + String(db.tickets.length + 1).padStart(3, '0'));
    const ticket = {
      id, title: b.title || '未命名事项',
      status: b.status || 'pending', assignee: b.assignee || u.name,
      assigneeId: b.assigneeId || u.id,
      group: b.group || '', customer: b.customer || '', vehicle: b.vehicle || '',
      order: b.order || '', dueOffset: Number(b.dueOffset || 2),
      createdOffset: Number(b.createdOffset || 0),
      evidence: b.evidence || [], contradictions: b.contradictions || [],
      crossGroup: !!b.crossGroup, needsVerify: !!b.needsVerify,
      priority: b.priority || '中', version: b.version || 1,
      raw: b.raw || [], timeline: b.timeline || [], history: b.history || [],
      notes: b.notes || '', source: b.source || 'web',
      createdBy: u.id, createdAt: new Date().toISOString()
    };
    db.tickets.unshift(ticket); saveDb();
    return sendJson(res, 201, { ticket });
  }
  let m = p.match(/^\/api\/tickets\/([^/]+)$/);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const u = requireAuth(req, res); if (!u) return;
    const t = db.tickets.find(x => x.id === decodeURIComponent(m[1]));
    if (!t) return sendJson(res, 404, { error: '工单不存在' });
    if (method === 'DELETE') {
      if (u.role !== 'admin' && t.createdBy !== u.id) return sendJson(res, 403, { error: '无权删除' });
      db.tickets = db.tickets.filter(x => x.id !== t.id); saveDb();
      return sendJson(res, 200, { ok: true });
    }
    const b = await readBody(req);
    // 合并式更新：只允许白名单字段
    const fields = ['title', 'status', 'assignee', 'assigneeId', 'group', 'customer', 'vehicle',
      'order', 'dueOffset', 'evidence', 'contradictions', 'crossGroup', 'needsVerify',
      'priority', 'version', 'raw', 'timeline', 'history', 'notes'];
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(b, f)) t[f] = b[f];
    t.updatedAt = new Date().toISOString();
    saveDb();
    return sendJson(res, 200, { ticket: t });
  }

  // 用户管理（管理员）
  if (p === '/api/users' && method === 'GET') {
    const u = requireAdmin(req, res); if (!u) return;
    return sendJson(res, 200, { users: db.users.map(publicUser) });
  }
  if (p === '/api/users' && method === 'POST') {
    const admin = requireAdmin(req, res); if (!admin) return;
    const b = await readBody(req);
    const username = String(b.username || '').trim();
    if (!username) return sendJson(res, 400, { error: '账号不能为空' });
    if (db.users.some(u => u.username === username)) return sendJson(res, 409, { error: '账号已存在' });
    const { salt, hash } = hashPassword(b.password || '123456');
    const user = {
      id: 'U-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
      username, name: b.name || username,
      role: b.role === 'admin' ? 'admin' : 'member',
      phone: b.phone || '', salt, passwordHash: hash,
      allowedGroups: Array.isArray(b.allowedGroups) ? b.allowedGroups : [],
      active: b.active !== false, createdAt: new Date().toISOString()
    };
    db.users.push(user); saveDb();
    return sendJson(res, 201, { user: publicUser(user) });
  }
  m = p.match(/^\/api\/users\/([^/]+)$/);
  if (m && (method === 'PUT' || method === 'DELETE')) {
    const admin = requireAdmin(req, res); if (!admin) return;
    const user = db.users.find(x => x.id === decodeURIComponent(m[1]));
    if (!user) return sendJson(res, 404, { error: '用户不存在' });
    if (method === 'DELETE') {
      if (user.id === admin.id) return sendJson(res, 400, { error: '不能删除自己' });
      db.users = db.users.filter(x => x.id !== user.id); saveDb();
      return sendJson(res, 200, { ok: true });
    }
    const b = await readBody(req);
    for (const f of ['name', 'role', 'phone', 'allowedGroups', 'active']) {
      if (Object.prototype.hasOwnProperty.call(b, f)) user[f] = b[f];
    }
    if (b.password) { const h = hashPassword(b.password); user.salt = h.salt; user.passwordHash = h.hash; }
    saveDb();
    return sendJson(res, 200, { user: publicUser(user) });
  }

  // haishuoclaw：密钥配置（仅管理员，返回时打码）
  if (p === '/api/haishi/keys' && method === 'GET') {
    const u = requireAdmin(req, res); if (!u) return;
    const keys = db.settings.haishuoclawKeys || {};
    const masked = {};
    for (const [phone, key] of Object.entries(keys)) {
      masked[phone] = String(key).slice(0, 4) + '****' + String(key).slice(-4);
    }
    return sendJson(res, 200, { keys: masked, phones: Object.keys(keys) });
  }
  if (p === '/api/haishi/keys' && method === 'POST') {
    const u = requireAdmin(req, res); if (!u) return;
    const b = await readBody(req);
    if (!b.phone || !b.key) return sendJson(res, 400, { error: '手机号和密钥都要填' });
    db.settings.haishuoclawKeys[String(b.phone).trim()] = String(b.key).trim();
    saveDb();
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/api/haishi/keys' && method === 'DELETE') {
    const u = requireAdmin(req, res); if (!u) return;
    const b = await readBody(req);
    delete db.settings.haishuoclawKeys[String(b.phone || '').trim()];
    saveDb();
    return sendJson(res, 200, { ok: true });
  }

  // 拉通知（代理，密钥不下发）
  if (p === '/api/haishi/notifications' && method === 'GET') {
    const u = requireAuth(req, res); if (!u) return;
    try {
      const data = await fetchNotifications(url.searchParams.get('phone') || '', {
        limit: Number(url.searchParams.get('limit') || 100),
        keyword: url.searchParams.get('keyword') || ''
      });
      return sendJson(res, 200, data);
    } catch (e) { return sendJson(res, 502, { error: e.message }); }
  }
  // 通知转工单（先返回草稿，不直接入库）
  if (p === '/api/haishi/drafts' && method === 'GET') {
    const u = requireAuth(req, res); if (!u) return;
    try {
      const queryPhone = url.searchParams.get('phone') || '';
      const data = await fetchNotifications(queryPhone, {
        limit: Number(url.searchParams.get('limit') || 50),
        keyword: url.searchParams.get('keyword') || ''
      });
      const list = data.notifications || data.data || [];
      const drafts = list.map(n => extractFromNotification(n, queryPhone));
      return sendJson(res, 200, { drafts, total: data.total, space: data.space });
    } catch (e) { return sendJson(res, 502, { error: e.message }); }
  }

  return sendJson(res, 404, { error: '接口不存在' });
}

/* ---------------- 启动 ---------------- */
loadDb();
syncLocalKeys();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    req._url = url;
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    res.writeHead(405); res.end('Method Not Allowed');
  } catch (e) {
    console.error('[http]', e);
    if (!res.headersSent) sendJson(res, 500, { error: e.message || '服务器错误' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[logistics-ticket-console] listening on 0.0.0.0:${PORT}`);
  console.log(`[db] ${db.users.length} users, ${db.tickets.length} tickets`);
});
