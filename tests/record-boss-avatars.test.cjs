/*
 * 记录表「敌人」面板的 Boss 头像（record/index.html 的 makeTrackTitle / makeBossAvatar）。
 *
 * 头像文件来自 record/assets/boss-avatars/，这不是源代码，可能不随包分发
 * （.gitignore 忽略整个 record/assets/，资料包也可能只带部分目录）。所以：
 *   - 有对应文件才显示头像；
 *   - 文件缺失时摘掉 <img>，标题退回纯文字，不留破图和空的图标列；
 *   - 缺图记在 missingBossAvatars 里，点等级重绘不再反复请求同一个缺图。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../record/index.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const match = source.match(new RegExp(`^    function ${name}\\([^]*?^    }`, 'm'));
  assert.ok(match, name);
  return match[0];
}

function harness() {
  const requests = [];
  function element(tagName) {
    const node = {
      tagName,
      className: '',
      children: [],
      listeners: [],
      style: {},
      dataset: {},
      parent: null,
      set innerHTML(value) { this.children = []; },
      appendChild(child) {
        child.parent = this;
        this.children.push(child);
        return child;
      },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      addEventListener(type, handler, options) { this.listeners.push({ type, handler, options }); },
      fire(type) {
        this.listeners.filter(listener => listener.type === type).forEach(listener => listener.handler({ type }));
      },
      remove() {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
      },
      get src() { return this._src; },
      set src(value) {
        this._src = value;
        requests.push(value);
      },
    };
    Object.defineProperty(node, 'classList', {
      configurable: true,
      get() {
        const self = this;
        const names = () => new Set(String(self.className).split(/\s+/).filter(Boolean));
        return {
          add(...values) {
            const set = names();
            values.forEach(value => set.add(value));
            self.className = [...set].join(' ');
          },
          remove(...values) {
            const set = names();
            values.forEach(value => set.delete(value));
            self.className = [...set].join(' ');
          },
          contains(value) { return names().has(value); },
        };
      },
    });
    return node;
  }
  const context = vm.createContext({
    document: { createElement: element },
    window: { RECORD_ITEM_ICONS: {} },
    escapeHtml: value => value,
    buildItemIcon: () => element('span'),
  });
  vm.runInContext([
    source.slice(source.indexOf('    const bossAvatarFiles = '), source.indexOf('    function makeTrackTitle')),
    fn('makeBossAvatar'),
    fn('makeTrackTitle'),
  ].join('\n'), context);
  return { context, requests, makeTitle: context.makeTrackTitle };
}

test('boss avatars load their own files, fall back to the title on error, and do not retry missing files', () => {
  const h = harness();
  const title = h.makeTitle('赫卡同', 'Hekaton', { bossKey: 'hekaton' });
  const icon = title.children[0];
  assert.equal(icon.src.split('?')[0], './assets/boss-avatars/HEKATON.png');
  assert.equal(icon.style.visibility, 'hidden', '加载完成前不显示');
  icon.fire('error');
  assert.ok(!title.classList.contains('with-icon'), '缺图后标题退回纯文字');
  assert.ok(icon.parent === null, '缺图的 <img> 要从标题里摘掉');
  assert.equal(title.children.length, 1, '只剩名称文本');
  const again = h.makeTitle('赫卡同', 'Hekaton', { bossKey: 'hekaton' });
  assert.ok(!again.classList.contains('with-icon'));
  assert.ok(again.children.every(child => child.tagName !== 'img'));
  assert.equal(h.requests.length, 1, '重绘不再请求已知缺失的头像');
  const loaded = h.makeTitle('达哈卡', 'Dahaka', { bossKey: 'dahaka' });
  const loadedIcon = loaded.children[0];
  assert.equal(loadedIcon.tagName, 'img');
  assert.equal(loadedIcon.className, 'track-boss-avatar');
  assert.equal(loadedIcon.src.split('?')[0], './assets/boss-avatars/DAHAKA.png');
  assert.equal(loadedIcon.alt, '');
  loadedIcon.fire('load');
  assert.equal(loadedIcon.style.visibility, '');
  assert.ok(loaded.classList.contains('with-icon'));
});

test('unmapped bosses show their name and faction rows keep their own icon', () => {
  const h = harness();
  const unmapped = h.makeTitle('无名者', 'Nameless', { bossKey: 'notInAvatarMap' });
  assert.ok(!unmapped.classList.contains('with-icon'));
  assert.ok(unmapped.children.every(child => child.tagName !== 'img'));
  assert.equal(h.requests.length, 0);
  const faction = h.makeTitle('迈诺斯', 'Minoans', { icon: './assets/ally/MINOANS.png' });
  const icon = faction.children[0];
  assert.equal(icon.className, 'track-faction-icon');
  assert.equal(icon.src, './assets/ally/MINOANS.png');
  assert.ok(faction.classList.contains('with-icon'));
  const plain = h.makeTitle('船体', 'Hull');
  assert.ok(!plain.classList.contains('with-icon'));
});
