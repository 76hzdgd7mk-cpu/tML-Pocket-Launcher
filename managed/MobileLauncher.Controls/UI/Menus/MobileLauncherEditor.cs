using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Terraria;
using Terraria.GameContent;
using Terraria.GameInput;

namespace MobileJoystick;

public partial class MobileMenuSystem
{
	private static string LauncherKindLabel(MobileCustomControlKind kind) => kind switch {
		MobileCustomControlKind.DPad => T("LauncherKindDPad"), MobileCustomControlKind.Touchpad => T("LauncherKindTouchpad"),
		MobileCustomControlKind.Mousewheel => T("LauncherKindMousewheel"), _ => T("LauncherKindText")
	};
	private string launcherPropertyControl, launcherPropertyPath, launcherPropertyText = "", launcherPropertyError = "";
	private int launcherPropertyPage;
	private int launcherPropertySection;
	private bool launcherRecordingKey;
	private void EndLauncherPropertyEdit()
	{
		launcherPropertyPath = null; launcherPropertyError = "";
		launcherRecordingKey = false;
		MobileTextInputSystem.Blur(this);
	}
	private void DrawLauncherConversionRow(SpriteBatch sb, Rectangle panel, MobileCustomControl control, int y)
	{
		Rectangle row = PropertyAt(panel, 10, y, 420, 42);
		DrawEditorSurface(sb, row, true); Label(sb, T("LauncherAdvancedProperties"), row, .65f, true);
		if (!Hit(row)) return;
		string type = control.Kind switch { MobileCustomControlKind.Joystick => "joystick", MobileCustomControlKind.RadialMenu => "radialmenu", _ => "button" };
		var data = MobileLauncherControl.Defaults(type);
		float diameter = CustomControlRadius(control) * 2;
		data["width"] = diameter / PlayerInput.RealScreenHeight; data["height"] = diameter / PlayerInput.RealScreenHeight;
		data["name"] = type == "button" ? CustomBindingLabel(control.Action, control.ModKeybind, control.KeyboardKey) : "";
		data["nativeTexture"] = control.TextureName;
		data["multitouch"] = control.Multitouch;
		string Binding(MobileControlAction action, string modKey, string keyboardKey) => action switch {
			MobileControlAction.ModKeybind => "TRIGGER_" + modKey,
			MobileControlAction.KeyboardKey => MobileKeyboardBindings.LauncherPrefix + keyboardKey,
			_ => "ACTION_" + action
		};
		if (type == "button") data["keycode"] = Binding(control.Action, control.ModKeybind, control.KeyboardKey);
		if (type == "joystick") {
			if (control.JoystickRole == MobileJoystickRole.Move) data["joystickKeys"] = new JArray("TRIGGER_Up", "TRIGGER_Right", "TRIGGER_Down", "TRIGGER_Left");
			else if (control.JoystickRole is MobileJoystickRole.Aim or MobileJoystickRole.Grapple) { data["mode"] = "MOUSE"; data["holdAction"] = control.JoystickRole == MobileJoystickRole.Grapple ? "Grapple" : "Unbound"; }
			else data["joystickKeys"] = new JArray("UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN");
		}
		if (type == "radialmenu") {
			data["sectorCount"] = 4;
			data["sectors"] = new JArray(Enumerable.Range(0, 4).Select(i => new JObject {
				["keycode"] = Binding(control.RadialActions[i], control.RadialModKeybinds.ElementAtOrDefault(i), control.RadialKeyboardKeys.ElementAtOrDefault(i)),
				["label"] = CustomBindingLabel(control.RadialActions[i], control.RadialModKeybinds.ElementAtOrDefault(i), control.RadialKeyboardKeys.ElementAtOrDefault(i)),
				["iconPath"] = ""
			}));
		}
		control.Launcher = new MobileLauncherControl { Data = data };
		control.X -= diameter / PlayerInput.RealScreenWidth / 2; control.Y -= diameter / PlayerInput.RealScreenHeight / 2;
		control.Size = 1; control.Action = MobileControlAction.LauncherControl;
		launcherPropertyControl = null; EndLauncherPropertyEdit(); RecordCustomEdit();
	}
	private static string[] LauncherChoices(string field, MobileLauncherControl control)
		=> field switch {
			"type" => new[] { "button", "joystick", "dpad", "radialmenu", "touchpad", "mousewheel", "text" },
			"mode" => control.Type == "joystick" ? new[] { "KEYBOARD", "MOUSE" } : new[] { "KEYBOARD" },
			"shape" => control.Type == "button" ? new[] { "RECTANGLE", "CIRCLE", "POLYGON" } : new[] { "RECTANGLE", "CIRCLE" },
			"style" => new[] { "CROSS", "ROUND", "SQUARE" }, "orientation" => new[] { "VERTICAL", "HORIZONTAL" },
			"scaleMode" => new[] { "FIT", "FILL", "STRETCH", "CENTER", "TILE" },
			"path" or "iconPath" => new[] { "" }.Concat(control.Assets.Keys.OrderBy(key => key)).ToArray(),
			_ => Array.Empty<string>()
		};
	private string LauncherFieldLabel(string path)
	{
		string field = path.Split('.').Last();
		if (field.Contains('[')) field = field[..field.IndexOf('[')];
		string key = "LauncherField" + field;
		string localized = MobileSettingsCatalog.Text(key);
		if (localized.StartsWith("Mods.MobileJoystick.", StringComparison.Ordinal)) localized = field;
		return path.StartsWith("texture.", StringComparison.Ordinal) ? LauncherLayerLabel(path.Split('.')[1]) + " · " + localized
			: path.StartsWith("sectors[", StringComparison.Ordinal) || path.StartsWith("joystickKeys[", StringComparison.Ordinal) || path.StartsWith("polygonPoints[", StringComparison.Ordinal) ? path.Split('.')[0] + " · " + localized : localized;
	}
	private static string LauncherLayerLabel(string layer) => layer switch {
		"normal" => T("LauncherLayerNormal"), "pressed" => T("LauncherLayerPressed"), "toggled" => T("LauncherLayerToggled"),
		"disabled" => T("LauncherLayerDisabled"), "background" or "centerBackground" => T("LauncherLayerBackground"),
		"knob" => T("LauncherLayerKnob"), "backgroundPressed" => T("LauncherLayerBackgroundPressed"), "knobPressed" => T("LauncherLayerKnobPressed"),
		"expandedBackground" => T("LauncherLayerExpanded"), "sector" => T("LauncherLayerSector"), "sectorSelected" => T("LauncherLayerSectorSelected"),
		"touchIndicator" or "wheelIndicator" => T("LauncherLayerIndicator"), _ => layer
	};
	private static int LauncherPropertySection(JValue value)
	{
		if (value.Path.StartsWith("texture.", StringComparison.Ordinal) || value.Path == "nativeTexture") return 2;
		string name = value.Path.Split('.')[0];
		return name is "mode" or "keycode" or "isToggle" or "holdAction" or "upKeycode" or "rightKeycode" or "downKeycode" or "leftKeycode" or "sectorCount"
			|| name.StartsWith("sectors[", StringComparison.Ordinal) || name.StartsWith("joystickKeys[", StringComparison.Ordinal) ? 1 : 0;
	}
	private void DrawLauncherProperties(SpriteBatch sb, MobileCustomControl control)
	{
		if (launcherPropertyControl != control.Id) { EndLauncherPropertyEdit(); launcherPropertyControl = control.Id; launcherPropertyPage = launcherPropertySection = 0; }
		Rectangle panel = CustomPropertyBounds(control);
		DrawEditorPanel(sb, panel);
		MobileLauncherControl launcher = control.Launcher;
		launcher.Data["x"] = control.X; launcher.Data["y"] = control.Y;
		JValue[] values = launcher.Data.Descendants().OfType<JValue>()
			.Where(value => value.Path != "id" && value.Type is JTokenType.String or JTokenType.Integer or JTokenType.Float or JTokenType.Boolean)
			.Where(value => LauncherPropertySection(value) == launcherPropertySection).ToArray();
		const int rows = 4;
		int pages = Math.Max(1, (values.Length + rows - 1) / rows);
		launcherPropertyPage = Math.Clamp(launcherPropertyPage, 0, pages - 1);
		Rectangle heading = PropertyAt(panel, 8, 6, 424, 30);
		string section = launcherPropertySection == 0 ? T("LauncherGroupGeneral") : launcherPropertySection == 1 ? T("LauncherGroupBindings") : T("LauncherGroupTextures");
		Label(sb, section + $"  {launcherPropertyPage + 1}/{pages}  ▾", heading, .7f, true);
		if (launcherPropertyPath == null && Hit(heading)) { launcherPropertySection = (launcherPropertySection + 1) % 3; launcherPropertyPage = 0; }
		for (int i = 0; i < rows && launcherPropertyPage * rows + i < values.Length; i++) {
			JValue value = values[launcherPropertyPage * rows + i];
			Rectangle row = PropertyAt(panel, 10, 40 + i * 35, 420, 32);
			DrawEditorSurface(sb, row, true);
			string text = value.Type == JTokenType.Boolean ? T(value.Value<bool>() ? "On" : "Off") : value.ToString(CultureInfo.InvariantCulture);
			Label(sb, LauncherFieldLabel(value.Path), new Rectangle(row.X + (int)(8 * layout.Scale), row.Y, row.Width / 2, row.Height), .56f);
			Label(sb, text, new Rectangle(row.Center.X, row.Y, row.Width / 2 - (int)(12 * layout.Scale), row.Height), .6f, true);
			if (launcherPropertyPath != null || !Hit(row)) continue;
			if (value.Type == JTokenType.Boolean) {
				ApplyLauncherProperty(control, value.Path, (!value.Value<bool>()).ToString());
			}
			else {
				launcherPropertyPath = value.Path; launcherPropertyText = value.ToString(CultureInfo.InvariantCulture); launcherPropertyError = "";
				Main.clrInput(); MobileTextInputSystem.Focus(this, row);
			}
		}
		Rectangle previous = PropertyAt(panel, 10, 184, 74, 32), next = PropertyAt(panel, 350, 184, 80, 32);
		Rectangle polygon = PropertyAt(panel, 90, 184, 252, 32);
		DrawEditorFooterButton(sb, previous, "Back", "<"); DrawEditorFooterButton(sb, next, "Back", ">");
		DrawEditorFooterButton(sb, polygon, "Settings", launcher.Type == "button" ? T("LauncherPolygonPoints") : T("PackOpenAssets"));
		if (launcherPropertyPath == null) {
			if (Hit(previous)) launcherPropertyPage = (launcherPropertyPage + pages - 1) % pages;
			if (Hit(next)) launcherPropertyPage = (launcherPropertyPage + 1) % pages;
			if (Hit(polygon)) {
				if (launcher.Type == "button") {
					launcherPropertyPath = "polygonPoints"; launcherPropertyText = launcher.Data["polygonPoints"].ToString(Formatting.None);
					Main.clrInput(); MobileTextInputSystem.Focus(this, polygon);
				}
				else OpenLauncherAssets();
			}
			Rectangle duplicate = PropertyAt(panel, 10, 222, 206, 32), assets = PropertyAt(panel, 224, 222, 206, 32);
			DrawEditorFooterButton(sb, duplicate, "EditorPlainButton", T("LauncherDuplicate"));
			DrawEditorFooterButton(sb, assets, "Settings", T("PackOpenAssets"));
			if (Hit(duplicate)) {
				var copy = MobileCustomControls.Clone(new MobileCustomPreset { Controls = new() { control } }).Controls[0];
				copy.Id = "control-" + Guid.NewGuid().ToString("N"); copy.X += .02f; copy.Y += .02f;
				ConstrainCustomControl(copy, PlayerInput.RealScreenWidth, PlayerInput.RealScreenHeight);
				editorDraft.Controls.Add(copy); selectedControlId = copy.Id; RecordCustomEdit();
			}
			if (Hit(assets)) OpenLauncherAssets();
			DrawCustomDeleteRow(sb, panel, 262, 32);
		}
		else { editorInputBlocked = false; DrawLauncherPropertyInput(sb, control); }
	}
	private static void OpenLauncherAssets()
	{
		string folder = Path.Combine(LauncherControlPack.ImportRoot, "UserAssets"); Directory.CreateDirectory(folder);
		System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = folder, UseShellExecute = true });
	}
	private void DrawLauncherPropertyInput(SpriteBatch sb, MobileCustomControl control)
	{
		Rectangle panel = new((PlayerInput.RealScreenWidth - (int)(600 * layout.Scale)) / 2, (PlayerInput.RealScreenHeight - (int)(290 * layout.Scale)) / 2,
			(int)(600 * layout.Scale), (int)(290 * layout.Scale));
		sb.Draw(TextureAssets.MagicPixel.Value, new Rectangle(0, 0, PlayerInput.RealScreenWidth, PlayerInput.RealScreenHeight), Color.Black * .65f);
		DrawEditorPanel(sb, panel);
		Label(sb, LauncherFieldLabel(launcherPropertyPath), PropertyAt(panel, 12, 6, 576, 38), .75f, true);
		Rectangle field = PropertyAt(panel, 16, 52, 568, 58);
		DrawEditorSurface(sb, field, true);
		if (Main.hasFocus) {
			PlayerInput.WritingText = true; Main.instance.HandleIME();
			if (launcherRecordingKey) {
				var keys = Microsoft.Xna.Framework.Input.Keyboard.GetState().GetPressedKeys();
				if (keys.Length > 0 && LauncherControlBindings.LauncherKey(keys[0]) is { } binding) {
					launcherPropertyText = binding; launcherRecordingKey = false; Main.clrInput();
				}
			}
			else launcherPropertyText = Main.GetInputText(launcherPropertyText);
			if (launcherPropertyText.Length > 4096) launcherPropertyText = launcherPropertyText[..4096];
		}
		Label(sb, launcherPropertyText + "|", field, .66f, true);
		Label(sb, launcherPropertyError.Length == 0 ? T("LauncherPropertyHint") : launcherPropertyError, PropertyAt(panel, 12, 116, 576, 52), .55f, true);
		string fieldName = launcherPropertyPath.Split('.').Last();
		string[] choices = LauncherChoices(fieldName, control.Launcher);
		if (fieldName.EndsWith("keycode", StringComparison.OrdinalIgnoreCase) || launcherPropertyPath.StartsWith("joystickKeys[", StringComparison.Ordinal)) {
			Rectangle record = PropertyAt(panel, 120, 174, 360, 36);
			DrawEditorFooterButton(sb, record, "Settings", launcherRecordingKey ? T("LauncherPressKey") : T("LauncherRecordKey"));
			if (Hit(record)) { launcherRecordingKey = true; Main.clrInput(); }
		}
		Rectangle prev = PropertyAt(panel, 16, 174, 84, 36), next = PropertyAt(panel, 500, 174, 84, 36);
		if (choices.Length > 0) {
			DrawEditorFooterButton(sb, prev, "Back", "<"); DrawEditorFooterButton(sb, next, "Back", ">");
			if (Hit(prev)) launcherPropertyText = choices[(Math.Max(0, Array.IndexOf(choices, launcherPropertyText)) + choices.Length - 1) % choices.Length];
			if (Hit(next)) launcherPropertyText = choices[(Array.IndexOf(choices, launcherPropertyText) + 1) % choices.Length];
		}
		Rectangle save = PropertyAt(panel, 120, 226, 170, 42), cancel = PropertyAt(panel, 310, 226, 170, 42);
		DrawEditorFooterButton(sb, save, "EditorSelected", T("Save")); DrawEditorFooterButton(sb, cancel, "Back", T("Cancel"));
		if (Main.inputTextEscape || Hit(cancel)) { EndLauncherPropertyEdit(); return; }
		if (Main.inputTextEnter || Hit(save)) ApplyLauncherProperty(control, launcherPropertyPath, launcherPropertyText);
	}
	private void ApplyLauncherProperty(MobileCustomControl control, string path, string text)
	{
		try {
			var edited = control.Launcher.Clone();
			if ((path.EndsWith(".path", StringComparison.Ordinal) || path.EndsWith(".iconPath", StringComparison.Ordinal)) && text.Length > 0) text = LauncherControlPack.SafeAssetPath(text);
			JToken previous = edited.Data.SelectToken(path) ?? throw new InvalidDataException("Unknown property");
			JToken replacement = previous.Type switch {
				JTokenType.Boolean => new JValue(bool.Parse(text)),
				JTokenType.Integer => new JValue(long.Parse(text, CultureInfo.InvariantCulture)),
				JTokenType.Float => new JValue(double.Parse(text, CultureInfo.InvariantCulture)),
				JTokenType.Array => JArray.Parse(text), _ => new JValue(text)
			};
			previous.Replace(replacement);
			if (path == "mode" && text == "KEYBOARD" && edited.Type == "joystick" && edited.Data["joystickKeys"] is JArray oldKeys && oldKeys.Count != 4)
				edited.Data["joystickKeys"] = new JArray("KEYBOARD_W", "KEYBOARD_D", "KEYBOARD_S", "KEYBOARD_A");
			if (path == "sectorCount" && edited.Data["sectors"] is JArray sectors) {
				int count = edited.Data.Value<int>("sectorCount");
				if (count >= 4 && count <= 12) while (sectors.Count > count) sectors.RemoveAt(sectors.Count - 1);
			}
			if (edited.Flag("isSizeRatioLocked", true) && path is "width" or "height") {
				string other = path == "width" ? "height" : "width";
				edited.Data[other] = control.Launcher.Number(other) * edited.Number(path) / control.Launcher.Number(path);
			}
			if (path == "shape" && text == "POLYGON" && edited.Data["polygonPoints"] is JArray points && points.Count < 3)
				edited.Data["polygonPoints"] = new JArray(new JObject { ["x"] = .5, ["y"] = 0 }, new JObject { ["x"] = 1, ["y"] = 1 }, new JObject { ["x"] = 0, ["y"] = 1 });
			MobileLauncherControl.Validate(edited.Data);
			if (path.EndsWith("keycode", StringComparison.OrdinalIgnoreCase) || path.StartsWith("joystickKeys[", StringComparison.Ordinal))
				if (!LauncherControlBindings.Supported(text)) throw new InvalidDataException(T("LauncherUnsupportedKey"));
			if ((path.EndsWith(".path", StringComparison.Ordinal) || path.EndsWith(".iconPath", StringComparison.Ordinal)) && text.Length > 0)
				AttachLauncherImage(edited, text);
			float x = edited.Data.Value<float?>("x") ?? control.X, y = edited.Data.Value<float?>("y") ?? control.Y;
			if (!float.IsFinite(x) || !float.IsFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new InvalidDataException(T("LauncherInvalidPosition"));
			control.Launcher = edited; control.Kind = MobileLauncherControl.Kind(edited.Type); control.X = x; control.Y = y; control.Multitouch = edited.Flag("multitouch", true);
			EndLauncherPropertyEdit(); RecordCustomEdit();
		}
		catch (Exception error) { launcherPropertyError = error.Message; }
	}
	private static void AttachLauncherImage(MobileLauncherControl control, string relative)
	{
		relative = LauncherControlPack.SafeAssetPath(relative);
		if (control.Assets.ContainsKey(relative)) return;
		string root = Path.Combine(LauncherControlPack.ImportRoot, "UserAssets");
		string path = Path.Combine(root, relative);
		for (string parent = path; parent != root && parent != null; parent = Path.GetDirectoryName(parent))
			if ((File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("Linked image paths are not supported");
		using var stream = File.OpenRead(path);
		if (stream.Length > 16 * 1024 * 1024) throw new InvalidDataException("PNG exceeds 16 MB");
		byte[] bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes);
		ControlTexturePackSystem.ValidateImportedImage(bytes);
		string hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
		Directory.CreateDirectory(LauncherControlPack.AssetRoot);
		string destination = Path.Combine(LauncherControlPack.AssetRoot, hash + ".png");
		if (!File.Exists(destination)) File.WriteAllBytes(destination, bytes);
		control.Assets[relative] = hash;
	}
}
