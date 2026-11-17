using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using MobileLauncher.Stores;
using Xunit;

namespace MobileLauncher.Stores.Tests;

public sealed class StoreFilesTests
{
    [Theory]
    [InlineData("Terraria/Content/Images/Player.xnb", "Content/Images/Player.xnb")]
    [InlineData("data/noarch/game/Content/Sounds/Sound.xnb", "Content/Sounds/Sound.xnb")]
    [InlineData("Terraria\\Content\\Images\\Player.xnb", "Content/Images/Player.xnb")]
    [InlineData("Terraria.exe", null)]
    public void OnlySelectsContent(string input, string? expected) => Assert.Equal(expected, StoreFiles.ContentPath(input));

    [Theory]
    [InlineData("Content/Images/../../../outside")]
    [InlineData("/Content/Images/file")]
    [InlineData("C:/Content/Images/file")]
    [InlineData("data/./Content/Images/file")]
    public void RejectsUnsafeManifestPaths(string input) => Assert.Throws<InvalidDataException>(() => StoreFiles.ContentPath(input));

    [Fact]
    public async Task RejectsCorruptSteamFile()
    {
        var file = Path.GetTempFileName();
        try
        {
            await File.WriteAllTextAsync(file, "damaged");
            await Assert.ThrowsAsync<InvalidDataException>(() => StoreFiles.VerifySha1Async(file, SHA1.HashData("expected"u8), default));
        }
        finally { File.Delete(file); }
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(false, false, true)]
    public async Task ExtractsGogInstallerAsDataWithoutRunningScripts(bool unsafePath, bool corruptChecksum, bool includeVersion = false)
    {
        var root = Path.Combine(Path.GetTempPath(), "store-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var zipPath = Path.Combine(root, "game.zip");
            using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
            {
                var entry = zip.CreateEntry(unsafePath ? "data/Content/Images/../../../escape" : "data/noarch/game/Content/Images/Player.xnb");
                using (var output = new StreamWriter(entry.Open())) output.Write("asset");
                if (includeVersion)
                {
                    using var info = new StreamWriter(zip.CreateEntry("data/noarch/gameinfo").Open());
                    info.Write("Terraria\n1.4.4.9\n123\nen-US\n");
                }
                var script = zip.CreateEntry("start.sh");
                using var ignored = new StreamWriter(script.Open()); ignored.Write("exit 99");
            }
            if (corruptChecksum)
            {
                var bytes = await File.ReadAllBytesAsync(zipPath);
                var central = bytes.AsSpan().IndexOf(new byte[] { 0x50, 0x4b, 0x01, 0x02 });
                Assert.True(central >= 0);
                bytes[central + 16] ^= 1;
                await File.WriteAllBytesAsync(zipPath, bytes);
            }
            var installer = Path.Combine(root, "setup.sh");
            await using (var output = File.Create(installer))
            {
                await output.WriteAsync(Encoding.ASCII.GetBytes("#!/bin/sh\nfilesizes=4\nhead -n 4\nexit 99\n"));
                await output.WriteAsync(new byte[4]);
                await using var zipInput = File.OpenRead(zipPath);
                await zipInput.CopyToAsync(output);
            }
            var extracted = Path.Combine(root, "extracted");
            var payload = Path.Combine(root, "payload.zip");
            if (unsafePath || corruptChecksum) await Assert.ThrowsAsync<InvalidDataException>(() => GogSession.ExtractInstallerAsync(installer, payload, extracted, default));
            else
            {
                await GogSession.ExtractInstallerAsync(installer, payload, extracted, default);
                Assert.Equal("asset", await File.ReadAllTextAsync(Path.Combine(extracted, "Content/Images/Player.xnb")));
                Assert.False(File.Exists(Path.Combine(extracted, "start.sh")));
                await File.WriteAllTextAsync(Path.Combine(extracted, "Terraria.exe"), "not a packaged resource");
                var packaged = await StoreFiles.PackageAsync(extracted, default);
                using var zip = ZipFile.OpenRead(packaged);
                Assert.Equal(includeVersion ? 2 : 1, zip.Entries.Count);
                Assert.NotNull(zip.GetEntry("Content/Images/Player.xnb"));
                Assert.Null(zip.GetEntry("Terraria.exe"));
                if (includeVersion)
                {
                    using var info = new StreamReader(zip.GetEntry("launcher-package.json")!.Open());
                    Assert.Contains("1.4.4.9", await info.ReadToEndAsync());
                }
                File.Copy(installer, Path.Combine(root, "import-valid.sh"));
                var localArchive = await GogSession.ImportAsync(root, "import-valid.sh", (_, _) => { }, default);
                using var imported = ZipFile.OpenRead(localArchive);
                Assert.Equal(includeVersion ? 2 : 1, imported.Entries.Count);
                Assert.NotNull(imported.GetEntry("Content/Images/Player.xnb"));
            }
        }
        finally { Directory.Delete(root, true); }
    }

    [Theory]
    [InlineData("1.4.4.9", "1.4.4.9")]
    [InlineData("Steam Terraria resources", null)]
    [InlineData("123456", null)]
    public async Task OnlyPreservesSemanticTerrariaVersions(string fallback, string? expected)
    {
        var root = Path.Combine(Path.GetTempPath(), "version-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            await StoreFiles.PreserveVersionAsync(root, fallback, default);
            var file = Path.Combine(root, "launcher-package.json");
            Assert.Equal(expected != null, File.Exists(file));
            if (expected != null) Assert.Contains(expected, await File.ReadAllTextAsync(file));
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public async Task RejectsMalformedGogHeader()
    {
        var file = Path.GetTempFileName();
        try
        {
            await File.WriteAllTextAsync(file, "#!/bin/sh\nhead -n 9999\nfilesizes=10\n");
            await Assert.ThrowsAsync<InvalidDataException>(() => GogSession.ExtractInstallerAsync(file, file + ".zip", file + ".out", default));
        }
        finally { File.Delete(file); }
    }

    [Fact]
    public async Task GogImportRejectsRenamedZipAndOutOfRootPathsWithoutLogin()
    {
        var root = Path.Combine(Path.GetTempPath(), "gog-import-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var input = Path.Combine(root, "import-fake.sh");
            using (var zip = ZipFile.Open(input, ZipArchiveMode.Create))
            {
                using var output = new StreamWriter(zip.CreateEntry("Content/Images/Tiles.xnb").Open());
                output.Write("asset");
            }
            await Assert.ThrowsAsync<InvalidDataException>(() => GogSession.ImportAsync(root, "import-fake.sh", (_, _) => { }, default));
            await Assert.ThrowsAsync<ArgumentException>(() => GogSession.ImportAsync(root, "../import-fake.sh", (_, _) => { }, default));
            Assert.Single(Directory.GetFiles(root));
            Assert.Empty(Directory.GetDirectories(root));
        }
        finally { Directory.Delete(root, true); }
    }
}
