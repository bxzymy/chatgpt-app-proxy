'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../ProxyAssistant/Core.js');

function fixture() {
    const config = core.defaultConfiguration('/Users/example');
    return { config, app: config.applications[0], proxy: config.proxies[0], metadata: { exists: true, executable: 'ChatGPT', version: '1.2.3' } };
}

test('first-run settings have only ChatGPT, no automatic startup or keyboard permissions', () => {
    const config = core.validateConfiguration(core.defaultConfiguration());
    assert.equal(config.applications.length, 1);
    assert.equal(config.applications[0].autoLaunch, false);
    assert.deepEqual(config.preferences, { launchAtLogin: false, globalShortcut: false });
});

test('proxy addresses are canonical, with explicit IPv6 brackets', () => {
    assert.equal(core.proxyURL(core.parseProxyAddress('http://LOCALHOST:07890/')), 'http://localhost:7890');
    assert.equal(core.proxyURL(core.parseProxyAddress('http://[::1]:7890')), 'http://[::1]:7890');
});

for (const address of ['socks5://127.0.0.1:7890', 'https://127.0.0.1:7890', 'http://a:b@localhost:7890',
    'http://localhost:7890/path', 'http://localhost:7890?x=y', 'http://localhost:0', 'http://localhost:65536',
    'http://localhost:1e3', 'http://localhost:7890\n', 'http://$(touch /tmp/nope):7890', 'http://999.1.1.1:7890',
    'http://[:::1]:7890', 'http://[1:2:3]:7890', 'http://[1::2::3]:7890']) {
    test('reject unsafe or unsupported proxy: ' + JSON.stringify(address), () => assert.throws(() => core.parseProxyAddress(address)));
}

test('multiple applications can reference independent or shared proxy profiles', () => {
    const { config } = fixture();
    config.proxies.push({ id: 'local-claude', name: 'Claude 入口', scheme: 'http', host: '127.0.0.1', port: 7891 });
    config.applications.push({ id: 'claude', name: 'Claude', adapter: 'claude-pending', bundlePath: '/Applications/Claude.app', proxyId: 'local-claude', autoLaunch: false });
    const validated = core.validateConfiguration(config);
    assert.equal(core.getProxy(validated, validated.applications[1]).port, 7891);
    assert.equal(core.getProxy(validated, validated.applications[0]).port, 7890);
    assert.throws(() => core.adapterFor(validated.applications[1]), /尚未适配/);
});

test('corrupt, future-version, duplicate, and broken-reference configurations are rejected', () => {
    const { config } = fixture();
    assert.throws(() => core.validateConfiguration({ ...config, schemaVersion: 99 }));
    assert.throws(() => core.validateConfiguration({ ...config, proxies: [...config.proxies, config.proxies[0]] }));
    assert.throws(() => core.validateConfiguration({ ...config, applications: [{ ...config.applications[0], proxyId: 'gone' }] }));
    assert.throws(() => core.validateConfiguration({ ...config, applications: [{ ...config.applications[0], autoLaunch: 'yes' }] }));
});

test('editing a shared proxy isolates the selected app without changing another application', () => {
    const { config } = fixture();
    config.applications.push({ id: 'claude', name: 'Claude', adapter: 'claude-pending', bundlePath: '/Applications/Claude.app', proxyId: 'local-default', autoLaunch: false });
    const original = core.copy(config);
    const changed = core.updateApplicationProxy(config, 'chatgpt', 'ChatGPT 专用', 'http://127.0.0.1:7897');
    assert.equal(core.getProxy(changed, changed.applications[0]).port, 7897);
    assert.equal(core.getProxy(changed, changed.applications[1]).port, 7890);
    assert.notEqual(changed.applications[0].proxyId, changed.applications[1].proxyId);
    assert.deepEqual(config, original);
});

test('repeated edits reuse a private profile rather than accumulating proxy entries', () => {
    const { config } = fixture();
    const changed = core.updateApplicationProxy(config, 'chatgpt', 'ChatGPT', 'http://127.0.0.1:7897');
    const again = core.updateApplicationProxy(changed, 'chatgpt', 'ChatGPT', 'http://127.0.0.1:7898');
    assert.equal(again.proxies.length, 1);
    assert.equal(core.getProxy(again, again.applications[0]).port, 7898);
});

test('launch plan uses argument arrays and process-scoped environment, keeps loopback direct', () => {
    const { app, proxy, metadata } = fixture();
    app.bundlePath = '/Applications/ChatGPT With Spaces.app';
    const plan = core.launchPlan(app, proxy, metadata);
    assert.equal(plan.executable, '/usr/bin/open');
    assert.equal(plan.arguments[1], app.bundlePath);
    assert.equal(plan.environment.HTTPS_PROXY, 'http://127.0.0.1:7890');
    assert.equal(plan.environment.NO_PROXY, 'localhost,127.0.0.1,::1');
    assert.equal(plan.environment.no_proxy, plan.environment.NO_PROXY);
    assert.ok(plan.appArguments.includes('--proxy-server=http://127.0.0.1:7890'));
    assert.ok(plan.appArguments.includes('--proxy-bypass-list=localhost;127.0.0.1;[::1]'));
    assert.equal(plan.arguments.includes('-n'), false);
    assert.equal(JSON.stringify(plan).includes('networksetup'), false);
    assert.equal(JSON.stringify(plan).includes('launchctl'), false);
});

test('a selected unrelated application cannot be launched with the ChatGPT adapter', () => {
    const { app, proxy, metadata } = fixture();
    assert.throws(() => core.launchPlan(app, proxy, { ...metadata, executable: 'Safari' }), /不是受支持/);
});

test('process identity survives helper restarts but rejects PID reuse and other entry points', () => {
    const { app, proxy, metadata } = fixture();
    const running = { pid: 42, launchTime: 123.25 };
    const receipt = { ...running, bundlePath: app.bundlePath, signature: core.fingerprint(app, proxy, metadata) };
    assert.equal(core.runtimeState(app, proxy, metadata, running, receipt).kind, 'managed');
    assert.equal(core.runtimeState(app, proxy, metadata, { ...running, launchTime: 999 }, receipt).kind, 'external');
    assert.equal(core.runtimeState(app, proxy, metadata, running, null).kind, 'external');
    assert.equal(core.runtimeState(app, proxy, metadata, null, receipt).kind, 'stopped');
});

test('proxy or app-version changes require restart without changing the existing receipt', () => {
    const { app, proxy, metadata } = fixture();
    const running = { pid: 42, launchTime: 123.25 };
    const receipt = { ...running, bundlePath: app.bundlePath, signature: core.fingerprint(app, proxy, metadata) };
    const original = core.copy(receipt);
    assert.equal(core.runtimeState(app, { ...proxy, port: 7891 }, metadata, running, receipt).kind, 'pending');
    assert.equal(core.runtimeState(app, proxy, { ...metadata, version: '2.0' }, running, receipt).kind, 'pending');
    assert.deepEqual(receipt, original);
});

test('missing applications and reserved adapters have explicit states', () => {
    const { app, proxy, metadata } = fixture();
    assert.equal(core.runtimeState(app, proxy, { exists: false }, null, null).kind, 'missing');
    assert.equal(core.runtimeState({ ...app, adapter: 'claude-pending' }, proxy, metadata, null, null).kind, 'unsupported');
    assert.throws(() => core.adapterFor({ ...app, adapter: 'constructor' }), /尚未适配/);
});

test('an HTTP challenge is distinct from a broken CONNECT tunnel', () => {
    const challenge = core.parseProbe(0, '403\n200\n0.85');
    assert.equal(challenge.ok, true);
    assert.match(challenge.message, /不代表应用/);
    assert.equal(core.parseProbe(56, '000\n407\n0.1').ok, false);
    assert.equal(core.parseProbe(60, '000\n200\n0.1').ok, false);
    assert.equal(core.parseProbe(0, '200\n000\n0.1').ok, false);
});

test('diagnostics redact credentials and API tokens', () => {
    const sanitized = core.redact('http://name:password@proxy:7890 Bearer abc123 sk-proj-abc123');
    assert.equal(sanitized.includes('password'), false);
    assert.equal(sanitized.includes('abc123'), false);
});
