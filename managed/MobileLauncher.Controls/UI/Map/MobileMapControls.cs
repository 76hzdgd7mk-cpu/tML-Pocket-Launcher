using System;
using System.Collections.Generic;
using System.Diagnostics;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input.Touch;
using Terraria;
using Terraria.GameInput;

namespace MobileJoystick;

internal static partial class MobileJoystickInput
{
	private const int MapLongPressMilliseconds = 500;
	private const float MapClickSlopSquared = 12 * 12;
	private static double lastZoomTime;
	private static int mapContact = int.MinValue;
	private static Vector2 mapLastPosition, mapStartPosition;
	private static long mapPressStarted;
	private static bool mapPressCanClick;
	private static bool mapGestureWasOpen;
	private static float mapPinchDistance;
	private static Vector2 mapPinchCenter;
	private static int mapPinchFirst = int.MinValue, mapPinchSecond = int.MinValue;
	private static int screenPinchFirst = int.MinValue, screenPinchSecond = int.MinValue;
	private static float screenPinchDistance;
	private static Vector2? pendingMapTap, pendingMapLongPress;

	internal static Vector2? ConsumeMapPress(out bool rightClick)
	{
		rightClick = pendingMapLongPress.HasValue;
		Vector2? position = pendingMapLongPress ?? pendingMapTap;
		pendingMapTap = pendingMapLongPress = null;
		return position;
	}

	internal static MobileControlLayout CreateMapLayout(MobileJoystickConfig config)
	{
		var normal = MobileJoystickLayout.CreateControlsLayout(config, Main.screenWidth, Main.screenHeight);
		var buttons = new List<MobileControlButton>();
		for (int i = 0; i < 3; i++) {
			Rectangle r = MobileJoystickLayout.GetToolbarButton(config, i, Main.screenWidth, Main.screenHeight);
			buttons.Add(new(i == 0 ? MobileControlAction.Chat : i == 1 ? MobileControlAction.MapStyle : MobileControlAction.Map,
				i == 0 ? "Chat" : i == 1 ? "MapStyle" : "Map", r.Center.ToVector2(), r.Width * .5f));
		}
		bool minus = false, plus = false;
		foreach (var button in normal.Buttons) {
			if (button.Action == MobileControlAction.ZoomIn) { buttons.Add(button); plus = true; }
			if (button.Action == MobileControlAction.ZoomOut) { buttons.Add(button); minus = true; }
		}
		float scale = normal.Scale;
		float y = Main.screenHeight - 42 * scale;
		if (!minus) buttons.Add(new(MobileControlAction.ZoomOut, "ZoomOut", new(Main.screenWidth * .295f, y), 16 * scale));
		if (!plus) buttons.Add(new(MobileControlAction.ZoomIn, "ZoomIn", new(Main.screenWidth * .705f, y), 16 * scale));
		return new(Vector2.Zero, 0, Vector2.Zero, 0, buttons.ToArray(), scale);
	}

	private static void ResetMapInteraction()
	{
		lastZoomTime = 0;
		ResetFullscreenMapGesture();
		ResetScreenPinch();
	}

	private static void ResetScreenPinch()
	{
		screenPinchFirst = screenPinchSecond = int.MinValue;
		screenPinchDistance = 0;
	}

	private static bool UpdateScreenPinch(MobileJoystickConfig config)
	{
		bool enabled = config?.EnablePinchZoom == true && !Main.mapFullscreen && !Main.playerInventory
			&& !MobileChatSystem.IsOpen && Main.LocalPlayer.talkNPC < 0;
		if (screenPinchFirst != int.MinValue) {
			MobileTouchContact? first = null, second = null;
			foreach (MobileTouchContact contact in Contacts) {
				if (contact.Id == screenPinchFirst && !contact.IsReleased) first = contact;
				if (contact.Id == screenPinchSecond && !contact.IsReleased) second = contact;
			}
			bool hasActiveFinger = first.HasValue || second.HasValue;
			if (enabled && first.HasValue && second.HasValue) {
				float distance = Vector2.Distance(first.Value.Position, second.Value.Position);
				if (screenPinchDistance > 1f && distance > 1f)
					Main.GameZoomTarget = MathHelper.Clamp(Main.GameZoomTarget * distance / screenPinchDistance, 1f, 2f);
				screenPinchDistance = distance;
			}
			else screenPinchDistance = 0f;
			bool consumed = Contacts.RemoveAll(contact => contact.Id == screenPinchFirst || contact.Id == screenPinchSecond) > 0;
			if (!hasActiveFinger) ResetScreenPinch();
			return consumed;
		}
		if (!enabled || Contacts.Count < 2) return false;
		MobileTouchContact? firstContact = null, secondContact = null;
		MobileHotbarLayout hotbar = MobileJoystickLayout.CreateHotbarLayout(config);
		Rectangle minimap = Main.mapStyle == 1 ? MobileJoystickLayout.GetMinimapBounds(config,
			PlayerInput.RealScreenWidth, PlayerInput.RealScreenHeight) : Rectangle.Empty;
		foreach (MobileTouchContact contact in Contacts) {
			Point point = contact.Position.ToPoint();
			if (contact.Id < 0 || contact.IsReleased || IsRadialContact(contact.Id) || minimap.Contains(point)
				|| MobileInventorySystem.OwnsContact(contact.Id) || MobileInventorySystem.BlocksControl(contact.Position)
				|| MobileExternalUiSystem.BlocksInventory(contact.Position) || contact.Id == joystickFingerId
				|| contact.Id == attackFingerId || TouchesAnyControl(contact)
				|| hotbar.InventoryButton.Contains(point) || hotbar.SettingsButton.Contains(point)) continue;
			bool overHotbar = false;
			for (int slot = 0; slot < 10 && !overHotbar; slot++) overHotbar = hotbar.GetSlot(slot).Contains(point);
			if (overHotbar) continue;
			if (!firstContact.HasValue) firstContact = contact;
			else { secondContact = contact; break; }
		}
		if (!firstContact.HasValue || !secondContact.HasValue) return false;
		screenPinchFirst = firstContact.Value.Id;
		screenPinchSecond = secondContact.Value.Id;
		screenPinchDistance = Vector2.Distance(firstContact.Value.Position, secondContact.Value.Position);
		Contacts.RemoveAll(contact => contact.Id == screenPinchFirst || contact.Id == screenPinchSecond);
		return true;
	}

	private static void ResetFullscreenMapGesture()
	{
		mapContact = int.MinValue; pendingMapTap = pendingMapLongPress = null; mapGestureWasOpen = false;
		mapPinchDistance = 0; mapPinchFirst = mapPinchSecond = int.MinValue;
	}
	private static void UpdateHeldZoom()
	{
		double now = Stopwatch.GetTimestamp() / (double)Stopwatch.Frequency;
		float elapsed = lastZoomTime == 0 ? 1f / 60 : (float)Math.Clamp(now - lastZoomTime, 0, .05);
		lastZoomTime = now;
		int direction = (IsActionDown(MobileControlAction.ZoomIn) ? 1 : 0) - (IsActionDown(MobileControlAction.ZoomOut) ? 1 : 0);
		if (direction == 0) return;
		if (Main.mapFullscreen) {
			float minimum = Main.screenWidth / (float)Math.Max(1, Main.maxTilesX) * .599f;
			Main.mapFullscreenScale = MathHelper.Clamp(Main.mapFullscreenScale * MathF.Pow(2, direction * elapsed), minimum, 31.18f);
		}
		else {
			// Let Terraria and zoom mods apply their own speed and bounds.
			Terraria.GameInput.PlayerInput.Triggers.Current.ViewZoomIn |= direction > 0;
			Terraria.GameInput.PlayerInput.Triggers.Current.ViewZoomOut |= direction < 0;
		}
	}

	private static void UpdateFullscreenMapGesture(long timestamp)
	{
		pendingMapTap = null;
		if (!Main.mapFullscreen || !Main.hasFocus || MobileChatSystem.IsOpen) { ResetFullscreenMapGesture(); return; }
		// The opening toolbar contact must be lifted before it can drag the map.
		if (!mapGestureWasOpen) { mapGestureWasOpen = true; mapContact = int.MinValue; return; }
		MobileTouchContact? first = null, second = null;
		int activeContacts = 0;
		foreach (var contact in Contacts) {
			if (contact.IsReleased) continue;
			activeContacts++;
			if (TouchesMapButton(contact.Position)) continue;
			if (!first.HasValue) first = contact;
			else { second = contact; break; }
		}
		if (first.HasValue && second.HasValue) {
			float distance = Vector2.Distance(first.Value.Position, second.Value.Position);
			Vector2 center = (first.Value.Position + second.Value.Position) * .5f;
			if (mapPinchDistance > 1 && distance > 1 && first.Value.Id == mapPinchFirst && second.Value.Id == mapPinchSecond) {
				float before = Main.mapFullscreenScale;
				float minimum = Main.screenWidth / (float)Math.Max(1, Main.maxTilesX) * .599f;
				Main.mapFullscreenScale = MathHelper.Clamp(before * distance / mapPinchDistance, minimum, 31.18f);
				Vector2 middle = new(Main.screenWidth * .5f, Main.screenHeight * .5f);
				Main.mapFullscreenPos += (mapPinchCenter - middle) / before - (center - middle) / Main.mapFullscreenScale;
			}
			mapPinchDistance = distance; mapPinchCenter = center;
			mapPinchFirst = first.Value.Id; mapPinchSecond = second.Value.Id;
			mapContact = int.MinValue; HasAnyControlTouch = true;
			return;
		}
		mapPinchDistance = 0; mapPinchFirst = mapPinchSecond = int.MinValue;
		bool found = false;
		foreach (var contact in Contacts) {
			if (mapContact == int.MinValue) {
				if (contact.State != TouchLocationState.Pressed || TouchesMapButton(contact.Position)) continue;
				mapContact = contact.Id; mapLastPosition = mapStartPosition = contact.Position;
				mapPressStarted = timestamp;
				mapPressCanClick = true;
			}
			if (contact.Id != mapContact) continue;
			found = true;
			if (contact.State == TouchLocationState.Invalid) { mapContact = int.MinValue; break; }
			Vector2 delta = contact.Position - mapLastPosition;
			mapPressCanClick &= activeContacts <= 1 && !TouchesMapButton(contact.Position)
				&& Vector2.DistanceSquared(contact.Position, mapStartPosition) < MapClickSlopSquared;
			if (contact.State == TouchLocationState.Released) {
				if (mapPressCanClick) pendingMapTap = contact.Position;
				mapContact = int.MinValue;
			}
			else {
				if (contact.State == TouchLocationState.Moved) Main.mapFullscreenPos -= delta / Math.Max(.001f, Main.mapFullscreenScale);
				if (mapPressCanClick && Stopwatch.GetElapsedTime(mapPressStarted, timestamp).TotalMilliseconds >= MapLongPressMilliseconds) {
					pendingMapLongPress = contact.Position;
					mapPressCanClick = false;
				}
			}
			mapLastPosition = contact.Position;
			HasAnyControlTouch = true;
			break;
		}
		if (!found) mapContact = int.MinValue;
	}
	private static bool TouchesMapButton(Vector2 position)
	{
		foreach (var button in Layout.Buttons) if (button.Contains(position)) return true;
		return false;
	}
}
