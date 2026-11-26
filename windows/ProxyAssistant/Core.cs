using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace AppProxyAssistant
{
    internal static class Json
    {
        public static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength = 65536 };

        public static Dictionary<string, object> Read(string text)
        {
            var result = Serializer.DeserializeObject(text) as Dictionary<string, object>;
            if (result == null) throw new InvalidDataException("Expected a JSON object.");
            return result;
        }

        public static int Integer(Dictionary<string, object> data, string key)
        {
            object value;
            if (!data.TryGetValue(key, out value) || !(value is int))
                throw new InvalidDataException("Invalid integer: " + key);
            return (int)value;
        }

        public static void WriteAtomic(string path, object value)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temporary, Serializer.Serialize(value), new UTF8Encoding(false));
                if (File.Exists(path)) File.Replace(temporary, path, path + ".bak", true);
                else File.Move(temporary, path);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
    }

    internal sealed class Settings
    {
        public int schemaVersion { get; set; }
        public int port { get; set; }
        public bool autoLaunchChatGpt { get; set; }

        public Settings() { schemaVersion = 1; port = 7890; }

        public static Settings Parse(string text)
        {
            var data = Json.Read(text);
            if (Json.Integer(data, "schemaVersion") != 1)
                throw new InvalidDataException("This settings version is not supported.");
            int port = Json.Integer(data, "port");
            object automatic;
            if (port < 1 || port > 65535 || !data.TryGetValue("autoLaunchChatGpt", out automatic) || !(automatic is bool))
                throw new InvalidDataException("Invalid proxy port or startup preference.");
            return new Settings { port = port, autoLaunchChatGpt = (bool)automatic };
        }

        [System.Web.Script.Serialization.ScriptIgnore]
        public string Proxy { get { return "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture); } }
    }

    internal sealed class SettingsStore
    {
        public readonly string DirectoryPath;
        public string Problem { get; private set; }
        public bool CanSave { get { return Problem == null; } }
        public string FilePath { get { return Path.Combine(DirectoryPath, "settings.json"); } }

        public SettingsStore(string directory) { DirectoryPath = Path.GetFullPath(directory); }

        public Settings Load()
        {
            if (!File.Exists(FilePath)) return new Settings();
            try { return Settings.Parse(File.ReadAllText(FilePath)); }
            catch (Exception error)
            {
                Problem = error.Message;
                return new Settings();
            }
        }

        public void Save(Settings settings)
        {
            if (!CanSave) throw new InvalidOperationException("Existing settings must be backed up before replacement.");
            Settings.Parse(Json.Serializer.Serialize(settings));
            Json.WriteAtomic(FilePath, settings);
        }

        public void BackupAndSave(Settings settings)
        {
            if (File.Exists(FilePath))
                File.Copy(FilePath, FilePath + ".preserved-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff", CultureInfo.InvariantCulture));
            string oldProblem = Problem;
            Problem = null;
            try { Save(settings); }
            catch { Problem = oldProblem; throw; }
        }
    }

    internal sealed class AppTarget
    {
        public string ExecutablePath { get; set; }
        public string PackageName { get; set; }

        public static AppTarget Parse(string text)
        {
            var data = Json.Read(text);
            object path, name;
            if (!data.TryGetValue("executablePath", out path) || !(path is string) || !Path.IsPathRooted((string)path)
                || !File.Exists((string)path) || !data.TryGetValue("packageName", out name) || !(name is string))
                throw new InvalidDataException("The app package did not report a valid executable.");
            return new AppTarget { ExecutablePath = Path.GetFullPath((string)path), PackageName = (string)name };
        }
    }

    internal sealed class ProcessIdentity
    {
        public int Id;
        public long StartTimeUtcTicks;
        public string ExecutablePath;
        public IntPtr Window;
    }

    internal sealed class LaunchRecord
    {
        public int schemaVersion { get; set; }
        public int processId { get; set; }
        public string startTimeUtcTicks { get; set; }
        public string executablePath { get; set; }
        public int port { get; set; }

        public static LaunchRecord Parse(string text)
        {
            var data = Json.Read(text);
            if (Json.Integer(data, "schemaVersion") != 1) throw new InvalidDataException("Unsupported launch record.");
            var record = Json.Serializer.Deserialize<LaunchRecord>(text);
            long ticks;
            if (record.processId <= 0 || record.port < 1 || record.port > 65535
                || !long.TryParse(record.startTimeUtcTicks, NumberStyles.None, CultureInfo.InvariantCulture, out ticks)
                || ticks <= 0 || ticks > DateTime.MaxValue.Ticks || string.IsNullOrEmpty(record.executablePath)
                || !Path.IsPathRooted(record.executablePath)) throw new InvalidDataException("Invalid launch identity.");
            return record;
        }

        public bool Matches(ProcessIdentity process)
        {
            return process != null && processId == process.Id
                && startTimeUtcTicks == process.StartTimeUtcTicks.ToString(CultureInfo.InvariantCulture)
                && string.Equals(Path.GetFullPath(executablePath), Path.GetFullPath(process.ExecutablePath), StringComparison.OrdinalIgnoreCase);
        }
    }

    internal enum AppState { Stopped, RunningUnconfirmed, Launched, RestartRequired }

    internal static class State
    {
        public static AppState Evaluate(IList<ProcessIdentity> processes, LaunchRecord record, Settings settings)
        {
            if (processes.Count == 0) return AppState.Stopped;
            if (record != null)
                foreach (var process in processes)
                    if (record.Matches(process)) return record.port == settings.port ? AppState.Launched : AppState.RestartRequired;
            return AppState.RunningUnconfirmed;
        }

        public static string Text(AppState state)
        {
            switch (state)
            {
                case AppState.Launched: return "已用当前配置发起启动 · 流量待验证";
                case AppState.RestartRequired: return "配置已更改 · 重启后应用";
                case AppState.RunningUnconfirmed: return "正在运行 · 启动配置未确认";
                default: return "ChatGPT 未运行";
            }
        }
    }

    internal sealed class FileLog
    {
        private readonly object gate = new object();
        public readonly string FilePath;
        public FileLog(string directory) { FilePath = Path.Combine(directory, "assistant.log"); }

        public void Write(string message)
        {
            lock (gate)
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                    if (File.Exists(FilePath) && new FileInfo(FilePath).Length >= 1024 * 1024)
                    {
                        if (File.Exists(FilePath + ".2")) File.Delete(FilePath + ".2");
                        if (File.Exists(FilePath + ".1")) File.Move(FilePath + ".1", FilePath + ".2");
                        File.Move(FilePath, FilePath + ".1");
                    }
                    if (message.Length > 12000) message = message.Substring(0, 12000) + " [truncated]";
                    File.AppendAllText(FilePath, DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)
                        + " " + message + Environment.NewLine, new UTF8Encoding(false));
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }

        public string ReadTail()
        {
            lock (gate)
            {
                if (!File.Exists(FilePath)) return "尚无日志。";
                using (var stream = new FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (stream.Length > 64000) stream.Seek(-64000, SeekOrigin.End);
                    using (var reader = new StreamReader(stream, Encoding.UTF8)) return reader.ReadToEnd();
                }
            }
        }
    }
}
