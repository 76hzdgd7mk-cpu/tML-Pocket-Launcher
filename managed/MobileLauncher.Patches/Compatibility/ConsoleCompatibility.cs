using System.Reflection;
using System.Runtime.InteropServices;
using MobileLauncher.Bootstrap.Compatibility;

namespace MobileLauncher.Patches.Compatibility;

/// <summary>RotatingartLauncher console adapter, ported to the launcher's MonoMod hook owner.</summary>
internal static class ConsoleCompatibility
{
    internal static void Install(List<IDisposable> hooks)
    {
        const BindingFlags flags = BindingFlags.Static | BindingFlags.Public;
        void Patch(MethodInfo method, Func<object[], object> action)
        {
            if (method is not null) hooks.Add(new RuntimeMethodHook(method, (args, _) => action(args)));
        }
        string title = string.Empty;
        var titleProperty = typeof(Console).GetProperty("Title", flags)!;
        Patch(titleProperty.GetMethod, _ => title);
        Patch(titleProperty.SetMethod, args => { title = (string)args[0]; return null; });
        foreach (var name in new[] { "ForegroundColor", "BackgroundColor" })
        {
            ConsoleColor color = name == "ForegroundColor" ? ConsoleColor.Gray : ConsoleColor.Black;
            var property = typeof(Console).GetProperty(name, flags)!;
            Patch(property.GetMethod, _ => color);
            Patch(property.SetMethod, args => { color = (ConsoleColor)args[0]; return null; });
        }
        foreach (var name in new[] { "Clear", "ResetColor" })
            Patch(typeof(Console).GetMethod(name, flags)!, _ => null);
        foreach (var method in typeof(Console).GetMethods(flags).Where(method => method.Name == "ReadKey"))
            Patch(method, _ => new ConsoleKeyInfo('\r', ConsoleKey.Enter, false, false, false));
        Patch(typeof(PosixSignalRegistration).GetMethod("Create", flags)!, _ => null);
        // Keep stdout/stderr and encoding owned by the existing runtime logger.
        // Do not import the upstream ReadLine infinite wait: this launcher has no stdin pipe.
    }
}
