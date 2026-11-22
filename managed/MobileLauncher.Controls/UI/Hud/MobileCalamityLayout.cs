using System;
using Microsoft.Xna.Framework;

namespace MobileJoystick;

internal static class MobileCalamityLayout
{
	internal const int DifficultyFrameSize = 74;

	internal static Rectangle DifficultyBounds(int width, int height, float uiScale, MobileInterfaceRegionLayout position)
	{
		if (width <= 0 || height <= 0) return Rectangle.Empty;
		var inventory = new MobileInventoryLayout(width, height);
		Rectangle safe = inventory.SafeViewport;
		int size = Math.Clamp((int)MathF.Round(DifficultyFrameSize * Math.Min(uiScale, inventory.Scale)), 1, Math.Min(safe.Width, safe.Height));
		Point anchor = inventory.Right(220, 300, 0, 0).Location;
		int x = Math.Clamp(anchor.X - size / 2, safe.Left, safe.Right - size);
		int y = Math.Clamp(anchor.Y - size / 2, safe.Top, safe.Bottom - size);
		var defaults = new Rectangle(x, y, size, size);
		return MobileInterfaceLayoutProfile.Transform(position, defaults, defaults, new Rectangle(0, 0, width, height), safe);
	}
}
