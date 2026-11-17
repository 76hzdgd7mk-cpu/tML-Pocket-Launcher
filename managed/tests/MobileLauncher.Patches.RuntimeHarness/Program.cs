using MobileLauncher.Bootstrap.Runtime;

var referenceRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../..", "build/game-references"));
var source = Environment.GetEnvironmentVariable("TML_REFERENCE_ROOT") ?? File.ReadAllText(Path.Combine(referenceRoot, "source.txt")).Trim();
using var resolver = new GameAssemblyResolver(source, Path.GetFullPath(Path.Combine(referenceRoot, "../../external/monomod")));
Environment.SetEnvironmentVariable("PATH", Path.Combine(source, "Libraries/Native/Windows") + Path.PathSeparator + Environment.GetEnvironmentVariable("PATH"));
FrameRegression.RunEntry();
TouchRegression.RunEntry();
