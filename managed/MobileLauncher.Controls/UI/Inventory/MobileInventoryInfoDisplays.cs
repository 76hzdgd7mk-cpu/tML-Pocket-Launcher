using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.ModLoader;

namespace MobileJoystick;

public partial class MobileInventorySystem
{
	private static readonly FieldInfo InfoDisplaysField = typeof(InfoDisplayLoader).GetField("InfoDisplays", BindingFlags.Static | BindingFlags.NonPublic);
	private int infoPage;
	private void DrawInfoToggles()
	{
		if (InfoDisplaysField?.GetValue(null) is not IEnumerable<InfoDisplay> displays) return;
		var active = displays.Where(InfoDisplayLoader.Active).ToList();
		const int pageSize = 12;
		int pages = System.Math.Max(1, (active.Count + pageSize - 1) / pageSize);
		infoPage = System.Math.Clamp(infoPage, 0, pages - 1);
		int count = System.Math.Min(pageSize, active.Count - infoPage * pageSize);
		for (int i = 0; i < count; i++) {
			InfoDisplay info = active[infoPage * pageSize + i];
			Rectangle r = layout.InfoToggle(i, count + (pages > 1 ? 1 : 0));
			bool hidden = Main.LocalPlayer.hideInfo[info.Type];
			Texture2D icon = ModContent.Request<Texture2D>(info.Texture).Value;
			InventorySurface(r, "Tool", Color.White * .65f);
			float size = System.Math.Min(r.Width, r.Height) * .72f / System.Math.Max(icon.Width, icon.Height);
			Main.spriteBatch.Draw(icon, r.Center.ToVector2(), null, hidden ? Color.Gray : Color.White, 0, icon.Size() / 2, size, SpriteEffects.None, 0);
			Tooltip(r, info.DisplayName.Value + (hidden ? T("HiddenSuffix") : T("ShownSuffix")));
			if (Click(r)) Main.LocalPlayer.hideInfo[info.Type] = !hidden;
		}
		if (pages > 1 && TextButton(layout.InfoToggle(count, count + 1), ">")) infoPage = (infoPage + 1) % pages;
	}
}
