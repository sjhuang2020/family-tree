# 黄氏家谱

一个纯静态的家族谱系网页，可视化家族成员关系，并自动推算任意两位成员之间的中文亲属称谓。无需构建，无后端依赖，部署在 GitHub Pages 上。

家谱数据经过**客户端加密**：仓库里只存密文 `family.enc.json`，访问者需输入密码才能在浏览器内解密查看，陌生人即使下载文件也只是乱码。

## 功能

- 家谱树可视化（D3.js，可展开/收起、点击进入详情）
- 任意两位成员的亲属关系自动判定（伯/叔/姑、堂兄弟姐妹、侄/侄孙、祖辈/孙辈等）
- 人物详情页：基本信息、父母/配偶/子女/兄弟姐妹、与核心成员的关系
- 辈分由树结构自动推导，无需手工维护
- 客户端密码保护（PBKDF2-SHA256 + AES-256-GCM，Web Crypto API）

## 数据工作流（重要）

明文数据 `family.json` **不进仓库**（已被 .gitignore 排除），只在本地维护。
每次改完数据后，加密成 `family.enc.json` 再提交：

```bash
# 1. 本地编辑明文 family.json
# 2. 加密（按提示输入访问密码，密码不写入任何文件）
node scripts/encrypt.js
# 3. 提交密文并推送
git add family.enc.json && git commit -m "更新家谱数据" && git push
```

页面加载时优先读取 `family.enc.json` 并弹出密码框；本地若存在明文 `family.json` 则在无密文时回退使用（仅本地开发）。

## 本地预览

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000，输入访问密码
```

（必须用 http 服务器，`file://` 下 fetch 与 Web Crypto 受限。）

## 项目结构

```
.
├── index.html          家谱树 + 关系计算器
├── person.html         人物详情页
├── family.enc.json     加密后的家族数据（仓库中发布的版本）
├── family.json         明文数据（本地维护，不进仓库）
├── scripts/
│   └── encrypt.js       明文 → 密文 加密脚本
├── assets/
│   ├── style.css        共享样式
│   └── genealogy.js     共享核心：数据加载/解密 / 辈分计算 / 关系判定
├── robots.txt          禁止搜索引擎收录
├── .nojekyll           告诉 GitHub Pages 不要走 Jekyll
└── README.md
```

## 数据格式（family.json）

嵌套树结构，每个成员：

```json
{
  "id": "唯一标识",
  "name": "姓名",
  "gender": "男 | 女",
  "birthOrder": 1,
  "parentId": "父节点 id（始祖为空字符串）",
  "relation": "长子 / 次女 等出生次序标签",
  "bio": "个人简介（可选）",
  "spouse": { "id": "...", "name": "...", "gender": "女", "relation": "..." },
  "children": [ /* 同结构的子节点 */ ]
}
```

- 不需要手填 `generation`，辈分在运行时按树深度自动计算。
- 新增成员：在对应父节点的 `children` 数组里加一个对象即可。
- 改完记得重新运行 `node scripts/encrypt.js` 生成密文。

## 关系算法

逻辑集中在 `assets/genealogy.js` 的 `autoJudgeRelation(members, idA, idB)`，
语义为「A 相对于 B 的称谓」。两个页面共用同一实现，修改只需改这一处。

## 安全说明

- 仓库中不含任何明文真实姓名（`family.json`、`a.md`、`test/` 均被 .gitignore 排除）。
- 访问控制依赖共享密码 + 客户端解密。密码强度决定安全性，请使用较强密码并仅在家族内分享。
- 更换密码：重新运行 `node scripts/encrypt.js` 用新密码加密并推送即可。

## 部署到 GitHub Pages

推送后在仓库 Settings → Pages → Source 选择 `main` 分支根目录，保存后通过
`https://<用户名>.github.io/<仓库名>/` 访问。
