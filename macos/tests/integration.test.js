'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');

const native = path.resolve(__dirname, '..');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 20000 });

test('macOS native launch lifecycle uses only a temporary fixture application and loopback proxy', { skip: process.platform !== 'darwin', timeout: 90000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-proxy-integration-'));
    const fixture = path.join(root, 'ChatGPT Fixture.app');
    const capture = path.join(root, 'captured.json');
    const fixtureSource = path.join(root, 'fixture.js');
    fs.writeFileSync(fixtureSource, `ObjC.import('Cocoa');\nfunction run() {\nvar env = $.NSProcessInfo.processInfo.environment;\nvar selected = {};\n['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NO_PROXY','no_proxy'].forEach(function(k) { selected[k] = ObjC.unwrap(env.objectForKey(k)) || ''; });\nvar result = JSON.stringify({ arguments: ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments), environment: selected });\n$(result).writeToFileAtomicallyEncodingError(${JSON.stringify(capture)}, true, $.NSUTF8StringEncoding, null);\n}\nfunction idle() { return 1; }\n`);
    run('/usr/bin/osacompile', ['-l', 'JavaScript', '-s', '-o', fixture, fixtureSource]);
    fs.renameSync(path.join(fixture, 'Contents/MacOS/applet'), path.join(fixture, 'Contents/MacOS/ChatGPT'));
    const plist = path.join(fixture, 'Contents/Info.plist');
    run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleExecutable ChatGPT', plist]);
    run('/usr/libexec/PlistBuddy', ['-c', `Add :CFBundleIdentifier string local.appproxy.fixture.${process.pid}`, plist]);
    run('/usr/libexec/PlistBuddy', ['-c', 'Add :LSUIElement bool true', plist]);
    run('/usr/bin/codesign', ['--force', '--sign', '-', fixture]);

    const connections = [];
    const sockets = new Set();
    function proxy() {
        const server = http.createServer((req, res) => { res.writeHead(407); res.end(); });
        server.on('connect', (request, socket) => {
            connections.push(request.url);
            socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
        });
        server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
        return server;
    }
    const first = proxy(), second = proxy();
    const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const blocker = net.createServer();
    try {
        await Promise.all([listen(first), listen(second), listen(blocker)]);
        const closedPort = blocker.address().port;
        await new Promise(resolve => blocker.close(resolve));
        const options = { fixture, capture, data: path.join(root, 'data'), port: first.address().port, secondPort: second.address().port, closedPort };
        const optionsPath = path.join(root, 'options.json');
        fs.writeFileSync(optionsPath, JSON.stringify(options));
        const combined = ['Core.js', 'Platform.js', 'App.js'].map(name => fs.readFileSync(path.join(native, 'ProxyAssistant', name), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(__dirname, 'native-harness.js'), 'utf8');
        const harness = path.join(root, 'harness.js');
        fs.writeFileSync(harness, combined);
        const result = await new Promise((resolve, reject) => {
            const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', harness, optionsPath]);
            let stdout = '', stderr = '';
            child.stdout.on('data', data => { stdout += data; });
            child.stderr.on('data', data => { stderr += data; });
            const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Native harness timed out')); }, 80000);
            child.on('error', reject);
            child.on('close', code => {
                clearTimeout(timeout);
                if (code !== 0 || !stdout.trim()) { reject(new Error(`Native harness exited ${code}: ${stderr || 'no JSON report (WindowServer access may be restricted)'}`)); }
                else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(new Error(`${error.message}: ${stdout}\n${stderr}`)); } }
            });
        });
        assert.ok(result.total >= 20, JSON.stringify(result));
        assert.ok(connections.includes('chatgpt.com:443'), 'CONNECT request must reach the local proxy; no real external request is made');
        process.stdout.write(`Native checks: ${result.checks.join('; ')}\n`);
    } finally {
        for (const socket of sockets) socket.destroy();
        await Promise.all([first, second, blocker].map(server => new Promise(resolve => { if (server.listening) server.close(resolve); else resolve(); })));
        // Only the uniquely named temporary fixture is addressed, never a real ChatGPT process.
        const cleanup = `ObjC.import('Cocoa'); var apps=$.NSWorkspace.sharedWorkspace.runningApplications; for(var i=0;i<apps.count;i++){var a=apps.objectAtIndex(i);try{if(a.bundleURL.path.js===${JSON.stringify(fixture)}){a.terminate;}}catch(_){}}`;
        try { run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', cleanup]); } catch (_) { /* Preserve artifacts when debugging a failed test. */ }
        if (process.env.APP_PROXY_KEEP_TEST_ARTIFACTS !== '1') fs.rmSync(root, { recursive: true, force: true });
    }
});
