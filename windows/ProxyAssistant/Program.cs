using System;
using System.IO;
using System.Reflection;
using System.Runtime.Versioning;
using System.Windows.Forms;

[assembly: AssemblyTitle("App Proxy")]
[assembly: AssemblyDescription("Native Windows tray assistant for the ChatGPT app proxy launcher")]
[assembly: TargetFramework(".NETFramework,Version=v4.8")]

namespace AppProxyAssistant
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] arguments)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                bool background = false;
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AppProxyAssistant");
                for (int index = 0; index < arguments.Length; index++)
                {
                    if (arguments[index] == "--background") background = true;
                    else if (arguments[index] == "--data-dir" && index + 1 < arguments.Length) directory = Path.GetFullPath(arguments[++index]);
                    else throw new ArgumentException("支持的参数：--background，--data-dir <目录>");
                }
                using (var instance = new SingleInstance(directory))
                {
                    if (!instance.IsFirst) return;
                    var store = new SettingsStore(directory);
                    var log = new FileLog(directory);
                    var backend = new LauncherBackend(directory, log, null, null);
                    Application.Run(new TrayContext(store, log, backend, instance, background));
                }
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "应用代理助手无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
