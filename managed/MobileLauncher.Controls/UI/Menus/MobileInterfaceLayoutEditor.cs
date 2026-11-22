using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;

namespace MobileJoystick;

internal sealed class MobileInterfaceLayoutEditor
{
	private readonly List<MobileInterfaceLayoutProfile> undo = new();
	private readonly List<MobileInterfaceLayoutProfile> redo = new();
	private readonly Dictionary<string, (Vector2 Center, float Scale)> externalOpening = new(StringComparer.OrdinalIgnoreCase);
	private const int HistoryLimit = 32;

	public MobileInterfaceLayoutProfile Draft { get; private set; }
	public MobileInterfaceLayoutProfile Opening { get; private set; }
	public MobileInterfaceRegion Selected { get; set; } = MobileInterfaceRegion.Hotbar;
	public bool InventoryView { get; set; }
	public bool ExternalView { get; set; }
	public string SelectedExternalUiId { get; set; }
	public bool IsOpen { get; private set; }
	public Rectangle HotbarEditorBounds { get; set; }
	public bool CanUndo => !ExternalView && undo.Count > 0;
	public bool CanRedo => !ExternalView && redo.Count > 0;

	public void Open(MobileInterfaceLayoutProfile profile)
	{
		Opening = profile?.Clone() ?? new MobileInterfaceLayoutProfile();
		Draft = Opening.Clone();
		Selected = MobileInterfaceRegion.Hotbar;
		InventoryView = false;
		ExternalView = false;
		SelectedExternalUiId = null;
		HotbarEditorBounds = Rectangle.Empty;
		undo.Clear(); redo.Clear();
		externalOpening.Clear();
		foreach (ExternalUiLayoutAdapter adapter in ExternalUiLayoutRegistry.Adapters) {
			Rectangle bounds = adapter.Bounds;
			externalOpening[adapter.Id] = (new Vector2(bounds.Center.X, bounds.Center.Y), adapter.Scale);
		}
		IsOpen = true;
		ExternalUiLayoutRegistry.SetEditing(true);
	}

	public void Close(bool keepExternalChanges = false)
	{
		if (!keepExternalChanges) RestoreExternalOpening();
		ExternalUiLayoutRegistry.SetEditing(false);
		IsOpen = false;
		Draft = null;
		Opening = null;
		undo.Clear(); redo.Clear();
		externalOpening.Clear();
	}

	public MobileInterfaceRegionLayout Resolve(MobileInterfaceRegion region, int width, int height)
	{
		MobileInterfaceRegionLayout entry = Draft?.Get(region) ?? new MobileInterfaceRegionLayout();
		Rectangle bounds = DefaultBounds(region, width, height);
		return new MobileInterfaceRegionLayout {
			CenterX = float.IsNaN(entry.CenterX) ? bounds.Center.X / Math.Max(1f, width) : entry.CenterX,
			CenterY = float.IsNaN(entry.CenterY) ? bounds.Center.Y / Math.Max(1f, height) : entry.CenterY,
			Scale = Math.Clamp(entry.Scale, .5f, MaximumScale(region, width, height))
		};
	}

	public float MaximumScale(MobileInterfaceRegion region, int width, int height)
		=> MobileInterfaceLayoutProfile.MaximumScaleFor(DefaultBounds(region, width, height), SafeBoundsFor(region, width, height));

	public Rectangle Bounds(MobileInterfaceRegion region, int width, int height)
	{
		Rectangle defaults = DefaultBounds(region, width, height);
		return MobileInterfaceLayoutProfile.Transform(Resolve(region, width, height), defaults, defaults,
			new Rectangle(0, 0, width, height), SafeBoundsFor(region, width, height));
	}

	public Rectangle SafeBoundsFor(MobileInterfaceRegion region, int width, int height)
		=> region == MobileInterfaceRegion.Hotbar && !HotbarEditorBounds.IsEmpty
			? HotbarEditorBounds : DefaultSafeBounds(region, width, height);

	public void Move(MobileInterfaceRegion region, Vector2 delta, int width, int height, bool record = true)
	{
		if (record) PushUndo();
		MobileInterfaceRegionLayout entry = Resolve(region, width, height);
		Rectangle defaults = DefaultBounds(region, width, height);
		Rectangle safe = SafeBoundsFor(region, width, height);
		float halfWidth = Math.Min(defaults.Width * entry.Scale * .5f, safe.Width * .5f);
		float halfHeight = Math.Min(defaults.Height * entry.Scale * .5f, safe.Height * .5f);
		// Keep fractional contact movement. Feeding the rounded render rectangle
		// back into the gesture discards small upward deltas on high-DPI phones.
		float cx = Math.Clamp(entry.CenterX * width, safe.Left + halfWidth, safe.Right - halfWidth);
		float cy = Math.Clamp(entry.CenterY * height, safe.Top + halfHeight, safe.Bottom - halfHeight);
		cx = Math.Clamp(cx + delta.X, safe.Left + halfWidth, safe.Right - halfWidth);
		cy = Math.Clamp(cy + delta.Y, safe.Top + halfHeight, safe.Bottom - halfHeight);
		Draft.Set(region, new MobileInterfaceRegionLayout { CenterX = cx / Math.Max(1f, width), CenterY = cy / Math.Max(1f, height), Scale = entry.Scale });
	}

	public void BeginGesture() => PushUndo();

	public void SetScale(MobileInterfaceRegion region, float scale, int width, int height, bool record = true)
	{
		if (record) PushUndo();
		MobileInterfaceRegionLayout entry = Resolve(region, width, height);
		Rectangle bounds = DefaultBounds(region, width, height);
		Draft.Set(region, new MobileInterfaceRegionLayout { CenterX = entry.CenterX, CenterY = entry.CenterY, Scale = Math.Clamp(scale, .5f, MaximumScale(region, width, height)) });
		ClampToViewport(region, bounds, width, height);
	}

	public void ResetSelected(int width, int height)
	{
		PushUndo();
		Draft.Reset(Selected);
	}

	public void RestoreDefaults()
	{
		PushUndo();
		Draft = new MobileInterfaceLayoutProfile();
	}

	public void Undo()
	{
		if (!CanUndo) return;
		redo.Add(Draft.Clone());
		Draft = undo[^1]; undo.RemoveAt(undo.Count - 1);
	}

	public void Redo()
	{
		if (!CanRedo) return;
		undo.Add(Draft.Clone());
		Draft = redo[^1]; redo.RemoveAt(redo.Count - 1);
	}

	public MobileInterfaceLayoutProfile Apply()
	{
		Draft.Validate();
		foreach (ExternalUiLayoutAdapter adapter in ExternalUiLayoutRegistry.Adapters) adapter.Save();
		return Draft.Clone();
	}

	public void CaptureExternalSelection(string id)
		=> SelectedExternalUiId = ExternalUiLayoutRegistry.Find(id)?.Id;

	public ExternalUiLayoutAdapter SelectedExternalUi
		=> ExternalUiLayoutRegistry.Find(SelectedExternalUiId);

	public void ResetSelectedExternalUi()
	{
		ExternalUiLayoutAdapter adapter = SelectedExternalUi;
		if (adapter != null) adapter.RestoreDefault();
	}

	public void ResetExternalUiDefaults()
	{
		foreach (ExternalUiLayoutAdapter adapter in ExternalUiLayoutRegistry.Adapters) adapter.RestoreDefault();
	}

	private void RestoreExternalOpening()
	{
		foreach (ExternalUiLayoutAdapter adapter in ExternalUiLayoutRegistry.Adapters) {
			if (!externalOpening.TryGetValue(adapter.Id, out var state)) continue;
			adapter.Move(state.Center);
			adapter.Resize(state.Scale);
			adapter.Save();
		}
	}

	private void ClampToViewport(MobileInterfaceRegion region, Rectangle defaults, int width, int height)
	{
		Rectangle bounds = Bounds(region, width, height);
		MobileInterfaceRegionLayout entry = Resolve(region, width, height);
		Rectangle safe = SafeBoundsFor(region, width, height);
		float halfWidth = Math.Min(defaults.Width * entry.Scale * .5f, safe.Width * .5f);
		float halfHeight = Math.Min(defaults.Height * entry.Scale * .5f, safe.Height * .5f);
		float cx = Math.Clamp(bounds.Center.X, safe.Left + halfWidth, safe.Right - halfWidth);
		float cy = Math.Clamp(bounds.Center.Y, safe.Top + halfHeight, safe.Bottom - halfHeight);
		Draft.Set(region, new MobileInterfaceRegionLayout { CenterX = cx / Math.Max(1f, width), CenterY = cy / Math.Max(1f, height), Scale = entry.Scale });
	}

	private void PushUndo()
	{
		if (Draft == null) return;
		undo.Add(Draft.Clone());
		if (undo.Count > HistoryLimit) undo.RemoveAt(0);
		redo.Clear();
	}

	internal static Rectangle DefaultBounds(MobileInterfaceRegion region, int width, int height)
	{
		if (region == MobileInterfaceRegion.Hotbar) {
			MobileHotbarLayout hotbar = MobileJoystickLayout.CreateHotbarLayout(MobileJoystickConfig.Instance, width, height, false);
			Rectangle buttons = Rectangle.Union(hotbar.InventoryButton, hotbar.SettingsButton);
			return Rectangle.Union(buttons, Rectangle.Union(hotbar.GetSlot(0), hotbar.GetSlot(MobileHotbarLayout.SlotCount - 1)));
		}
		var inventory = new MobileInventoryLayout(width, height);
		return inventory.RegionBounds(region);
	}

	internal static Rectangle DefaultSafeBounds(MobileInterfaceRegion region, int width, int height)
	{
		if (region != MobileInterfaceRegion.Hotbar) return new MobileInventoryLayout(width, height).SafeViewport;
		float scale = MobileJoystickLayout.GetControlScale(MobileJoystickConfig.Instance, width, height);
		int inset = Math.Max(4, (int)((MobileJoystickConfig.Instance?.EdgePadding ?? 18) * scale * .5f));
		return new Rectangle(inset, 4, Math.Max(1, width - inset * 2), Math.Max(1, height - 8));
	}
}
