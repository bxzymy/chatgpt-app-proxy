using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AppProxyAssistant.Tests
{
    internal static class AssistantTests
    {
        private static string directory;
        private static string fixture;
        private static int passed;
        private static int failed;
        private static readonly List<object> results = new List<object>();

        [STAThread]
        private static int Main(string[] arguments)
        {
            Console.OutputEncoding = new System.Text.UTF8Encoding(false);
            if (arguments.Length == 2 && arguments[0] == "--second-instance")
            {
                using (var second = new SingleInstance(arguments[1])) return second.IsFirst ? 5 : 0;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            directory = Path.GetFullPath(arguments[0]);
            fixture = Path.GetFullPath(arguments[1]);
            Directory.CreateDirectory(directory);
            object startupBefore = ReadStartup();
            Test("settings defaults and invalid input", SettingsValidation);
            Test("future and corrupt settings preserved; explicit recovery", ConfigurationPreservation);
            Test("atomic settings save and backup", AtomicSettings);
            Test("PID reuse, executable identity, and configuration changes", IdentityStates);
            Test("bounded log rotation", LogRotation);
            Test("single instance wakes the existing process", SingleInstanceWake);
            Test("hidden PowerShell, Unicode, child-only environment, and failure reporting", HiddenPowerShell);
            Test("package inspection does not contact the proxy", InspectWithoutProxy);
            Test("proxy failure leaves the running app untouched", FailedRestart);
            Test("real fixture launch, flags, environment, process record, and graceful restart", FixtureLifecycle);
            Test("package-context fallback records the fixture process", PackageFallback);
            Test("native controls render without clipped content", NativeRendering);
            Test("tray message loop initializes and exits without launching ChatGPT", TrayLifecycle);
            Test("tests did not alter login startup", delegate { Assert(object.Equals(startupBefore, ReadStartup()), "Login startup changed."); });
            File.WriteAllText(Path.Combine(directory, "results.json"), Json.Serializer.Serialize(new { passed = passed, failed = failed, tests = results }));
            Console.WriteLine("Passed: " + passed + "; failed: " + failed);
            return failed == 0 ? 0 : 1;
        }

        private static object ReadStartup()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                return key == null ? null : key.GetValue("AppProxyAssistant");
        }

        private static void Test(string name, Action action)
        {
            var watch = Stopwatch.StartNew();
            try
            {
                action(); passed++;
                results.Add(new { name = name, passed = true, milliseconds = watch.ElapsedMilliseconds });
                Console.WriteLine("PASS " + name);
            }
            catch (Exception error)
            {
                failed++;
                results.Add(new { name = name, passed = false, error = error.ToString(), milliseconds = watch.ElapsedMilliseconds });
                Console.WriteLine("FAIL " + name + "\r\n" + error);
            }
        }

        private static void Assert(bool value, string message)
        {
            if (!value) throw new Exception(message);
        }

        private static void Throws(Action action)
        {
            bool threw = false;
            try { action(); } catch { threw = true; }
            Assert(threw, "Expected the operation to fail.");
        }

        private static string Area(string name)
        {
            string path = Path.Combine(directory, name);
            Directory.CreateDirectory(path);
            return path;
        }

        private static void SettingsValidation()
        {
            var defaults = new Settings();
            Assert(defaults.port == 7890 && !defaults.autoLaunchChatGpt, "Unexpected defaults.");
            foreach (string invalid in new[] { "{}", "[]", "{\"schemaVersion\":2}",
                "{\"schemaVersion\":1,\"port\":0,\"autoLaunchChatGpt\":false}",
                "{\"schemaVersion\":1,\"port\":65536,\"autoLaunchChatGpt\":false}",
                "{\"schemaVersion\":1,\"port\":7890,\"autoLaunchChatGpt\":\"false\"}" })
                Throws(delegate { Settings.Parse(invalid); });
            Assert(Settings.Parse(Json.Serializer.Serialize(defaults)).Proxy == "http://127.0.0.1:7890", "Round trip failed.");
        }

        private static void ConfigurationPreservation()
        {
            foreach (string contents in new[] { "{\"schemaVersion\":9,\"privateField\":\"preserve me\"}", "broken-json" })
            {
                var store = new SettingsStore(Area("preserve-" + Guid.NewGuid().ToString("N")));
                File.WriteAllText(store.FilePath, contents);
                var loaded = store.Load();
                Assert(!store.CanSave && !loaded.autoLaunchChatGpt, "Unreadable settings were accepted.");
                Throws(delegate { store.Save(new Settings()); });
                Assert(File.ReadAllText(store.FilePath) == contents, "Original settings were overwritten.");
                store.BackupAndSave(new Settings { port = 7897 });
                Assert(Settings.Parse(File.ReadAllText(store.FilePath)).port == 7897, "Explicit recovery failed.");
                string backup = Directory.GetFiles(store.DirectoryPath, "settings.json.preserved-*").Single();
                Assert(File.ReadAllText(backup) == contents, "Recovery did not preserve the original bytes.");
            }
        }

        private static void AtomicSettings()
        {
            var store = new SettingsStore(Area("atomic"));
            store.Save(new Settings());
            store.Save(new Settings { port = 7897, autoLaunchChatGpt = true });
            Assert(Settings.Parse(File.ReadAllText(store.FilePath + ".bak")).port == 7890, "Backup is missing.");
            Assert(store.Load().port == 7897 && store.Load().autoLaunchChatGpt, "Saved preferences did not persist.");
            Assert(Directory.GetFiles(store.DirectoryPath, "*.tmp").Length == 0, "Temporary file was left behind.");
        }

        private static void IdentityStates()
        {
            var identity = new ProcessIdentity { Id = 123, StartTimeUtcTicks = DateTime.UtcNow.Ticks, ExecutablePath = @"C:\Fixture\ChatGPT.exe" };
            var record = new LaunchRecord { schemaVersion = 1, processId = identity.Id,
                startTimeUtcTicks = identity.StartTimeUtcTicks.ToString(CultureInfo.InvariantCulture), executablePath = identity.ExecutablePath, port = 7890 };
            record = LaunchRecord.Parse(Json.Serializer.Serialize(record));
            var running = new List<ProcessIdentity> { identity };
            Assert(State.Evaluate(running, record, new Settings()) == AppState.Launched, "Recorded launch not recognized.");
            Assert(State.Evaluate(running, record, new Settings { port = 7897 }) == AppState.RestartRequired, "Changed port was not recognized.");
            identity.StartTimeUtcTicks++;
            Assert(State.Evaluate(running, record, new Settings()) == AppState.RunningUnconfirmed, "Reused PID was accepted.");
            identity.StartTimeUtcTicks--; identity.ExecutablePath = @"C:\Different\ChatGPT.exe";
            Assert(!record.Matches(identity), "A different executable was accepted.");
            Assert(State.Evaluate(new List<ProcessIdentity>(), record, new Settings()) == AppState.Stopped, "Stale record indicates running.");
        }

        private static void LogRotation()
        {
            var log = new FileLog(Area("logs"));
            for (int index = 0; index < 3; index++)
            {
                File.WriteAllText(log.FilePath, new string('x', 1024 * 1024));
                log.Write("rotation " + index);
            }
            Assert(File.Exists(log.FilePath + ".1") && File.Exists(log.FilePath + ".2"), "Log rotation is missing.");
            Assert(!File.Exists(log.FilePath + ".3"), "Too many log backups.");
            log.Write(new string('y', 50000));
            Assert(new FileInfo(log.FilePath).Length < 14000 && log.ReadTail().Contains("[truncated]"), "Log entry was not bounded.");
        }

        private static void SingleInstanceWake()
        {
            string path = Area("single-instance");
            using (var first = new SingleInstance(path))
            {
                Assert(first.IsFirst, "First instance rejected.");
                using (var child = Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location,
                    "--second-instance \"" + path + "\"") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden }))
                {
                    Assert(child.WaitForExit(5000) && child.ExitCode == 0, "Second process did not exit.");
                    Assert(first.Wake.WaitOne(1000), "Existing instance did not receive the wake signal.");
                }
            }
        }

        private static void HiddenPowerShell()
        {
            const string script = "param([string] $Value)\nAdd-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ConsoleProbe { [DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow(); }';\n"
                + "[pscustomobject]@{value=$Value; environment=$env:APP_PROXY_TEST_VALUE; console=[ConsoleProbe]::GetConsoleWindow().ToInt64()} | ConvertTo-Json -Compress";
            var runner = new PowerShellRunner();
            var result = runner.Run(script, "-Value '界面测试'", new Dictionary<string, string> { { "APP_PROXY_TEST_VALUE", "child only" } });
            Assert(result.ExitCode == 0, result.Error + result.Output);
            var data = Json.Read(result.Output.Trim());
            Assert((string)data["value"] == "界面测试" && (string)data["environment"] == "child only", "Unicode or environment was lost.");
            Assert(Convert.ToInt64(data["console"], CultureInfo.InvariantCulture) == 0, "Helper created a console window.");
            Assert(Environment.GetEnvironmentVariable("APP_PROXY_TEST_VALUE") == null, "Parent environment was changed.");
            result = runner.Run("Write-Error 'fixture failure'; exit 7", "", null);
            Assert(result.ExitCode == 7 && result.Error.Contains("fixture failure") && !result.Error.Contains("#< CLIXML"), "Failure output was lost or still contains serialized metadata.");
            string normalized = PowerShellRunner.ReadDiagnosticText("#< CLIXML\r\n<Objs xmlns=\"http://schemas.microsoft.com/powershell/2004/04\">"
                + "<Obj S=\"progress\"><ToString>private progress metadata</ToString></Obj>"
                + "<Obj S=\"information\"><ToString>duplicate output metadata</ToString></Obj>"
                + "<S S=\"warning\">fixture warning_x000D__x000A_second line</S><S S=\"error\">fixture error</S></Objs>");
            Assert(normalized.Contains("fixture warning\r\nsecond line") && normalized.Contains("fixture error") && !normalized.Contains("metadata"),
                "Serialized helper diagnostics were not reduced to useful messages.");
        }

        private static string FixturePrefix()
        {
            string packageDirectory = Path.GetDirectoryName(Path.GetDirectoryName(fixture)).Replace("'", "''");
            string executable = fixture.Replace("'", "''");
            return "function Get-AppxPackage { [CmdletBinding()] param([string] $Name) if ($Name -eq 'OpenAI.Codex') { "
                + "[pscustomobject]@{Name='OpenAI.Codex'; Version=[version]'1.0.0.0'; PackageFullName='fixture'; PackageFamilyName='fixture'; InstallLocation='" + packageDirectory + "'} } };\n"
                + "function Get-AppxPackageManifest { [CmdletBinding()] param([string] $Package) [xml]'<Package><Applications><Application Id=\"ChatGPT\" Executable=\"app\\ChatGPT.exe\" /></Applications></Package>' };\n"
                + "function Get-Process { [CmdletBinding()] param([string] $Name, [int] $Id) "
                + "if ($PSBoundParameters.ContainsKey('Id')) { Microsoft.PowerShell.Management\\Get-Process -Id $Id -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '" + executable + "' } } "
                + "else { Microsoft.PowerShell.Management\\Get-Process -Name $Name -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '" + executable + "' } } };\n";
        }

        private static LauncherBackend Backend(string prefix, string capture)
        {
            string area = Area("backend-" + Guid.NewGuid().ToString("N"));
            return new LauncherBackend(area, new FileLog(area), prefix,
                new Dictionary<string, string> { { "APP_PROXY_FIXTURE_CAPTURE", capture } });
        }

        private static void InspectWithoutProxy()
        {
            string prefix = FixturePrefix() + "function New-Object { [CmdletBinding()] param([Parameter(Position=0)] [string] $TypeName) throw 'Inspection must not create a TCP client.' };\n";
            var target = Backend(prefix, Path.Combine(directory, "unused.json")).Inspect();
            Assert(target.ExecutablePath == fixture, "Package inspection failed.");
        }

        private sealed class FakeBackend : IBackend
        {
            public int InspectCount;
            public bool ProxyFails;
            public bool QuitCalled;
            public bool LaunchCalled;
            public AppTarget Inspect() { Interlocked.Increment(ref InspectCount); return new AppTarget { ExecutablePath = fixture }; }
            public List<ProcessIdentity> Find(AppTarget target) { return new List<ProcessIdentity>(); }
            public void CheckProxy(int port) { if (ProxyFails) throw new IOException("fixture proxy unavailable"); }
            public LaunchRecord Launch(AppTarget target, int port) { LaunchCalled = true; return null; }
            public void QuitGracefully(AppTarget target) { QuitCalled = true; }
            public void Show(AppTarget target) { }
        }

        private static void FailedRestart()
        {
            var fake = new FakeBackend { ProxyFails = true };
            Throws(delegate { new AssistantActions(fake).Restart(new AppTarget(), 7890); });
            Assert(!fake.QuitCalled && !fake.LaunchCalled, "Failed proxy check touched the running app.");
        }

        private static int UnusedPort()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }

        private static void FixtureLifecycle()
        {
            string capture = Path.Combine(directory, "fixture-capture.json");
            var backend = Backend(FixturePrefix(), capture);
            AppTarget target = backend.Inspect();
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start(20);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            string parentProxy = Environment.GetEnvironmentVariable("HTTP_PROXY");
            try
            {
                LaunchRecord first = backend.Launch(target, port);
                Assert(backend.Find(target).Exists(first.Matches), "Launch record is not live.");
                var captured = Json.Read(File.ReadAllText(capture));
                Assert(backend.Find(target).Exists(value => value.Window.ToInt64() == Convert.ToInt64(captured["window"], CultureInfo.InvariantCulture)),
                    "An overlay or an unrelated window was selected instead of the fixture window.");
                var flags = ((object[])captured["arguments"]).Select(value => (string)value).ToArray();
                Assert(flags.Contains("--proxy-server=http://127.0.0.1:" + port)
                    && flags.Contains("--proxy-bypass-list=localhost;127.0.0.1;[::1]") && flags.Contains("--disable-quic"), "Proxy flags were not delivered.");
                var environment = (Dictionary<string, object>)captured["environment"];
                foreach (string key in new[] { "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy" })
                    Assert((string)environment[key] == "http://127.0.0.1:" + port, "Proxy environment missing: " + key);
                Assert((string)environment["NO_PROXY"] == "localhost,127.0.0.1,::1", "Bypass environment was not delivered.");
                Assert(Environment.GetEnvironmentVariable("HTTP_PROXY") == parentProxy, "Parent proxy environment changed.");
                Throws(delegate { new AssistantActions(backend).Restart(target, UnusedPort()); });
                Assert(backend.Find(target).Exists(first.Matches), "Proxy failure closed the existing fixture.");
                backend.Show(target);
                LaunchRecord second = new AssistantActions(backend).Restart(target, port);
                Assert(second.processId != first.processId || second.startTimeUtcTicks != first.startTimeUtcTicks, "Restart did not replace the process.");
                string recordPath = Path.Combine(directory, "persisted-launch.json");
                Json.WriteAtomic(recordPath, second);
                Assert(backend.Find(target).Exists(LaunchRecord.Parse(File.ReadAllText(recordPath)).Matches), "Persisted record was not recognized.");
                backend.QuitGracefully(target);
                Assert(backend.Find(target).Count == 0, "Fixture did not quit normally.");
            }
            finally { listener.Stop(); CleanupFixture(backend, target); }
        }

        private static void PackageFallback()
        {
            string prefix = FixturePrefix()
                + "function Start-Process { [CmdletBinding()] param($FilePath, $ArgumentList, [switch] $PassThru) throw 'fixture direct activation rejected' };\n"
                + "function Invoke-CommandInDesktopPackage { [CmdletBinding()] param($PackageFamilyName, $AppId, $Command, $Args) "
                + "Microsoft.PowerShell.Management\\Start-Process -FilePath $Command -ArgumentList $Args -PassThru | Out-Null };\n";
            var backend = Backend(prefix, Path.Combine(directory, "fallback-capture.json"));
            AppTarget target = backend.Inspect();
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start(20);
            try
            {
                LaunchRecord record = backend.Launch(target, ((IPEndPoint)listener.LocalEndpoint).Port);
                Assert(backend.Find(target).Exists(record.Matches), "Fallback process was not recorded.");
                backend.QuitGracefully(target);
            }
            finally { listener.Stop(); CleanupFixture(backend, target); }
        }

        private static void CleanupFixture(LauncherBackend backend, AppTarget target)
        {
            foreach (var identity in backend.Find(target))
            {
                // Only an exact executable inside this test run may be cleaned up.
                Assert(string.Equals(identity.ExecutablePath, fixture, StringComparison.OrdinalIgnoreCase)
                    && fixture.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "Fixture cleanup escaped the test directory.");
                using (var process = Process.GetProcessById(identity.Id))
                {
                    process.CloseMainWindow();
                    if (!process.WaitForExit(2000)) { process.Kill(); process.WaitForExit(2000); }
                }
            }
        }

        private static void Render(Form form, string name)
        {
            using (form)
            {
                var handle = form.Handle;
                CreateHandles(form);
                form.PerformLayout();
                AssertInside(form);
                using (var bitmap = new Bitmap(form.Width, form.Height))
                {
                    form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                    bitmap.Save(Path.Combine(Area("previews"), name + ".png"), ImageFormat.Png);
                }
            }
        }

        private static void CreateHandles(Control control)
        {
            foreach (Control child in control.Controls) { var handle = child.Handle; CreateHandles(child); child.PerformLayout(); }
        }

        private static void AssertInside(Control parent)
        {
            foreach (Control child in parent.Controls)
            {
                Assert(child.Right <= parent.ClientSize.Width + 1 && child.Bottom <= parent.ClientSize.Height + 1,
                    "Control clipped in " + parent.GetType().Name + ": " + child.GetType().Name + " " + child.Text);
                AssertInside(child);
            }
        }

        private static void NativeRendering()
        {
            var panel = new MainForm();
            panel.UpdateState(new Settings(), State.Text(AppState.RunningUnconfirmed), true, false, true);
            Render(panel, "panel");
            Render(new SettingsForm(new Settings(), false, false), "settings");
            Render(new DiagnosticsForm(delegate { return "示例诊断数据 / Example diagnostics\r\n端口连接不能证明代理流量。\r\nNo real ChatGPT app was controlled."; }, delegate { }), "diagnostics");
        }

        private static void TrayLifecycle()
        {
            string path = Area("tray-profile");
            var fake = new FakeBackend();
            using (var instance = new SingleInstance(path))
            using (var timer = new System.Windows.Forms.Timer { Interval = 1800 })
            {
                var context = new TrayContext(new SettingsStore(path), new FileLog(path), fake, instance, true);
                timer.Tick += delegate { timer.Stop(); context.ExitThread(); };
                timer.Start();
                Application.Run(context);
                context.Dispose();
            }
            Assert(fake.InspectCount == 1 && !fake.LaunchCalled && !fake.QuitCalled, "Default tray startup controlled an app.");
        }
    }
}
