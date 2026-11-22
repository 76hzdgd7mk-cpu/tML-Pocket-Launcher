using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Terraria;

namespace MobileJoystick;

internal sealed class LauncherControlPack
{
	private static readonly uint[] pngCrcTable = CreateCrcTable();
	private static uint[] CreateCrcTable()
	{
		var table = new uint[256];
		for (uint i = 0; i < table.Length; i++) {
			uint crc = i;
			for (int bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? 0xEDB88320U ^ (crc >> 1) : crc >> 1;
			table[i] = crc;
		}
		return table;
	}
	internal MobileCustomPreset Preset { get; private set; }
	internal readonly Dictionary<string, byte[]> Images = new(StringComparer.Ordinal);
	internal readonly List<string> Warnings = new();
	internal static string ImportRoot => Path.Combine(Main.SavePath, "ModConfigs", "MobileJoystick", "ControlPacks");
	internal static string AssetRoot => Path.Combine(ImportRoot, "Assets");
	internal static string[] Sources()
	{
		Directory.CreateDirectory(ImportRoot);
		return Directory.GetFiles(ImportRoot).Where(path => new[] { ".zip", ".json" }.Contains(Path.GetExtension(path).ToLowerInvariant()) && !Path.GetFileName(path).Equals("manifest.json", StringComparison.OrdinalIgnoreCase))
			.Concat(Directory.GetDirectories(ImportRoot).Where(path => File.Exists(Path.Combine(path, "layout.json"))))
			.OrderBy(Path.GetFileName, StringComparer.CurrentCultureIgnoreCase).ToArray();
	}
	internal static void OpenDirectory()
	{
		Directory.CreateDirectory(ImportRoot);
		Process.Start(new ProcessStartInfo { FileName = ImportRoot, UseShellExecute = true });
	}
	internal static LauncherControlPack Read(string path)
	{
		if (Path.GetExtension(path).Equals(".zip", StringComparison.OrdinalIgnoreCase)) {
			using var archive = new ControlTexturePackArchive(File.OpenRead(path), textureManifest: false);
			return Parse(archive.ReadFile("layout.json", 2_000_000), archive.ReadFile("manifest.json", 1_000_000), relative => archive.ReadFile("assets/" + SafeAssetPath(relative)));
		}
		string folder = Directory.Exists(path) ? path : Path.GetDirectoryName(Path.GetFullPath(path));
		string layout = Directory.Exists(path) ? Path.Combine(path, "layout.json") : path;
		string manifest = Path.Combine(folder, "manifest.json");
		return Parse(ReadBounded(layout, 2_000_000), File.Exists(manifest) ? ReadBounded(manifest, 1_000_000) : null,
			relative => {
				string asset = Path.Combine(folder, "assets", SafeAssetPath(relative));
				// Do not follow junctions or symlinks out of a folder pack.
				for (string parent = asset; parent != folder && parent != null; parent = Path.GetDirectoryName(parent))
					if ((File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("Linked assets are not supported");
				return ReadBounded(asset, 16 * 1024 * 1024);
			});
	}
	internal static JObject Json(byte[] bytes)
	{
		using var reader = new JsonTextReader(new StringReader(Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF'))) { MaxDepth = 40, DateParseHandling = DateParseHandling.None };
		JObject result = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
		if (reader.Read()) throw new InvalidDataException("Trailing JSON data");
		return result;
	}
	internal static LauncherControlPack Parse(byte[] layoutBytes, byte[] manifestBytes, Func<string, byte[]> readAsset)
	{
		if (layoutBytes.Length > 2_000_000 || manifestBytes?.Length > 1_000_000) throw new InvalidDataException("Control pack JSON is too large");
		JObject layout = Json(layoutBytes);
		int version = layout.Value<int?>("version") ?? 1;
		if (version < 1 || version > 3) throw new InvalidDataException("Unsupported layout version: " + version);
		JObject manifest = manifestBytes == null ? null : Json(manifestBytes);
		if (layout["controls"] is not JArray controls || controls.Count == 0 || controls.Count > 256) throw new InvalidDataException("Expected 1–256 controls");
		var pack = new LauncherControlPack { Preset = new MobileCustomPreset { Name = manifest?.Value<string>("name") ?? layout.Value<string>("name") ?? "RotatingartLauncher" } };
		long total = 0;
		long pixels = 0;
		var assets = new Dictionary<string, string>(StringComparer.Ordinal);
		foreach (JToken token in controls) {
			if (token is not JObject raw) throw new InvalidDataException("Invalid control");
			var data = (JObject)raw.DeepClone();
			MobileLauncherControl.Validate(data);
			float x = data.Value<float?>("x") ?? 0, y = data.Value<float?>("y") ?? 0;
			if (!float.IsFinite(x) || !float.IsFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new InvalidDataException("Invalid control position");
			var control = new MobileCustomControl {
				Id = "ral-" + Guid.NewGuid().ToString("N"), Kind = MobileLauncherControl.Kind(data.Value<string>("type")),
				X = x, Y = y, Size = 1, Action = MobileControlAction.LauncherControl,
				JoystickRole = MobileJoystickRole.Unbound, Multitouch = data.Value<bool>("multitouch"), Launcher = new MobileLauncherControl { Data = data }
			};
			IEnumerable<JValue> paths = data.Descendants().OfType<JProperty>().Where(p => p.Name is "path" or "iconPath")
				.Select(p => p.Value).OfType<JValue>();
			foreach (JValue value in paths) {
				string relative = value.Value<string>();
				if (string.IsNullOrWhiteSpace(relative)) continue;
				relative = SafeAssetPath(relative);
				if (!assets.TryGetValue(relative, out string hash)) {
					byte[] bytes = readAsset(relative);
					ValidatePng(bytes);
					pixels += (long)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4)) * System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4));
					if (pixels > 32_000_000) throw new InvalidDataException("Control pack images exceed 32 million pixels");
					if ((total += bytes.Length) > ControlTexturePackArchive.MaxArchiveBytes) throw new InvalidDataException("Control pack images exceed 64 MB");
					hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
					assets.Add(relative, hash);
					pack.Images.TryAdd(hash, bytes);
				}
				value.Value = relative;
				control.Launcher.Assets[relative] = hash;
			}
			foreach (string key in LauncherControlBindings.ControlKeys(data).Distinct())
				if (!LauncherControlBindings.Supported(key)) pack.Warnings.Add(control.Launcher.String("name") + ": " + key);
			if (control.Launcher.Flag("isPassThrough")) pack.Warnings.Add(control.Launcher.String("name") + ": " + MobileSettingsCatalog.Text("PackPassThroughWarning"));
			pack.Preset.Controls.Add(control);
		}
		MobileCustomControls.Validate(pack.Preset);
		return pack;
	}
	internal static string SafeAssetPath(string path)
	{
		path = path.Replace('\\', '/');
		if (string.IsNullOrWhiteSpace(path) || path.StartsWith('/') || path.Contains(':') || path.Contains('\0') || path.Split('/').Any(p => p is "" or "." or "..")
			|| !path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Invalid PNG path: " + path);
		return path;
	}
	internal static void ValidatePng(byte[] bytes)
	{
		if (bytes.Length < 33 || bytes.Length > 16 * 1024 * 1024 || !bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })
			|| Encoding.ASCII.GetString(bytes, 12, 4) != "IHDR") throw new InvalidDataException("Invalid PNG image");
		uint width = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4));
		uint height = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4));
		if (width == 0 || height == 0 || width > 4096 || height > 4096 || (long)width * height > 16_000_000) throw new InvalidDataException("PNG dimensions exceed limit");
		int offset = 8; bool imageData = false, end = false;
		while (offset <= bytes.Length - 12) {
			uint length = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
			if (length > bytes.Length - offset - 12) throw new InvalidDataException("Truncated PNG chunk");
			string type = Encoding.ASCII.GetString(bytes, offset + 4, 4);
			uint crc = uint.MaxValue;
			for (int i = offset + 4; i < offset + 8 + (int)length; i++) crc = pngCrcTable[(crc ^ bytes[i]) & 255] ^ (crc >> 8);
			if ((crc ^ uint.MaxValue) != System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + 8 + (int)length, 4))) throw new InvalidDataException("Invalid PNG checksum");
			if (type == "IHDR" && (offset != 8 || length != 13)) throw new InvalidDataException("Invalid PNG header");
			if (type == "IDAT" && length > 0) imageData = true;
			offset += (int)length + 12;
			if (type == "IEND") { end = length == 0 && offset == bytes.Length; break; }
		}
		if (!imageData || !end) throw new InvalidDataException("Incomplete PNG");
	}
	private static byte[] ReadBounded(string path, int maximum)
	{
		using var stream = File.OpenRead(path);
		if (stream.Length > maximum) throw new InvalidDataException("File too large: " + Path.GetFileName(path));
		byte[] bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes); return bytes;
	}
	internal void Install(int slot)
	{
		MobileJoystickConfig config = MobileJoystickConfig.Instance;
		if (slot < 0 || slot >= MobileCustomControls.PresetCount) throw new ArgumentOutOfRangeException(nameof(slot));
		MobileCustomControls.EnsureInitialized(config);
		Directory.CreateDirectory(AssetRoot);
		foreach (var image in Images) {
			// Decode before touching the live preset. Content addressed assets are immutable.
			ControlTexturePackSystem.ValidateImportedImage(image.Value);
			string path = Path.Combine(AssetRoot, image.Key + ".png");
			if (!File.Exists(path)) {
				string temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
				try { File.WriteAllBytes(temporary, image.Value); File.Move(temporary, path, true); }
				finally { if (File.Exists(temporary)) File.Delete(temporary); }
			}
		}
		var previous = config.CustomPresets[slot];
		var mode = config.ControlLayout; int selected = config.ActiveCustomPresetIndex;
		try {
			config.CustomPresets[slot] = MobileCustomControls.Clone(Preset);
			config.ActiveCustomPresetIndex = slot;
			config.ControlLayout = MobileControlLayoutMode.Custom;
			config.SaveFromMobileMenu();
			MobileJoystickInput.Reset();
		}
		catch { config.CustomPresets[slot] = previous; config.ActiveCustomPresetIndex = selected; config.ControlLayout = mode; throw; }
	}
}
