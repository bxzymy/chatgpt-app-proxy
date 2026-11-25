/* Appended to the JXA sources by integration.test.js. Overrides only run(). */
function run(argv) {
    var P = ProxyAssistantPlatform;
    var C = ProxyAssistantCore;
    var options = JSON.parse(P.read(argv[0]));
    var checks = [];
    function check(condition, name) { if (!condition) { throw new Error(name); } checks.push(name); }
    function waitFor(predicate, seconds) {
        var deadline = Date.now() + seconds * 1000;
        while (Date.now() < deadline) {
            appProxyAssistant.pulse();
            if (predicate()) { return true; }
            $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.08));
        }
        return false;
    }
    var config = C.defaultConfiguration();
    config.applications[0].bundlePath = options.fixture;
    config.proxies[0].port = options.closedPort;
    var store = new P.Store(options.data);
    store.save(config);
    $.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
    appProxyAssistant = new AppProxyAssistant(options.data, true);
    var app = appProxyAssistant.currentApplication();
    try {
        var dispatched = $.NSApplication.sharedApplication.sendActionToFrom('showSettings:', appProxyAssistant.actions, null);
        check(Boolean(dispatched) && Boolean(appProxyAssistant.settings), 'Cocoa button actions reach the JavaScript controller');
        appProxyAssistant.settings.address.stringValue = 'http://127.0.0.1:' + options.closedPort;
        $.NSApplication.sharedApplication.sendActionToFrom('saveSettings:', appProxyAssistant.actions, null);
        check(P.exists(store.configPath) && !appProxyAssistant.lastError, 'native settings action validates and saves configuration');
        var pulsed = false;
        var originalPulse = appProxyAssistant.pulse;
        appProxyAssistant.pulse = function () { pulsed = true; originalPulse.call(appProxyAssistant); };
        var timer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(1, appProxyAssistant.actions, 'pulse:', null, false);
        timer.fire;
        check(pulsed, 'native timer dispatch drives asynchronous process monitoring');
        appProxyAssistant.pulse = originalPulse;
        appProxyAssistant.startApplication(app, false);
        check(waitFor(function () { return !appProxyAssistant.busy[app.id]; }, 7), 'unreachable proxy check completes');
        check(P.runningApplications(options.fixture).length === 0, 'unreachable proxy never launches an application');
        check(appProxyAssistant.lastError.indexOf('无法连接') !== -1, 'unreachable proxy has an actionable error');

        appProxyAssistant.config.proxies[0].port = options.port;
        appProxyAssistant.store.save(appProxyAssistant.config);
        appProxyAssistant.startApplication(app, false);
        check(waitFor(function () { return appProxyAssistant.stateFor(app).kind === 'managed'; }, 15), 'application launched and proxy arguments verified');
        var firstPID = P.runningApplications(options.fixture)[0].pid;
        check(waitFor(function () { return P.exists(options.capture); }, 4), 'fixture recorded launch context');
        var captured = JSON.parse(P.read(options.capture));
        check(captured.environment.HTTPS_PROXY === 'http://127.0.0.1:' + options.port, 'HTTPS_PROXY reaches the target process');
        check(captured.environment.http_proxy === captured.environment.HTTPS_PROXY, 'lowercase proxy environment reaches target');
        check(captured.environment.NO_PROXY === 'localhost,127.0.0.1,::1', 'loopback bypass reaches target');
        check(captured.arguments.indexOf('--proxy-server=' + captured.environment.HTTPS_PROXY) !== -1, 'Chromium proxy flag reaches target');
        check(captured.arguments.indexOf('--disable-quic') !== -1, 'QUIC switch reaches target');
        var ownProxy = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HTTPS_PROXY')) || '';
        check(ownProxy !== captured.environment.HTTPS_PROXY, 'target proxy does not overwrite the helper process environment');

        var loaded = appProxyAssistant.store.loadReceipts();
        check(C.runtimeState(app, C.getProxy(appProxyAssistant.config, app), P.metadata(app.bundlePath), P.runningApplications(app.bundlePath)[0], loaded[app.id]).kind === 'managed', 'persisted launch record restores process identity');
        appProxyAssistant.startApplication(app, false);
        check(waitFor(function () { return !appProxyAssistant.busy[app.id]; }, 8), 'show-window request completes');
        check(P.runningApplications(options.fixture).length === 1 && P.runningApplications(options.fixture)[0].pid === firstPID, 'opening twice reuses the same application process');

        appProxyAssistant.config = C.updateApplicationProxy(appProxyAssistant.config, app.id, '不可连接的入口', 'http://127.0.0.1:' + options.closedPort);
        app = appProxyAssistant.currentApplication();
        appProxyAssistant.startApplication(app, true);
        check(waitFor(function () { return !appProxyAssistant.busy[app.id]; }, 7), 'restart preflight failure completes');
        check(P.runningApplications(options.fixture).length === 1 && P.runningApplications(options.fixture)[0].pid === firstPID, 'failed proxy preflight never quits an existing application');

        appProxyAssistant.config = C.updateApplicationProxy(appProxyAssistant.config, app.id, '第二入口', 'http://127.0.0.1:' + options.secondPort);
        app = appProxyAssistant.currentApplication();
        check(appProxyAssistant.stateFor(app).kind === 'pending', 'changed endpoint requires restart');
        appProxyAssistant.startApplication(app, true);
        check(waitFor(function () { return appProxyAssistant.stateFor(app).kind === 'managed' && P.runningApplications(options.fixture)[0].pid !== firstPID; }, 20), 'graceful restart replaces process and applies new proxy');
        check(waitFor(function () { return JSON.parse(P.read(options.capture)).environment.HTTPS_PROXY === 'http://127.0.0.1:' + options.secondPort; }, 4), 'new proxy environment reaches restarted process');

        var probe = null;
        appProxyAssistant.runner.probe(C.getProxy(appProxyAssistant.config, app), 'https://chatgpt.com', function (result) { probe = result; });
        check(waitFor(function () { return probe !== null; }, 16), 'HTTPS diagnostic completes through local test proxy');
        check(!probe.ok && probe.message.indexOf('认证') !== -1, '407 authentication response is classified accurately');

        P.runningApplications(options.fixture)[0].native.terminate;
        check(waitFor(function () { return P.runningApplications(options.fixture).length === 0; }, 8), 'normal exit remains stopped');
        check(appProxyAssistant.stateFor(app).kind === 'stopped', 'normal exit does not trigger an automatic restart');

        var corruption = new P.Store(options.data + '/corrupt');
        P.write(corruption.configPath, '{"schemaVersion":99}');
        corruption.load();
        check(Boolean(corruption.configError), 'future schema is detected');
        var refused = false;
        try { corruption.save(C.defaultConfiguration()); } catch (_) { refused = true; }
        check(refused && P.read(corruption.configPath) === '{"schemaVersion":99}', 'unreadable configuration is never silently overwritten');

        P.write(store.logPath, Array(1024 * 1024 + 64).join('x'));
        store.log('rotation-check');
        check(P.exists(store.logPath + '.1') && P.read(store.logPath).indexOf('rotation-check') !== -1, 'native diagnostic log rotates at its size limit');
        return JSON.stringify({ checks: checks, total: checks.length });
    } finally {
        P.runningApplications(options.fixture).forEach(function (item) { item.native.terminate; });
        $.NSStatusBar.systemStatusBar.removeStatusItem(appProxyAssistant.statusItem);
    }
}
