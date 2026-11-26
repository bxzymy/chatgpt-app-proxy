using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class FixtureApp
{
    [STAThread]
    private static void Main(string[] arguments)
    {
        Application.EnableVisualStyles();
        using (var form = new Form { Text = "App Proxy isolated test fixture", ShowInTaskbar = false, Opacity = 0,
            StartPosition = FormStartPosition.Manual, Location = new Point(-20000, -20000), Size = new Size(100, 80) })
        using (var timeout = new Timer { Interval = 90000 })
        {
            string capture = Environment.GetEnvironmentVariable("APP_PROXY_FIXTURE_CAPTURE");
            form.Shown += delegate
            {
                var environment = new Dictionary<string, string>();
                foreach (string key in new[] { "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy" })
                    environment[key] = Environment.GetEnvironmentVariable(key);
                File.WriteAllText(capture, new JavaScriptSerializer().Serialize(new { arguments = arguments, environment = environment,
                    window = form.Handle.ToInt64(), processId = System.Diagnostics.Process.GetCurrentProcess().Id }), new UTF8Encoding(false));
            };
            form.FormClosing += delegate { File.AppendAllText(capture + ".closing", "closing\r\n"); };
            timeout.Tick += delegate { form.Close(); };
            timeout.Start();
            Application.Run(form);
            File.AppendAllText(capture + ".closing", "message loop exited\r\n");
        }
    }
}
