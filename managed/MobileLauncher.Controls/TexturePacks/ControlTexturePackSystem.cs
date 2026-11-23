using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.ModLoader;
using Terraria.ModLoader.IO;

namespace MobileJoystick;

internal static class ControlTexturePackSystem
{
	private const string BuiltInPackId = "android-mobile-controls";
	private const string RalPackId = "ral-code";
	private static readonly Dictionary<string, Texture2D> userTextures = new(StringComparer.Ordinal);
	private static readonly Dictionary<string, Texture2D> builtInTextures = new(StringComparer.Ordinal);
	private static readonly Dictionary<string, Texture2D> importedTextures = new(StringComparer.Ordinal);
	private static readonly HashSet<string> warnedMissingDefaults = new(StringComparer.Ordinal);
	internal static void ValidateImportedImage(byte[] bytes)
	{
		LauncherControlPack.ValidatePng(bytes);
		using var stream = new MemoryStream(bytes, false);
		using Texture2D texture = Texture2D.FromStream(Main.instance.GraphicsDevice, stream);
	}
	internal static Texture2D ImportedTexture(MobileLauncherControl control, string path)
	{
		if (string.IsNullOrWhiteSpace(path) || control.Assets == null || !control.Assets.TryGetValue(path, out string hash)
			|| hash.Length != 64 || hash.Any(c => !Uri.IsHexDigit(c))) return null;
		if (importedTextures.TryGetValue(hash, out Texture2D cached)) return cached;
		try {
			byte[] bytes = File.ReadAllBytes(Path.Combine(LauncherControlPack.AssetRoot, hash + ".png"));
			LauncherControlPack.ValidatePng(bytes);
			using var stream = new MemoryStream(bytes, false);
			cached = Texture2D.FromStream(Main.instance.GraphicsDevice, stream);
			importedTextures[hash] = cached;
			return cached;
		}
		catch (Exception error) { MobileControlsSession.Logger.Warn("Could not load imported control image: " + error.Message); importedTextures[hash] = null; return null; }
	}
	private static ControlTexturePackManifest builtInManifest;
	private const string BuiltInManifest = "Assets/TexturePacks/AndroidMobileControls.json";
	private static bool isInitialized;
	private static ControlTexturePackManifest activeManifest;
	private static string activePackId;
	private static string PackRoot => Path.Combine(Main.SavePath, "ModConfigs", "MobileJoystick", "TexturePacks");
	internal static string ActivePackId => activePackId ?? BuiltInPackId;
	internal static ControlTexturePackManifest ActiveManifest => activeManifest;
	internal static string ActivePackName => UseRalDefaults ? MobileSettingsCatalog.Text("RalDefaultAppearance") : activeManifest?.Name ?? BuiltInPackId;
	internal static bool UseRalDefaults => ActivePackId == RalPackId;
	private static bool UsesBundledTextures => UseRalDefaults || ActivePackId == BuiltInPackId;
	internal static bool TryDrawDefault(SpriteBatch batch, string name, Vector2 center, float size, Color color)
	{
		if (TryDraw(batch, name, center, size, color)) return true;
		if (!string.IsNullOrWhiteSpace(name) && warnedMissingDefaults.Add(name))
			MobileControlsSession.Logger.Warn($"Default touch-control texture '{name}' is unavailable; skipping its artwork.");
		return false;
	}

	internal static void Load()
	{
		Unload();
		isInitialized = true;
		if (UiTextureAssets.Available) {
			string root = UiTextureAssets.Root;
			try {
				builtInManifest = ControlTexturePackManifest.Parse(UiTextureAssets.ReadText(BuiltInManifest),
					root, path => File.Exists(Path.ChangeExtension(path, ".rawimg")));
				LoadTextures(builtInManifest, entry => {
					using var stream = File.OpenRead(Path.Combine(root, Path.ChangeExtension(entry.File, ".rawimg")));
					byte[] pixels = ImageIO.ReadRaw(stream, out int width, out int height);
					var texture = new Texture2D(Main.instance.GraphicsDevice, width, height);
					try { texture.SetData(pixels); return texture; }
					catch { texture.Dispose(); throw; }
				}, builtInTextures);
			}
			catch (Exception error) {
				foreach (Texture2D texture in builtInTextures.Values.Distinct()) texture.Dispose();
				builtInTextures.Clear();
				builtInManifest = null;
				MobileControlsSession.Logger.Warn("Could not load extracted control textures: " + error.Message);
			}
		}
		string selected = ReadSelectedPackId();
		if (selected == BuiltInPackId && builtInManifest == null
			&& !Directory.Exists(Path.Combine(PackRoot, selected)) && !File.Exists(Path.Combine(PackRoot, selected + ".zip")))
			selected = RalPackId;
		if (!SetActivePack(selected, save: false)
			&& (builtInManifest == null || !SetActivePack(BuiltInPackId, save: false))) SetActivePack(RalPackId, save: false);
	}

	internal static string ReadSelectedPackId()
	{
		string marker = Path.Combine(PackRoot, "active.json");
		try {
			if (File.Exists(marker)) return Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(marker)).Value<string>("id") ?? BuiltInPackId;
		}
		catch { }
		return BuiltInPackId;
	}

	internal static void Unload()
	{
		if (!Program.IsMainThread) {
			Main.RunOnMainThread(UnloadOnMainThread).GetAwaiter().GetResult();
			return;
		}

		UnloadOnMainThread();
	}

	private static void UnloadOnMainThread()
	{
		LauncherControlArtwork.Unload();
		foreach (Texture2D texture in importedTextures.Values) texture?.Dispose();
		importedTextures.Clear();
		foreach (Texture2D texture in userTextures.Values.Distinct()) texture.Dispose();
		userTextures.Clear();
		foreach (Texture2D texture in builtInTextures.Values.Distinct()) texture.Dispose();
		builtInTextures.Clear();
		builtInManifest = null;
		activeManifest = null;
		activePackId = null;
		warnedMissingDefaults.Clear();
		isInitialized = false;
	}

	internal static IReadOnlyList<ControlTextureEntry> Textures(string category = null)
		=> activeManifest?.Textures.Values.Where(entry => category == null || entry.Category == category)
			.OrderBy(entry => entry.DisplayName, StringComparer.CurrentCultureIgnoreCase).ToArray()
			?? Array.Empty<ControlTextureEntry>();

	internal static IReadOnlyList<(string Id, string Name)> AvailablePacks()
	{
		var packs = new List<(string Id, string Name)>();
		if (!isInitialized) return packs;
		packs.Add((RalPackId, MobileSettingsCatalog.Text("RalDefaultAppearance")));
		if (builtInManifest != null) packs.Add((builtInManifest.Id, builtInManifest.Name));
		try {
			if (!Directory.Exists(PackRoot)) return packs;
			foreach (string directory in Directory.GetDirectories(PackRoot)) {
				try {
					var manifest = ControlTexturePackManifest.Parse(File.ReadAllText(Path.Combine(directory, "manifest.json")), directory, File.Exists);
					if (manifest.Id != RalPackId && Path.GetFileName(directory) == manifest.Id) {
						packs.RemoveAll(pack => pack.Id == manifest.Id);
						packs.Add((manifest.Id, manifest.Name));
					}
				}
				catch { }
			}
			foreach (string path in Directory.GetFiles(PackRoot, "*.zip")) {
				try {
					using var archive = new ControlTexturePackArchive(File.OpenRead(path));
					if (archive.Manifest.Id != RalPackId && archive.Manifest.Id == Path.GetFileNameWithoutExtension(path) && !Directory.Exists(Path.Combine(PackRoot, archive.Manifest.Id))) {
						packs.RemoveAll(pack => pack.Id == archive.Manifest.Id);
						packs.Add((archive.Manifest.Id, archive.Manifest.Name));
					}
				}
				catch { }
			}
		}
		catch { }
		return packs.OrderBy(pack => pack.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
	}

	internal static bool ActivateNextPack()
	{
		IReadOnlyList<(string Id, string Name)> packs = AvailablePacks();
		if (packs.Count == 0) return false;
		int index = -1;
		for (int i = 0; i < packs.Count; i++) {
			if (packs[i].Id == ActivePackId) { index = i; break; }
		}
		return SetActivePack(packs[(index + 1) % packs.Count].Id);
	}

	internal static string OpenPackDirectory()
	{
		Directory.CreateDirectory(PackRoot);
		Process.Start(new ProcessStartInfo { FileName = PackRoot, UseShellExecute = true });
		return PackRoot;
	}

	internal static ControlTextureEntry FindTexture(string name)
	{
		if (activeManifest == null || string.IsNullOrWhiteSpace(name)) return null;
		string id = activeManifest.Textures.ContainsKey(name) ? name
			: activeManifest.Mappings.TryGetValue(name, out string mapped) ? mapped : null;
		return id != null && activeManifest.Textures.TryGetValue(id, out ControlTextureEntry entry) ? entry : null;
	}

	internal static bool SetActivePack(string id, bool save = true)
	{
		if (!isInitialized || string.IsNullOrWhiteSpace(id)
			|| !System.Text.RegularExpressions.Regex.IsMatch(id, "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")) return false;
		var loaded = new Dictionary<string, Texture2D>(StringComparer.Ordinal);
		try {
			ControlTexturePackManifest manifest;
			if (id == RalPackId) manifest = builtInManifest;
			else if (id == BuiltInPackId && !Directory.Exists(Path.Combine(PackRoot, id)) && !File.Exists(Path.Combine(PackRoot, id + ".zip")))
				manifest = builtInManifest ?? throw new InvalidDataException("内置纹理包不可用");
			else {
				string directory = Path.Combine(PackRoot, id);
				if (Directory.Exists(directory)) {
					manifest = ControlTexturePackManifest.Parse(File.ReadAllText(Path.Combine(directory, "manifest.json")), directory, File.Exists);
					if (manifest.Id != id) return false;
					LoadTextures(manifest, entry => File.ReadAllBytes(Path.Combine(directory, entry.File)), loaded);
				}
				else {
					using var archive = new ControlTexturePackArchive(File.OpenRead(Path.Combine(PackRoot, id + ".zip")));
					manifest = archive.Manifest;
					if (manifest.Id != id) return false;
					LoadTextures(manifest, entry => archive.ReadFile(entry.File), loaded);
				}
			}
			if (save) SaveActivePack(id);
			DisposeUserTextures();
			foreach (var pair in loaded) userTextures.Add(pair.Key, pair.Value);
			activeManifest = manifest;
			activePackId = id;
			return true;
		}
		catch (Exception error) {
			foreach (Texture2D texture in loaded.Values.Distinct()) texture.Dispose();
			MobileControlsSession.Logger.Warn($"Could not load control texture pack '{id}': {error}");
			return false;
		}
	}

	private static void LoadTextures(ControlTexturePackManifest manifest, Func<ControlTextureEntry, byte[]> read,
		Dictionary<string, Texture2D> destination)
		=> LoadTextures(manifest, entry => {
			byte[] data = read(entry);
			if (data.Length > 16 * 1024 * 1024) throw new InvalidDataException("纹理文件超过 16 MB");
			using var stream = new MemoryStream(data, writable: false);
			return Texture2D.FromStream(Main.instance.GraphicsDevice, stream);
		}, destination);

	private static void LoadTextures(ControlTexturePackManifest manifest, Func<ControlTextureEntry, Texture2D> load,
		Dictionary<string, Texture2D> destination)
	{
		var files = new Dictionary<string, Texture2D>(StringComparer.Ordinal);
		foreach (ControlTextureEntry entry in manifest.Textures.Values) {
			if (!files.TryGetValue(entry.File, out Texture2D texture)) {
				texture = load(entry);
				if (texture.Width > 4096 || texture.Height > 4096 || (long)texture.Width * texture.Height > 16_000_000) {
					texture.Dispose();
					throw new InvalidDataException("纹理尺寸过大");
				}
				files.Add(entry.File, texture);
			}
			destination.Add(entry.Id, texture);
		}
	}

	internal static bool TryDraw(SpriteBatch batch, string name, Vector2 center, float size, Color color)
	{
		if (activeManifest == null || string.IsNullOrWhiteSpace(name)) return false;
		string id = activeManifest.Textures.ContainsKey(name) ? name
			: activeManifest.Mappings.TryGetValue(name, out string mapped) ? mapped : null;
		if (id == null || !activeManifest.Textures.TryGetValue(id, out ControlTextureEntry entry)) return false;
		Texture2D texture;
		try {
			if (userTextures.TryGetValue(id, out texture)) { }
			else if (UsesBundledTextures && builtInTextures.TryGetValue(id, out texture)) { }
			else return false;
			Rectangle source = texture.Bounds;
			if (entry.Source != null) {
				int[] crop = entry.Source;
				if ((long)crop[0] + crop[2] > texture.Width || (long)crop[1] + crop[3] > texture.Height) return false;
				source = new Rectangle(crop[0], crop[1], crop[2], crop[3]);
			}
			Vector2 position = center + new Vector2(entry.OffsetX, entry.OffsetY) * size;
			float drawScale = size * entry.Scale / Math.Max(source.Width, source.Height);
			batch.Draw(texture, position, source, color, 0f, source.Size() * .5f, drawScale, SpriteEffects.None, 0f);
			return true;
		}
		catch { return false; }
	}

	internal static bool TryDrawFrame(SpriteBatch batch, string name, Rectangle bounds, int corner,
		float scale, Color color, bool frameOnly = false)
	{
		ControlTextureEntry entry = FindTexture(name);
		Texture2D texture = GetTexture(name);
		if (entry == null || texture == null) return false;
		Rectangle source = entry.Source is int[] crop ? new Rectangle(crop[0], crop[1], crop[2], crop[3]) : texture.Bounds;
		if (!texture.Bounds.Contains(source)) return false;
		Vector2 center = bounds.Center.ToVector2() + new Vector2(entry.OffsetX * bounds.Width, entry.OffsetY * bounds.Height);
		int width = Math.Max(1, (int)(bounds.Width * entry.Scale)), height = Math.Max(1, (int)(bounds.Height * entry.Scale));
		bounds = new Rectangle((int)(center.X - width / 2f), (int)(center.Y - height / 2f), width, height);
		int cx = Math.Min(corner, source.Width / 2), cy = Math.Min(corner, source.Height / 2);
		int ex = Math.Min(Math.Max(1, (int)(cx * scale)), bounds.Width / 2);
		int ey = Math.Min(Math.Max(1, (int)(cy * scale)), bounds.Height / 2);
		int[] sx = { source.Left, source.Left + cx, source.Right - cx, source.Right };
		int[] sy = { source.Top, source.Top + cy, source.Bottom - cy, source.Bottom };
		int[] dx = { bounds.Left, bounds.Left + ex, bounds.Right - ex, bounds.Right };
		int[] dy = { bounds.Top, bounds.Top + ey, bounds.Bottom - ey, bounds.Bottom };
		for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
			if (frameOnly && x == 1 && y == 1) continue;
			if (dx[x + 1] <= dx[x] || dy[y + 1] <= dy[y] || sx[x + 1] <= sx[x] || sy[y + 1] <= sy[y]) continue;
			batch.Draw(texture, new Rectangle(dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]),
				new Rectangle(sx[x], sy[y], sx[x + 1] - sx[x], sy[y + 1] - sy[y]), color);
		}
		return true;
	}

	internal static Texture2D GetTexture(string name)
	{
		if (activeManifest == null) return null;
		string id = activeManifest.Textures.ContainsKey(name) ? name
			: activeManifest.Mappings.TryGetValue(name, out string mapped) ? mapped : null;
		if (id == null) return null;
		if (userTextures.TryGetValue(id, out Texture2D texture)) return texture;
		return UsesBundledTextures && builtInTextures.TryGetValue(id, out texture) ? texture : null;
	}

	private static void SaveActivePack(string id)
	{
		Directory.CreateDirectory(PackRoot);
		string marker = Path.Combine(PackRoot, "active.json");
		string temporary = marker + ".tmp";
		File.WriteAllText(temporary, Newtonsoft.Json.JsonConvert.SerializeObject(new { id }));
		if (File.Exists(marker)) File.Replace(temporary, marker, null);
		else File.Move(temporary, marker);
	}

	private static void DisposeUserTextures()
	{
		foreach (Texture2D texture in userTextures.Values.Distinct()) texture.Dispose();
		userTextures.Clear();
	}
}
