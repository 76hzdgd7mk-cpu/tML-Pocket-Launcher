using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input.Touch;
using Terraria;
using Terraria.ModLoader;

namespace MobileJoystick;

public sealed class MobileCalamityMechInput : MobileSystem
{
	private const int NoContact = int.MinValue;
	private static int mechType, panelType;
	private static int contactId = NoContact;
	private static Projectile pendingPanel;
	private static int pendingIdentity;
	private static Vector2 pendingOffset;

	internal static bool HasActiveMech => mechType > 0 && Main.LocalPlayer.ownedProjectileCounts[mechType] > 0;

	public override void PostSetupContent()
	{
		if (Main.dedServ) return;
		if (ModContent.TryFind("CalamityMod", "GiantIbanRobotOfDoom", out ModProjectile mech)) mechType = mech.Type;
		if (ModContent.TryFind("CalamityMod", "AndromedaUI_Background", out ModProjectile panel)) {
			panelType = panel.Type;
			On_Main.DrawProj += DrawPanel;
		}
	}

	public override void Unload()
	{
		if (panelType > 0) On_Main.DrawProj -= DrawPanel;
		Reset();
		mechType = panelType = 0;
	}

	internal static void Reset()
	{
		pendingPanel = null;
		contactId = NoContact;
	}

	private static bool IsLocalPanel(Projectile panel) => panel.active && panel.type == panelType && panel.owner == Main.myPlayer;

	internal static bool ReadInput(List<MobileTouchContact> contacts)
	{
		if (panelType <= 0 || Main.playerInventory || Main.mapFullscreen || MobileChatSystem.IsOpen) {
			Reset();
			return false;
		}
		if (pendingPanel != null && (!IsLocalPanel(pendingPanel) || pendingPanel.identity != pendingIdentity)) pendingPanel = null;
		if (contactId != NoContact) {
			int index = contacts.FindIndex(contact => contact.Id == contactId);
			if (index >= 0) {
				if (contacts[index].IsReleased) contactId = NoContact;
				contacts.RemoveAt(index);
				return true;
			}
			contactId = NoContact;
		}
		if (Main.LocalPlayer.ownedProjectileCounts[panelType] == 0 || pendingPanel != null) return false;

		for (int index = 0; index < contacts.Count; index++) {
			MobileTouchContact touch = contacts[index];
			if (touch.Id < 0 || touch.State != TouchLocationState.Pressed) continue;
			Vector2 world = MobileWorldInteraction.ToWorld(touch.Position);
			foreach (Projectile panel in Main.ActiveProjectiles) {
				if (!IsLocalPanel(panel)) continue;
				Rectangle bounds = panel.Hitbox;
				bounds.Inflate(10, 10);
				if (!bounds.Contains(world.ToPoint())) continue;
				contactId = touch.Id;
				pendingPanel = panel;
				pendingIdentity = panel.identity;
				pendingOffset = world - panel.Center;
				contacts.RemoveAt(index);
				return true;
			}
		}
		return false;
	}

	private static void DrawPanel(On_Main.orig_DrawProj orig, Main self, int index)
	{
		Projectile panel = pendingPanel;
		if (panel == null || panel.whoAmI != index) { orig(self, index); return; }
		pendingPanel = null;
		if (!Main.hasFocus || Main.playerInventory || Main.mapFullscreen
			|| !ReferenceEquals(panel, Main.projectile[index]) || !IsLocalPanel(panel) || panel.identity != pendingIdentity) {
			orig(self, index);
			return;
		}

		Vector2 offset = panel.Center + pendingOffset - Main.screenPosition;
		int previousX = Main.mouseX, previousY = Main.mouseY;
		bool previousLeft = Main.mouseLeft, previousRelease = Main.mouseLeftRelease;
		bool previousBlock = Main.blockMouse;
		try {
			Main.mouseX = (int)offset.X;
			Main.mouseY = (int)(Main.LocalPlayer.gravDir == -1f ? Main.screenHeight - offset.Y : offset.Y);
			Main.mouseLeft = Main.mouseLeftRelease = Main.blockMouse = true;
			orig(self, index);
		}
		finally {
			Main.mouseX = previousX;
			Main.mouseY = previousY;
			Main.mouseLeft = previousLeft;
			Main.mouseLeftRelease = previousRelease;
			Main.blockMouse = previousBlock;
		}
	}
}
