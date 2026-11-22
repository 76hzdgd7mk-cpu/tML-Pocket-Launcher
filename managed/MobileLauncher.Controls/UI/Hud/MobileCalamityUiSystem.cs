using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input.Touch;
using MonoMod.RuntimeDetour;
using ReLogic.Content;
using Terraria;
using Terraria.GameInput;
using Terraria.ModLoader;

namespace MobileJoystick;

// Optional adapter: Calamity owns appearance and saved positions; touch owns its
// pointer capture so a second joystick finger cannot steal a meter drag.
public sealed class MobileCalamityUiSystem : MobileSystem
{
	internal const string DifficultyAdapterId = "CalamityMod.Difficulty";
	private const MobileInterfaceRegion DifficultyRegion = MobileInterfaceRegion.CalamityDifficulty;
	private const BindingFlags Flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
	private sealed record Meter(Type Ui, string Prefix, string Texture, int Frames, Func<bool> Visible, int TouchPadding);
	private static readonly List<Meter> meters = new();
	private readonly List<IDisposable> hooks = new();
	private static object config;
	private static Type configType;
	private static MethodInfo save;
	private static Func<Item, bool> isCalamityEnchanted;
	private static PropertyInfo currentDifficulty;
	private static Meter captured;
	private static int finger = -1, contactThisFrame = -1;
	private static bool layoutEditing, moved;
	private static Vector2 offset, lastPosition;
	internal static bool Available => config != null;
	internal static bool IsEnchantedItem(Item item) => isCalamityEnchanted?.Invoke(item) == true;
	internal static bool DifficultyAvailable { get; private set; }
	private static bool UseMobileDifficulty => MobileJoystickConfig.Instance?.EnableMobileControls == true;
	private static MobileInterfaceLayoutProfile DifficultyProfile => MobileMenuSystem.InterfaceLayoutDraft ?? MobileJoystickConfig.Instance?.InterfaceLayout;
	internal static Rectangle DifficultyBounds => MobileCalamityLayout.DifficultyBounds(PlayerInput.RealScreenWidth,
		PlayerInput.RealScreenHeight, Main.UIScale, DifficultyProfile?.Get(DifficultyRegion));
	internal static bool OwnsContact(int id) => id >= 0 && (id == finger || id == contactThisFrame);
	internal static bool Dragging => finger >= 0;
	internal static bool Locked {
		get => !Available || (bool)configType.GetProperty("MeterPosLock").GetValue(config);
		set { if (Available) { configType.GetProperty("MeterPosLock").SetValue(config, value); Save(); } }
	}
	private static object Member(object instance, string name) => instance?.GetType().GetProperty(name, Flags)?.GetValue(instance)
		?? instance?.GetType().GetField(name, Flags)?.GetValue(instance);
	private static object CalamityPlayer { get {
		var players = Main.LocalPlayer.ModPlayers;
		for (int i = 0; i < players.Length; i++) {
			var player = players[i];
			if (player.GetType().FullName == "CalamityMod.CalPlayer.CalamityPlayer") return player;
		}
		return null;
	} }
	private static bool PlayerFlag(string name) => Member(CalamityPlayer, name) is true;
	private static bool ConfigFlag(string name) => Member(config, name) is true;
	private static bool ChargedItem() {
		foreach (var global in Main.LocalPlayer.HeldItem.Globals)
			if (global.GetType().FullName == "CalamityMod.Items.CalamityGlobalItem") return Member(global, "UsesCharge") is true;
		return false;
	}
	public override void PostSetupContent()
	{
		if (Main.dedServ || !ModLoader.TryGetMod("CalamityMod", out Mod calamity)) return;
		if (calamity.Code.GetType("CalamityMod.CalamityUtils")?.GetMethod("IsEnchanted", Flags, null, new[] { typeof(Item) }, null)
			is { IsStatic: true } isEnchanted && isEnchanted.ReturnType == typeof(bool))
			isCalamityEnchanted = isEnchanted.CreateDelegate<Func<Item, bool>>();
		RegisterDifficultyLayout(calamity.Code);
		configType = calamity.Code.GetType("CalamityMod.CalamityClientConfig");
		config = configType?.GetProperty("Instance", Flags)?.GetValue(null) ?? configType?.GetField("Instance", Flags)?.GetValue(null);
		if (config == null || configType.GetProperty("MeterPosLock") == null) { config = null; return; }
		save = calamity.Code.GetType("CalamityMod.CalamityMod")?.GetMethods(Flags).FirstOrDefault(m => m.Name == "SaveConfig" && m.GetParameters().Length == 1);
		void Add(string typeName, string prefix, string texture, int frames, Func<bool> visible, int touchPadding = 0) {
			Type type = calamity.Code.GetType(typeName);
			if (type?.GetMethod("Draw", Flags, null, new[] { typeof(SpriteBatch), typeof(Player) }, null) is { IsStatic: true }
				&& type.GetField(texture, Flags) != null && configType.GetProperty(prefix + "PosX") != null && configType.GetProperty(prefix + "PosY") != null)
				meters.Add(new(type, prefix, texture, frames, visible, touchPadding));
		}
		Add("CalamityMod.UI.Rippers.RipperUI", "RageMeter", "rageBorderTex", 1, () => PlayerFlag("RageEnabled"));
		Add("CalamityMod.UI.Rippers.RipperUI", "AdrenalineMeter", "adrenBorderTex", 12, () => PlayerFlag("AdrenalineEnabled"));
		Add("CalamityMod.UI.StealthUI", "StealthMeter", "edgeTexture", 1,
			() => ConfigFlag("StealthMeter") && PlayerFlag("wearingRogueArmor") && Convert.ToSingle(Member(CalamityPlayer, "rogueStealthMax") ?? 0f) > 0f);
		Add("CalamityMod.UI.DraedonsArsenal.ChargeMeterUI", "ChargeMeter", "edgeTexture", 1, () => ConfigFlag("ChargeMeter") && ChargedItem());
		Add("CalamityMod.UI.FlightBar", "FlightBar", "borderTexture", 1, FlightBarVisible, touchPadding: 12);
		RegisterLayoutAdapters();
		foreach (Type type in meters.Select(m => m.Ui).Distinct()) {
			MethodInfo draw = type.GetMethod("Draw", Flags, null, new[] { typeof(SpriteBatch), typeof(Player) }, null);
			if (draw != null) hooks.Add(new Hook(draw, (Action<Action<SpriteBatch, Player>, SpriteBatch, Player>)DrawMeter));
		}
	}
	private static bool FlightBarVisible()
	{
		Player player = Main.LocalPlayer;
		return ConfigFlag("FlightBar") && (player.wingsLogic > 0 && player.wingTimeMax > 0
			|| player.mount.Active && player.mount._data.flightTimeMax > 0 || player.carpet && !player.canCarpet);
	}
	private void RegisterDifficultyLayout(Assembly calamity)
	{
		Type indicator = calamity.GetType("CalamityMod.UI.ModeIndicator.ModeIndicatorUI");
		MethodInfo centerGetter = indicator?.GetProperty("DrawCenter", Flags)?.GetMethod;
		MethodInfo scaleGetter = indicator?.GetProperty("MainIconScale", Flags)?.GetMethod;
		MethodInfo draw = indicator?.GetMethod("Draw", Flags, null, new[] { typeof(SpriteBatch) }, null);
		if (centerGetter?.IsStatic != true || centerGetter.ReturnType != typeof(Vector2)
			|| scaleGetter?.IsStatic != true || scaleGetter.ReturnType != typeof(float) || draw?.IsStatic != true || draw.ReturnType != typeof(void)) return;
		currentDifficulty = calamity.GetType("CalamityMod.Systems.DifficultyModeSystem")?.GetProperty("GetCurrentDifficulty", Flags);
		hooks.Add(new Hook(centerGetter, (Func<Func<Vector2>, Vector2>)(orig => {
			Rectangle bounds = UseMobileDifficulty ? DifficultyBounds : Rectangle.Empty;
			return bounds.IsEmpty ? orig() : bounds.Center.ToVector2() / Main.UIScale;
		})));
		hooks.Add(new Hook(scaleGetter, (Func<Func<float>, float>)(orig => {
			Rectangle bounds = UseMobileDifficulty ? DifficultyBounds : Rectangle.Empty;
			return bounds.IsEmpty ? orig() : orig() * bounds.Width / (MobileCalamityLayout.DifficultyFrameSize * Main.UIScale);
		})));
		hooks.Add(new Hook(draw, (Action<Action<SpriteBatch>, SpriteBatch>)((orig, batch) => {
			if (!layoutEditing || !UseMobileDifficulty) orig(batch);
		})));
		DifficultyAvailable = true;
		ExternalUiLayoutRegistry.Register(DifficultyAdapterId, MobileSettingsCatalog.Text("CalamityDifficulty"),
			() => UseMobileDifficulty, () => DifficultyBounds, center => SetDifficultyLayout(center, DifficultyProfile?.Get(DifficultyRegion).Scale ?? 1f),
			() => DifficultyProfile?.Get(DifficultyRegion).Scale ?? 1f, scale => SetDifficultyLayout(DifficultyBounds.Center.ToVector2(), scale),
			() => { }, SetLayoutEditing, () => MobileMenuSystem.InterfaceLayoutDraft?.Reset(DifficultyRegion));
	}
	private static void SetDifficultyLayout(Vector2 center, float scale)
	{
		if (PlayerInput.RealScreenWidth <= 0 || PlayerInput.RealScreenHeight <= 0) return;
		MobileMenuSystem.InterfaceLayoutDraft?.Set(DifficultyRegion, new MobileInterfaceRegionLayout {
			CenterX = center.X / PlayerInput.RealScreenWidth, CenterY = center.Y / PlayerInput.RealScreenHeight, Scale = scale
		});
	}
	internal static void DrawDifficultyPreview(SpriteBatch batch, Rectangle bounds)
	{
		if (!bounds.IsEmpty && Member(currentDifficulty?.GetValue(null), "Texture") is Asset<Texture2D> texture)
			batch.Draw(texture.Value, bounds, Color.White);
	}
	private static void RegisterLayoutAdapters()
	{
		foreach (Meter meter in meters) {
			PropertyInfo scale = FindScaleProperty(meter);
			Func<float> getScale = scale == null ? null : () => Convert.ToSingle(scale.GetValue(config));
			Action<float> setScale = scale == null ? null : value => scale.SetValue(config, Convert.ChangeType(value, scale.PropertyType));
			string displayName = meter.Prefix switch {
				"RageMeter" => "Calamity · Rage",
				"AdrenalineMeter" => "Calamity · Adrenaline",
				"StealthMeter" => "Calamity · Stealth",
				"FlightBar" => MobileSettingsCatalog.Text("CalamityFlightBar"),
				_ => "Calamity · Charge"
			};
			ExternalUiLayoutRegistry.Register("CalamityMod." + meter.Prefix, displayName,
				meter.Visible, () => Bounds(meter), center => SetCenter(meter, center), getScale, setScale, Save, SetLayoutEditing);
		}
	}
	private static void SetLayoutEditing(bool editing) => layoutEditing = editing;
	private static PropertyInfo FindScaleProperty(Meter meter)
	{
		foreach (string suffix in new[] { "Scale", "ScaleFactor" }) {
			PropertyInfo property = configType.GetProperty(meter.Prefix + suffix, Flags);
			if (property?.CanRead == true && property.CanWrite && (property.PropertyType == typeof(float) || property.PropertyType == typeof(double))) return property;
		}
		return null;
	}
	private static void SetCenter(Meter meter, Vector2 center)
	{
		configType.GetProperty(meter.Prefix + "PosX").SetValue(config, center.X * 100f / PlayerInput.RealScreenWidth);
		configType.GetProperty(meter.Prefix + "PosY").SetValue(config, center.Y * 100f / PlayerInput.RealScreenHeight);
	}
	private static void DrawMeter(Action<SpriteBatch, Player> orig, SpriteBatch batch, Player player)
	{
		bool locked = Locked;
		// Suppress Calamity's independent Mouse.GetState drag while our captured
		// touch updates the same saved config. Desktop mouse behavior stays native.
		if ((MobileTouchInput.UsingTouch && Available) || layoutEditing) configType.GetProperty("MeterPosLock").SetValue(config, true);
		try { orig(batch, player); }
		finally { if (Available) configType.GetProperty("MeterPosLock").SetValue(config, locked); }
	}
	private static Rectangle Bounds(Meter meter)
	{
		if (meter.Ui.GetField(meter.Texture, Flags)?.GetValue(null) is not Texture2D texture) return default;
		float x = (float)configType.GetProperty(meter.Prefix + "PosX").GetValue(config);
		float y = (float)configType.GetProperty(meter.Prefix + "PosY").GetValue(config);
		Vector2 center = new(x * .01f * PlayerInput.RealScreenWidth, y * .01f * PlayerInput.RealScreenHeight);
		float scale = FindScaleProperty(meter) is PropertyInfo scaleProperty ? Convert.ToSingle(scaleProperty.GetValue(config)) : 1f;
		Vector2 size = new Vector2(texture.Width, texture.Height / meter.Frames) * (Main.UIScale * scale);
		return Utils.CenteredRectangle(center, size);
	}
	internal static void ReadInput(IReadOnlyList<MobileTouchContact> contacts)
	{
		contactThisFrame = -1;
		if (!Available || Locked || Main.gameMenu || !Main.hasFocus || Main.ingameOptionsWindow || Main.inFancyUI || MobileChatSystem.IsOpen || Main.mapFullscreen) { Reset(); return; }
		if (finger >= 0) {
			foreach (var contact in contacts) if (contact.Id == finger) {
				contactThisFrame = finger;
				if (contact.State != TouchLocationState.Invalid && contact.Position != lastPosition) {
					Vector2 half = Bounds(captured).Size() / 2;
					Vector2 position = Vector2.Clamp(contact.Position - offset, half, new Vector2(PlayerInput.RealScreenWidth, PlayerInput.RealScreenHeight) - half);
					SetCenter(captured, position);
					lastPosition = contact.Position;
					moved = true;
				}
				if (contact.IsReleased) { Reset(); return; }
				Main.LocalPlayer.mouseInterface = true;
				return;
			}
			Reset();
		}
		foreach (var contact in contacts) {
			if (contact.Id < 0 || contact.State != TouchLocationState.Pressed || MobileInventorySystem.BlocksControl(contact.Position)) continue;
			foreach (Meter meter in meters) {
				if (!meter.Visible()) continue;
				Rectangle bounds = Bounds(meter);
				if (bounds.IsEmpty) continue;
				Rectangle hit = bounds;
				hit.Inflate(meter.TouchPadding, meter.TouchPadding);
				if (!hit.Contains(contact.Position.ToPoint())) continue;
				captured = meter; finger = contactThisFrame = contact.Id;
				lastPosition = contact.Position;
				offset = lastPosition - bounds.Center.ToVector2();
				Main.LocalPlayer.mouseInterface = true;
				return;
			}
		}
	}
	private static void Save() { if (Available && save != null) save.Invoke(null, new[] { config }); }
	private static void Reset() {
		bool savePosition = moved;
		captured = null; finger = -1; moved = false;
		if (savePosition) Save();
	}
	public override void OnWorldUnload() { Reset(); contactThisFrame = -1; }
	public override void Unload() {
		Reset(); foreach (var hook in hooks) hook.Dispose(); hooks.Clear(); meters.Clear();
		DifficultyAvailable = false; currentDifficulty = null;
		isCalamityEnchanted = null;
		config = null; configType = null; save = null; contactThisFrame = -1; layoutEditing = false;
	}
}
