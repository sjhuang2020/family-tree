# 项目进度与维护说明

> 黄氏家谱静态站点 · 客户端加密版 · 部署于 GitHub Pages
> 最后更新：2026-06-14

## 当前状态：已上线

- 线上地址：https://sjhuang2020.github.io/family-tree/
- 仓库：github.com/sjhuang2020/family-tree（**Public**）
- 访问方式：打开页面 → 输入共享密码 → 浏览器端解密查看家谱
- 测试：`node test/relations.test.js`，21/21 通过

## 架构概览

纯静态，无后端，无构建步骤。三个核心页面 + 一个共享 JS：

```
index.html          家谱树可视化（D3.js）+ 亲属关系自动判定计算器
person.html         人物详情页（基本信息 / 直系亲属 / 与核心成员关系）
assets/genealogy.js 共享核心：数据加载+解密 / 辈分推导 / 关系判定算法
assets/style.css    共享样式（Wiki 质感 + 卡片化，含密码闸门样式）
scripts/encrypt.js  明文 → 密文 加密脚本（Node.js）
```

关系判定逻辑只维护一处：`genealogy.js` 的 `autoJudgeRelation(members, idA, idB)`，
语义为「A 相对于 B 的称谓」。两个页面共用，改动只改这一处。
辈分（generation）按树深度运行时自动推导，不手填。

## 隐私保护机制（重点）

家族真实姓名属隐私，处理原则：**明文绝不进仓库，只发布密文。**

加密方案：PBKDF2-SHA256（25 万次迭代）派生密钥 + AES-256-GCM，
Node 端（encrypt.js）与浏览器端（genealogy.js）用同一套 Web Crypto 格式。

### 哪些文件含明文、如何隔离

被 `.gitignore` 排除、**永不上传**的本地文件：
- `family.json` —— 明文家谱数据（唯一数据源，本地编辑）
- `a.md` —— 家谱数据草稿（含真名）
- `test/` —— 测试用例（硬编码了真实姓名/id）

仓库里只有：
- `family.enc.json` —— 加密后的密文（汉字数为 0，下载也是乱码）
- 其余 HTML/CSS/JS/README/CLAUDE.md（均不含真名，已逐一扫描确认）

### 附加防护
- `robots.txt` 全站 Disallow，两个 HTML 都加了 `<meta name="robots" content="noindex,nofollow">`，禁止搜索引擎收录。
- 密码正确解密后缓存在 sessionStorage（翻页不重输，关标签页即清）。

## 数据更新流程（每次改家谱都走这套）

```bash
cd /Users/sjhuang/Documents/project/家谱

# 1. 编辑明文（本地，不进仓库）
#    vi family.json   ← 唯一数据源
#    a.md 是草稿，改完记得同步到 family.json

# 2. 加密（按提示输入密码，密码不写入任何文件，不经过任何人）
node scripts/encrypt.js
#    或非交互：FAMILY_PW='你的密码' node scripts/encrypt.js

# 3. 本地预览验证（必须用 http 服务器，file:// 下 fetch/Web Crypto 受限）
python3 -m http.server 8000
#    浏览器开 http://localhost:8000，输密码确认显示正常

# 4. 跑测试
node test/relations.test.js

# 5. 提交密文并推送（family.json/a.md/test 会被 gitignore 自动挡住）
git add family.enc.json index.html person.html assets/ README.md
git commit -m "更新家谱数据"
git push
```

更换访问密码：重新跑 `node scripts/encrypt.js` 用新密码加密、推送即可。

## family.json 数据格式

嵌套树，每个成员：
```json
{
  "id": "唯一标识",
  "name": "姓名",
  "gender": "男 | 女",
  "birthOrder": 1,
  "parentId": "父节点 id（始祖为空字符串）",
  "relation": "长子 / 次女 等出生次序标签",
  "bio": "个人简介（可选，空则详情页显示浅灰占位）",
  "spouse": { "id": "...", "name": "...", "gender": "女", "relation": "..." },
  "children": [ /* 同结构子节点 */ ]
}
```
当前规模：42 人（含配偶），6 代，始祖黄名璋。数据以 a.md 为权威源。

## 重要约束 / 踩过的坑

- **GitHub 免费版的 Private 仓库不能发 GitHub Pages**。本项目因此保持 Public——
  安全性靠「代码公开 + 数据加密」而非仓库私有。要 Private + Pages 需 GitHub Pro 或转 Cloudflare Pages。
- 历史教训：项目初期明文 family.json/a.md 曾被提交上传，后用 orphan 分支重建历史 + force push 彻底清除。
  以后切记先 .gitignore 再 commit。
- 本地预览必须用 http 服务器，不能直接 open（file:// 下 fetch 被拦）。
- D3.js 从 d3js.org CDN 加载，访客需联网。

## 后续可改进方向（待定）

- [ ] 详情页个人简介（bio）内容补全，目前多数为空占位
- [ ] 老三支系信息待补充（a.md 中标「待定」，现为占位节点）
- [ ] 可选：D3.js 改本地引用，去除 CDN 联网依赖
- [ ] 可选：迁移 Cloudflare Pages，叠加真正的登录验证 + 支持 Private 仓库
- [ ] 可选：把搭建/加密流程沉淀成可复用脚本或文档模板
