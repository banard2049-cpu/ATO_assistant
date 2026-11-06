'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const record = read('record/index.html');
const viewer = read('tools/matrix.html');
const dataContext = { window: {} };
vm.runInNewContext(read('record/matrix-data.js'), dataContext);
const matrixData = JSON.parse(JSON.stringify(dataContext.window.ATO_MATRIX_DATA));
const sourceNotes = () => Object.fromEntries(Object.entries(matrixData).map(([code, cell]) => [code, cell.sources]));

test('两页加载同一个矩阵文件，来源和总结只维护一份', () => {
  for (const [filename, source] of [['record/index.html', record], ['tools/matrix.html', viewer]]) {
    const scripts = [...source.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)];
    const shared = scripts.filter(match => match[1].split('?')[0].endsWith('/matrix-data.js'));
    assert.equal(shared.length, 1, filename);
    assert.equal(path.resolve(__dirname, '..', path.dirname(filename), shared[0][1].split('?')[0]),
      path.resolve(__dirname, '..', 'record/matrix-data.js'));
    assert.ok(shared[0].index < source.indexOf('const matrixData ='), `${filename}: data loads before use`);
    assert.doesNotMatch(source, /matrix-summaries\.js|id="matrix-(?:notes|summaries)-data"|const choiceMatrixNotes\s*=\s*\{/);
  }
  assert.ok(Object.keys(matrixData).length > 300);
  for (const [code, cell] of Object.entries(matrixData)) {
    assert.match(code, /^(?:[A-Z]|AA|BB|CC|DD|EE|FF)(?:[1-9]|1[0-2])$/);
    assert.ok(cell.summary.trim(), code);
    assert.ok(Array.isArray(cell.sources), code);
    if (!cell.sources.length) assert.equal(cell.sourceStatus, 'unverified', `${code}: missing source status`);
    assert.ok(cell.sources.every(source => typeof source === 'string' && source.trim()), code);
    assert.ok((cell.removals || []).every(source => typeof source === 'string' && source.trim()), code);
  }
});

function element() {
  return {
    children: [], events: {}, style: {}, textContent: '', value: '',
    set innerHTML(value) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { this.events[name] = handler; },
    remove() { this.removed = true; },
    getBoundingClientRect() { return { left: 10, top: 10, bottom: 30, width: 200, height: 100 }; },
  };
}

function loadViewer(data, hash = '#F8') {
  const nodes = new Map();
  const document = {
    createElement: element,
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
  };
  const window = { ATO_MATRIX_DATA: data, location: { hash } };
  vm.runInNewContext(viewer.match(/<script>([\s\S]*?)<\/script>/)[1], { window, document });
  return nodes;
}

function loadRecord(data, marks) {
  const body = element();
  const elements = { choiceMatrix: element(), matrixHint: element(), matrixLockButton: element() };
  const context = vm.createContext({
    window: {
      ATO_MATRIX_DATA: data, innerWidth: 1024, innerHeight: 768,
      setTimeout(callback) { callback(); return 0; }, clearTimeout() {},
    },
    document: { createElement: element, getElementById() { return null; }, body },
    elements, state: { matrix: marks }, matrixUnlocked: false, setTimeout() {},
  });
  vm.runInContext(record.slice(record.indexOf('    const matrixData ='), record.indexOf('    async function exportState(')), context);
  context.renderMatrix();
  return { context, elements, body };
}

test('同一份数据驱动记录表提示、总结弹窗和检索页显示', () => {
  const shared = structuredClone(matrixData);
  shared.F8.summary = '共用数据中的剧情总结';
  shared.F8.sources[0] += '（共用来源）';
  const { elements, body } = loadRecord(shared, { F8: true });
  const f8 = elements.choiceMatrix.children.find(button => button.textContent === 'F8');
  assert.ok(f8.title.includes(shared.F8.sources[0]));
  f8.events.click();
  assert.equal(body.children[0].children[1].textContent, shared.F8.summary);

  const nodes = loadViewer(shared);
  assert.equal(nodes.get('#summaryText').textContent, shared.F8.summary);
  assert.equal(nodes.get('#rawNotes').textContent, shared.F8.sources.join('\n\n'));
  assert.equal(nodes.get('#sourceList').children.length, 2);
  nodes.get('#searchInput').value = '共用来源';
  nodes.get('#searchInput').events.input();
  const visible = nodes.get('#matrix').children.filter(button => !button.className.split(' ').includes('hidden'));
  assert.deepEqual(visible.map(button => button.textContent), ['F8']);
});

test('移除已有标记单独显示和跳转，不成为新增标记来源或划掉菜单', () => {
  const modes = cellModes(sourceNotes());
  for (const code of ['R5', 'N8', 'F10', 'H6']) {
    const cell = matrixData[code];
    assert.equal(cell.removals.length, 1, code);
    assert.ok(!cell.sources.some(note => note.includes('移除') || note.includes('擦除')), code);
    assert.ok(!modes[code]?.includes('cross'), code);
    const { context, elements, body } = loadRecord(matrixData, { [code]: true });
    const button = elements.choiceMatrix.children.find(value => value.textContent === code);
    assert.ok(button.title.includes('移除已有标记：'), code);
    button.events.click();
    const popup = body.children[0];
    const removalLink = popup.children.find(value => value.textContent === '查看移除标记的段落 →');
    assert.ok(removalLink, code);
    let target;
    context.jumpToMatrixSource = notes => { target = notes; };
    removalLink.events.click({ stopPropagation() {} });
    assert.deepEqual(target, cell.removals, code);
    const nodes = loadViewer(matrixData, `#${code}`);
    assert.ok(nodes.get('#sourceList').children.at(-1).children[0].textContent.startsWith('移除标记：'), code);
    assert.ok(nodes.get('#rawNotes').textContent.includes(cell.removals[0]), code);
  }
});

test('来源待核的格子不再把条件检查当成标记来源', () => {
  for (const code of ['E1', 'F2', 'G2']) {
    assert.deepEqual(matrixData[code].sources, []);
    const nodes = loadViewer(matrixData, `#${code}`);
    assert.equal(nodes.get('#sourceList').children.length, 0);
    assert.match(nodes.get('#sourceEmpty').textContent, /待核实/);
    assert.ok(nodes.get('#badges').children.some(value => value.textContent === '来源待核'));
    const { body, elements } = loadRecord(matrixData, { [code]: true });
    elements.choiceMatrix.children.find(value => value.textContent === code).events.click();
    assert.ok(!body.children[0].children.some(value => value.className === 'summary-link'));
  }
});

test('检索页缺少共用数据文件时显示加载错误', () => {
  const nodes = loadViewer(undefined);
  assert.equal(nodes.get('#matrixMeta').textContent, '矩阵数据读取失败');
  assert.match(nodes.get('#matrix').children[0].textContent, /缺少矩阵数据文件/);
});

test('F8 来源仅为 C1 的两处标记，C2.5 条件检查不列为来源', () => {
  assert.equal(matrixData.F8.sources.length, 2);
  for (const [index, id] of ['0029', '0030'].entries()) {
    assert.match(matrixData.F8.sources[index], new RegExp(`^C1 \\|.* > ${id} line .*标记 F8$`));
  }
  assert.doesNotMatch(matrixData.F8.summary, /过去的罪孽|检查/);
  assert.equal(matrixData.B9.sources.length, 1);
  assert.match(matrixData.B9.sources[0], /^C2 \|.*标记 B9$/);
});

test('没有可解析故事书位置的矩阵格不显示无效跳转入口', () => {
  const begin = record.indexOf('    function allMatrixSourceTargets(');
  const end = record.indexOf('    function pickMatrixTarget(', begin);
  const context = vm.createContext({});
  vm.runInContext(record.slice(begin, end), context);
  const notes = sourceNotes();
  assert.equal(context.allMatrixSourceTargets(notes.A10).length, 0);
  assert.ok(context.allMatrixSourceTargets(notes.A7).length > 0);
  const summary = record.slice(record.indexOf('    function showMatrixSummary('), record.indexOf('    function jumpToMatrixSource('));
  assert.match(summary, /if \(allMatrixSourceTargets\(notes\)\.length\)/);
});

function cellModes(notes) {
  const begin = record.indexOf('    const matrixCellModes = {}');
  const end = record.indexOf('    function matrixDisplayLabel(', begin);
  const context = vm.createContext({
    matrixData: Object.fromEntries(Object.entries(notes).map(([code, sources]) => [code, { sources }])),
  });
  vm.runInContext(record.slice(begin, end) + '\nthis.modes = matrixCellModes;', context);
  return JSON.parse(JSON.stringify(context.modes));
}

test('X10、BB2、DD1 的来源支持 T/L 菜单，普通格保持普通标记', () => {
  const modes = cellModes(sourceNotes());
  for (const code of ['X10', 'BB2', 'DD1']) {
    assert.ok(modes[code].includes('T'), `${code}: missing T`);
    assert.ok(modes[code].includes('L'), `${code}: missing L`);
  }
  assert.equal(modes.A1, undefined);
  // BB6 的同一来源段落还标记 BB8 为 L，不能把 BB8 的字母给 BB6。
  assert.deepEqual(modes.BB6, ['circle']);
  // BB9 是「将BB9标记为L，但圈起来」——圈的是本格，存档里就是 circleL。
  assert.ok(modes.BB9.includes('circle'), 'BB9: missing circle');
  // 反过来，0063 那段的圈是 BB6 的，不能因为同一条注记也标记 BB8 就给 BB8 加圈出。
  assert.ok(!modes.BB8.includes('circle'), 'BB8: 圈出来自别的格子');
  // W11 的第三取值是 N（「将W11标为N（N？没错）」），不能只留 T/L。
  assert.ok(modes.W11.includes('N'), 'W11: missing N');
  assert.deepEqual(cellModes({ X10: ['将X10标记改为T'] }).X10, ['T', 'L']);
  assert.deepEqual(cellModes({ DD1: ['标记 DD1。用 T 标记；用 L 标记'] }).DD1, ['T', 'L']);
  assert.deepEqual(cellModes({ X10: ['将X10标注为N'] }).X10, ['N']);
  assert.deepEqual(cellModes({ W11: ['将 W11 标记为 L（另一选项：让花园保持原样、远离凡人，则标记为 N）'] }).W11, ['L', 'N', 'T']);
  assert.deepEqual(
    cellModes({ BB8: ['C5 | 不惜一切代价 (Whatever the Cost) > 0063 line 70: 现在，你站在墙壁永恒的光芒中，沉浸在这一刻 / 圈出抉择矩阵 (Matrix) 代码BB6。将BB8标记为L'] }).BB8,
    ['L', 'T'],
  );
  assert.deepEqual(
    cellModes({ BB9: ['C5 | 血肉之躯的软弱 (THE FLESH IS WEAK) > 0015 line 22: 你们不知道西狄佩还有其他孩子 / 将BB9标记为L，但圈起来'] }).BB9,
    ['L', 'circle', 'T'],
  );
});

test('同段落划掉其他格子时，不给本格添加划掉菜单', () => {
  const modes = cellModes(sourceNotes());
  for (const code of ['P4', 'O9', 'F4', 'D4']) assert.ok(modes[code]?.includes('cross'), code);
  for (const code of ['N10', 'O10', 'L9', 'P10']) assert.ok(!modes[code]?.includes('cross'), code);
  assert.equal(cellModes({ N10: ['C2 | 主线 > 0240 line 215: 划掉 P4 并标记 N10'] }).N10, undefined);
  assert.deepEqual(cellModes({ P4: ['将 P4 划去'] }).P4, ['cross']);
});

const storybookPath = path.join(__dirname, '..', 'story/data/storybook-data.js');
const officialPath = path.join(__dirname, '..', 'story/data/storybook-official-data.js');

test('修正后的民间正文编号与官方对应段落一致', {
  skip: (!fs.existsSync(storybookPath) || !fs.existsSync(officialPath)) && '本地故事书数据未安装',
}, () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(storybookPath, 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(officialPath, 'utf8'), context);
  const fan = context.window.STORYBOOK_DATA.books.flatMap(book => book.entries);
  const official = context.window.STORYBOOK_OFFICIAL_DATA.books.flatMap(book => book.entries);
  const codes = text => [...text.matchAll(/\b([A-Z]{1,2}[1-9]\d?)\b/g)].map(match => match[1]).sort();
  for (const key of ['c2-0-181', 'c2-2-6', 'c3-0-7']) {
    const entry = fan.find(value => value.key === key);
    const reference = official.find(value => value.key === key);
    assert.deepEqual(codes(entry.text), codes(reference.officialText), key);
  }
  assert.ok(matrixData.L10.sources.some(note => note.includes('> 0207 line ')));
  assert.ok(!matrixData.I10.sources.some(note => note.includes('> 0207 line ')));
  for (const [code, invalid] of [['G3', ['0112', '0130']], ['I2', ['0131']], ['I4', ['0130']]]) {
    assert.ok(!matrixData[code].sources.some(note => invalid.some(id => note.includes(`> ${id} line `))), code);
  }
});

// 正文里的矩阵赋值有几种写法：
//   「将 X10 标记为 T」「将R10标注为T」「将W11标为L」（更正后的译文大量改用「标注为／标为」），
//   以及「标记 BB2：……标记为 T；……标记为 L」这种先点名格号、再逐支给字母的写法。
// 取值除 T／L 外还有 N（W11 的另一支），但记录表菜单只有 T/L/圈出/划掉，所以 N 只校验来源注记。
const MATRIX_CODE = /^(?:[A-Z]|AA|BB|CC|DD|EE|FF)(?:[1-9]|1[0-2])$/;
const MATRIX_MARK = /([A-Z]{1,2}\s*\d{1,2})\s*(?:标记|标注|标)(?:改|作|记)?为\s*([TLN])\b|(?:标记|标注)\s*([A-Z]{1,2}\s*\d{1,2})[^。\n]{0,40}?(?:标记|标注|标)(?:改|作|记)?为\s*([TLN])\b/g;

test('故事书正文中的字母标记均有对应菜单，遗漏格的来源指向可核验', {
  skip: !fs.existsSync(storybookPath) && '本地故事书数据未安装',
}, () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(storybookPath, 'utf8'), context);
  const books = context.window.STORYBOOK_DATA.books;
  const notes = sourceNotes();
  const modes = cellModes(notes);
  let checked = 0;
  for (const book of books) {
    for (const entry of book.entries) {
      for (const match of entry.text.matchAll(MATRIX_MARK)) {
        const code = (match[1] || match[3]).replace(/\s/g, '');
        const letter = match[2] || match[4];
        if (!MATRIX_CODE.test(code)) continue;
        if (letter === 'N') {
          assert.ok(notes[code]?.length, `${book.id}/${entry.chapterKey}/${entry.id}: ${code} 标为 N，但注记里没有这一格`);
        } else {
          assert.ok(modes[code]?.includes(letter), `${book.id}/${entry.chapterKey}/${entry.id}: ${code} ${letter}`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 50, '应核对整本故事书而非仅个别段落');
  for (const [code, chapterKey, entryId, evidence] of [
    ['X10', 'hub-04-the-greater-good', '0001', /将X10标记改为T/],
    ['BB2', 'hub-03-the-one-you-dont', '0072', /标记 BB2[：:][\s\S]*标记为 T[\s\S]*标记为 L/],
    ['T11', 'mnemos-breakthroughs', 'M026', /将T11标注为L/],
    ['DD1', 'main', '0022', /标记 DD1。.*用 T 标记.*用 L 标记/],
  ]) {
    const entry = books.find(book => book.id === 'c5').entries.find(entry => entry.chapterKey === chapterKey && entry.id === entryId);
    assert.ok(entry, code);
    assert.match(entry.text, evidence);
    assert.ok(notes[code].some(note => note.includes(`C5 | ${entry.chapter} > ${entry.id} line ${entry.line}:`)), `${code}: source target`);
  }
});
