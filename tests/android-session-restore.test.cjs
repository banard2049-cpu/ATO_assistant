const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const init = html.match(/^    async function initAuth\(\) \{[^]*?^    }/m)[0];
function setup(android, fetchImpl, startImpl) {
  const events = [];
  const scope = { window: { ATOAndroid: android }, authUrl: './api/campaign-state.php',
    fetch: fetchImpl, console: {warn(){}, error(){}}, elements: { authMessage: { textContent: '' } },
    startAuthenticatedApp: user => { events.push(['start', user.id]); if (startImpl) startImpl(); },
    showAuth: message => events.push(['auth', message]) };
  vm.createContext(scope); vm.runInContext(init, scope);
  return { scope, events };
}
test('Android restores the stored account without a second login', async () => {
  const h = setup({ rememberedSession: () => JSON.stringify({ok:true,authenticated:true,user:{id:'alpha'}}) },
    () => { throw new Error('unexpected network path'); });
  await h.scope.initAuth(); assert.deepEqual(h.events, [['start','alpha']]);
});
test('older Android and web clients retain the fetch session path', async () => {
  const h = setup({}, async () => ({json: async () => ({ok:true,authenticated:true,user:{id:'alpha'}})}));
  await h.scope.initAuth(); assert.deepEqual(h.events, [['start','alpha']]);
});
test('logged out sessions show login, while dashboard errors do not pretend the session expired', async () => {
  const h = setup({rememberedSession: () => JSON.stringify({ok:true,authenticated:false})});
  await h.scope.initAuth(); assert.equal(h.events[0][0], 'auth');
  const failing = setup({rememberedSession: () => JSON.stringify({ok:true,authenticated:true,user:{id:'alpha'}})}, null, () => {throw Error('render');});
  await failing.scope.initAuth(); assert.deepEqual(failing.events, [['start','alpha']]);
  assert.match(failing.scope.elements.authMessage.textContent, /登录状态已恢复/);
});
