'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('the packaged app launches via Launch Services with isolated arguments and exits its self-test', { skip: process.platform !== 'darwin', timeout: 30000 }, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-proxy-bundle-'));
    const project = path.resolve(__dirname, '../..');
    const bundle = path.join(root, 'App Proxy.app');
    const report = path.join(root, 'report.json');
    const data = path.join(root, 'data');
    const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 20000, cwd: project });
    try {
        run('/bin/bash', ['macos/build.sh', root]);
        run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
        const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(bundle, 'Contents/Info.plist')]));
        assert.equal(info.LSUIElement, true);
        assert.equal(info.NSContactsUsageDescription, undefined);
        assert.equal(info.NSMicrophoneUsageDescription, undefined);
        assert.ok(fs.existsSync(path.join(bundle, 'Contents/Resources/images/macos/panel.png')));
        assert.ok(fs.existsSync(path.join(bundle, 'Contents/Resources/README.zh-CN.md')));
        run('/usr/bin/open', ['-W', '-a', bundle, '--args', '--ui-self-test', '--data-dir', data, '--qa-report', report, '--quit-after-self-test']);
        const result = JSON.parse(fs.readFileSync(report, 'utf8'));
        assert.equal(result.startupError, undefined, JSON.stringify(result));
        assert.equal(result.bundleIdentifier, 'local.appproxy.assistant');
        assert.equal(result.configurationPath, path.join(data, 'configuration.json'));
        assert.equal(result.panelWidth, 384);
        assert.equal(result.settings, true);
        assert.equal(result.diagnostics, true);
        run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    } finally {
        // Bundle identity is shared with the deliverable, so cleanup matches only this temporary path.
        const cleanup = `ObjC.import('Cocoa');var a=$.NSWorkspace.sharedWorkspace.runningApplications;for(var i=0;i<a.count;i++){var p=a.objectAtIndex(i);try{if(p.bundleURL.path.js===${JSON.stringify(bundle)}){p.terminate;}}catch(_){}}`;
        try { run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', cleanup]); } catch (_) {}
        fs.rmSync(root, { recursive: true, force: true });
    }
});
