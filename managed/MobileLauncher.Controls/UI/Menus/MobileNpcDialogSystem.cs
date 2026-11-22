using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using ReLogic.Graphics;
using Terraria;
using Terraria.GameContent;
using Terraria.GameInput;
using Terraria.ID;
using Terraria.ModLoader;

namespace MobileJoystick;

internal sealed class MobileNpcDialogSystem : MobileSystem
{
	private string primaryText = "", secondaryText = "";
	private int pendingAction = -1;
	private bool drawingNative;
	private readonly RasterizerState raster = new() { ScissorTestEnable = true, CullMode = CullMode.None };
	private bool down, previousDown, released;
	private int touchId = -1;
	private Vector2 pointer, pressPosition;
	private Rectangle panel, primary, secondary, close, happiness;
	private float scale;

	private static string T(string key) => MobileSettingsCatalog.Text(key);
	internal static bool IsTalking => UiTextureAssets.Available && MobileJoystickConfig.Instance?.EnableMobileControls == true
		&& !Main.gameMenu && !Main.playerInventory && !Main.editSign && !Main.editChest
		&& Main.LocalPlayer.talkNPC >= 0 && Main.LocalPlayer.talkNPC < Main.maxNPCs
		&& !string.IsNullOrEmpty(Main.npcChatText);

	public override void Load()
	{
		if (Main.dedServ) return;
		On_Main.GUIChatDrawInner += DrawDialog;
		On_Main.DrawNPCChatButtons += NativeButtons;
	}
	public override void Unload()
	{
		if (!Main.dedServ) {
			On_Main.GUIChatDrawInner -= DrawDialog;
			On_Main.DrawNPCChatButtons -= NativeButtons;
		}
		raster.Dispose();
	}

	public override void PostUpdateInput()
	{
		if (!IsTalking) { down = previousDown = released = false; touchId = -1; pendingAction = -1; return; }
		ReadPointer();
	}

	private void ReadPointer()
	{
		down = MobileTouchInput.ReadUiPointer(ref touchId, ref pointer, out bool cancelled);
		if (cancelled) { down = previousDown = released = false; pendingAction = -1; return; }
		released |= !down && previousDown;
		if (down && !previousDown) pressPosition = pointer;
		previousDown = down;
	}

	// Keep native labels and dispatch, including every ModNPC/GlobalNPC hook.
	// Native drawing is clipped; our mobile panel replaces only its presentation.
	private void DrawDialog(On_Main.orig_GUIChatDrawInner orig, Main self)
	{
		if (!IsTalking) { orig(self); return; }
		BuildLayout();
		if (released) {
			if (Hit(close)) pendingAction = 0;
			else if (!string.IsNullOrEmpty(primaryText) && Hit(primary)) pendingAction = 1;
			else if (!string.IsNullOrEmpty(secondaryText) && Hit(secondary)) pendingAction = 2;
			else if (happiness.Width > 0 && Hit(happiness)) pendingAction = 3;
		}
		int x = Main.mouseX, y = Main.mouseY;
		bool left = Main.mouseLeft, release = Main.mouseLeftRelease;
		Rectangle scissor = Main.instance.GraphicsDevice.ScissorRectangle;
		Main.spriteBatch.End();
		Main.spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend, SamplerState.LinearClamp,
			DepthStencilState.None, raster, null, Main.UIScaleMatrix);
		Main.instance.GraphicsDevice.ScissorRectangle = Rectangle.Empty;
		drawingNative = true;
		try {
			Main.mouseLeft = Main.mouseLeftRelease = false;
			orig(self);
		}
		finally {
			drawingNative = false;
			pendingAction = -1;
			Main.mouseX = x; Main.mouseY = y;
			Main.mouseLeft = left; Main.mouseLeftRelease = release;
			Main.spriteBatch.End();
			Main.instance.GraphicsDevice.ScissorRectangle = scissor;
			Main.spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend, SamplerState.LinearClamp,
				DepthStencilState.None, RasterizerState.CullCounterClockwise, null, Main.UIScaleMatrix);
		}
		DrawLayer();
		released = false;
	}

	private bool Hit(Rectangle bounds) => bounds.Contains(pointer.ToPoint()) && bounds.Contains(pressPosition.ToPoint());

	private void NativeButtons(On_Main.orig_DrawNPCChatButtons orig, int color, Color chatColor, int lines, string first, string second)
	{
		if (!drawingNative) { orig(color, chatColor, lines, first, second); return; }
		primaryText = first;
		secondaryText = second;
		Main.npcChatFocus1 = pendingAction == 0;
		Main.npcChatFocus2 = pendingAction == 1 && !string.IsNullOrEmpty(first);
		Main.npcChatFocus3 = pendingAction == 2 && !string.IsNullOrEmpty(second);
		Main.npcChatFocus4 = pendingAction == 3;
		// The native dispatcher also checks its dialogue rectangle.
		Main.mouseX = Main.screenWidth / 2;
		Main.mouseY = 110;
		Main.mouseLeft = Main.mouseLeftRelease = pendingAction >= 0;
	}

	private bool DrawLayer()
	{
		if (!IsTalking) return true;
		BuildLayout();
		Main.LocalPlayer.mouseInterface = true;
		Main.LocalPlayer.controlUseItem = false;
		Main.LocalPlayer.controlUseTile = false;
		Main.spriteBatch.End();
		Main.spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend, SamplerState.PointClamp, DepthStencilState.None, raster);
		try {
			Nine("Panel", panel, Color.White);
			NPC npc = Main.npc[Main.LocalPlayer.talkNPC];
			DrawNpcHead(npc);
			Label(npc.GivenOrTypeName, new Rectangle(panel.X + (int)(120 * scale), panel.Y + (int)(8 * scale), panel.Width - (int)(132 * scale), (int)(30 * scale)), 1.05f, false);
			var body = new Rectangle(panel.X + (int)(120 * scale), panel.Y + (int)(42 * scale), panel.Width - (int)(132 * scale), panel.Height - (int)(118 * scale));
			Nine("PauseButton", body, new Color(150, 160, 200, 190));
			DrawText(Main.npcChatText, new Rectangle(body.X + (int)(8 * scale), body.Y + (int)(5 * scale), body.Width - (int)(16 * scale), body.Height - (int)(10 * scale)));
			if (!string.IsNullOrEmpty(primaryText)) ActionButton(primaryText, primary, npc, false);
			if (!string.IsNullOrEmpty(secondaryText)) ActionButton(secondaryText, secondary, npc, true);
			Button("", close);
			DrawIcon(UiTextureAssets.Request("MobileJoystick/Assets/MobileHud/Close", AssetRequestMode.ImmediateLoad).Value, close);
			if (happiness.Width > 0) { Button("", happiness); DrawIcon(TextureAssets.EmoteMenuButton.Value, happiness, TextureAssets.EmoteMenuButton.Value.Frame(2, 1, 0)); }
		}
		finally {
			Main.spriteBatch.End();
			Main.spriteBatch.Begin(SpriteSortMode.Deferred, BlendState.AlphaBlend, SamplerState.LinearClamp, DepthStencilState.None, RasterizerState.CullCounterClockwise, null, Main.UIScaleMatrix);
		}
		return true;
	}

	private void BuildLayout()
	{
		scale = Math.Min(PlayerInput.RealScreenWidth / 1280f, PlayerInput.RealScreenHeight / 576f);
		int width = Math.Min((int)(550 * scale), (int)(PlayerInput.RealScreenWidth * .72f));
		int textLines = Math.Max(1, (int)Math.Ceiling(FontAssets.MouseText.Value.MeasureString(Main.npcChatText).X * .85f * scale / Math.Max(1, width - 148 * scale)));
		int height = (int)((184 + Math.Min(4, Math.Max(0, textLines - 2)) * 23) * scale);
		panel = new((PlayerInput.RealScreenWidth - width) / 2, Math.Max((int)(8 * scale), (PlayerInput.RealScreenHeight - height) / 2 - (int)(60 * scale)), width, height);
		int buttonHeight = (int)(44 * scale);
		int gap = (int)(8 * scale), y = panel.Bottom - buttonHeight - (int)(12 * scale);
		close = new(panel.X + (int)(12 * scale), y, buttonHeight, buttonHeight);
		happiness = string.IsNullOrEmpty(Main.LocalPlayer.currentShoppingSettings.HappinessReport)
			? Rectangle.Empty : new(close.Right + gap, y, buttonHeight, buttonHeight);
		int actionsLeft = panel.X + (int)(124 * scale);
		int buttonWidth = (panel.Right - (int)(12 * scale) - actionsLeft - gap) / 2;
		primary = string.IsNullOrEmpty(primaryText) ? Rectangle.Empty : new(panel.Right - (int)(12 * scale) - buttonWidth, y, buttonWidth, buttonHeight);
		secondary = string.IsNullOrEmpty(secondaryText) ? Rectangle.Empty : new(actionsLeft, y, buttonWidth, buttonHeight);
	}

	private void DrawNpcHead(NPC npc)
	{
		var bounds = new Rectangle(panel.X + (int)(12 * scale), panel.Y + (int)(12 * scale), (int)(96 * scale), (int)(96 * scale));
		Nine("PauseButton", bounds, Color.White * .7f);
		MobileInteractionArtwork.DrawNpc(Main.spriteBatch, npc, bounds.Center.ToVector2(), 86 * scale, Color.White);
	}

	private void DrawText(string text, Rectangle bounds)
	{
		string[] words = text.Replace("\r", "").Split('\n');
		int line = 0; string current = "";
		foreach (string word in words) {
			foreach (char c in word) {
				string candidate = current + c;
				if (FontAssets.MouseText.Value.MeasureString(candidate).X * .85f * scale > bounds.Width && current.Length > 0) {
					if (bounds.Y + (line + 1) * (int)(23 * scale) > bounds.Bottom) return;
					Label(current, new Rectangle(bounds.X, bounds.Y + line * (int)(23 * scale), bounds.Width, (int)(24 * scale)), .85f, false, new Color(235, 240, 255));
					line++; current = c.ToString();
				}
				else current = candidate;
			}
			Label(current, new Rectangle(bounds.X, bounds.Y + line * (int)(23 * scale), bounds.Width, (int)(24 * scale)), .85f, false, new Color(235, 240, 255));
			line++; current = "";
			if (bounds.Y + line * (int)(23 * scale) > bounds.Bottom - (int)(24 * scale)) break;
		}
	}

	private void Button(string text, Rectangle bounds)
	{
		Nine("PauseButton", bounds, bounds.Contains(pointer.ToPoint()) ? Color.White : new Color(210, 218, 242));
		Label(text, bounds, .72f);
	}

	private void DrawIcon(Texture2D texture, Rectangle bounds, Rectangle? source = null)
	{
		Rectangle frame = source ?? texture.Bounds;
		float fit = Math.Min(bounds.Width, bounds.Height) * .72f / Math.Max(frame.Width, frame.Height);
		Main.spriteBatch.Draw(texture, bounds.Center.ToVector2(), frame, Color.White, 0, frame.Size() * .5f, fit, SpriteEffects.None, 0);
	}

	private void ActionButton(string text, Rectangle bounds, NPC npc, bool second)
	{
		Button("", bounds);
		Vector2 center = new(bounds.Left + bounds.Height * .5f, bounds.Center.Y);
		if (npc.type == NPCID.Guide && !second) NativeControlTheme.Glyph(Main.spriteBatch, "Help", center, bounds.Height * .8f, Color.Gold);
		else MobileJoystickSystem.DrawItemIcon(Main.spriteBatch,
			ContentSamples.ItemsByType[npc.type == NPCID.Guide || npc.type == NPCID.GoblinTinkerer && second ? ItemID.WoodenHammer : ItemID.PiggyBank],
			center, bounds.Height * .8f, Color.White);
		Label(text, new Rectangle(bounds.Left + bounds.Height, bounds.Y, bounds.Width - bounds.Height, bounds.Height), .95f);
	}

	private static Texture2D Texture(string name) => UiTextureAssets.Request($"MobileJoystick/Assets/MobileMenu/{name}", AssetRequestMode.ImmediateLoad).Value;
	private void Nine(string name, Rectangle destination, Color tint)
	{
		Texture2D texture = Texture(name); int src = Math.Min(12, Math.Min(texture.Width, texture.Height) / 2); int border = Math.Min(Math.Max(1, (int)(src * scale * .65f)), Math.Min(destination.Width, destination.Height) / 2);
		int[] sx = { 0, src, texture.Width - src, texture.Width }, sy = { 0, src, texture.Height - src, texture.Height };
		int[] dx = { destination.Left, destination.Left + border, destination.Right - border, destination.Right }, dy = { destination.Top, destination.Top + border, destination.Bottom - border, destination.Bottom };
		for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) if (dx[x + 1] > dx[x] && dy[y + 1] > dy[y])
			Main.spriteBatch.Draw(texture, new Rectangle(dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]), new Rectangle(sx[x], sy[y], sx[x + 1] - sx[x], sy[y + 1] - sy[y]), tint);
	}
	private void Label(string text, Rectangle bounds, float size, bool center = true, Color? color = null)
	{
		DynamicSpriteFont font = FontAssets.MouseText.Value;
		float textScale = Math.Min(size * scale, (bounds.Width - 8 * scale) / Math.Max(1, font.MeasureString(text).X));
		Vector2 position = center ? new(bounds.Center.X - font.MeasureString(text).X * textScale / 2f, bounds.Center.Y - font.LineSpacing * textScale / 2f) : new(bounds.X, bounds.Center.Y - font.LineSpacing * textScale / 2f);
		Utils.DrawBorderStringFourWay(Main.spriteBatch, font, text, position.X, position.Y, color ?? Color.White, Color.Black, Vector2.Zero, textScale);
	}
}
