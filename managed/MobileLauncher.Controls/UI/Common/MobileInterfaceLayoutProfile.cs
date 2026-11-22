using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MobileJoystick;

public enum MobileInterfaceRegion
{
	Hotbar,
	InventoryItems,
	CoinAmmo,
	InventoryActions,
	Equipment,
	Crafting,
	CalamityDifficulty
}

public sealed class MobileInterfaceRegionLayout
{
	public float CenterX { get; set; } = float.NaN;
	public float CenterY { get; set; } = float.NaN;
	public float Scale { get; set; } = 1f;

	public MobileInterfaceRegionLayout Clone() => new() { CenterX = CenterX, CenterY = CenterY, Scale = Scale };
}

public sealed class MobileInterfaceLayoutProfile
{
	public const int CurrentFormatVersion = 1;
	private const float MinimumScale = .5f;
	private const float MaximumScale = 2f;
	public int FormatVersion { get; set; } = CurrentFormatVersion;
	public Dictionary<string, JToken> Regions { get; set; } = new(StringComparer.OrdinalIgnoreCase);

	public MobileInterfaceRegionLayout Get(MobileInterfaceRegion region)
	{
		if (!TryRead(region, out MobileInterfaceRegionLayout layout))
			return new MobileInterfaceRegionLayout();
		return Normalize(layout);
	}

	public void Set(MobileInterfaceRegion region, MobileInterfaceRegionLayout layout)
	{
		Regions ??= new Dictionary<string, JToken>(StringComparer.OrdinalIgnoreCase);
		Regions[region.ToString()] = JObject.FromObject(Normalize(layout ?? new MobileInterfaceRegionLayout()));
		FormatVersion = CurrentFormatVersion;
	}

	public bool Has(MobileInterfaceRegion region)
		=> TryRead(region, out MobileInterfaceRegionLayout layout)
			&& IsFinite(layout.CenterX) && IsFinite(layout.CenterY) && IsFinite(layout.Scale);

	public MobileInterfaceLayoutProfile Clone()
	{
		var clone = new MobileInterfaceLayoutProfile { FormatVersion = CurrentFormatVersion };
		if (Regions != null)
			foreach (var pair in Regions)
				if (Enum.TryParse(pair.Key, true, out MobileInterfaceRegion region) && Enum.IsDefined(typeof(MobileInterfaceRegion), region)
					&& TryRead(region, out MobileInterfaceRegionLayout entry) && IsFinite(entry.CenterX) && IsFinite(entry.CenterY) && IsFinite(entry.Scale))
					clone.Set(region, entry);
		return clone;
	}

	public void Validate()
	{
		if (FormatVersion != CurrentFormatVersion || Regions == null) {
			FormatVersion = CurrentFormatVersion;
			Regions = new Dictionary<string, JToken>(StringComparer.OrdinalIgnoreCase);
			return;
		}

		var valid = new Dictionary<string, JToken>(StringComparer.OrdinalIgnoreCase);
		foreach (var pair in Regions) {
			if (!Enum.TryParse(pair.Key, true, out MobileInterfaceRegion region) || !Enum.IsDefined(typeof(MobileInterfaceRegion), region)
				|| !TryReadToken(pair.Value, out MobileInterfaceRegionLayout layout)
				|| !IsFinite(layout.CenterX) || !IsFinite(layout.CenterY) || !IsFinite(layout.Scale)) continue;
			valid[region.ToString()] = JObject.FromObject(Normalize(layout));
		}
		Regions = valid;
	}

	public void Reset(MobileInterfaceRegion region)
	{
		Regions?.Remove(region.ToString());
	}

	public static Rectangle Transform(MobileInterfaceRegionLayout entry, Rectangle rectangle, Rectangle defaultGroupBounds, Rectangle viewport)
		=> Transform(entry, rectangle, defaultGroupBounds, viewport, viewport);

	public static Rectangle Transform(MobileInterfaceRegionLayout entry, Rectangle rectangle, Rectangle defaultGroupBounds, Rectangle viewport, Rectangle usableBounds)
	{
		if (entry == null || !IsFinite(entry.CenterX) || !IsFinite(entry.CenterY) || !IsFinite(entry.Scale)) return rectangle;
		float scale = Math.Clamp(entry.Scale, MinimumScale, MaximumScaleFor(defaultGroupBounds, usableBounds));
		float centerX = Math.Clamp(entry.CenterX, 0f, 1f) * viewport.Width + viewport.X;
		float centerY = Math.Clamp(entry.CenterY, 0f, 1f) * viewport.Height + viewport.Y;
		float defaultCenterX = defaultGroupBounds.Center.X;
		float defaultCenterY = defaultGroupBounds.Center.Y;
		centerX = Math.Clamp(centerX, usableBounds.Left + Math.Min(defaultGroupBounds.Width * scale * .5f, usableBounds.Width * .5f),
			usableBounds.Right - Math.Min(defaultGroupBounds.Width * scale * .5f, usableBounds.Width * .5f));
		centerY = Math.Clamp(centerY, usableBounds.Top + Math.Min(defaultGroupBounds.Height * scale * .5f, usableBounds.Height * .5f),
			usableBounds.Bottom - Math.Min(defaultGroupBounds.Height * scale * .5f, usableBounds.Height * .5f));
		float x = centerX + (rectangle.X - defaultCenterX) * scale;
		float y = centerY + (rectangle.Y - defaultCenterY) * scale;
		int width = Math.Max(1, (int)MathF.Round(rectangle.Width * scale));
		int height = Math.Max(1, (int)MathF.Round(rectangle.Height * scale));
		return new Rectangle((int)MathF.Round(x), (int)MathF.Round(y), width, height);
	}

	public static float MaximumScaleFor(Rectangle groupBounds, Rectangle usableBounds)
	{
		if (groupBounds.Width <= 0 || groupBounds.Height <= 0) return MaximumScale;
		float fitWidth = usableBounds.Width / (float)groupBounds.Width;
		float fitHeight = usableBounds.Height / (float)groupBounds.Height;
		return Math.Clamp(Math.Min(fitWidth, fitHeight), MinimumScale, MaximumScale);
	}

	public static MobileInterfaceRegionLayout Normalize(MobileInterfaceRegionLayout layout)
	{
		if (layout == null || !IsFinite(layout.CenterX) || !IsFinite(layout.CenterY) || !IsFinite(layout.Scale))
			return new MobileInterfaceRegionLayout();
		return new MobileInterfaceRegionLayout {
			CenterX = Math.Clamp(layout.CenterX, 0f, 1f),
			CenterY = Math.Clamp(layout.CenterY, 0f, 1f),
			Scale = Math.Clamp(layout.Scale, MinimumScale, MaximumScale)
		};
	}

	private bool TryRead(MobileInterfaceRegion region, out MobileInterfaceRegionLayout layout)
	{
		layout = null;
		return Regions != null && Regions.TryGetValue(region.ToString(), out JToken token) && TryReadToken(token, out layout);
	}

	private static bool TryReadToken(JToken token, out MobileInterfaceRegionLayout layout)
	{
		layout = null;
		try {
			layout = token?.ToObject<MobileInterfaceRegionLayout>();
			return layout != null;
		}
		catch (JsonException) {
			return false;
		}
		catch (ArgumentException) {
			return false;
		}
	}

	private static bool IsFinite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
}
