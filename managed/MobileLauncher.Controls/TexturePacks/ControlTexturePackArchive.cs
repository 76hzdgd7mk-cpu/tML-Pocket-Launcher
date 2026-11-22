using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;

namespace MobileJoystick;

// Archives are read in place. No extraction or writable cache is needed.
internal sealed class ControlTexturePackArchive : IDisposable
{
	internal const int MaxArchiveBytes = 64 * 1024 * 1024;
	private readonly ZipArchive archive;
	private readonly Dictionary<string, ZipArchiveEntry> files = new(StringComparer.OrdinalIgnoreCase);
	private readonly string prefix;
	internal ControlTexturePackManifest Manifest { get; }

	internal ControlTexturePackArchive(Stream stream, bool textureManifest = true)
	{
		if (stream.Length > MaxArchiveBytes) { stream.Dispose(); throw new InvalidDataException("纹理包 ZIP 过大"); }
		try {
			archive = new ZipArchive(stream, ZipArchiveMode.Read);
			if (archive.Entries.Count > 512) throw new InvalidDataException("纹理包文件过多");
			long total = 0;
			foreach (ZipArchiveEntry entry in archive.Entries) {
				string name = entry.FullName.Replace('\\', '/');
				if (name.StartsWith('/') || name.Contains(':') || name.Contains('\0')
					|| name.Split('/').Any(part => part is "." or "..")) throw new InvalidDataException("纹理包路径无效");
				if (name.EndsWith('/')) continue;
				if (entry.Length > 16 * 1024 * 1024 || (total += entry.Length) > MaxArchiveBytes)
					throw new InvalidDataException("纹理包解压大小超限");
				if (!files.TryAdd(name, entry)) throw new InvalidDataException("纹理包文件名重复");
			}
			string[] manifests = files.Keys.Where(name => name == "manifest.json" || name.EndsWith("/manifest.json", StringComparison.Ordinal)).ToArray();
			if (manifests.Length != 1) throw new InvalidDataException("纹理包需包含唯一的 manifest.json");
			prefix = manifests[0][..^"manifest.json".Length];
			string root = Path.GetFullPath("TexturePack");
			string json = Encoding.UTF8.GetString(ReadFile("manifest.json", 1_000_000)).TrimStart('\uFEFF');
			if (textureManifest) Manifest = ControlTexturePackManifest.Parse(json, root, path => files.ContainsKey(prefix + Path.GetRelativePath(root, path).Replace('\\', '/')));
		}
		catch { archive?.Dispose(); stream.Dispose(); throw; }
	}

	internal byte[] ReadFile(string relative, int limit = 16 * 1024 * 1024)
	{
		if (!files.TryGetValue(prefix + relative.Replace('\\', '/'), out ZipArchiveEntry entry) || entry.Length > limit)
			throw new InvalidDataException("纹理包文件缺失或过大：" + relative);
		using Stream input = entry.Open();
		byte[] data = new byte[checked((int)entry.Length)];
		input.ReadExactly(data);
		if (input.ReadByte() != -1) throw new InvalidDataException("纹理包文件长度无效");
		return data;
	}

	public void Dispose() => archive.Dispose();
}
