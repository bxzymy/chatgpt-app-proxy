using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AppProxyAssistant
{
    internal static class View
    {
        public static readonly Color Blue = Color.FromArgb(30, 94, 185);

        public static void Prepare(Form form, string title, Size size)
        {
            form.Text = title;
            form.Font = new Font("Microsoft YaHei UI", 9F);
            form.AutoScaleMode = AutoScaleMode.Dpi;
            form.ClientSize = size;
            form.StartPosition = FormStartPosition.CenterScreen;
            form.BackColor = Color.White;
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            using (var executable = Icon.ExtractAssociatedIcon(System.Reflection.Assembly.GetExecutingAssembly().Location))
                if (executable != null) form.Icon = (Icon)executable.Clone();
        }

        public static Label Label(string text, bool heading)
        {
            return new Label { Text = text, AutoSize = true, MaximumSize = new Size(480, 0),
                Margin = new Padding(0, 0, 0, heading ? 12 : 10),
                Font = new Font("Microsoft YaHei UI", heading ? 18F : 9F, heading ? FontStyle.Bold : FontStyle.Regular),
                ForeColor = heading ? Color.FromArgb(25, 35, 50) : Color.FromArgb(75, 83, 96) };
        }

        public static Button Button(string text, int width, bool primary)
        {
            var button = new Button { Text = text, Width = width, Height = 36, Margin = new Padding(0, 0, 10, 0),
                FlatStyle = FlatStyle.Flat, BackColor = primary ? Blue : Color.White,
                ForeColor = primary ? Color.White : Color.FromArgb(35, 45, 60), Cursor = Cursors.Hand };
            button.FlatAppearance.BorderColor = primary ? Blue : Color.FromArgb(205, 211, 220);
            return button;
        }

        public static TableLayoutPanel Layout(Form form)
        {
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 0 };
            form.Controls.Add(layout);
            return layout;
        }

        public static void Row(TableLayoutPanel layout, Control control)
        {
            int index = layout.RowCount++;
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(control, 0, index);
        }
    }

    internal sealed class MainForm : Form
    {
        public readonly Button Primary = View.Button("启动 ChatGPT", 144, true);
        public readonly Button Restart = View.Button("重启并应用代理", 166, false);
        public readonly Button Configure = View.Button("代理设置", 116, false);
        public readonly Button Diagnostics = View.Button("诊断与日志", 130, false);
        private readonly Label status;
        private readonly Label address;
        public bool AllowClose;

        public MainForm()
        {
            View.Prepare(this, "应用代理助手", new Size(540, 360));
            var layout = View.Layout(this);
            View.Row(layout, View.Label("应用代理助手", true));
            View.Row(layout, View.Label("ChatGPT · Microsoft Store", false));
            status = View.Label("正在检测应用…", false);
            status.Font = new Font(Font, FontStyle.Bold);
            status.ForeColor = View.Blue;
            status.Margin = new Padding(0, 12, 0, 10);
            View.Row(layout, status);
            address = View.Label("代理入口：http://127.0.0.1:7890", false);
            View.Row(layout, address);
            var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 10, 0, 14) };
            actions.Controls.Add(Primary); actions.Controls.Add(Restart);
            View.Row(layout, actions);
            var secondary = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 15) };
            secondary.Controls.Add(Configure); secondary.Controls.Add(Diagnostics);
            View.Row(layout, secondary);
            View.Row(layout, View.Label("请在代理客户端的连接页面验证实际流量。\r\n关闭此窗口后，助手继续在系统托盘运行。", false));
            KeyPreview = true;
            KeyDown += delegate(object sender, KeyEventArgs args) { if (args.KeyCode == Keys.Escape) Hide(); };
            FormClosing += delegate(object sender, FormClosingEventArgs args)
            {
                if (!AllowClose && args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); }
            };
        }

        public void UpdateState(Settings settings, string description, bool running, bool busy, bool settingsValid)
        {
            status.Text = description;
            address.Text = "代理入口：" + settings.Proxy;
            Primary.Text = running ? "显示 ChatGPT" : "启动 ChatGPT";
            Primary.Enabled = !busy && settingsValid;
            Restart.Enabled = !busy && running && settingsValid;
            Configure.Enabled = !busy;
        }
    }

    internal sealed class SettingsForm : Form
    {
        public readonly NumericUpDown Port = new NumericUpDown { Minimum = 1, Maximum = 65535, Width = 100, Height = 30 };
        public readonly CheckBox AutoLaunch = new CheckBox { Text = "助手启动时自动启动 ChatGPT", AutoSize = true };
        public readonly CheckBox AtLogin = new CheckBox { Text = "登录 Windows 时启动助手", AutoSize = true };
        public readonly Button Save = View.Button("保存", 100, true);

        public SettingsForm(Settings settings, bool loginEnabled, bool needsRecovery)
        {
            View.Prepare(this, "代理设置", new Size(540, 390));
            var layout = View.Layout(this);
            View.Row(layout, View.Label("代理设置", true));
            View.Row(layout, View.Label("本地 HTTP / Mixed 代理端口", false));
            var endpoint = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 12) };
            var prefix = View.Label("http://127.0.0.1:", false); prefix.Margin = new Padding(0, 3, 8, 0);
            endpoint.Controls.Add(prefix); endpoint.Controls.Add(Port); Port.Value = settings.port;
            View.Row(layout, endpoint);
            View.Row(layout, View.Label("填写 Clash / Mihomo 的 HTTP 或 Mixed 端口。\r\n修改端口后，需要重启 ChatGPT 才能应用。", false));
            AutoLaunch.Checked = settings.autoLaunchChatGpt;
            AtLogin.Checked = loginEnabled;
            AutoLaunch.Margin = new Padding(0, 6, 0, 8);
            AtLogin.Margin = new Padding(0, 0, 0, 10);
            View.Row(layout, AutoLaunch); View.Row(layout, AtLogin);
            View.Row(layout, View.Label(needsRecovery ? "原配置无法读取。保存前将提示备份原文件。" : "请先把 EXE 放在固定位置，再开启登录自启动。", false));
            var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 8, 0, 0) };
            var cancel = View.Button("取消", 90, false);
            Save.DialogResult = DialogResult.OK; cancel.DialogResult = DialogResult.Cancel;
            buttons.Controls.Add(Save); buttons.Controls.Add(cancel); View.Row(layout, buttons);
            AcceptButton = Save; CancelButton = cancel;
        }

        public Settings Selected { get { return new Settings { port = (int)Port.Value, autoLaunchChatGpt = AutoLaunch.Checked }; } }
    }

    internal sealed class DiagnosticsForm : Form
    {
        private readonly TextBox text;
        public DiagnosticsForm(Func<string> read, Action openDirectory)
        {
            View.Prepare(this, "诊断与日志", new Size(740, 480));
            FormBorderStyle = FormBorderStyle.Sizable;
            MinimumSize = new Size(560, 360);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 3 };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(View.Label("诊断与日志", true), 0, 0);
            text = new TextBox { Multiline = true, ReadOnly = true, WordWrap = false, ScrollBars = ScrollBars.Both,
                Dock = DockStyle.Fill, Font = new Font("Consolas", 9F), BackColor = Color.FromArgb(248, 249, 251), Text = read() };
            layout.Controls.Add(text, 0, 1);
            var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 12, 0, 0) };
            var refresh = View.Button("刷新日志", 112, false);
            var open = View.Button("打开数据目录", 144, false);
            refresh.Click += delegate { text.Text = read(); };
            open.Click += delegate { openDirectory(); };
            buttons.Controls.Add(refresh); buttons.Controls.Add(open); layout.Controls.Add(buttons, 0, 2);
            Controls.Add(layout);
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private readonly SettingsStore store;
        private readonly FileLog log;
        private readonly IBackend backend;
        private readonly LoginStartup login = new LoginStartup();
        private readonly SingleInstance instance;
        private readonly MainForm panel = new MainForm();
        private readonly NotifyIcon tray;
        private readonly ToolStripMenuItem primaryMenu;
        private readonly ToolStripMenuItem restartMenu;
        private readonly ToolStripMenuItem settingsMenu;
        private readonly ToolStripMenuItem statusMenu;
        private readonly System.Windows.Forms.Timer timer;
        private readonly Control dispatcher = new Control();
        private Settings settings;
        private AppTarget target;
        private LaunchRecord record;
        private List<ProcessIdentity> processes = new List<ProcessIdentity>();
        private bool busy;
        private bool refreshing;
        private bool exiting;
        private string operation;
        private string lastError;

        public TrayContext(SettingsStore store, FileLog log, IBackend backend, SingleInstance instance, bool background)
        {
            this.store = store; this.log = log; this.backend = backend; this.instance = instance;
            settings = store.Load();
            try
            {
                string path = Path.Combine(store.DirectoryPath, "launch.json");
                if (File.Exists(path)) record = LaunchRecord.Parse(File.ReadAllText(path));
            }
            catch (Exception error) { log.Write("Launch record ignored: " + error.Message); }
            if (!store.CanSave) log.Write("Settings preserved: " + store.Problem);
            var menu = new ContextMenuStrip();
            statusMenu = new ToolStripMenuItem("正在检测应用…") { Enabled = false };
            menu.Items.Add(statusMenu);
            menu.Items.Add("打开面板", null, delegate { ShowPanel(); });
            primaryMenu = new ToolStripMenuItem("启动 ChatGPT", null, delegate { StartOrShow(); }); menu.Items.Add(primaryMenu);
            restartMenu = new ToolStripMenuItem("重启并应用代理", null, delegate { Restart(); }); menu.Items.Add(restartMenu);
            menu.Items.Add(new ToolStripSeparator());
            settingsMenu = new ToolStripMenuItem("代理设置…", null, delegate { Configure(); }); menu.Items.Add(settingsMenu);
            menu.Items.Add("检查代理端口", null, delegate { CheckProxy(); });
            menu.Items.Add("诊断与日志…", null, delegate { Diagnostics(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出助手", null, delegate { if (!busy) ExitThread(); else Notify("正在处理操作，请稍候再退出。"); });
            tray = new NotifyIcon { Text = "应用代理助手", Icon = panel.Icon, ContextMenuStrip = menu, Visible = true };
            tray.MouseClick += delegate(object sender, MouseEventArgs args) { if (args.Button == MouseButtons.Left) ShowPanel(); };
            tray.BalloonTipClicked += delegate { ShowPanel(); };
            panel.Primary.Click += delegate { StartOrShow(); };
            panel.Restart.Click += delegate { Restart(); };
            panel.Configure.Click += delegate { Configure(); };
            panel.Diagnostics.Click += delegate { Diagnostics(); };
            var handle = dispatcher.Handle;
            timer = new System.Windows.Forms.Timer { Interval = 3000 };
            timer.Tick += delegate
            {
                if (instance.Wake.WaitOne(0)) ShowPanel();
                RefreshProcesses();
            };
            timer.Start();
            Render();
            if (!background) ShowPanel();
            dispatcher.BeginInvoke(new Action(Initialize));
        }

        private async void Initialize()
        {
            await RunBusy("正在检测应用…", delegate { target = backend.Inspect(); }, false);
            if (target != null && store.CanSave && settings.autoLaunchChatGpt && processes.Count == 0 && lastError == null) StartOrShow();
        }

        private void ShowPanel()
        {
            panel.Show();
            if (panel.WindowState == FormWindowState.Minimized) panel.WindowState = FormWindowState.Normal;
            panel.Activate();
        }

        private void Notify(string text)
        {
            tray.BalloonTipTitle = "应用代理助手";
            tray.BalloonTipText = text.Length > 240 ? text.Substring(0, 240) : text;
            tray.ShowBalloonTip(5000);
        }

        private string Description
        {
            get
            {
                if (busy) return operation;
                if (!store.CanSave) return "配置无法读取 · 请在设置中备份并重新保存";
                if (lastError != null) return "操作未完成 · 请查看诊断与日志";
                if (target == null) return "尚未确认已安装的 ChatGPT · 点击启动重新检测";
                return State.Text(State.Evaluate(processes, record, settings));
            }
        }

        private void Render()
        {
            if (exiting) return;
            bool running = processes.Count != 0;
            panel.UpdateState(settings, Description, running, busy, store.CanSave);
            statusMenu.Text = Description;
            primaryMenu.Text = running ? "显示 ChatGPT" : "启动 ChatGPT";
            primaryMenu.Enabled = !busy && store.CanSave;
            restartMenu.Enabled = !busy && running && store.CanSave;
            settingsMenu.Enabled = !busy;
        }

        private async Task<bool> RunBusy(string description, Action action, bool showErrors)
        {
            if (busy || exiting) return false;
            while (refreshing) await Task.Delay(25);
            if (busy || exiting) return false;
            busy = true; operation = description; lastError = null; Render();
            bool completed = false;
            try
            {
                try
                {
                    await Task.Run(action);
                    processes = await Task.Run(delegate { return backend.Find(target); });
                    completed = true;
                }
                catch (Exception error)
                {
                    lastError = error.Message; log.Write("ERROR: " + error.Message);
                    if (showErrors)
                    {
                        if (panel.Visible) MessageBox.Show(panel, error.Message, "操作未完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        else Notify("操作未完成。点击通知打开面板，再查看诊断与日志。");
                    }
                }
                if (!completed)
                {
                    try { processes = await Task.Run(delegate { return backend.Find(target); }); } catch { }
                }
            }
            finally { busy = false; Render(); }
            return completed;
        }

        private async void RefreshProcesses()
        {
            if (busy || refreshing || target == null) return;
            refreshing = true;
            try { processes = await Task.Run(delegate { return backend.Find(target); }); }
            catch (Exception error) { if (lastError != error.Message) log.Write(error.Message); lastError = error.Message; }
            finally { refreshing = false; Render(); }
        }

        private void SaveRecord(LaunchRecord value)
        {
            record = value;
            Json.WriteAtomic(Path.Combine(store.DirectoryPath, "launch.json"), value);
        }

        private async void StartOrShow()
        {
            if (!store.CanSave) { Configure(); return; }
            await RunBusy("正在启动或显示 ChatGPT…", delegate
            {
                target = backend.Inspect();
                if (backend.Find(target).Count != 0) backend.Show(target);
                else SaveRecord(backend.Launch(target, settings.port));
            }, true);
        }

        private async void Restart()
        {
            await RunBusy("正在请求正常退出并重新启动…", delegate
            {
                target = backend.Inspect();
                SaveRecord(new AssistantActions(backend).Restart(target, settings.port));
            }, true);
        }

        private async void CheckProxy()
        {
            if (await RunBusy("正在检查本地代理端口…", delegate { backend.CheckProxy(settings.port); }, true))
                Notify("本地端口可连接。请在代理客户端中继续验证 ChatGPT 的实际流量。");
        }

        private void Configure()
        {
            if (busy || refreshing) return;
            try
            {
                bool wasEnabled = login.Enabled;
                using (var dialog = new SettingsForm(settings, wasEnabled, !store.CanSave))
                {
                    if (dialog.ShowDialog(panel.Visible ? panel : null) != DialogResult.OK) return;
                    if (!store.CanSave && MessageBox.Show("原配置无法读取或版本较新。是否先保留原文件副本，再保存当前设置？",
                        "保留原配置", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
                    bool changedLogin = wasEnabled != dialog.AtLogin.Checked;
                    try
                    {
                        if (changedLogin) login.Set(dialog.AtLogin.Checked);
                        if (store.CanSave) store.Save(dialog.Selected); else store.BackupAndSave(dialog.Selected);
                    }
                    catch
                    {
                        if (changedLogin) login.Set(wasEnabled);
                        throw;
                    }
                    settings = dialog.Selected;
                    lastError = null;
                    log.Write("Settings saved. Proxy: " + settings.Proxy);
                    Render();
                }
            }
            catch (Exception error)
            {
                log.Write("Settings failed: " + error.Message);
                MessageBox.Show(error.Message, "无法保存设置", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private string ReadDiagnostics()
        {
            try
            {
                return "状态：" + Description + "\r\n代理入口：" + settings.Proxy + "\r\n数据目录：" + store.DirectoryPath
                    + "\r\n" + (target == null ? "" : "应用路径：" + target.ExecutablePath + "\r\n")
                    + (store.CanSave ? "" : "配置错误：" + store.Problem + "\r\n")
                    + (lastError == null ? "" : "最近错误：" + lastError + "\r\n")
                    + "\r\n端口检测与进程状态不能证明全部流量已走代理。日志时间为 UTC。\r\n\r\n" + log.ReadTail();
            }
            catch (Exception error) { return "无法读取日志：" + error.Message; }
        }

        private void Diagnostics()
        {
            using (var dialog = new DiagnosticsForm(ReadDiagnostics, delegate
            {
                try
                {
                    Directory.CreateDirectory(store.DirectoryPath);
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(store.DirectoryPath) { UseShellExecute = true });
                }
                catch (Exception error) { MessageBox.Show(error.Message, "无法打开数据目录"); }
            })) dialog.ShowDialog(panel.Visible ? panel : null);
        }

        protected override void ExitThreadCore()
        {
            exiting = true;
            timer.Stop(); timer.Dispose();
            tray.Visible = false; tray.Dispose();
            panel.AllowClose = true; panel.Dispose(); dispatcher.Dispose();
            base.ExitThreadCore();
        }
    }
}
