using System.Text;

namespace MobileLauncher.Host;

internal static class RuntimeLogging
{
    private static readonly object Sync = new();
    private static bool _initialized;

    public static void Initialize(string workingDirectory)
    {
        lock (Sync)
        {
            if (_initialized)
            {
                return;
            }

            var output = Console.Out;
            var error = Console.Error;
            if (OperatingSystem.IsAndroid() || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ANDROID_ROOT")))
            {
                output = new AndroidLogTextWriter(4); // ANDROID_LOG_INFO
                error = new AndroidLogTextWriter(6); // ANDROID_LOG_ERROR
                Console.SetOut(output);
                Console.SetError(error);
            }

            var path = Path.Combine(workingDirectory, "dotnet-runtime.log");
            try
            {
                var fileStream = new FileStream(
                    path,
                    FileMode.Append,
                    FileAccess.Write,
                    FileShare.ReadWrite,
                    bufferSize: 16 * 1024,
                    options: FileOptions.Asynchronous);
                var fileWriter = new StreamWriter(fileStream, new UTF8Encoding(false))
                {
                    AutoFlush = true
                };
                Console.SetOut(new TeeTextWriter(output, fileWriter));
                Console.SetError(new TeeTextWriter(error, fileWriter));
                AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
                    Console.Error.WriteLine(
                        $"[dotnet] UnhandledException terminating={eventArgs.IsTerminating}:\n{eventArgs.ExceptionObject}");
                TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
                {
                    Console.Error.WriteLine($"[dotnet] UnobservedTaskException:\n{eventArgs.Exception}");
                    eventArgs.SetObserved();
                };
                _initialized = true;
                Console.WriteLine($"[dotnet] Runtime log started: {path}");
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine($"[dotnet] Could not initialize runtime log at {path}: {exception}");
            }
        }
    }

    private sealed class TeeTextWriter(TextWriter consoleWriter, TextWriter fileWriter) : TextWriter
    {
        public override Encoding Encoding => Encoding.UTF8;

        public override void Write(char value)
        {
            lock (Sync)
            {
                consoleWriter.Write(value);
                fileWriter.Write(value);
            }
        }

        public override void Write(string? value)
        {
            lock (Sync)
            {
                consoleWriter.Write(value);
                fileWriter.Write(value);
            }
        }

        public override void WriteLine(string? value)
        {
            lock (Sync)
            {
                consoleWriter.WriteLine(value);
                fileWriter.WriteLine(value);
            }
        }

        public override void Flush()
        {
            lock (Sync)
            {
                consoleWriter.Flush();
                fileWriter.Flush();
            }
        }
    }
}
