#!/usr/bin/env node
/* =========================================================================
 * encrypt.js —— 把明文 family.json 加密成 family.enc.json
 *
 * 用法：
 *   node scripts/encrypt.js
 *   （运行后按提示输入密码，密码不回显、不写入任何文件、不进 git）
 *
 * 加密方案：PBKDF2-SHA256(250000) 派生密钥 + AES-256-GCM
 * 与浏览器 Web Crypto API 完全兼容，前端 genealogy.js 负责解密。
 * ========================================================================= */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const IN_PATH = path.join(ROOT, 'family.json');
const OUT_PATH = path.join(ROOT, 'family.enc.json');
const ITER = 250000;

function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    process.stdout.write(prompt);
    rl.once('line', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error('找不到 family.json，请在项目根目录运行。');
    process.exit(1);
  }

  // 校验明文是合法 JSON
  const plain = fs.readFileSync(IN_PATH);
  try { JSON.parse(plain.toString('utf8')); }
  catch (e) { console.error('family.json 不是合法 JSON：', e.message); process.exit(1); }

  // 密码来源：优先环境变量 FAMILY_PW（非交互），否则交互输入
  let pw1, pw2;
  if (process.env.FAMILY_PW) {
    pw1 = pw2 = process.env.FAMILY_PW;
  } else {
    pw1 = await askPassword('请输入访问密码：');
    pw2 = await askPassword('\n请再次输入确认：');
    process.stdout.write('\n');
  }
  if (!pw1 || pw1.length < 4) {
    console.error('密码太短（至少 4 位），已取消。');
    process.exit(1);
  }
  if (pw1 !== pw2) {
    console.error('两次输入不一致，已取消。');
    process.exit(1);
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(pw1, salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: ITER,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // 密文 + GCM 认证标签拼接（与 Web Crypto 的 AES-GCM 输出格式一致）
    data: Buffer.concat([ct, tag]).toString('base64')
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload));
  console.log('✓ 已生成 family.enc.json');
  console.log('  下一步：git add family.enc.json && git commit && git push');
})();
