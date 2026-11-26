using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Xml;
using Microsoft.Win32;

namespace AppProxyAssistant
{
    internal static class Native
    {
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(int access, bool inherit, int id);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder path, ref int size);
        [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
        private delegate bool WindowCallback(IntPtr window, IntPtr parameter);
        [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

        public static string ExecutablePath(int id)
        {
            IntPtr handle = OpenProcess(0x1000, false, id);
            if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                var path = new StringBuilder(32768);
                int length = path.Capacity;
                if (!QueryFullProcessImageName(handle, 0, path, ref length)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return Path.GetFullPath(path.ToString());
            }
            finally { CloseHandle(handle); }
        }

        public static List<IntPtr> AppWindows(int processId)
        {
            var result = new List<IntPtr>();
            EnumWindows(delegate(IntPtr window, IntPtr parameter)
            {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                IntPtr ownerWindow = GetWindow(window, 4);
                if (owner == processId && IsWindowVisible(window)
                    && (ownerWindow == IntPtr.Zero || !IsWindowVisible(ownerWindow)))
                {
                    var title = new StringBuilder(512);
                    GetWindowText(window, title, title.Capacity);
                    // Input-method overlays can be the first visible window in a
                    // process. Process.MainWindowHandle may select those overlays.
                    if (!string.IsNullOrWhiteSpace(title.ToString())) result.Add(window);
                }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        private static bool OwnedBy(IntPtr window, int processId)
        {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            return owner == processId;
        }

        public static bool RequestClose(IntPtr window, int processId)
        {
            return OwnedBy(window, processId) && PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
        }

        public static void ShowWindow(IntPtr window, int processId)
        {
            if (!OwnedBy(window, processId)) throw new InvalidOperationException("窗口已改变，请重试。");
            if (IsIconic(window)) ShowWindowAsync(window, 9);
            else ShowWindowAsync(window, 5);
            SetForegroundWindow(window);
        }
    }

    internal sealed class ScriptResult
    {
        public int ExitCode;
        public string Output;
        public string Error;
    }

    internal sealed class PowerShellRunner
    {
        internal static string ReadDiagnosticText(string text)
        {
            const string marker = "#< CLIXML";
            if (!text.TrimStart().StartsWith(marker, StringComparison.Ordinal)) return text;
            try
            {
                var document = new XmlDocument { XmlResolver = null };
                using (var reader = XmlReader.Create(new StringReader(text.Substring(text.IndexOf(marker, StringComparison.Ordinal) + marker.Length)),
                    new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 65536 }))
                    document.Load(reader);
                var messages = new StringBuilder();
                foreach (XmlNode node in document.DocumentElement.ChildNodes)
                {
                    var stream = node.Attributes == null ? null : node.Attributes["S"];
                    if (stream == null || (!string.Equals(stream.Value, "error", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(stream.Value, "warning", StringComparison.OrdinalIgnoreCase))) continue;
                    string value = node.LocalName == "S" ? node.InnerText : null;
                    if (value == null)
                        foreach (XmlNode child in node.ChildNodes)
                            if (child.LocalName == "ToString") { value = child.InnerText; break; }
                    if (!string.IsNullOrWhiteSpace(value))
                        messages.AppendLine(Regex.Replace(value, "_x([0-9A-Fa-f]{4})_", match =>
                            ((char)int.Parse(match.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture)).ToString()));
                }
                return messages.ToString();
            }
            catch (XmlException) { return "PowerShell diagnostic metadata was incomplete; refer to the launcher output."; }
        }

        public ScriptResult Run(string script, string arguments, IDictionary<string, string> environment, string preamble = null)
        {
            string command = "$OutputEncoding = [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false); "
                + "$ProgressPreference = 'SilentlyContinue'; " + (preamble ?? "") + "\r\n& {\r\n" + script + "\r\n} " + arguments;
            var start = new ProcessStartInfo
            {
                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
                Arguments = "-NoLogo -NoProfile -NonInteractive -InputFormat Text -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand "
                    + Convert.ToBase64String(Encoding.Unicode.GetBytes(command)),
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            if (environment != null)
                foreach (var pair in environment) start.EnvironmentVariables[pair.Key] = pair.Value;
            var output = new StringBuilder();
            var error = new StringBuilder();
            var gate = new object();
            int streamsClosed = 0;
            using (var process = new Process { StartInfo = start })
            {
                DataReceivedEventHandler appendOutput = delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data == null) { Interlocked.Increment(ref streamsClosed); return; }
                    lock (gate) if (output.Length < 48000) output.AppendLine(args.Data);
                };
                DataReceivedEventHandler appendError = delegate(object sender, DataReceivedEventArgs args)
                {
                    if (args.Data == null) { Interlocked.Increment(ref streamsClosed); return; }
                    lock (gate) if (error.Length < 48000) error.AppendLine(args.Data);
                };
                process.OutputDataReceived += appendOutput;
                process.ErrorDataReceived += appendError;
                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                if (!process.WaitForExit(30000))
                {
                    // Only the helper we created is stopped. Never kill the target app.
                    try { process.Kill(); } catch (InvalidOperationException) { }
                    process.WaitForExit(2000);
                    process.CancelOutputRead();
                    process.CancelErrorRead();
                    throw new TimeoutException("后台启动步骤超时；ChatGPT 可能已启动，请检查状态或日志后重试。");
                }
                // GUI descendants may inherit a pipe. Never wait indefinitely for EOF.
                var drainWatch = Stopwatch.StartNew();
                while (Interlocked.CompareExchange(ref streamsClosed, 0, 0) < 2 && drainWatch.ElapsedMilliseconds < 1000)
                    Thread.Sleep(10);
                process.CancelOutputRead();
                process.CancelErrorRead();
                process.OutputDataReceived -= appendOutput;
                process.ErrorDataReceived -= appendError;
                lock (gate) return new ScriptResult { ExitCode = process.ExitCode, Output = output.ToString(), Error = ReadDiagnosticText(error.ToString()) };
            }
        }
    }

    internal interface IBackend
    {
        AppTarget Inspect();
        List<ProcessIdentity> Find(AppTarget target);
        void CheckProxy(int port);
        LaunchRecord Launch(AppTarget target, int port);
        void Show(AppTarget target);
        void QuitGracefully(AppTarget target);
    }

    internal sealed class LauncherBackend : IBackend
    {
        private readonly FileLog log;
        private readonly string directory;
        private readonly string script;
        private readonly PowerShellRunner runner = new PowerShellRunner();
        private readonly IDictionary<string, string> childEnvironment;
        private readonly string preamble;

        public LauncherBackend(string directory, FileLog log, string testPrefix, IDictionary<string, string> childEnvironment)
        {
            this.directory = directory;
            this.log = log;
            this.childEnvironment = childEnvironment;
            preamble = testPrefix;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AppProxy.Launcher.ps1"))
            {
                if (stream == null) throw new InvalidOperationException("The embedded launcher is missing.");
                using (var reader = new StreamReader(stream, Encoding.UTF8)) script = reader.ReadToEnd();
            }
        }

        private ScriptResult Run(string arguments)
        {
            var result = runner.Run(script, arguments, childEnvironment, preamble);
            if (!string.IsNullOrWhiteSpace(result.Output)) log.Write(result.Output.Trim());
            if (!string.IsNullOrWhiteSpace(result.Error)) log.Write(result.Error.Trim());
            if (result.ExitCode != 0)
            {
                string detail = (result.Output + "\r\n" + result.Error).Trim();
                if (detail.Length > 1500) detail = detail.Substring(0, 1500);
                throw new InvalidOperationException("启动脚本未完成。\r\n" + detail);
            }
            return result;
        }

        public AppTarget Inspect()
        {
            var result = Run("-InspectOnly -WarningAction SilentlyContinue");
            return AppTarget.Parse(result.Output.Trim());
        }

        public List<ProcessIdentity> Find(AppTarget target)
        {
            var result = new List<ProcessIdentity>();
            if (target == null) return result;
            foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(target.ExecutablePath)))
            {
                using (process)
                {
                    try
                    {
                        string path = Native.ExecutablePath(process.Id);
                        if (string.Equals(path, target.ExecutablePath, StringComparison.OrdinalIgnoreCase))
                        {
                            var windows = Native.AppWindows(process.Id);
                            result.Add(new ProcessIdentity { Id = process.Id, ExecutablePath = path,
                                StartTimeUtcTicks = process.StartTime.ToUniversalTime().Ticks,
                                Window = windows.Count == 0 ? IntPtr.Zero : windows[0] });
                        }
                    }
                    catch (InvalidOperationException) { }
                    catch (Win32Exception)
                    {
                        try { if (process.HasExited) continue; } catch (InvalidOperationException) { continue; }
                        // An unreadable same-name process must not be treated as absent.
                        throw new InvalidOperationException("无法确认同名进程的身份。请正常退出 ChatGPT 后重试。");
                    }
                }
            }
            return result;
        }

        public void CheckProxy(int port)
        {
            using (var client = new TcpClient())
            {
                IAsyncResult pending = client.BeginConnect("127.0.0.1", port, null, null);
                using (pending.AsyncWaitHandle)
                {
                    if (!pending.AsyncWaitHandle.WaitOne(1800)) throw new TimeoutException("本地代理端口连接超时，请检查代理客户端。");
                    try { client.EndConnect(pending); }
                    catch (SocketException) { throw new InvalidOperationException("无法连接 127.0.0.1:" + port + "，请启动代理客户端并核对 HTTP / Mixed 端口。"); }
                }
            }
        }

        public LaunchRecord Launch(AppTarget target, int port)
        {
            CheckProxy(port);
            if (Find(target).Count != 0) throw new InvalidOperationException("ChatGPT 已在运行，请使用“重启并应用代理”。");
            Directory.CreateDirectory(directory);
            string report = Path.Combine(directory, "launch-result-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                Run("-Port " + port.ToString(CultureInfo.InvariantCulture) + " -LaunchReportPath '" + report.Replace("'", "''") + "'");
                if (!File.Exists(report)) throw new InvalidOperationException("启动请求已发送，但无法记录进程身份。请检查 ChatGPT 状态；代理配置未确认。");
                var record = LaunchRecord.Parse(File.ReadAllText(report));
                if (!string.Equals(record.executablePath, target.ExecutablePath, StringComparison.OrdinalIgnoreCase)
                    || record.port != port || !Find(target).Exists(record.Matches))
                    throw new InvalidOperationException("应用或进程已发生变化，无法确认本次启动配置。请刷新后重试。");
                return record;
            }
            finally { if (File.Exists(report)) File.Delete(report); }
        }

        public void Show(AppTarget target)
        {
            foreach (var process in Find(target))
                if (process.Window != IntPtr.Zero) { Native.ShowWindow(process.Window, process.Id); return; }
            throw new InvalidOperationException("已检测到后台进程，但没有可显示的窗口。请通过 ChatGPT 自身的托盘图标打开窗口。");
        }

        public void QuitGracefully(AppTarget target)
        {
            var original = Find(target);
            bool requested = false;
            foreach (var identity in original)
            {
                if (identity.Window == IntPtr.Zero) continue;
                using (var process = Process.GetProcessById(identity.Id))
                {
                    if (process.StartTime.ToUniversalTime().Ticks != identity.StartTimeUtcTicks
                        || !string.Equals(Native.ExecutablePath(process.Id), identity.ExecutablePath, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidOperationException("进程身份已改变，请重试。");
                    foreach (IntPtr window in Native.AppWindows(process.Id))
                        requested = Native.RequestClose(window, process.Id) || requested;
                }
            }
            if (original.Count == 0) return;
            if (!requested) throw new InvalidOperationException("无法请求正常退出。请从 ChatGPT 菜单完全退出后，再点击启动。");
            var watch = Stopwatch.StartNew();
            while (watch.ElapsedMilliseconds < 12000)
            {
                if (Find(target).Count == 0) return;
                Thread.Sleep(200);
            }
            throw new InvalidOperationException("ChatGPT 尚未完全退出，可能仍驻留后台。请从 ChatGPT 菜单选择退出，再点击启动；助手不会强制结束进程。");
        }
    }

    internal sealed class AssistantActions
    {
        private readonly IBackend backend;
        public AssistantActions(IBackend backend) { this.backend = backend; }

        public LaunchRecord Restart(AppTarget target, int port)
        {
            // A failed proxy check must leave the original app untouched.
            backend.CheckProxy(port);
            backend.QuitGracefully(target);
            return backend.Launch(target, port);
        }
    }

    internal sealed class LoginStartup
    {
        private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "AppProxyAssistant";
        public string Command { get { return "\"" + Assembly.GetExecutingAssembly().Location + "\" --background"; } }

        public bool Enabled
        {
            get
            {
                using (var key = Registry.CurrentUser.OpenSubKey(KeyPath))
                    return key != null && string.Equals(key.GetValue(ValueName) as string, Command, StringComparison.OrdinalIgnoreCase);
            }
        }

        public void Set(bool enabled)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(KeyPath))
            {
                if (enabled) key.SetValue(ValueName, Command, RegistryValueKind.String);
                else key.DeleteValue(ValueName, false);
            }
        }
    }

    internal sealed class SingleInstance : IDisposable
    {
        private readonly Mutex mutex;
        public readonly EventWaitHandle Wake;
        public readonly bool IsFirst;

        public SingleInstance(string directory)
        {
            string identity = WindowsIdentity.GetCurrent().User.Value + "|" + Path.GetFullPath(directory).ToUpperInvariant();
            string suffix;
            using (var hash = SHA256.Create()) suffix = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-", "").Substring(0, 24);
            bool created;
            mutex = new Mutex(true, @"Local\AppProxyAssistant-" + suffix, out created);
            IsFirst = created;
            Wake = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\AppProxyAssistant-Wake-" + suffix);
            if (!IsFirst) Wake.Set();
        }

        public void Dispose()
        {
            Wake.Dispose();
            if (IsFirst) mutex.ReleaseMutex();
            mutex.Dispose();
        }
    }
}
