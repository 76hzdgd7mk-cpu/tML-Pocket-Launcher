using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MobileJoystick;

internal sealed class ControlTexturePackManifest
{
	internal int FormatVersion { get; private init; }
	internal string Id { get; private init; }
	internal string Name { get; set; }
	internal string Author { get; private init; }
	internal Dictionary<string, ControlTextureEntry> Textures { get; private init; }
	internal Dictionary<string, string> Mappings { get; private init; }

	internal static ControlTexturePackManifest Parse(string json, string packRoot, Func<string, bool> fileExists)
	{
		if (string.IsNullOrWhiteSpace(json) || json.Length > 1_000_000) throw new InvalidDataException("纹理包清单为空或过大");
		if (fileExists == null) throw new ArgumentNullException(nameof(fileExists));
		JObject root;
		using (var text = new JsonTextReader(new StringReader(json)) { MaxDepth = 32 })
			root = JObject.Load(text, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });

		int version = RequiredInt(root, "formatVersion");
		if (version != 1) throw new InvalidDataException($"不支持纹理包格式版本：{version}");
		string id = RequiredString(root, "id", 128);
		if (!Regex.IsMatch(id, "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")) throw new InvalidDataException("纹理包 ID 无效");
		string name = RequiredString(root, "name", 128);
		string author = root.Value<string>("author") ?? string.Empty;
		if (author.Length > 128) throw new InvalidDataException("作者名称过长");
		if (root["textures"] is not JObject textureObject || textureObject.Properties().Count() > 256)
			throw new InvalidDataException("纹理包图片清单无效");

		var textures = new Dictionary<string, ControlTextureEntry>(StringComparer.Ordinal);
		var canonicalRoot = Path.GetFullPath(packRoot);
		foreach (JProperty property in textureObject.Properties()) {
			string textureId = property.Name;
			if (!Regex.IsMatch(textureId, "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$") || property.Value is not JObject value)
				throw new InvalidDataException($"逻辑纹理名称无效：{textureId}");
			string relative = RequiredString(value, "file", 240).Replace('/', Path.DirectorySeparatorChar);
			if (Path.IsPathRooted(relative) || relative.Contains(':') || relative.Contains('\0'))
				throw new InvalidDataException($"纹理路径必须为相对 PNG 路径：{textureId}");
			string[] segments = relative.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
			if (segments.Length == 0 || segments.Any(segment => segment is "." or "..")
				|| !relative.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
				throw new InvalidDataException($"纹理路径无效：{textureId}");
			string fullPath = Path.GetFullPath(Path.Combine(canonicalRoot, relative));
			if (!fullPath.StartsWith(canonicalRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
				StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException($"纹理路径越界：{textureId}");
			if (!fileExists(fullPath)) throw new InvalidDataException($"纹理文件不存在：{relative}");

			string displayName = RequiredString(value, "displayName", 128);
			string category = RequiredString(value, "category", 32);
			JArray offset = value["offset"] as JArray;
			if (offset?.Count != 2) throw new InvalidDataException($"纹理偏移无效：{textureId}");
			float offsetX = ReadFiniteFloat(offset[0], textureId);
			float offsetY = ReadFiniteFloat(offset[1], textureId);
			float scale = value.Value<float?>("scale") ?? 1f;
			if (!float.IsFinite(scale) || scale is < 0.1f or > 3f || Math.Abs(offsetX) > 1f || Math.Abs(offsetY) > 1f)
				throw new InvalidDataException($"纹理偏移或缩放超出范围：{textureId}");

			int[] source = null;
			if (value["source"] is JArray sourceArray) {
				if (sourceArray.Count != 4) throw new InvalidDataException($"纹理裁切区域无效：{textureId}");
				source = sourceArray.Select(token => token.Value<int>()).ToArray();
				if (source[0] < 0 || source[1] < 0 || source[2] <= 0 || source[3] <= 0)
					throw new InvalidDataException($"纹理裁切区域无效：{textureId}");
			}
			textures.Add(textureId, new ControlTextureEntry(textureId, displayName, category, relative, offsetX, offsetY, scale, source));
		}

		var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		if (root["mappings"] is JObject mappingObject) {
			foreach (JProperty property in mappingObject.Properties()) {
				string target = property.Value.Value<string>();
				if (property.Name.Length is 0 or > 128 || string.IsNullOrWhiteSpace(target) || !textures.ContainsKey(target))
					throw new InvalidDataException($"纹理名称映射无效：{property.Name}");
				if (!mappings.TryAdd(property.Name, target)) throw new InvalidDataException($"纹理名称映射重复：{property.Name}");
			}
		}
		return new ControlTexturePackManifest { FormatVersion = version, Id = id, Name = name, Author = author, Textures = textures, Mappings = mappings };
	}

	private static string RequiredString(JObject value, string name, int maximumLength)
	{
		string text = value.Value<string>(name);
		if (string.IsNullOrWhiteSpace(text) || text.Length > maximumLength) throw new InvalidDataException($"纹理包字段无效：{name}");
		return text.Trim();
	}

	private static int RequiredInt(JObject value, string name)
		=> value[name]?.Value<int>() ?? throw new InvalidDataException($"纹理包缺少字段：{name}");

	private static float ReadFiniteFloat(JToken token, string id)
	{
		if (!float.TryParse(token.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out float value) || !float.IsFinite(value))
			throw new InvalidDataException($"纹理偏移无效：{id}");
		return value;
	}
}

internal sealed record ControlTextureEntry(string Id, string DisplayName, string Category, string File,
	float OffsetX, float OffsetY, float Scale, int[] Source);
