using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Terraria;
using Terraria.GameContent;

namespace MobileJoystick;

internal static class LauncherControlArtwork
{
	private sealed record Surface(Texture2D Texture, Color[] Pixels) { internal long LastUsed; }
	private static readonly Dictionary<string, Surface> surfaces = new(StringComparer.Ordinal);
	private static long useCounter;
	private static int cachedPixels;
	internal static void Unload() { foreach (var surface in surfaces.Values) surface.Texture.Dispose(); surfaces.Clear(); cachedPixels = 0; }
	internal static Color ColorValue(JObject data, string key, uint fallback)
	{
		uint value = unchecked((uint)(data.Value<long?>(key) ?? fallback));
		return new Color((byte)(value >> 16), (byte)(value >> 8), (byte)value, (byte)(value >> 24));
	}
	internal static bool ShapeContains(JObject data, Vector2 uv, Vector2 dimensions)
	{
		return RalControlStyle.Distance(data, uv, dimensions) <= 0;
	}
	private static Surface Cached(string key, int width, int height, Func<int, int, Color> pixel)
	{
		if (surfaces.TryGetValue(key, out Surface surface)) { surface.LastUsed = ++useCounter; return surface; }
		// Editor drags change dimensions repeatedly. Bound GPU memory for generated masks.
		while (surfaces.Count > 0 && (surfaces.Count >= 256 || cachedPixels + width * height > 16_000_000)) {
			var oldest = surfaces.MinBy(pair => pair.Value.LastUsed);
			cachedPixels -= oldest.Value.Pixels.Length; oldest.Value.Texture.Dispose(); surfaces.Remove(oldest.Key);
		}
		var pixels = new Color[width * height];
		for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) pixels[y * width + x] = pixel(x, y);
		var texture = new Texture2D(Main.instance.GraphicsDevice, width, height); texture.SetData(pixels);
		cachedPixels += pixels.Length;
		return surfaces[key] = new Surface(texture, pixels) { LastUsed = ++useCounter };
	}
	private static Point RasterSize(Vector2 dimensions)
	{
		float ratio = Math.Min(1f, 512 / Math.Max(dimensions.X, dimensions.Y));
		return new Point(Math.Max(1, (int)(dimensions.X * ratio)), Math.Max(1, (int)(dimensions.Y * ratio)));
	}
	private static void Sprite(SpriteBatch batch, Texture2D texture, Vector2 center, Vector2 dimensions, float rotation, Color color)
		=> batch.Draw(texture, center, null, color, MathHelper.ToRadians(rotation), new Vector2(texture.Width, texture.Height) / 2,
			dimensions / new Vector2(texture.Width, texture.Height), SpriteEffects.None, 0);
	private static Surface SurfaceFor(MobileLauncherControl control, Vector2 dimensions, JObject layer = null, int sector = -1, int count = 8, bool borderOnly = false, bool pressed = false)
	{
		Point size = RasterSize(dimensions);
		string assetPath = layer?.Value<string>("path");
		Texture2D image = layer == null ? null : ControlTexturePackSystem.ImportedTexture(control, assetPath);
		if (layer != null && image == null) return null;
		string key = control.RenderId + "|" + size + "|" + dimensions + "|" + layer?.Path + "|" + sector + "/" + count + "/" + borderOnly + "/" + pressed;
		if (surfaces.TryGetValue(key, out Surface cached)) { cached.LastUsed = ++useCounter; return cached; }
		Color[] source = null;
		if (image != null) { source = new Color[image.Width * image.Height]; image.GetData(source); }
		float padding = (layer?.Value<float?>("padding") ?? 0) * Math.Min(dimensions.X, dimensions.Y);
		Vector2 available = Vector2.Max(Vector2.One, dimensions - new Vector2(padding * 2));
		string mode = layer?.Value<string>("scaleMode") ?? "FIT";
		Vector2 imageSize = image == null ? Vector2.One : new Vector2(image.Width, image.Height);
		Vector2 scale = mode switch {
			"STRETCH" => available / imageSize, "FILL" => new Vector2(Math.Max(available.X / imageSize.X, available.Y / imageSize.Y)),
			"CENTER" or "TILE" => Vector2.One, _ => new Vector2(Math.Min(available.X / imageSize.X, available.Y / imageSize.Y))
		};
		float footprint = Math.Max(dimensions.X / size.X, dimensions.Y / size.Y);
		return Cached(key, size.X, size.Y, (x, y) => {
			Vector2 uv = new((x + .5f) / size.X, (y + .5f) / size.Y);
			float coverage = layer?.Value<bool?>("clipToShape") == false ? 1 : RalControlStyle.Coverage(RalControlStyle.Distance(control.Data, uv, dimensions), footprint);
			if (coverage <= 0) return Color.Transparent;
			if (sector >= 0 && LauncherControlBindings.Sector(uv - new Vector2(.5f), count) != sector) return Color.Transparent;
			if (image == null) {
				if (sector >= 0) return Color.White * coverage;
				return RalControlStyle.Sample(control.Data, uv, dimensions, footprint, pressed, borderOnly);
			}
			Vector2 position = (uv - new Vector2(.5f)) * dimensions;
			position = Vector2.Transform(position, Matrix.CreateRotationZ(-MathHelper.ToRadians(layer.Value<float?>("rotation") ?? 0)));
			Vector2 sample = position / scale + imageSize / 2;
			if (layer.Value<bool?>("flipHorizontal") == true) sample.X = imageSize.X - sample.X;
			if (layer.Value<bool?>("flipVertical") == true) sample.Y = imageSize.Y - sample.Y;
			if (mode == "TILE") { sample.X = (sample.X % image.Width + image.Width) % image.Width; sample.Y = (sample.Y % image.Height + image.Height) % image.Height; }
			if (Math.Abs(position.X) > available.X / 2 || Math.Abs(position.Y) > available.Y / 2 || sample.X < 0 || sample.Y < 0 || sample.X >= image.Width || sample.Y >= image.Height) return Color.Transparent;
			Color pixel = source[(int)sample.Y * image.Width + (int)sample.X];
			Color tint = (layer.Value<long?>("tintColor") ?? 0) == 0 ? Color.White : ColorValue(layer, "tintColor", 0);
			return new Color(pixel.R * tint.R / 255, pixel.G * tint.G / 255, pixel.B * tint.B / 255, pixel.A * tint.A / 255) * ((layer.Value<float?>("opacity") ?? 1) * coverage);
		});
	}
	private static bool Layer(SpriteBatch batch, MobileLauncherControl data, string name, Vector2 center, Vector2 dimensions, Color color, int sector = -1, int count = 8, Vector2? displayDimensions = null)
	{
		if (data.Data["texture"]?[name] is not JObject layer || layer.Value<bool?>("enabled") != true) return false;
		Surface surface = SurfaceFor(data, dimensions, layer, sector, count);
		if (surface == null) return false;
		Sprite(batch, surface.Texture, center, displayDimensions ?? dimensions, data.Number("rotation"), color); return true;
	}
	internal static bool AlphaContains(MobileControlButton button, Vector2 point)
	{
		MobileLauncherControl data = button.Launcher;
		if (!data.Flag("useTextureAlphaHitTest") || data.Data["texture"]?["normal"] is not JObject layer || layer.Value<bool?>("enabled") != true) return true;
		Surface surface = SurfaceFor(data, button.Dimensions, layer);
		if (surface == null) return true;
		Vector2 uv = data.Local(point, button.Center) / button.Dimensions + new Vector2(.5f);
		int x = (int)(uv.X * surface.Texture.Width), y = (int)(uv.Y * surface.Texture.Height);
		return x >= 0 && y >= 0 && x < surface.Texture.Width && y < surface.Texture.Height && surface.Pixels[y * surface.Texture.Width + x].A > 16;
	}
	internal static void Draw(SpriteBatch batch, MobileControlButton button, Color color, bool selected = false)
	{
		MobileLauncherControl data = button.Launcher;
		bool held = MobileJoystickInput.LauncherHeld(button.Id), toggled = MobileJoystickInput.LauncherToggled(button.Id);
		var gesture = MobileJoystickInput.LauncherState(button.Id);
		Vector2 dimensions = button.Dimensions;
		Vector2 center = button.Center;
		float rotation = data.Number("rotation");
		Vector2 backgroundDimensions = data.Type == "joystick" ? new Vector2(Math.Min(dimensions.X, dimensions.Y) * .75f) : dimensions;
		string background = data.Type switch { "button" => toggled ? "toggled" : held ? "pressed" : "normal", "radialmenu" => "centerBackground", "joystick" => held ? "backgroundPressed" : "background", _ => "background" };
		bool textured = Layer(batch, data, background, center, backgroundDimensions, color * data.Number("opacity", .35f));
		if (!textured && background is "pressed" or "toggled") textured = Layer(batch, data, "normal", center, backgroundDimensions, color * data.Number("opacity", .35f));
		if (!textured && background == "backgroundPressed") textured = Layer(batch, data, "background", center, backgroundDimensions, color * data.Number("opacity", .35f));
		if (data.Type != "joystick") {
			if (!textured) Sprite(batch, SurfaceFor(data, dimensions, pressed: held || toggled).Texture, center, dimensions, rotation, color);
			else if (data.Number("strokeWidth", 1.5f) > 0) Sprite(batch, SurfaceFor(data, dimensions, borderOnly: true, pressed: held || toggled).Texture, center, dimensions, rotation, color);
		}
		if (data.String("nativeTexture") is { Length: > 0 } nativeTexture && data.Type != "joystick")
			NativeControlTheme.Legacy(batch, nativeTexture, center, Math.Min(dimensions.X, dimensions.Y), color);
		if (data.Type == "joystick") {
			float radius = Math.Min(dimensions.X, dimensions.Y) / 2;
			Vector2 knob = new(radius * 2 * data.Number("stickKnobSize", .4f));
			Vector2 displacement = gesture?.Offset ?? Vector2.Zero;
			if (displacement.LengthSquared() > .75f * .75f) displacement = Vector2.Normalize(displacement) * .75f;
			displacement = Vector2.Transform(displacement, Matrix.CreateRotationZ(MathHelper.ToRadians(rotation)));
			Color bg = ColorValue(data.Data, "bgColor", 0xFF2A2A2A), stroke = ColorValue(data.Data, "strokeColor", 0xFFAAAAAA);
			bool userStroke = stroke.A > 0;
			NativeControlTheme.RalJoystick(batch, center, radius, displacement, color, held, data.Number("stickKnobSize", .4f),
				bg, userStroke ? stroke : RalControlStyle.Dark(bg) ? Color.White : Color.Black,
				data.Number("opacity", .35f), userStroke ? data.Number("borderOpacity", .5f) : data.Number("opacity", .35f) * .3f,
				data.Number("stickOpacity", .7f), !textured, false, userStroke ? data.Number("strokeWidth", 1.5f) : 1.5f);
			// RAL constrains the knob center to 75% of the touch radius.
			bool knobTextured = Layer(batch, data, held ? "knobPressed" : "knob", center + displacement * radius, knob, color * data.Number("stickOpacity", .7f))
				|| Layer(batch, data, "knob", center + displacement * radius, knob, color * data.Number("stickOpacity", .7f));
			NativeControlTheme.RalJoystick(batch, center, radius, displacement, color, held, data.Number("stickKnobSize", .4f),
				bg, userStroke ? stroke : RalControlStyle.Dark(bg) ? Color.White : Color.Black,
				data.Number("opacity", .35f), userStroke ? data.Number("borderOpacity", .5f) : data.Number("opacity", .35f) * .3f,
				data.Number("stickOpacity", .7f), false, !knobTextured, userStroke ? data.Number("strokeWidth", 1.5f) : 1.5f);
		}
		if (data.Type == "dpad") {
			float size = Math.Min(dimensions.X, dimensions.Y) * data.Number("buttonSize", .35f);
			string[] labels = { "↑", "→", "↓", "←" };
			for (int i = 0; i < 4; i++) {
				Vector2 direction = Direction(i, 4);
				Vector2 position = center + Vector2.Transform(direction * (dimensions / 2 - new Vector2(size / 2)) * (1 - data.Number("buttonSpacing", .05f)), Matrix.CreateRotationZ(MathHelper.ToRadians(rotation)));
				bool active = gesture != null && Vector2.Dot(gesture.Offset, direction) > data.Number("deadZone", .2f);
				if (active) Sprite(batch, TextureAssets.MagicPixel.Value, position, new Vector2(size), rotation, ColorValue(data.Data, "activeColor", 0xCCFFFFFF) * (color.A / 255f));
				if (data.Flag("showLabels")) Label(batch, labels[i], position, new Vector2(size), Color.White);
			}
		}
		if (data.Type == "radialmenu" && (gesture != null || selected)) {
			int count = (int)data.Number("sectorCount", 8);
			float progress = gesture == null || data.Number("expandDuration") <= 0 ? 1 : Math.Clamp((float)((System.Diagnostics.Stopwatch.GetTimestamp() / (double)System.Diagnostics.Stopwatch.Frequency - gesture.Started) * 1000 / data.Number("expandDuration")), 0, 1);
			progress = progress * progress * (3 - 2 * progress);
			Vector2 expanded = dimensions * MathHelper.Lerp(1, data.Number("expandedScale", 2.5f), progress);
			Vector2 fullDimensions = dimensions * data.Number("expandedScale", 2.5f);
			if (gesture?.Sector is >= 0) {
				Surface highlight = SurfaceFor(data, fullDimensions, sector: gesture.Sector, count: count);
				Sprite(batch, highlight.Texture, center, expanded, rotation, ColorValue(data.Data, "selectedColor", 0x99FFFFFF));
			}
			Layer(batch, data, "expandedBackground", center, fullDimensions, color, displayDimensions: expanded);
			JArray sectors = (JArray)data.Data["sectors"];
			for (int i = 0; i < count; i++) {
				Layer(batch, data, gesture?.Sector == i ? "sectorSelected" : "sector", center, fullDimensions, color, i, count, expanded);
				Vector2 direction = Vector2.Transform(Direction(i, count), Matrix.CreateRotationZ(MathHelper.ToRadians(rotation)));
				Vector2 position = center + direction * Math.Min(expanded.X, expanded.Y) * .36f;
				if (i < sectors.Count) {
					Texture2D icon = ControlTexturePackSystem.ImportedTexture(data, sectors[i].Value<string>("iconPath"));
					if (icon != null) Sprite(batch, icon, position, dimensions * .5f, 0, color);
					else Label(batch, sectors[i].Value<string>("label") ?? (i + 1).ToString(), position, dimensions * .7f, color);
				}
				if (data.Flag("showDividers", true)) {
					float angle = (i + .5f) * MathHelper.TwoPi / count + MathHelper.ToRadians(rotation) - MathHelper.PiOver2;
					batch.Draw(TextureAssets.MagicPixel.Value, center, null, ColorValue(data.Data, "dividerColor", 0x66FFFFFF), angle, Vector2.Zero,
						new Vector2(Math.Min(expanded.X, expanded.Y) / 2, 1), SpriteEffects.None, 0);
				}
			}
		}
		if (held && data.Type is "touchpad" or "mousewheel") Layer(batch, data, data.Type == "touchpad" ? "touchIndicator" : "wheelIndicator", center + (gesture?.Offset ?? Vector2.Zero) * dimensions / 2, dimensions * .12f, color);
		string text = data.Type == "text" ? data.String("displayText") : data.Type == "button" ? data.String("name") : "";
		if (!string.IsNullOrWhiteSpace(text) && (data.Type != "button" || !textured))
			Label(batch, text, center, dimensions * .8f, RalControlStyle.Paint(ColorValue(data.Data, "textColor", 0xFFFFFFFF), data.Number("textOpacity", .9f)) * (color.A / 255f));
		if (selected) {
			Vector2 half = dimensions / 2 + new Vector2(4);
			Vector2[] corners = { new(-half.X, -half.Y), new(half.X, -half.Y), new(half.X, half.Y), new(-half.X, half.Y) };
			for (int i = 0; i < 4; i++) {
				Vector2 start = center + Vector2.Transform(corners[i], Matrix.CreateRotationZ(MathHelper.ToRadians(rotation)));
				Vector2 end = center + Vector2.Transform(corners[(i + 1) % 4], Matrix.CreateRotationZ(MathHelper.ToRadians(rotation)));
				Vector2 line = end - start;
				batch.Draw(TextureAssets.MagicPixel.Value, start, null, Color.Cyan, MathF.Atan2(line.Y, line.X), Vector2.Zero, new Vector2(line.Length(), 2), SpriteEffects.None, 0);
			}
		}
	}
	internal static Vector2 Direction(int slot, int count) => new(MathF.Sin(slot * MathHelper.TwoPi / count), -MathF.Cos(slot * MathHelper.TwoPi / count));
	internal static void Label(SpriteBatch batch, string text, Vector2 center, Vector2 dimensions, Color color)
	{
		Vector2 measure = FontAssets.MouseText.Value.MeasureString(text);
		float scale = Math.Min(.8f, Math.Min(dimensions.X / Math.Max(1, measure.X), dimensions.Y / Math.Max(1, measure.Y)));
		Utils.DrawBorderString(batch, text, center, color, scale, .5f, .5f);
	}
}
