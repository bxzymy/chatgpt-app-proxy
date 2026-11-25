/* Native AppKit UI and application lifecycle. All target launches use Core plans. */
var appProxyAssistant = null;
var AppProxyActionsClass = null;

function apLabel(value, x, y, width, height, size, secondary) {
    var field = $.NSTextField.labelWithString(String(value));
    field.frame = $.NSMakeRect(x, y, width, height);
    field.font = $.NSFont.systemFontOfSize(size || 13);
    field.textColor = secondary ? $.NSColor.secondaryLabelColor : $.NSColor.labelColor;
    field.lineBreakMode = $.NSLineBreakByWordWrapping;
    field.maximumNumberOfLines = height > 24 ? 3 : 1;
    return field;
}
function apButton(title, action, x, y, width, height, target) {
    var button = $.NSButton.buttonWithTitleTargetAction(title, target, action);
    button.frame = $.NSMakeRect(x, y, width, height || 28);
    button.bezelStyle = $.NSBezelStyleRounded;
    button.font = $.NSFont.systemFontOfSize(12);
    return button;
}
function apField(value, x, y, width) {
    var field = $.NSTextField.alloc.initWithFrame($.NSMakeRect(x, y, width, 26));
    field.stringValue = String(value);
    field.font = $.NSFont.systemFontOfSize(13);
    return field;
}
function apCheckbox(title, action, x, y, width, target) {
    var button = $.NSButton.checkboxWithTitleTargetAction(title, target, action);
    button.frame = $.NSMakeRect(x, y, width, 24);
    button.font = $.NSFont.systemFontOfSize(12);
    return button;
}
function apSeparator(parent, y, width) {
    var box = $.NSBox.alloc.initWithFrame($.NSMakeRect(20, y, width - 40, 1));
    box.boxType = $.NSBoxSeparator;
    parent.addSubview(box);
}
function apWindow(title, width, height) {
    var style = $.NSWindowStyleMaskTitled | $.NSWindowStyleMaskClosable | $.NSWindowStyleMaskMiniaturizable;
    var window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, width, height), style, $.NSBackingStoreBuffered, false);
    window.title = title;
    window.releasedWhenClosed = false;
    window.center;
    return window;
}
function apAlert(title, message, confirm) {
    var alert = $.NSAlert.alloc.init;
    alert.messageText = title;
    alert.informativeText = String(message);
    alert.addButtonWithTitle(confirm || '好');
    if (confirm) { alert.addButtonWithTitle('取消'); }
    $.NSApplication.sharedApplication.activateIgnoringOtherApps(true);
    return Number(alert.runModal) === Number($.NSAlertFirstButtonReturn);
}
function apActionClass() {
    if (AppProxyActionsClass) { return AppProxyActionsClass; }
    var methods = {};
    var callbacks = {
        togglePanel: 'togglePanel', primaryAction: 'primaryAction', moreActions: 'moreActions',
        showSettings: 'showSettings', showDiagnostics: 'showDiagnostics', quitAssistant: 'quitAssistant',
        restartTarget: 'restartTarget', quitTarget: 'quitTarget', chooseApplication: 'chooseApplication',
        saveSettings: 'saveSettings', cancelSettings: 'cancelSettings', runDiagnostic: 'runDiagnostic',
        copyDiagnostics: 'copyDiagnostics', refreshLogs: 'refreshLogs', openConfigurationFolder: 'openConfigurationFolder',
        selectApplication: 'selectApplication', permissionSettings: 'permissionSettings',
        pulse: 'pulse', workspaceChanged: 'workspaceChanged'
    };
    Object.keys(callbacks).forEach(function (selector) {
        methods[selector + ':'] = {
            types: ['void', ['id']],
            implementation: function (sender) {
                if (!appProxyAssistant) { return; }
                try { appProxyAssistant[callbacks[selector]](sender); }
                catch (error) { appProxyAssistant.reportError('操作没有完成', error); }
            }
        };
    });
    ObjC.registerSubclass({ name: 'AppProxyAssistantActions', superclass: 'NSObject', methods: methods });
    AppProxyActionsClass = $.AppProxyAssistantActions;
    return AppProxyActionsClass;
}

function AppProxyAssistant(directory, preview) {
    this.platform = ProxyAssistantPlatform;
    this.store = new this.platform.Store(directory);
    this.config = this.store.load();
    this.receipts = this.store.loadReceipts();
    this.runner = new this.platform.TaskRunner();
    this.preview = Boolean(preview);
    this.actions = apActionClass().alloc.init;
    this.currentIndex = 0;
    this.health = {};
    this.busy = {};
    this.waiting = [];
    this.lastError = '';
    this.lastDiagnostic = '';
    this.lastHealthCheck = 0;
    this.lastRefresh = 0;
    this.globalMonitor = null;
    this.localMonitor = null;
    this.lastShortcut = 0;
    this.settings = null;
    this.diagnostics = null;
    this.buildPanel();
    this.store.log('assistant-started', { version: '1.0.0', preview: this.preview, configReadable: !this.store.configError });
}
AppProxyAssistant.prototype.currentApplication = function () { return this.config.applications[this.currentIndex] || this.config.applications[0]; };
AppProxyAssistant.prototype.running = function (app) { return this.platform.runningApplications(app.bundlePath); };
AppProxyAssistant.prototype.stateFor = function (app) {
    var running = this.running(app);
    var state = ProxyAssistantCore.runtimeState(app, ProxyAssistantCore.getProxy(this.config, app), this.platform.metadata(app.bundlePath), running[0], this.receipts[app.id]);
    if (running.length > 1) { state = { kind: 'external', title: '检测到多个实例', detail: '请先正常退出多余实例，再通过助手启动', action: '显示窗口' }; }
    return state;
};
AppProxyAssistant.prototype.buildPanel = function () {
    var view = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, 384, 350));
    var title = apLabel('应用代理助手', 20, 312, 300, 23, 16, false);
    title.font = $.NSFont.systemFontOfSizeWeight(16, 0.3);
    view.addSubview(title);
    this.subtitle = apLabel('为应用单独保存代理', 20, 289, 340, 18, 12, true);
    view.addSubview(this.subtitle);
    this.appChooser = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(20, 283, 270, 28), false);
    this.appChooser.addItemsWithTitles($(this.config.applications.map(function (app) { return app.name; })));
    this.appChooser.target = this.actions;
    this.appChooser.action = 'selectApplication:';
    this.appChooser.hidden = this.config.applications.length < 2;
    this.subtitle.hidden = this.config.applications.length > 1;
    view.addSubview(this.appChooser);
    apSeparator(view, 276, 384);
    this.appIcon = $.NSImageView.alloc.initWithFrame($.NSMakeRect(20, 219, 42, 42));
    this.appIcon.imageScaling = $.NSImageScaleProportionallyUpOrDown;
    view.addSubview(this.appIcon);
    this.appName = apLabel('ChatGPT', 74, 242, 286, 22, 15, false);
    this.appName.font = $.NSFont.systemFontOfSizeWeight(15, 0.3);
    view.addSubview(this.appName);
    this.appStatus = apLabel('未运行', 74, 220, 288, 20, 12, true);
    view.addSubview(this.appStatus);
    this.proxySummary = apLabel('', 20, 188, 344, 20, 12, false);
    this.proxySummary.lineBreakMode = $.NSLineBreakByTruncatingMiddle;
    view.addSubview(this.proxySummary);
    this.stateDetail = apLabel('', 20, 149, 344, 34, 12, true);
    view.addSubview(this.stateDetail);
    this.primaryButton = apButton('带代理启动', 'primaryAction:', 18, 108, 277, 32, this.actions);
    this.primaryButton.keyEquivalent = '\r';
    view.addSubview(this.primaryButton);
    this.moreButton = apButton('更多', 'moreActions:', 301, 108, 65, 32, this.actions);
    view.addSubview(this.moreButton);
    this.healthLabel = apLabel('代理入口 · 尚未检查', 20, 78, 342, 20, 12, true);
    view.addSubview(this.healthLabel);
    apSeparator(view, 62, 384);
    view.addSubview(apButton('代理配置', 'showSettings:', 15, 18, 100, 28, this.actions));
    view.addSubview(apButton('诊断与日志', 'showDiagnostics:', 120, 18, 116, 28, this.actions));
    var quit = apButton('退出助手', 'quitAssistant:', 275, 18, 94, 28, this.actions);
    quit.toolTip = '仅退出助手，已启动的 ChatGPT 会继续运行';
    view.addSubview(quit);
    var controller = $.NSViewController.alloc.init;
    controller.view = view;
    this.popover = $.NSPopover.alloc.init;
    this.popover.behavior = $.NSPopoverBehaviorTransient;
    this.popover.contentSize = $.NSMakeSize(384, 350);
    this.popover.contentViewController = controller;
    this.panelView = view;
    this.statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
    var image = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription('network', '应用代理助手');
    if (image && !image.isNil()) {
        image.template = true;
        this.statusItem.button.image = image;
    } else { this.statusItem.button.title = '代理'; }
    this.statusItem.button.target = this.actions;
    this.statusItem.button.action = 'togglePanel:';
    this.refresh();
};
AppProxyAssistant.prototype.startMonitoring = function () {
    var center = this.platform.workspace.notificationCenter;
    center.addObserverSelectorNameObject(this.actions, 'workspaceChanged:', $.NSWorkspaceDidLaunchApplicationNotification, $());
    center.addObserverSelectorNameObject(this.actions, 'workspaceChanged:', $.NSWorkspaceDidTerminateApplicationNotification, $());
    this.timer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.5, this.actions, 'pulse:', null, true);
    $.NSRunLoop.mainRunLoop.addTimerForMode(this.timer, $.NSRunLoopCommonModes);
    this.installShortcut();
    this.checkHealth();
    if (!this.preview && !this.store.configError) {
        var self = this;
        this.config.applications.forEach(function (app) {
            if (app.autoLaunch && ProxyAssistantCore.supportsAdapter(app.adapter) && !self.running(app).length) { self.startApplication(app, false); }
        });
    }
};
AppProxyAssistant.prototype.togglePanel = function () {
    if (this.popover.shown) { this.popover.performClose(null); }
    else { this.showPanel(); }
};
AppProxyAssistant.prototype.showPanel = function () {
    this.refresh();
    this.popover.showRelativeToRectOfViewPreferredEdge(this.statusItem.button.bounds, this.statusItem.button, $.NSMinYEdge);
    $.NSApplication.sharedApplication.activateIgnoringOtherApps(true);
    if (Date.now() - this.lastHealthCheck > 10000) { this.checkHealth(); }
};
AppProxyAssistant.prototype.refresh = function () {
    var app = this.currentApplication();
    var proxy = ProxyAssistantCore.getProxy(this.config, app);
    var state = this.stateFor(app);
    var busy = this.busy[app.id];
    this.appName.stringValue = app.name;
    this.appIcon.image = this.platform.workspace.iconForFile(app.bundlePath);
    this.appStatus.stringValue = busy || state.title;
    this.appStatus.textColor = state.kind === 'pending' || state.kind === 'external' ? $.NSColor.systemOrangeColor : $.NSColor.secondaryLabelColor;
    this.proxySummary.stringValue = proxy.name + ' · ' + ProxyAssistantCore.proxyURL(proxy);
    this.proxySummary.toolTip = ProxyAssistantCore.proxyURL(proxy);
    this.stateDetail.stringValue = this.store.configError ? '配置无法读取，原文件已保留。请打开诊断查看详情。' : state.detail;
    this.primaryButton.title = state.action;
    this.primaryButton.enabled = !busy && state.kind !== 'unsupported' && !this.store.configError;
    this.moreButton.enabled = !busy;
    var health = this.health[proxy.id];
    this.healthLabel.stringValue = !health ? '代理入口 · 尚未检查' : health.pending ? '代理入口 · 正在检查…' : health.ok ? '代理入口 · TCP 可连接' : '代理入口 · 连接失败';
    this.healthLabel.textColor = health && !health.pending && !health.ok ? $.NSColor.systemOrangeColor : $.NSColor.secondaryLabelColor;
    this.statusItem.button.toolTip = app.name + '：' + (busy || state.title) + '\n' + String(this.healthLabel.stringValue.js);
    this.lastRefresh = Date.now();
};
AppProxyAssistant.prototype.selectApplication = function () { this.currentIndex = Number(this.appChooser.indexOfSelectedItem); this.refresh(); };
AppProxyAssistant.prototype.workspaceChanged = function () { this.refresh(); };
AppProxyAssistant.prototype.pulse = function () {
    this.runner.poll();
    var queue = this.waiting;
    this.waiting = [];
    for (var i = 0; i < queue.length; i += 1) {
        var job = queue[i];
        try { if (!job.poll()) { this.waiting.push(job); } }
        catch (error) { delete this.busy[job.app.id]; this.reportError('操作没有完成', error); }
    }
    if (Date.now() - this.lastRefresh > 2000) { this.refresh(); }
    if (Date.now() - this.lastHealthCheck > 20000) { this.checkHealth(); }
    if (this.config.preferences.globalShortcut && !this.globalMonitor && this.platform.accessibilityTrusted(false)) { this.installShortcut(); }
};
AppProxyAssistant.prototype.checkHealth = function () {
    var self = this;
    this.lastHealthCheck = Date.now();
    this.config.proxies.forEach(function (proxy) {
        if (self.health[proxy.id] && self.health[proxy.id].pending) { return; }
        self.health[proxy.id] = { pending: true };
        self.runner.checkPort(proxy, function (ok) {
            var current = self.config.proxies.filter(function (item) { return item.id === proxy.id; })[0];
            if (!current || ProxyAssistantCore.proxyURL(current) !== ProxyAssistantCore.proxyURL(proxy)) { return; }
            self.health[proxy.id] = { pending: false, ok: ok, time: new Date().toISOString() };
            self.refresh();
        });
    });
    this.refresh();
};
AppProxyAssistant.prototype.reportError = function (title, error) {
    this.lastError = ProxyAssistantCore.redact(String(error.message || error));
    this.store.log('operation-error', { title: title, message: this.lastError });
    this.refresh();
    if (!this.preview) { apAlert(title, this.lastError); }
};
AppProxyAssistant.prototype.primaryAction = function () {
    var app = this.currentApplication();
    if (this.stateFor(app).kind === 'missing') { this.showSettings(); return; }
    this.startApplication(app, false);
};
AppProxyAssistant.prototype.startApplication = function (app, restart) {
    if (this.store.configError) { this.reportError('配置需要恢复', this.store.configError); return; }
    if (this.busy[app.id]) { return; }
    var self = this;
    var proxy = ProxyAssistantCore.getProxy(this.config, app);
    var metadata = this.platform.metadata(app.bundlePath);
    var plan;
    try {
        if (!metadata.exists) { throw new Error('找不到 ' + app.name + '，请先在代理配置中选择应用。'); }
        plan = ProxyAssistantCore.launchPlan(app, proxy, metadata);
    } catch (error) { this.reportError('无法启动 ' + app.name, error); return; }
    var current = this.running(app);
    if (current.length > 1) { this.reportError('检测到多个实例', '请先正常退出多余的 ' + app.name + ' 实例。'); return; }
    if (current.length && !restart) { this.openApplication(app, plan, current[0].pid); return; }
    this.busy[app.id] = '检查代理入口…';
    this.refresh();
    this.runner.checkPort(proxy, function (ok) {
        self.health[proxy.id] = { ok: ok, pending: false, time: new Date().toISOString() };
        if (!ok) {
            delete self.busy[app.id];
            self.reportError('代理入口不可连接', '无法连接 ' + ProxyAssistantCore.proxyURL(proxy) + '。请先启动代理客户端或检查端口，再重试。');
            return;
        }
        var latest = self.running(app);
        if (!restart && latest.length) { delete self.busy[app.id]; self.openApplication(app, plan, latest[0].pid); return; }
        if (restart && latest.length) {
            self.busy[app.id] = '等待应用正常退出…';
            self.refresh();
            if (!latest[0].native.terminate) {
                delete self.busy[app.id]; self.reportError('应用尚未退出', '请先处理 ' + app.name + ' 中的保存或退出提示，再重试。'); return;
            }
            var deadline = Date.now() + 20000;
            self.waiting.push({ app: app, poll: function () {
                if (!self.running(app).length) { self.openApplication(app, plan, null); return true; }
                if (Date.now() > deadline) { delete self.busy[app.id]; self.reportError('等待退出已超时', '没有强制结束应用。请正常退出 ' + app.name + ' 后重新启动。'); return true; }
                return false;
            } });
        } else { self.openApplication(app, plan, null); }
    });
};
AppProxyAssistant.prototype.openApplication = function (app, plan, previousPID) {
    var self = this;
    this.busy[app.id] = previousPID ? '正在显示窗口…' : '正在带代理启动…';
    this.refresh();
    this.runner.start(plan.executable, plan.arguments, 10, function (result) {
        if (result.code !== 0) {
            delete self.busy[app.id]; self.reportError('无法打开 ' + app.name, result.stderr || 'macOS 启动服务没有完成操作。'); return;
        }
        var deadline = Date.now() + 10000;
        self.waiting.push({ app: app, poll: function () {
            var running = self.running(app);
            if (running.length) {
                var process = running[0];
                if (process.pid === previousPID) { delete self.busy[app.id]; self.refresh(); return true; }
                self.runner.verifyArguments(process.pid, plan.environment.HTTPS_PROXY, function (verified) {
                    delete self.busy[app.id];
                    if (verified && self.running(app).some(function (item) { return item.pid === process.pid && item.launchTime === process.launchTime; })) {
                        self.receipts[app.id] = { pid: process.pid, launchTime: process.launchTime, bundlePath: app.bundlePath, signature: plan.signature };
                        self.store.saveReceipts(self.receipts);
                        self.store.log('application-started', { app: app.id, pid: process.pid, proxy: plan.environment.HTTPS_PROXY });
                    } else {
                        self.store.log('launch-arguments-unconfirmed', { app: app.id, pid: process.pid });
                        self.lastError = '应用已打开，但未能确认启动参数。请检查代理客户端的实际连接。';
                    }
                    self.refresh();
                });
                return true;
            }
            if (Date.now() > deadline) { delete self.busy[app.id]; self.reportError('没有检测到应用', app.name + ' 启动后没有保持运行，请查看诊断日志。'); return true; }
            return false;
        } });
    });
};
AppProxyAssistant.prototype.restartTarget = function () {
    var app = this.currentApplication();
    if (this.running(app).length && !apAlert('重启 ' + app.name + ' 并应用代理？', '会先请求应用正常退出，再使用已保存的代理配置重新打开。请先完成需要保留的操作。', '正常退出并重启')) { return; }
    this.startApplication(app, true);
};
AppProxyAssistant.prototype.quitTarget = function () {
    var app = this.currentApplication();
    var current = this.running(app);
    if (!current.length) { return; }
    if (!apAlert('正常退出 ' + app.name + '？', '助手不会自动重新启动它。', '退出应用')) { return; }
    current.forEach(function (item) { item.native.terminate; });
    this.store.log('application-quit-requested', { app: app.id });
    this.refresh();
};
AppProxyAssistant.prototype.moreActions = function () {
    var menu = $.NSMenu.alloc.initWithTitle('应用操作');
    var running = this.running(this.currentApplication()).length > 0;
    [
        ['重启并应用代理…', 'restartTarget:', true],
        ['正常退出应用…', 'quitTarget:', running],
        ['查看诊断与日志', 'showDiagnostics:', true],
        ['打开配置目录', 'openConfigurationFolder:', true]
    ].forEach(function (entry) {
        var item = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(entry[0], entry[1], '');
        item.target = this.actions;
        item.enabled = entry[2];
        menu.addItem(item);
    }, this);
    menu.autoenablesItems = false;
    menu.popUpMenuPositioningItemAtLocationInView($(), $.NSMakePoint(0, 0), this.moreButton);
    this.actionMenu = menu;
};

AppProxyAssistant.prototype.showSettings = function () {
    this.popover.performClose(null);
    if (this.settings) { this.settings.window.close; }
    var app = this.currentApplication();
    var proxy = ProxyAssistantCore.getProxy(this.config, app);
    var window = apWindow(app.name + ' 的代理配置', 550, 475);
    var view = window.contentView;
    view.addSubview(apLabel('应用', 24, 434, 480, 20, 13, false));
    var path = apField(app.bundlePath, 24, 398, 397);
    view.addSubview(path);
    view.addSubview(apButton('选择…', 'chooseApplication:', 430, 397, 96, 28, this.actions));
    view.addSubview(apLabel('代理名称', 24, 365, 480, 20, 13, false));
    var name = apField(proxy.name, 24, 333, 502);
    view.addSubview(name);
    view.addSubview(apLabel('HTTP／Mixed 代理地址', 24, 299, 480, 20, 13, false));
    var address = apField(ProxyAssistantCore.proxyURL(proxy), 24, 268, 502);
    view.addSubview(address);
    view.addSubview(apLabel('例如 http://127.0.0.1:7890；修改后需要重启应用。', 24, 240, 502, 20, 12, true));
    apSeparator(view, 225, 550);
    var autoLaunch = apCheckbox('助手启动时自动打开 ' + app.name, null, 24, 188, 500, null);
    autoLaunch.state = app.autoLaunch ? 1 : 0;
    view.addSubview(autoLaunch);
    var login = apCheckbox('登录后启动助手', null, 24, 156, 500, null);
    login.state = this.config.preferences.launchAtLogin ? 1 : 0;
    view.addSubview(login);
    var hotkey = apCheckbox('全局快捷键  ⌃⌥⌘P', null, 24, 124, 500, null);
    hotkey.state = this.config.preferences.globalShortcut ? 1 : 0;
    view.addSubview(hotkey);
    var permission = this.platform.accessibilityTrusted(false);
    var permissionLabel = apLabel(permission ? '快捷键权限已就绪' : '全局快捷键需辅助功能授权；仅识别此组合，不记录按键。', 43, 93, 485, 24, 11, true);
    view.addSubview(permissionLabel);
    var loginState = this.platform.loginStatus();
    view.addSubview(apLabel(loginState === 1 ? '登录项已启用' : loginState === 2 ? '登录项等待系统允许，可在“登录项与扩展”中开启' : '登录项未启用', 24, 65, 500, 20, 11, true));
    apSeparator(view, 54, 550);
    view.addSubview(apButton('取消', 'cancelSettings:', 335, 13, 88, 28, this.actions));
    var save = apButton('保存配置', 'saveSettings:', 431, 13, 100, 28, this.actions);
    save.keyEquivalent = '\r';
    save.enabled = !this.store.configError;
    view.addSubview(save);
    this.settings = { window: window, appId: app.id, path: path, name: name, address: address, autoLaunch: autoLaunch, login: login, hotkey: hotkey, permission: permissionLabel };
    if (!this.preview) { $.NSApplication.sharedApplication.activateIgnoringOtherApps(true); window.makeKeyAndOrderFront(null); }
};
AppProxyAssistant.prototype.cancelSettings = function () { if (this.settings) { this.settings.window.close; } };
AppProxyAssistant.prototype.chooseApplication = function () {
    var chooser = $.NSOpenPanel.openPanel;
    chooser.title = '选择 ChatGPT.app';
    chooser.message = '选择已安装的官方 ChatGPT 应用。';
    chooser.allowedFileTypes = $(['app']);
    chooser.canChooseFiles = true;
    chooser.canChooseDirectories = false;
    chooser.allowsMultipleSelection = false;
    chooser.directoryURL = $.NSURL.fileURLWithPath('/Applications');
    if (Number(chooser.runModal) === Number($.NSModalResponseOK)) {
        var path = this.platform.canonical(chooser.URL.path.js);
        var info = this.platform.metadata(path);
        if (!info.exists || info.executable !== 'ChatGPT') { apAlert('请选择 ChatGPT.app', '首版适配 ChatGPT；Claude 等应用会在后续版本单独适配。'); return; }
        this.settings.path.stringValue = path;
    }
};
AppProxyAssistant.prototype.saveSettings = function () {
    if (!this.settings) { return; }
    var fields = this.settings;
    var config = ProxyAssistantCore.updateApplicationProxy(this.config, fields.appId, fields.name.stringValue.js, fields.address.stringValue.js);
    var app = config.applications.filter(function (item) { return item.id === fields.appId; })[0];
    if (this.busy[app.id]) { apAlert('操作正在进行', '请等待当前启动或重启操作完成，再修改配置。'); return; }
    app.bundlePath = this.platform.canonical(ProxyAssistantCore.validateBundlePath(fields.path.stringValue.js));
    var info = this.platform.metadata(app.bundlePath);
    if (!info.exists || info.executable !== 'ChatGPT') { throw new Error('找不到有效的 ChatGPT.app，请重新选择应用。'); }
    var proxy = ProxyAssistantCore.getProxy(config, app);
    app.autoLaunch = Number(fields.autoLaunch.state) === 1;
    var loginWanted = Number(fields.login.state) === 1;
    var hotkeyWanted = Number(fields.hotkey.state) === 1;
    config.preferences.launchAtLogin = loginWanted;
    config.preferences.globalShortcut = hotkeyWanted;
    ProxyAssistantCore.validateConfiguration(config);
    ProxyAssistantCore.launchPlan(app, proxy, info);
    var loginChanged = loginWanted !== this.config.preferences.launchAtLogin;
    var previousLogin = this.config.preferences.launchAtLogin;
    try {
        if (loginChanged) { this.platform.setLogin(loginWanted); }
        this.config = this.store.save(config);
    } catch (error) {
        if (loginChanged) { try { this.platform.setLogin(previousLogin); } catch (_) { /* The system settings remain visible for recovery. */ } }
        throw error;
    }
    this.store.log('configuration-saved', { app: app.id, proxy: ProxyAssistantCore.proxyURL(proxy) });
    fields.window.close;
    this.installShortcut();
    if (hotkeyWanted && !this.platform.accessibilityTrusted(false)) { this.platform.accessibilityTrusted(true); }
    this.health = {};
    this.lastHealthCheck = 0;
    this.refresh();
    if (this.platform.loginStatus() === 2 && loginWanted) { apAlert('登录项等待允许', '请在系统设置 → 通用 → 登录项与扩展中允许“应用代理助手”。'); }
};
AppProxyAssistant.prototype.installShortcut = function () {
    var self = this;
    if (this.globalMonitor) { $.NSEvent.removeMonitor(this.globalMonitor); this.globalMonitor = null; }
    if (this.localMonitor) { $.NSEvent.removeMonitor(this.localMonitor); this.localMonitor = null; }
    if (!this.config.preferences.globalShortcut || !this.platform.accessibilityTrusted(false) || this.preview) { return; }
    function handle(event) {
        if (Number(event.keyCode) === 35 && (Number(event.modifierFlags) & 0x1e0000) === 0x1c0000 && Date.now() - self.lastShortcut > 350) {
            self.lastShortcut = Date.now(); self.togglePanel(); return true;
        }
        return false;
    }
    this.globalHandler = function (event) { handle(event); };
    this.localHandler = function (event) { return handle(event) ? null : event; };
    this.globalMonitor = $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler(1024, this.globalHandler);
    this.localMonitor = $.NSEvent.addLocalMonitorForEventsMatchingMaskHandler(1024, this.localHandler);
};

AppProxyAssistant.prototype.diagnosticSummary = function () {
    var app = this.currentApplication();
    var info = this.platform.metadata(app.bundlePath);
    var proxy = ProxyAssistantCore.getProxy(this.config, app);
    return [
        '应用代理助手 1.0.0', '时间：' + new Date().toISOString(),
        '系统：' + this.platform.string($.NSProcessInfo.processInfo.operatingSystemVersionString),
        '应用：' + app.name + ' ' + (info.version || '未找到'), '路径：' + app.bundlePath,
        '代理：' + ProxyAssistantCore.proxyURL(proxy), '状态：' + this.stateFor(app).title,
        '配置：' + (this.store.configError || '可读取'),
        '最近错误：' + (this.lastError || '无'), 'HTTPS 测试：' + (this.lastDiagnostic || '尚未执行'),
        '', '入口检查与 HTTPS 测试不能证明应用的全部流量已走代理。',
        '请在 Clash／Mihomo 的连接记录中核对常用功能。', '', '—— 助手日志（不含对话内容）——', this.store.tail()
    ].join('\n');
};
AppProxyAssistant.prototype.showDiagnostics = function () {
    this.popover.performClose(null);
    if (!this.diagnostics) {
        var window = apWindow('诊断与日志', 700, 475);
        var view = window.contentView;
        view.addSubview(apLabel('代理连接检查与启动日志', 20, 439, 640, 22, 14, false));
        var scroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(20, 65, 660, 360));
        scroll.hasVerticalScroller = true;
        scroll.autohidesScrollers = true;
        scroll.borderType = $.NSBezelBorder;
        var text = $.NSTextView.alloc.initWithFrame($.NSMakeRect(0, 0, 640, 360));
        text.editable = false;
        text.selectable = true;
        text.richText = false;
        text.font = $.NSFont.monospacedSystemFontOfSizeWeight(11, 0);
        text.textColor = $.NSColor.textColor;
        text.backgroundColor = $.NSColor.textBackgroundColor;
        text.verticallyResizable = true;
        text.horizontallyResizable = false;
        text.autoresizingMask = $.NSViewWidthSizable;
        text.textContainer.containerSize = $.NSMakeSize(640, 10000000);
        text.textContainer.widthTracksTextView = true;
        scroll.documentView = text;
        view.addSubview(scroll);
        var probe = apButton('测试代理 HTTPS', 'runDiagnostic:', 14, 20, 140, 30, this.actions);
        view.addSubview(probe);
        view.addSubview(apButton('刷新', 'refreshLogs:', 158, 20, 74, 30, this.actions));
        view.addSubview(apButton('配置目录', 'openConfigurationFolder:', 238, 20, 106, 30, this.actions));
        view.addSubview(apButton('复制诊断', 'copyDiagnostics:', 568, 20, 116, 30, this.actions));
        this.diagnostics = { window: window, text: text, probe: probe };
    }
    this.refreshLogs();
    if (!this.preview) { $.NSApplication.sharedApplication.activateIgnoringOtherApps(true); this.diagnostics.window.makeKeyAndOrderFront(null); }
};
AppProxyAssistant.prototype.refreshLogs = function () { if (this.diagnostics) { this.diagnostics.text.string = this.diagnosticSummary(); } };
AppProxyAssistant.prototype.copyDiagnostics = function () {
    var pasteboard = $.NSPasteboard.generalPasteboard;
    pasteboard.clearContents;
    pasteboard.setStringForType(ProxyAssistantCore.redact(this.diagnosticSummary()), $.NSPasteboardTypeString);
};
AppProxyAssistant.prototype.runDiagnostic = function () {
    var self = this;
    var app = this.currentApplication();
    var proxy = ProxyAssistantCore.getProxy(this.config, app);
    var target = ProxyAssistantCore.adapterFor(app).testURL;
    this.diagnostics.probe.enabled = false;
    this.diagnostics.probe.title = '正在测试…';
    this.lastDiagnostic = '正在通过 ' + ProxyAssistantCore.proxyURL(proxy) + ' 测试 ' + target;
    this.refreshLogs();
    this.runner.probe(proxy, target, function (probe) {
        self.lastDiagnostic = new Date().toLocaleTimeString() + ' · ' + probe.message;
        self.store.log('proxy-https-test', { app: app.id, proxy: ProxyAssistantCore.proxyURL(proxy), ok: probe.ok, message: probe.message });
        self.diagnostics.probe.enabled = true;
        self.diagnostics.probe.title = '测试代理 HTTPS';
        self.refreshLogs();
    });
};
AppProxyAssistant.prototype.openConfigurationFolder = function () { this.platform.workspace.openURL($.NSURL.fileURLWithPath(this.store.directory)); };
AppProxyAssistant.prototype.permissionSettings = function () { this.platform.workspace.openURL($.NSURL.URLWithString('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')); };
AppProxyAssistant.prototype.quitAssistant = function () {
    this.store.log('assistant-quit', { targetApplicationsRemainRunning: true });
    if (this.timer) { this.timer.invalidate; }
    if (this.globalMonitor) { $.NSEvent.removeMonitor(this.globalMonitor); }
    if (this.localMonitor) { $.NSEvent.removeMonitor(this.localMonitor); }
    $.NSApplication.sharedApplication.terminate(null);
};

function startAssistant(argv) {
    argv = Array.isArray(argv) ? argv : [];
    var args = argv.map(String).concat(ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments).map(String));
    var directory = ProxyAssistantPlatform.supportDirectory();
    var index = args.indexOf('--data-dir');
    if (index !== -1) {
        if (!args[index + 1] || args[index + 1].charAt(0) !== '/') { throw new Error('--data-dir requires an absolute path'); }
        directory = args[index + 1];
    }
    if (args.indexOf('--platform-self-test') !== -1) {
        var store = new ProxyAssistantPlatform.Store(directory);
        var config = store.load();
        store.log('platform-self-test', { isolated: true });
        return JSON.stringify({ schema: config.schemaVersion, metadata: ProxyAssistantPlatform.metadata(config.applications[0].bundlePath), logWritten: ProxyAssistantPlatform.exists(store.logPath), loginStatus: ProxyAssistantPlatform.loginStatus(), accessibility: ProxyAssistantPlatform.accessibilityTrusted(false) });
    }
    var preview = args.indexOf('--ui-self-test') !== -1;
    $.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
    appProxyAssistant = new AppProxyAssistant(directory, preview);
    if (preview) {
        appProxyAssistant.showSettings();
        appProxyAssistant.showDiagnostics();
        appProxyAssistant.startMonitoring();
        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.65));
        var result = { panelWidth: Number(appProxyAssistant.panelView.frame.size.width), panelHeight: Number(appProxyAssistant.panelView.frame.size.height), primaryAction: appProxyAssistant.primaryButton.title.js, settings: Boolean(appProxyAssistant.settings), diagnostics: Boolean(appProxyAssistant.diagnostics), targetState: appProxyAssistant.stateFor(appProxyAssistant.currentApplication()).kind, bundleIdentifier: ProxyAssistantPlatform.string($.NSBundle.mainBundle.bundleIdentifier), configurationPath: appProxyAssistant.store.configPath, loginStatus: ProxyAssistantPlatform.loginStatus() };
        var renderIndex = args.indexOf('--render-preview');
        if (renderIndex !== -1) {
            var output = args[renderIndex + 1];
            if (!output || output.charAt(0) !== '/') { throw new Error('--render-preview requires an absolute path'); }
            ProxyAssistantPlatform.mkdir(output);
            $.NSApplication.sharedApplication.appearance = $.NSAppearance.appearanceNamed($.NSAppearanceNameAqua);
            function capture(view, path) {
                var appearance = $.NSAppearance.appearanceNamed($.NSAppearanceNameAqua);
                view.appearance = appearance;
                $.NSAppearance.setCurrentAppearance(appearance);
                var backdrop = $.NSBox.alloc.initWithFrame(view.bounds);
                backdrop.boxType = $.NSBoxCustom;
                backdrop.borderType = $.NSNoBorder;
                backdrop.fillColor = $.NSColor.windowBackgroundColor;
                backdrop.transparent = false;
                view.addSubviewPositionedRelativeTo(backdrop, $.NSWindowBelow, view.subviews.objectAtIndex(0));
                view.layoutSubtreeIfNeeded;
                var bitmap = view.bitmapImageRepForCachingDisplayInRect(view.bounds);
                view.cacheDisplayInRectToBitmapImageRep(view.bounds, bitmap);
                var data = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
                if (!data.writeToFileAtomically(path, true)) { throw new Error('Could not write preview: ' + path); }
                backdrop.removeFromSuperview;
            }
            capture(appProxyAssistant.panelView, output + '/panel.png');
            capture(appProxyAssistant.settings.window.contentView, output + '/settings.png');
            capture(appProxyAssistant.diagnostics.window.contentView, output + '/diagnostics.png');
            result.previewDirectory = output;
        }
        var reportIndex = args.indexOf('--qa-report');
        if (reportIndex !== -1) { ProxyAssistantPlatform.write(args[reportIndex + 1], JSON.stringify(result, null, 2)); }
        if (appProxyAssistant.timer) { appProxyAssistant.timer.invalidate; }
        ProxyAssistantPlatform.workspace.notificationCenter.removeObserver(appProxyAssistant.actions);
        $.NSStatusBar.systemStatusBar.removeStatusItem(appProxyAssistant.statusItem);
        if (args.indexOf('--quit-after-self-test') !== -1) { $.NSApplication.sharedApplication.terminate(null); }
        return JSON.stringify(result);
    }
    appProxyAssistant.startMonitoring();
}
function run(argv) {
    try { return startAssistant(argv); }
    catch (error) {
        var message = String(error.message || error) + (error.stack ? '\n' + error.stack : '');
        var args = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments);
        var reportIndex = args.indexOf('--qa-report');
        if (reportIndex !== -1 && args[reportIndex + 1]) {
            ProxyAssistantPlatform.write(args[reportIndex + 1], JSON.stringify({ startupError: message }, null, 2));
            if (args.indexOf('--quit-after-self-test') !== -1) { $.NSApplication.sharedApplication.terminate(null); }
        } else { apAlert('助手无法完成初始化', message); }
        return message;
    }
}
function idle() {
    if (appProxyAssistant) { try { appProxyAssistant.pulse(); } catch (error) { appProxyAssistant.store.log('idle-error', { message: String(error) }); } }
    return 5;
}
function reopen() { if (appProxyAssistant) { appProxyAssistant.showPanel(); } }
