/* Native macOS services. JXA calls Cocoa directly; no browser or Node runtime. */
ObjC.import('Cocoa');
ObjC.import('Foundation');
ObjC.import('ServiceManagement');
ObjC.import('ApplicationServices');

var ProxyAssistantPlatform = (function () {
    'use strict';
    var fm = $.NSFileManager.defaultManager;
    var workspace = $.NSWorkspace.sharedWorkspace;

    function string(value) {
        if (value === undefined || value === null) { return ''; }
        try { return String(ObjC.unwrap(value)); } catch (_) { return String(value); }
    }
    function errorDescription(ref) {
        try { return ref[0].localizedDescription.js; } catch (_) { return 'macOS 未提供错误详情'; }
    }
    function exists(path) { return Boolean(fm.fileExistsAtPath(path)); }
    function canonical(path) { return string($(path).stringByStandardizingPath.stringByResolvingSymlinksInPath); }
    function read(path) {
        var error = Ref();
        var value = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, error);
        if (!value || value.isNil()) { throw new Error('无法读取文件：' + errorDescription(error)); }
        return value.js;
    }
    function mkdir(path) {
        var error = Ref();
        if (!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, $({ NSFilePosixPermissions: 448 }), error)) {
            throw new Error('无法创建配置目录：' + errorDescription(error));
        }
    }
    function write(path, content) {
        var error = Ref();
        if (!$(content).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, error)) {
            throw new Error('无法保存文件：' + errorDescription(error));
        }
        fm.setAttributesOfItemAtPathError($({ NSFilePosixPermissions: 384 }), path, null);
    }
    function remove(path) { if (exists(path)) { fm.removeItemAtPathError(path, null); } }
    function move(source, destination) {
        if (exists(source)) {
            var error = Ref();
            if (!fm.moveItemAtPathToPathError(source, destination, error)) { throw new Error(errorDescription(error)); }
        }
    }
    function metadata(path) {
        try {
            if (!exists(path + '/Contents/Info.plist')) { return { exists: false }; }
            var info = ObjC.deepUnwrap($.NSDictionary.dictionaryWithContentsOfFile(path + '/Contents/Info.plist'));
            var executable = String(info.CFBundleExecutable || '');
            return {
                exists: exists(path + '/Contents/MacOS/' + executable),
                executable: executable,
                bundleIdentifier: String(info.CFBundleIdentifier || ''),
                version: String(info.CFBundleShortVersionString || info.CFBundleVersion || ''),
                chromium: Boolean(info.ChromiumBaseVersion || info.ElectronAsarIntegrity),
                name: String(info.CFBundleDisplayName || info.CFBundleName || '')
            };
        } catch (_) { return { exists: false }; }
    }
    function runningApplications(path) {
        var result = [];
        var applications = workspace.runningApplications;
        for (var i = 0; i < Number(applications.count); i += 1) {
            var nativeApp = applications.objectAtIndex(i);
            try {
                if (canonical(nativeApp.bundleURL.path.js) !== canonical(path) || nativeApp.terminated) { continue; }
                result.push({
                    pid: Number(nativeApp.processIdentifier),
                    launchTime: Number(nativeApp.launchDate.timeIntervalSince1970),
                    native: nativeApp
                });
            } catch (_) { /* Helpers without an application bundle are not target apps. */ }
        }
        return result;
    }
    function Store(directory) {
        this.directory = directory;
        this.configPath = directory + '/configuration.json';
        this.receiptPath = directory + '/launch-records.json';
        this.logPath = directory + '/Logs/assistant.log';
        this.configError = '';
        mkdir(directory);
        mkdir(directory + '/Logs');
    }
    Store.prototype.load = function () {
        var config;
        if (exists(this.configPath)) {
            try { config = ProxyAssistantCore.validateConfiguration(JSON.parse(read(this.configPath))); }
            catch (error) { this.configError = String(error.message || error); }
        }
        if (!config) {
            config = ProxyAssistantCore.defaultConfiguration();
            var userApp = string($.NSHomeDirectory()) + '/Applications/ChatGPT.app';
            if (!exists(config.applications[0].bundlePath) && exists(userApp)) { config.applications[0].bundlePath = userApp; }
            if (!this.configError) { this.save(config); }
        }
        return config;
    };
    Store.prototype.save = function (config) {
        if (this.configError) { throw new Error('原配置无法读取，已保留原文件。请先在配置目录中恢复有效的 configuration.json，再重开助手。'); }
        var valid = ProxyAssistantCore.validateConfiguration(config);
        if (exists(this.configPath)) { write(this.configPath + '.backup', read(this.configPath)); }
        write(this.configPath, JSON.stringify(valid, null, 2) + '\n');
        return valid;
    };
    Store.prototype.loadReceipts = function () {
        try {
            var value = exists(this.receiptPath) ? JSON.parse(read(this.receiptPath)) : {};
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (_) { return {}; }
    };
    Store.prototype.saveReceipts = function (receipts) { write(this.receiptPath, JSON.stringify(receipts, null, 2) + '\n'); };
    Store.prototype.log = function (event, details) {
        try {
            var attributes = fm.attributesOfItemAtPathError(this.logPath, null);
            var size = attributes && !attributes.isNil() ? Number(ObjC.unwrap(attributes.objectForKey('NSFileSize'))) : 0;
            if (size > 1024 * 1024) {
                remove(this.logPath + '.2');
                move(this.logPath + '.1', this.logPath + '.2');
                move(this.logPath, this.logPath + '.1');
            }
            if (!exists(this.logPath)) { write(this.logPath, ''); }
            var line = ProxyAssistantCore.redact(JSON.stringify({ time: new Date().toISOString(), event: event, details: details || {} })) + '\n';
            var handle = $.NSFileHandle.fileHandleForWritingAtPath(this.logPath);
            handle.seekToEndOfFile;
            handle.writeData($(line).dataUsingEncoding($.NSUTF8StringEncoding));
            handle.closeFile;
        } catch (_) { /* Logging must not break application controls. */ }
    };
    Store.prototype.tail = function () {
        try { return read(this.logPath).slice(-60000); } catch (_) { return '暂时没有日志。'; }
    };

    function TaskRunner() { this.tasks = []; }
    TaskRunner.prototype.start = function (executable, args, timeoutSeconds, callback) {
        var task = $.NSTask.alloc.init;
        var stdout = $.NSPipe.pipe;
        var stderr = $.NSPipe.pipe;
        task.executableURL = $.NSURL.fileURLWithPath(executable);
        task.arguments = $(args);
        task.standardOutput = stdout;
        task.standardError = stderr;
        task.standardInput = $.NSFileHandle.fileHandleWithNullDevice;
        var error = Ref();
        if (!task.launchAndReturnError(error)) { callback({ code: -1, stdout: '', stderr: errorDescription(error), timedOut: false }); return; }
        this.tasks.push({ native: task, stdout: stdout, stderr: stderr, deadline: Date.now() + timeoutSeconds * 1000, callback: callback, timedOut: false });
    };
    TaskRunner.prototype.poll = function () {
        var pending = [], completed = [];
        this.tasks.forEach(function (task) {
            if (task.native.running) {
                if (Date.now() > task.deadline && !task.timedOut) { task.timedOut = true; task.native.terminate; }
                pending.push(task);
            } else { completed.push(task); }
        });
        this.tasks = pending;
        completed.forEach(function (task) {
            var out = $.NSString.alloc.initWithDataEncoding(task.stdout.fileHandleForReading.readDataToEndOfFile, $.NSUTF8StringEncoding);
            var err = $.NSString.alloc.initWithDataEncoding(task.stderr.fileHandleForReading.readDataToEndOfFile, $.NSUTF8StringEncoding);
            task.callback({ code: task.timedOut ? -2 : Number(task.native.terminationStatus), stdout: string(out), stderr: string(err), timedOut: task.timedOut });
        });
    };
    TaskRunner.prototype.checkPort = function (proxy, callback) {
        this.start('/usr/bin/nc', ['-z', '-G', '2', '-w', '2', proxy.host, String(proxy.port)], 4, function (result) {
            callback(result.code === 0, result);
        });
    };
    TaskRunner.prototype.probe = function (proxy, target, callback) {
        this.start('/usr/bin/curl', [
            '--proxy', ProxyAssistantCore.proxyURL(proxy), '--noproxy', '',
            '--head', '--connect-timeout', '5', '--max-time', '12',
            '--silent', '--show-error', '--output', '/dev/null',
            '--write-out', '%{http_code}\n%{http_connect}\n%{time_total}', target
        ], 14, function (result) {
            callback(ProxyAssistantCore.parseProbe(result.code, result.stdout), result);
        });
    };
    TaskRunner.prototype.verifyArguments = function (pid, url, callback) {
        this.start('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], 3, function (result) {
            var marker = '--proxy-server=' + url;
            var offset = result.stdout.indexOf(marker);
            var end = offset + marker.length;
            callback(result.code === 0 && offset >= 0 && (end === result.stdout.length || /\s/.test(result.stdout.charAt(end))));
        });
    };

    function loginStatus() {
        try { return Number($.SMAppService.mainAppService.status); } catch (_) { return -1; }
    }
    function setLogin(enabled) {
        var error = Ref();
        var service = $.SMAppService.mainAppService;
        var succeeded = enabled ? service.registerAndReturnError(error) : service.unregisterAndReturnError(error);
        if (!succeeded) { throw new Error(errorDescription(error)); }
        return loginStatus();
    }
    function accessibilityTrusted(prompt) {
        if (prompt) { return Boolean($.AXIsProcessTrustedWithOptions($({ AXTrustedCheckOptionPrompt: true }))); }
        return Boolean($.AXIsProcessTrusted());
    }
    return {
        string: string, exists: exists, canonical: canonical, read: read, write: write, mkdir: mkdir,
        metadata: metadata, runningApplications: runningApplications, Store: Store, TaskRunner: TaskRunner,
        workspace: workspace, loginStatus: loginStatus, setLogin: setLogin,
        accessibilityTrusted: accessibilityTrusted,
        supportDirectory: function () { return string($.NSHomeDirectory()) + '/Library/Application Support/AppProxyAssistant'; }
    };
}());
