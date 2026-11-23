using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.ID;

namespace MobileJoystick;

// Shared by gameplay controls, custom layout previews and radial action menus.
// Pack sprites replace individual artwork layers; game items remain dynamic.
internal static class MobileControlArtwork
{
	internal static string AimKnobTexture => MobileJoystickInput.AimAndUseMode && MobileJoystickInput.GetHeldItem() is { IsAir: false }
		? "AttackAimUse" : "AttackAimOnly";

	internal static Item GetActionItem(MobileControlAction action)
	{
		if (Main.myPlayer < 0 || Main.myPlayer >= Main.maxPlayers) return null;
		Player player = Main.LocalPlayer;
		return action switch {
			MobileControlAction.UseItem => player.HeldItem,
			MobileControlAction.Interact => MobileJoystickInput.GetPriorityRightClickOrHeldItem(),
			MobileControlAction.Grapple => player.QuickGrapple_GetItemToUse(),
			MobileControlAction.Mount or MobileControlAction.QuickMount => player.miscEquips[3],
			MobileControlAction.Heal => FindConsumable(player, false),
			MobileControlAction.Mana => FindConsumable(player, true),
			_ => null
		};
	}

	private static Item FindConsumable(Player player, bool mana)
	{
		Item best = null;
		foreach (Item item in player.inventory) {
			if (item == null || item.IsAir) continue;
			int value = mana ? item.healMana : item.healLife;
			if (value > 0 && (best == null || value > (mana ? best.healMana : best.healLife))) best = item;
		}
		return best;
	}

	internal static bool DrawButton(SpriteBatch batch, MobileControlAction action, Vector2 center,
		float radius, Color color, bool highlighted = false, Item itemOverride = null, string textureName = null)
	{
		string defaultTexture = MobileJoystickLayout.GetDefaultTexture(action);
		bool custom = !UsesDefaultTexture(textureName, defaultTexture) && textureName != "HeldItem";
		ControlTextureEntry entry = custom ? ControlTexturePackSystem.FindTexture(textureName) : null;
		bool gamePotionArtwork = action is MobileControlAction.Heal or MobileControlAction.Mana
			or MobileControlAction.Buff or MobileControlAction.QuickPotions;
		if (action == MobileControlAction.QuickPotions) {
			DrawQuickPotions(batch, center, radius, color);
			return true;
		}
		// A chosen complete sprite owns the button. Surface selections replace only
		// its base, keeping the live item or action glyph above it.
		if (!gamePotionArtwork && entry != null && entry.Category != "surface"
			&& ControlTexturePackSystem.TryDraw(batch, textureName, center, radius * 2f, color)) return true;
		string background = entry?.Category == "surface" ? textureName : GetButtonBackground(action);
		if (background == null) {
			NativeControlTheme.Legacy(batch, defaultTexture, center, radius * 2f, highlighted ? Color.White : color);
			return true;
		}
		if (entry?.Category != "surface" || !ControlTexturePackSystem.TryDraw(batch, background, center, radius * 2f, highlighted ? Color.White : color))
			NativeControlTheme.Legacy(batch, highlighted && entry == null ? "PhonePressedCircle" : background,
				center, radius * 2f, highlighted ? Color.White : color);
		Item item = itemOverride ?? GetActionItem(action);
		if (action == MobileControlAction.Interact && MobileInteractionArtwork.DrawTarget(batch, center, radius * 1.35f, color)) return true;
		if (item is { IsAir: false })
			MobileJoystickSystem.DrawItemIcon(batch, item, center, radius * 1.35f, color);
		else if (action is MobileControlAction.Heal or MobileControlAction.Mana or MobileControlAction.Buff)
			DrawPotionItemIcon(batch, action, center, radius * 1.35f, color);
		else DrawActionIcon(batch, action, center, radius * 1.35f, color);
		return true;
	}

	internal static int PotionItemType(MobileControlAction action) => action switch {
		MobileControlAction.Heal => ItemID.LesserHealingPotion,
		MobileControlAction.Mana => ItemID.LesserManaPotion,
		MobileControlAction.Buff => ItemID.WrathPotion,
		_ => 0
	};

	internal static void DrawPotionItemIcon(SpriteBatch batch, MobileControlAction action, Vector2 center, float size, Color color)
	{
		Item available = action is MobileControlAction.Heal or MobileControlAction.Mana ? GetActionItem(action) : null;
		DrawItemTypeIcon(batch, available is { IsAir: false } ? available.type : PotionItemType(action), center, size, color);
	}

	internal static void DrawQuickPotions(SpriteBatch batch, Vector2 center, float radius, Color color)
	{
		NativeControlTheme.Legacy(batch, "PhoneTealCircle", center, radius * 2f, color);
		float diameter = radius * 2f;
		float iconSize = diameter * (20f / 64f);
		DrawPotionItemIcon(batch, MobileControlAction.Heal, center + new Vector2(0f, -16f) * (diameter / 64f), iconSize, color);
		DrawPotionItemIcon(batch, MobileControlAction.Mana, center + new Vector2(16f, 0f) * (diameter / 64f), iconSize, color);
		DrawPotionItemIcon(batch, MobileControlAction.Buff, center + new Vector2(0f, 16f) * (diameter / 64f), iconSize, color);
	}

	private static void DrawItemTypeIcon(SpriteBatch batch, int itemType, Vector2 center, float maxSize, Color color)
	{
		if (itemType <= 0) return;
		Main.instance.LoadItem(itemType);
		Texture2D texture = TextureAssets.Item[itemType].Value;
		Rectangle frame = Main.itemAnimations[itemType]?.GetFrame(texture) ?? texture.Frame();
		batch.Draw(texture, center, frame, color, 0f, frame.Size() * .5f,
			maxSize / Math.Max(frame.Width, frame.Height), SpriteEffects.None, 0f);
	}

	internal static bool UsesDefaultTexture(string selected, string defaultTexture)
	{
		if (string.IsNullOrWhiteSpace(selected) || selected == defaultTexture) return true;
		ControlTextureEntry entry = ControlTexturePackSystem.FindTexture(selected);
		return entry != null && entry.Id == ControlTexturePackSystem.FindTexture(defaultTexture)?.Id;
	}

	internal static string GetButtonBackground(MobileControlAction action) => action switch {
		MobileControlAction.Jump or MobileControlAction.AimModeToggle or MobileControlAction.TargetLockToggle
			or MobileControlAction.SmartCursor or MobileControlAction.ToggleGameControls => "PhoneTealCircle",
		MobileControlAction.Grapple or MobileControlAction.Mount or MobileControlAction.QuickMount => "PhoneGreenCircle",
		MobileControlAction.Interact or MobileControlAction.UseItem or MobileControlAction.Heal
			or MobileControlAction.Mana or MobileControlAction.Buff or MobileControlAction.Unbound
			or MobileControlAction.SmartInteract or MobileControlAction.SwapUseInteract or MobileControlAction.RadialMenu => "PhonePurpleCircle",
		_ => null
	};

	internal static string GetActionGlyph(MobileControlAction action) => action switch {
		MobileControlAction.Jump => "PhoneJumpGlyph",
		MobileControlAction.Grapple => "PhoneEmptyGrappleGlyph",
		MobileControlAction.Mount or MobileControlAction.QuickMount => "PhoneMountGlyph",
		MobileControlAction.AimModeToggle => MobileJoystickInput.AimRightClickMode ? "PhoneInteractGlyph"
			: MobileJoystickInput.AimAndUseMode ? "PhoneAimModeGlyph" : "PhoneAimCross",
		MobileControlAction.TargetLockToggle => "PhoneTargetGlyph",
		MobileControlAction.SmartCursor => MobileJoystickInput.SmartCursorEnabled ? "PhoneSmartCursorOnGlyph" : "PhoneSmartCursorGlyph",
		MobileControlAction.Heal => "Heal",
		MobileControlAction.Mana => "Mana",
		MobileControlAction.Buff => "Buff",
		MobileControlAction.SmartInteract => "PhoneSmartInteractGlyph",
		MobileControlAction.SwapUseInteract => "PhoneSwapGlyph",
		MobileControlAction.Interact => "PhoneInteractGlyph",
		MobileControlAction.UseItem => "PhoneUseGlyph",
		MobileControlAction.AutoSelect => "PhoneAutoSelectGlyph",
		MobileControlAction.CycleUseProfile => "PhoneUseProfileGlyph",
		MobileControlAction.Unbound => "PhoneUnboundGlyph",
		MobileControlAction.RadialMenu => "PhoneRadialGlyph",
		MobileControlAction.ZoomIn => "PhoneZoomInGlyph",
		MobileControlAction.ZoomOut => "PhoneZoomOutGlyph",
		MobileControlAction.Inventory => "PhoneInventoryGlyph",
		MobileControlAction.Loadout1 or MobileControlAction.Loadout2 or MobileControlAction.Loadout3
			or MobileControlAction.SwitchLoadout => "PhoneLoadoutGlyph",
		MobileControlAction.Zoom => "ZoomPair",
		MobileControlAction.Chat => "Chat",
		MobileControlAction.Map => "Map",
		MobileControlAction.MapStyle or MobileControlAction.MapAlphaCycle => "MapStyle",
		MobileControlAction.Settings or MobileControlAction.ToggleGameControls => "PhoneMenuGlyph",
		_ => null
	};

	internal static bool DrawActionIcon(SpriteBatch batch, MobileControlAction action, Vector2 center, float size, Color color)
	{
		if (action is MobileControlAction.Heal or MobileControlAction.Mana or MobileControlAction.Buff) {
			DrawPotionItemIcon(batch, action, center, size, color);
			return true;
		}
		if (ControlTexturePackSystem.TryDrawDefault(batch, GetActionGlyph(action), center, size, color)) return true;
		int item = action switch {
			MobileControlAction.Heal => ItemID.LesserHealingPotion,
			MobileControlAction.Mana => ItemID.LesserManaPotion,
			MobileControlAction.Buff => ItemID.WrathPotion,
			MobileControlAction.Grapple => ItemID.GrapplingHook,
			MobileControlAction.Mount or MobileControlAction.QuickMount => ItemID.SlimySaddle,
			MobileControlAction.Settings => ItemID.Wrench,
			MobileControlAction.UseItem => ItemID.WoodenSword,
			MobileControlAction.AutoSelect => ItemID.Torch,
			_ => 0
		};
		if (item > 0) {
			Main.instance.LoadItem(item);
			Texture2D texture = TextureAssets.Item[item].Value;
			Rectangle frame = Main.itemAnimations[item]?.GetFrame(texture) ?? texture.Bounds;
			batch.Draw(texture,center,frame,color,0f,frame.Size()*.5f,
				size/Math.Max(frame.Width,frame.Height),SpriteEffects.None,0f);
			return true;
		}
		return false;
	}

	internal static void DrawRadialFrame(SpriteBatch batch, Vector2 center, float radius, Color color)
		=> NativeControlTheme.Radial(batch,center,radius,color);
}
