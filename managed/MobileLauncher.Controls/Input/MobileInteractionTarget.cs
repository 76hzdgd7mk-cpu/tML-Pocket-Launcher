using Microsoft.Xna.Framework;
using Terraria;
using Terraria.DataStructures;
using Terraria.ID;
using Terraria.ModLoader;

namespace MobileJoystick;

// Preview and native interaction share the logical aim, never the finger over a control.
internal static class MobileInteractionTarget
{
	private static Point tilePoint;
	private static int tileType = -1, itemType;
	internal static bool HasAim => MobileJoystickInput.EnabledThisFrame && MobileJoystickInput.HasTouchAimPosition
		&& !Main.gameMenu && !Main.playerInventory && !Main.mapFullscreen && Main.LocalPlayer.talkNPC < 0
		&& !MobileChatSystem.IsOpen && !Main.ingameOptionsWindow && !Main.inFancyUI;

	internal static NPC NativeNpcTarget()
	{
		int index = Main.HasSmartInteractTarget ? Main.SmartInteractNPC : -1;
		if (index < 0 && Main.HoveringOverAnNPC) index = Main.instance.mouseNPCIndex;
		return index >= 0 && index < Main.maxNPCs && Main.npc[index] is { active: true } npc ? npc : null;
	}

	internal static Vector2? NativeTapTarget()
	{
		if (NativeNpcTarget() is NPC npc) return NpcHoverBounds(npc).Center.ToVector2();
		Point tile;
		if (Main.HasSmartInteractTarget && Main.SmartInteractX >= 0 && Main.SmartInteractY >= 0)
			tile = new Point(Main.SmartInteractX, Main.SmartInteractY);
		else if (Main.LocalPlayer.cursorItemIconEnabled)
			tile = new Point(Player.tileTargetX, Player.tileTargetY);
		else return null;
		return WorldGen.InWorld(tile.X, tile.Y, 10) && Main.tile[tile.X, tile.Y].HasTile
			&& Main.LocalPlayer.IsInTileInteractionRange(tile.X, tile.Y, TileReachCheckSettings.Simple)
			? new Vector2(tile.X * 16 + 8, tile.Y * 16 + 8) : null;
	}

	private static Rectangle NpcHoverBounds(NPC npc)
	{
		Vector2 bottom = npc.Bottom + npc.netOffset;
		Rectangle bounds = new((int)bottom.X - npc.frame.Width / 2, (int)bottom.Y - npc.frame.Height, npc.frame.Width, npc.frame.Height);
		NPCLoader.ModifyHoverBoundingBox(npc, ref bounds);
		return bounds;
	}

	internal static NPC NpcAt(Vector2 world)
	{
		Player player = Main.LocalPlayer;
		if (player.dead || player.ownedProjectileCounts[ProjectileID.WireKite] > 0) return null;
		Rectangle reach = new((int)(player.Center.X - Player.tileRangeX * 16),
			(int)(player.Center.Y - Player.tileRangeY * 16), Player.tileRangeX * 32, Player.tileRangeY * 32);
		foreach (NPC npc in Main.ActiveNPCs) {
			if (!npc.ShowNameOnHover || npc.shimmerTransparency != 0f && !npc.CanApplyHunterPotionEffects()) continue;
			bool canChat = NPCLoader.CanChat(npc) ?? (npc.townNPC || npc.type is 105 or 106 or 123 or 354 or 376 or 579 or 453 or 589);
			if (!canChat || !reach.Intersects(npc.Hitbox)) continue;
			if (NpcHoverBounds(npc).Contains(world.ToPoint()) && NPCLoader.PreHoverInteract(npc, true)) return npc;
		}
		return null;
	}

	internal static void CaptureTile(Player player, Point point)
	{
		Reset();
		if (!WorldGen.InWorld(point.X, point.Y, 10) || !Main.tile[point.X, point.Y].HasTile
			|| !player.IsInTileInteractionRange(point.X, point.Y, TileReachCheckSettings.Simple)) return;
		tilePoint = point;
		tileType = Main.tile[point.X, point.Y].TileType;
		// Includes ModTile/GlobalTile.MouseOver icons from the single native interaction pass.
		itemType = player.cursorItemIconEnabled ? player.cursorItemIconID : 0;
	}

	internal static int ItemAtAim()
	{
		if (!HasAim) return 0;
		Point point = MobileWorldInteraction.ToWorld(MobileJoystickInput.TouchAimPosition).ToTileCoordinates();
		if (!WorldGen.InWorld(point.X, point.Y, 10) || !Main.tile[point.X, point.Y].HasTile
			|| !Main.LocalPlayer.IsInTileInteractionRange(point.X, point.Y, TileReachCheckSettings.Simple)) return 0;
		Tile tile = Main.tile[point.X, point.Y];
		if (point == tilePoint && tile.TileType == tileType && itemType > 0) return itemType;
		// Switches have no native cursor item; give them the same contextual preview.
		return tile.TileType switch { TileID.Switches => ItemID.Switch, TileID.Lever => ItemID.Lever, _ => 0 };
	}

	internal static void Reset() { tileType = -1; itemType = 0; }
}
