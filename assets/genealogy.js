/* =========================================================================
 * genealogy.js —— 黄氏家谱共享核心逻辑
 * 数据加载 / 成员扁平化 / 辈分自动计算 / 亲属关系判定
 * index.html 与 person.html 共用此文件，关系逻辑只维护这一处。
 * ========================================================================= */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------
   * 1. 数据加载
   * ------------------------------------------------------------------- */

  /**
   * 加载家谱数据并返回 { tree, members }。
   * - 优先加载加密版 family.enc.json：弹出密码框，浏览器内解密。
   * - 找不到加密版时回退到明文 family.json（本地开发用）。
   * 密码正确解密一次后会缓存于 sessionStorage，刷新/翻页无需重输，关闭标签页即清除。
   */
  async function loadFamily(plainUrl = 'family.json', encUrl = 'family.enc.json') {
    let tree;

    // 1) 尝试加密版
    const encRes = await fetch(encUrl, { cache: 'no-store' }).catch(() => null);
    if (encRes && encRes.ok) {
      const payload = await encRes.json();
      tree = await decryptPayload(payload);
    } else {
      // 2) 回退明文
      const res = await fetch(plainUrl);
      if (!res.ok) throw new Error('家谱数据加载失败：' + res.status);
      tree = await res.json();
    }

    const members = extractAllMembers(tree);
    return { tree, members };
  }

  /* ---------------------------------------------------------------------
   * 1b. 客户端解密（Web Crypto：PBKDF2-SHA256 + AES-256-GCM）
   *     与 scripts/encrypt.js 生成的密文格式一一对应。
   * ------------------------------------------------------------------- */

  const PW_CACHE_KEY = 'familyTreePw';

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(password, salt, iter) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  async function tryDecrypt(payload, password) {
    const salt = b64ToBytes(payload.salt);
    const iv = b64ToBytes(payload.iv);
    const data = b64ToBytes(payload.data); // 密文 + 16字节 GCM tag
    const key = await deriveKey(password, salt, payload.iter || 250000);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const text = new TextDecoder().decode(plainBuf);
    return JSON.parse(text); // 解密+解析成功即密码正确
  }

  async function decryptPayload(payload) {
    // 先试 sessionStorage 缓存的密码
    const cached = sessionStorage.getItem(PW_CACHE_KEY);
    if (cached) {
      try { return await tryDecrypt(payload, cached); }
      catch (_) { sessionStorage.removeItem(PW_CACHE_KEY); }
    }
    // 弹出密码闸门，直到正确或用户取消
    while (true) {
      const pw = await promptPassword();
      if (pw === null) throw new Error('已取消访问');
      try {
        const tree = await tryDecrypt(payload, pw);
        sessionStorage.setItem(PW_CACHE_KEY, pw);
        removeGate();
        return tree;
      } catch (_) {
        showGateError('密码错误，请重试。');
      }
    }
  }

  /* 简易密码输入遮罩（无依赖，注入到 <body>） */
  function promptPassword() {
    return new Promise((resolve) => {
      let gate = document.getElementById('pw-gate');
      if (!gate) {
        gate = document.createElement('div');
        gate.id = 'pw-gate';
        gate.innerHTML =
          '<div class="pw-gate-card">' +
          '  <div class="pw-gate-title">黄氏家谱</div>' +
          '  <div class="pw-gate-tip">本家谱受密码保护，请输入访问密码。</div>' +
          '  <input id="pw-gate-input" type="password" class="pw-gate-input" ' +
          '         placeholder="访问密码" autocomplete="current-password" />' +
          '  <div id="pw-gate-error" class="pw-gate-error"></div>' +
          '  <button id="pw-gate-btn" class="pw-gate-btn">进入</button>' +
          '</div>';
        document.body.appendChild(gate);
      }
      const input = gate.querySelector('#pw-gate-input');
      const btn = gate.querySelector('#pw-gate-btn');
      input.value = '';
      input.focus();
      const submit = () => resolve(input.value);
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  function showGateError(msg) {
    const el = document.getElementById('pw-gate-error');
    if (el) el.textContent = msg;
    const input = document.getElementById('pw-gate-input');
    if (input) { input.value = ''; input.focus(); }
  }

  function removeGate() {
    const gate = document.getElementById('pw-gate');
    if (gate) gate.remove();
  }

  /* ---------------------------------------------------------------------
   * 2. 成员扁平化（辈分由树深度自动推导，无需手填 generation）
   * ------------------------------------------------------------------- */

  /**
   * 将嵌套的家谱树展开为成员数组。
   * 每个成员含：id, name, gender, generation, birthOrder, parentId,
   *            relation, isSpouse, partnerId, childIds
   */
  function extractAllMembers(node, parentId = '', generation = 1, members = []) {
    const member = {
      id: node.id,
      name: node.name,
      gender: node.gender || '男',
      generation: generation,
      birthOrder: node.birthOrder || 0,
      parentId: parentId,
      relation: node.relation || '',
      bio: node.bio || '',
      isSpouse: false,
      partnerId: node.spouse ? node.spouse.id : null,
      childIds: (node.children || []).map(c => c.id)
    };
    members.push(member);

    // 配偶：与本人同辈，parentId 为空，标记 isSpouse
    if (node.spouse) {
      members.push({
        id: node.spouse.id,
        name: node.spouse.name,
        gender: node.spouse.gender || (member.gender === '男' ? '女' : '男'),
        generation: generation,
        birthOrder: 0,
        parentId: '',
        relation: node.spouse.relation || '',
        bio: node.spouse.bio || '',
        isSpouse: true,
        partnerId: node.id,
        childIds: []
      });
    }

    (node.children || []).forEach(child =>
      extractAllMembers(child, node.id, generation + 1, members)
    );

    return members;
  }

  /* ---------------------------------------------------------------------
   * 3. 图遍历工具
   * ------------------------------------------------------------------- */

  function findMemberById(members, id) {
    return members.find(m => m.id === id) || null;
  }

  /** 返回从直接父辈到始祖的祖先链（不含自身） */
  function findAncestors(members, id) {
    const chain = [];
    let cur = findMemberById(members, id);
    while (cur && cur.parentId) {
      const parent = findMemberById(members, cur.parentId);
      if (!parent) break;
      chain.push(parent);
      cur = parent;
    }
    return chain;
  }

  /** 含自身的祖先链（自身在首位） */
  function selfAndAncestors(members, id) {
    const self = findMemberById(members, id);
    return self ? [self, ...findAncestors(members, id)] : [];
  }

  /** 最近共同祖先 */
  function findCommonAncestor(members, idA, idB) {
    const aLine = selfAndAncestors(members, idA);
    const bIds = new Set(selfAndAncestors(members, idB).map(m => m.id));
    return aLine.find(m => bIds.has(m.id)) || null;
  }

  /** 在 id 的祖先链中，找出作为 commonAnc 直接子女的那一支（分支祖先） */
  function branchUnder(members, id, commonAncId) {
    const line = selfAndAncestors(members, id); // 自身 -> 始祖
    for (const m of line) {
      if (m.parentId === commonAncId) return m;
      if (m.id === commonAncId) return null; // 自身即共同祖先
    }
    return null;
  }

  /* ---------------------------------------------------------------------
   * 4. 关系判定：autoJudgeRelation(members, idA, idB)
   *    语义：「A 相对于 B 的称谓」，即 A 是 B 的什么人。
   * ------------------------------------------------------------------- */

  // 按辈差生成「父/祖/曾祖/高祖…」前缀
  function ancestorTerm(diffAbs, gender) {
    const male = ['父亲', '祖父', '曾祖父', '高祖父'];
    const female = ['母亲', '祖母', '曾祖母', '高祖母'];
    const list = gender === '男' ? male : female;
    if (diffAbs <= list.length) return list[diffAbs - 1];
    return (gender === '男' ? '先祖' : '先祖母') + `（上${diffAbs}辈）`;
  }

  function descendantTerm(diffAbs, gender) {
    const male = ['儿子', '孙子', '曾孙', '玄孙'];
    const female = ['女儿', '孙女', '曾孙女', '玄孙女'];
    const list = gender === '男' ? male : female;
    if (diffAbs <= list.length) return list[diffAbs - 1];
    return (gender === '男' ? '远孙' : '远孙女') + `（下${diffAbs}辈）`;
  }

  // 旁系长辈：伯/叔/姑（+祖 叠加）
  function elderCollateralTerm(diffAbs, gender, isElderBranch) {
    const zu = '祖'.repeat(Math.max(0, diffAbs - 1)); // 1辈无祖，2辈一个祖…
    if (gender === '男') {
      const base = isElderBranch ? '伯' : '叔';
      return diffAbs === 1 ? base + '父' : base + zu + '父';
    } else {
      return diffAbs === 1 ? '姑母' : '姑' + zu + '母';
    }
  }

  // 旁系晚辈：侄/侄孙
  function youngerCollateralTerm(diffAbs, gender) {
    const zu = '孙'.repeat(Math.max(0, diffAbs - 1));
    if (gender === '男') return diffAbs === 1 ? '侄子' : '侄' + zu;
    return diffAbs === 1 ? '侄女' : '侄' + zu + '女';
  }

  function autoJudgeRelation(members, idA, idB) {
    const a = findMemberById(members, idA);
    const b = findMemberById(members, idB);
    if (!a || !b) return '未知关系';
    if (idA === idB) return '本人';

    // 配偶关系
    if (a.partnerId === idB || b.partnerId === idA) {
      return a.gender === '男' ? '丈夫' : '妻子';
    }

    // 嫁入/娶入的配偶（无血缘路径）：经其伴侣换算
    if (a.isSpouse && a.partnerId) {
      const viaPartner = autoJudgeRelation(members, a.partnerId, idB);
      if (viaPartner && viaPartner !== '未知关系' && viaPartner !== '同辈旁系亲属') {
        return viaPartner + (a.gender === '男' ? '（女婿/夫）' : '（配偶）');
      }
    }

    const commonAnc = findCommonAncestor(members, idA, idB);
    const genDiff = a.generation - b.generation;

    // 直系（A 是 B 的祖先，或 B 是 A 的祖先）
    if (commonAnc && (commonAnc.id === idA || commonAnc.id === idB)) {
      if (genDiff < 0) return ancestorTerm(-genDiff, a.gender);
      if (genDiff > 0) return descendantTerm(genDiff, a.gender);
    }

    // 同辈
    if (genDiff === 0) {
      if (a.parentId && a.parentId === b.parentId) {
        // 亲兄弟姐妹
        if (a.gender === '男') return a.birthOrder < b.birthOrder ? '哥哥' : '弟弟';
        return a.birthOrder < b.birthOrder ? '姐姐' : '妹妹';
      }
      if (commonAnc) {
        // 堂兄弟姐妹：按双方分支祖先的出生次序定长幼
        const aBranch = branchUnder(members, idA, commonAnc.id);
        const bBranch = branchUnder(members, idB, commonAnc.id);
        const aElder = aBranch && bBranch && aBranch.birthOrder < bBranch.birthOrder;
        if (a.gender === '男') return aElder ? '堂哥' : '堂弟';
        return aElder ? '堂姐' : '堂妹';
      }
      return '同辈旁系亲属';
    }

    // 旁系长辈（A 辈分高于 B）
    if (genDiff < 0 && commonAnc) {
      const diffAbs = -genDiff;
      const aBranch = branchUnder(members, idA, commonAnc.id);
      const bBranch = branchUnder(members, idB, commonAnc.id);
      const isElderBranch = aBranch && bBranch && aBranch.birthOrder < bBranch.birthOrder;
      return elderCollateralTerm(diffAbs, a.gender, isElderBranch);
    }

    // 旁系晚辈（A 辈分低于 B）
    if (genDiff > 0 && commonAnc) {
      return youngerCollateralTerm(genDiff, a.gender);
    }

    return '亲属';
  }

  /* ---------------------------------------------------------------------
   * 5. 导出
   * ------------------------------------------------------------------- */
  global.Genealogy = {
    loadFamily,
    extractAllMembers,
    findMemberById,
    findAncestors,
    findCommonAncestor,
    autoJudgeRelation
  };
})(window);
