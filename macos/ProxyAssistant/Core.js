/* Shared, side-effect-free model. Runs in JavaScriptCore (JXA) and Node.js tests. */
var ProxyAssistantCore = (function () {
    'use strict';

    var SCHEMA_VERSION = 1;
    var LOOPBACK = 'localhost,127.0.0.1,::1';
    var ADAPTERS = {
        chatgpt: {
            name: 'ChatGPT',
            testURL: 'https://chatgpt.com',
            executableNames: ['ChatGPT'],
            arguments: function (url) {
                return [
                    '--proxy-server=' + url,
                    '--proxy-bypass-list=localhost;127.0.0.1;[::1]',
                    '--disable-quic'
                ];
            }
        }
    };

    function fail(message) { throw new Error(message); }
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function text(value, label, maximum) {
        if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
            fail(label + '无效');
        }
        return value.trim();
    }
    function identifier(value, label) {
        if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) { fail(label + '无效'); }
        return value;
    }
    function validatePort(value) {
        var raw = String(value);
        if (!/^\d{1,5}$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
            fail('端口必须是 1–65535 之间的整数');
        }
        return Number(raw);
    }
    function validateHost(value) {
        var host = text(value, '代理主机', 253);
        if (host.charAt(0) === '[' && host.charAt(host.length - 1) === ']') { host = host.slice(1, -1); }
        if (host.indexOf(':') !== -1) {
            if (!/^[0-9a-f:]+$/i.test(host) || (host.match(/:/g) || []).length < 2 || host.length > 39) {
                fail('IPv6 代理地址无效');
            }
            var compressed = host.split('::');
            var groups = compressed.map(function (part) { return part ? part.split(':') : []; });
            var validGroups = groups.every(function (parts) { return parts.every(function (part) { return /^[0-9a-f]{1,4}$/i.test(part); }); });
            var count = groups.reduce(function (sum, parts) { return sum + parts.length; }, 0);
            if (!validGroups || compressed.length > 2 || (compressed.length === 1 ? count !== 8 : count >= 8)) { fail('IPv6 代理地址无效'); }
        } else {
            if (!host.split('.').every(function (part) {
                return part.length > 0 && part.length < 64 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part);
            })) { fail('请填写主机名或 IP 地址，不要包含协议、路径或账号密码'); }
            if (/^[0-9.]+$/.test(host) && (host.split('.').length !== 4 || host.split('.').some(function (part) { return Number(part) > 255; }))) {
                fail('IPv4 代理地址无效');
            }
        }
        return host.toLowerCase();
    }
    function proxyURL(proxy) {
        if (proxy.scheme !== 'http') { fail('首版支持 HTTP／Mixed 代理入口，请使用 http:// 地址'); }
        var host = validateHost(proxy.host);
        return 'http://' + (host.indexOf(':') === -1 ? host : '[' + host + ']') + ':' + validatePort(proxy.port);
    }
    function parseProxyAddress(value) {
        var address = text(value, '代理地址', 320);
        var match = /^http:\/\/(\[[0-9a-f:]+\]|[^:/?#@\s]+):(\d{1,5})\/?$/i.exec(address);
        if (!match) { fail('请输入完整 HTTP 代理地址，例如 http://127.0.0.1:7890（不包含账号密码或路径）'); }
        var result = { scheme: 'http', host: validateHost(match[1]), port: validatePort(match[2]) };
        proxyURL(result);
        return result;
    }
    function validateBundlePath(value) {
        var path = text(value, '应用路径', 2048);
        if (path.charAt(0) !== '/' || !/\.app\/?$/.test(path)) { fail('请选择完整的 .app 应用'); }
        return path.replace(/\/$/, '');
    }
    function defaultConfiguration(home) {
        return {
            schemaVersion: SCHEMA_VERSION,
            proxies: [{ id: 'local-default', name: '本地代理', scheme: 'http', host: '127.0.0.1', port: 7890 }],
            applications: [{ id: 'chatgpt', name: 'ChatGPT', adapter: 'chatgpt', bundlePath: '/Applications/ChatGPT.app', proxyId: 'local-default', autoLaunch: false }],
            preferences: { launchAtLogin: false, globalShortcut: false }
        };
    }
    function validateConfiguration(input) {
        if (!input || input.schemaVersion !== SCHEMA_VERSION) { fail('配置版本不受支持；请保留原文件并使用兼容版本'); }
        var config = copy(input);
        if (!Array.isArray(config.proxies) || !config.proxies.length || config.proxies.length > 32 ||
            !Array.isArray(config.applications) || !config.applications.length || config.applications.length > 32) { fail('应用或代理配置列表无效'); }
        var proxyIds = Object.create(null), appIds = Object.create(null);
        config.proxies.forEach(function (proxy) {
            identifier(proxy.id, '代理 ID');
            if (proxyIds[proxy.id]) { fail('代理 ID 重复'); }
            proxyIds[proxy.id] = true;
            proxy.name = text(proxy.name, '代理名称', 64);
            proxy.host = validateHost(proxy.host);
            proxy.port = validatePort(proxy.port);
            proxyURL(proxy);
        });
        config.applications.forEach(function (app) {
            identifier(app.id, '应用 ID');
            identifier(app.adapter, '适配器 ID');
            if (appIds[app.id]) { fail('应用 ID 重复'); }
            appIds[app.id] = true;
            app.name = text(app.name, '应用名称', 64);
            app.bundlePath = validateBundlePath(app.bundlePath);
            if (!proxyIds[app.proxyId]) { fail(app.name + '引用了不存在的代理配置'); }
            if (typeof app.autoLaunch !== 'boolean') { fail('应用自动启动设置无效'); }
        });
        if (!config.preferences || typeof config.preferences.launchAtLogin !== 'boolean' || typeof config.preferences.globalShortcut !== 'boolean') { fail('助手偏好设置无效'); }
        return config;
    }
    function getProxy(config, app) {
        var proxy = config.proxies.filter(function (item) { return item.id === app.proxyId; })[0];
        if (!proxy) { fail('找不到此应用的代理配置'); }
        return proxy;
    }
    function updateApplicationProxy(input, appId, name, address) {
        var config = copy(input);
        var app = config.applications.filter(function (item) { return item.id === appId; })[0];
        if (!app) { fail('找不到此应用配置'); }
        var endpoint = parseProxyAddress(address);
        var proxy = getProxy(config, app);
        if (config.applications.filter(function (item) { return item.proxyId === proxy.id; }).length > 1) {
            var base = app.id.slice(0, 48) + '-proxy', id = base, suffix = 1;
            while (config.proxies.some(function (item) { return item.id === id; })) { id = base + '-' + suffix; suffix += 1; }
            proxy = { id: id };
            config.proxies.push(proxy);
            app.proxyId = id;
        }
        proxy.name = name; proxy.scheme = endpoint.scheme; proxy.host = endpoint.host; proxy.port = endpoint.port;
        return validateConfiguration(config);
    }
    function adapterFor(app) {
        if (!supportsAdapter(app.adapter)) { fail('此应用尚未适配；首版支持 ChatGPT'); }
        var adapter = ADAPTERS[app.adapter];
        return adapter;
    }
    function supportsAdapter(id) { return Object.prototype.hasOwnProperty.call(ADAPTERS, id); }
    function fingerprint(app, proxy, metadata) {
        return JSON.stringify([app.adapter, app.bundlePath, proxyURL(proxy), String(metadata.version || ''), String(metadata.executable || '')]);
    }
    function launchPlan(app, proxy, metadata) {
        var adapter = adapterFor(app);
        var path = validateBundlePath(app.bundlePath);
        var url = proxyURL(proxy);
        if (!metadata || adapter.executableNames.indexOf(metadata.executable) === -1) { fail('所选应用不是受支持的 ChatGPT.app'); }
        var environment = {
            HTTP_PROXY: url, HTTPS_PROXY: url, ALL_PROXY: url,
            http_proxy: url, https_proxy: url, all_proxy: url,
            NO_PROXY: LOOPBACK, no_proxy: LOOPBACK
        };
        var args = ['-a', path, '--stdin', '/dev/null', '--stdout', '/dev/null', '--stderr', '/dev/null'];
        Object.keys(environment).forEach(function (key) { args.push('--env', key + '=' + environment[key]); });
        args.push('--args');
        args = args.concat(adapter.arguments(url));
        return { executable: '/usr/bin/open', arguments: args, environment: environment, appArguments: adapter.arguments(url), signature: fingerprint(app, proxy, metadata) };
    }
    function sameProcess(receipt, running, app) {
        return !!receipt && !!running && receipt.pid === running.pid && receipt.bundlePath === app.bundlePath &&
            typeof receipt.launchTime === 'number' && typeof running.launchTime === 'number' &&
            Math.abs(receipt.launchTime - running.launchTime) < 0.05;
    }
    function runtimeState(app, proxy, metadata, running, receipt) {
        if (!metadata || !metadata.exists) { return { kind: 'missing', title: '找不到应用', detail: '请在代理配置中选择 ChatGPT.app', action: '选择应用' }; }
        if (!supportsAdapter(app.adapter)) { return { kind: 'unsupported', title: '尚未适配', detail: '此应用的启动方式有待验证', action: '暂不支持' }; }
        if (!running) { return { kind: 'stopped', title: '未运行', detail: '通过助手启动时应用代理配置', action: '带代理启动' }; }
        if (!sameProcess(receipt, running, app)) { return { kind: 'external', title: '运行中 · 配置未确认', detail: '此实例不在助手的启动记录中', action: '显示窗口' }; }
        if (receipt.signature !== fingerprint(app, proxy, metadata)) { return { kind: 'pending', title: '运行中 · 等待重启', detail: '配置或应用版本已改变，重启后应用', action: '显示窗口' }; }
        return { kind: 'managed', title: '运行中 · 已按配置启动', detail: '实际流量请在代理客户端中核对', action: '显示窗口' };
    }
    function parseProbe(exitCode, output) {
        var lines = String(output || '').trim().split(/\r?\n/);
        var http = Number(lines[0]) || 0;
        var connect = Number(lines[1]) || 0;
        var seconds = Number(lines[2]) || 0;
        if (exitCode === 0 && connect === 200 && http >= 100 && http <= 599) {
            return { ok: true, httpStatus: http, connectStatus: connect, seconds: seconds, message: '代理 HTTPS 通道可用；目标返回 HTTP ' + http + '。这不代表应用的全部流量已走代理。' };
        }
        if (connect === 407) { return { ok: false, message: '代理要求身份认证，首版暂不支持认证代理。' }; }
        if (connect === 200) { return { ok: false, message: '已连接代理，但目标请求或 TLS 验证没有完成（退出码 ' + exitCode + '）。' }; }
        return { ok: false, message: '代理 HTTPS 测试失败（退出码 ' + exitCode + '）；请检查代理入口与客户端规则。' };
    }
    function redact(value) {
        return String(value).replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[已隐藏]@')
            .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [已隐藏]')
            .replace(/\bsk-[A-Za-z0-9_-]+/g, '[已隐藏密钥]');
    }
    return {
        SCHEMA_VERSION: SCHEMA_VERSION, ADAPTERS: ADAPTERS,
        copy: copy, validatePort: validatePort, validateHost: validateHost,
        proxyURL: proxyURL, parseProxyAddress: parseProxyAddress, validateBundlePath: validateBundlePath,
        defaultConfiguration: defaultConfiguration, validateConfiguration: validateConfiguration,
        getProxy: getProxy, updateApplicationProxy: updateApplicationProxy, adapterFor: adapterFor, supportsAdapter: supportsAdapter, fingerprint: fingerprint,
        launchPlan: launchPlan, sameProcess: sameProcess, runtimeState: runtimeState,
        parseProbe: parseProbe, redact: redact
    };
}());
if (typeof module !== 'undefined' && module.exports) { module.exports = ProxyAssistantCore; }
