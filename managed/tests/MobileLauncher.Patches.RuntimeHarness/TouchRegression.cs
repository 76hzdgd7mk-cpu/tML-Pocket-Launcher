using System.Reflection;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input.Touch;
using MonoMod.RuntimeDetour;
using Terraria;
using Terraria.GameInput;
using Terraria.ModLoader;
using MobileJoystick;
using TMain = Terraria.Main;
#pragma warning disable ChangeMagicNumberToID // Synthetic fixture item identities.

internal static class TouchRegression
{
    const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
    static readonly Assembly Product = typeof(MobileJoystickConfig).Assembly;
    static Type Input => Product.GetType("MobileJoystick.MobileJoystickInput");
    static object Call(Type t, object instance, string name, params object[] args) => t.GetMethod(name, All).Invoke(instance, args);
    static void Set(Type t, object instance, string name, object value)
    {
        var f = t.GetField(name, All) ?? t.GetField("<" + name + ">k__BackingField", All); f.SetValue(instance, value);
    }
    static int failures;
    static void Check(string name, Action test)
    {
        try { test(); Console.WriteLine("PASS " + name); }
        catch (Exception e) { failures++; Console.WriteLine("FAIL " + name + ": " + (e.InnerException ?? e).ToString()); }
    }
    static void Equal(bool good, string message) { if (!good) throw new Exception(message); }
    static void SetAimAndUse(bool enabled) =>
        Set(Input, null, "aimStickMode", Enum.Parse(Input.GetNestedType("AimStickMode", All), enabled ? "LeftClick" : "AimOnly"));
    internal static void RunEntry()
    {
        Console.WriteLine("Loading native tML input fixture");
        Check("Embedded touch patch attaches and detaches against the game assembly", () =>
        {
            using (MobileControlsSession.Initialize()) { }
            using (MobileControlsSession.Initialize()) { }
        });
        Check("Embedded patch contains texture metadata and localization without images", () =>
        {
            string[] names = Product.GetManifestResourceNames().Select(name => name.Replace('\\', '/')).ToArray();
            Equal(names.Contains("Assets/TexturePacks/AndroidMobileControls.json"), "missing control texture metadata");
            Equal(names.Contains("Assets/asset-aliases.json"), "missing UI texture aliases");
            Equal(!names.Any(name => name.EndsWith(".png") || name.EndsWith(".zip") || name.EndsWith(".rawimg")), "embedded texture art");
            foreach (string culture in new[] { "en-US", "zh-Hans" })
            {
                var text = Product.GetType("MobileJoystick.MobileControlsText");
                Equal(Call(text, null, "Load", culture) != null, $"failed to parse {culture} UI text");
            }
        });
        Check("Launcher profile configures both game controls and interface", () =>
        {
            var previousPath = Terraria.Program.SavePath;
            var directory = Directory.CreateTempSubdirectory("mobile-controls-fixture-");
            try
            {
                Terraria.Program.SavePath = directory.FullName;
                File.WriteAllText(Path.Combine(directory.FullName, "MobileControls.json"), """
                    {
                      "ControlLayout": 2,
                      "HotbarOrientation": 1,
                      "CustomPresets": [{ "Name": "Test", "Controls": [{
                        "Id": "fixture-dpad", "Kind": 3, "Action": 32, "X": 0.4, "Y": 0.5, "Size": 1,
                        "Launcher": { "Data": { "type": "dpad", "style": "ROUND" }, "Assets": {} }
                      }] }],
                      "InterfaceLayout": { "FormatVersion": 1, "Regions": {
                        "Hotbar": { "CenterX": 0.4, "CenterY": 0.3, "Scale": 0.8 }
                      } }
                    }
                    """);
                Call(typeof(MobileJoystickConfig), null, "Load");
                var profile = MobileJoystickConfig.Instance;
                Equal(profile.ControlLayout == MobileControlLayoutMode.Custom, "custom mode was not loaded");
                Equal(profile.CustomPresets[0].Controls.Single().Kind == MobileCustomControlKind.DPad, "custom control was rejected");
                Equal(profile.HotbarOrientation == MobileHotbarOrientation.Horizontal, "hotbar orientation was not loaded");
                Equal(Math.Abs(profile.InterfaceLayout.Get(MobileInterfaceRegion.Hotbar).CenterY - .3f) < .001f, "hotbar position was not loaded");
            }
            finally
            {
                Terraria.Program.SavePath = previousPath;
                directory.Delete(recursive: true);
            }
        });
        Check("Built-in mobile layout matches the control preview", () =>
        {
            var config = new MobileJoystickConfig();
            var layoutType = Product.GetType("MobileJoystick.MobileJoystickLayout");
            foreach (var (width, height) in new[] { (1280, 576), (2400, 1080) })
            {
                var layout = Call(layoutType, null, "CreateControlsLayout", config, width, height, null);
                var type = layout.GetType();
                var move = (Vector2)type.GetProperty("JoystickCenter", All).GetValue(layout);
                var aim = (Vector2)type.GetProperty("AttackCenter", All).GetValue(layout);
                float scale = (float)type.GetProperty("Scale", All).GetValue(layout);
                float radius = (float)type.GetProperty("JoystickRadius", All).GetValue(layout);
                var buttons = ((Array)type.GetProperty("Buttons", All).GetValue(layout)).Cast<object>().ToArray();
                var buttonType = buttons[0].GetType();
                object FindButton(string action) =>
                    buttons.Single(button => buttonType.GetProperty("Action", All).GetValue(button).ToString() == action);
                Vector2 Center(string action) => (Vector2)buttonType.GetProperty("Center", All).GetValue(FindButton(action));
                Equal(Math.Abs(move.X - width * .203125f) < .01f && Math.Abs(aim.X - width * .85f) < .01f, "wrong joystick centers");
                Equal(Math.Abs(radius - 66 * scale) < .01f, "wrong joystick radius");
                Equal(Vector2.Distance(Center("Jump"), aim + new Vector2(122, -84) * scale) < .01f, "wrong jump center");
                Equal(Center("Inventory").X == (int)(width * .056f) + Math.Max(16, (int)(38 * scale)) / 2, "wrong backpack center");
                Equal(Center("QuickPotions").X > move.X, "default layout lacks the advanced potion button");
            }
        });
        Terraria.Program.SavePath = Path.GetTempPath();
        TMain.dedServ = true;
        TMain.screenWidth = 1280; TMain.screenHeight = 720;
        TMain.myPlayer = 0;
        TMain.player[0] = new Player();
        TMain.LocalPlayer.active = true; TMain.LocalPlayer.position = new Vector2(1000, 1000);
        Set(typeof(Player), TMain.LocalPlayer, "talkNPC", -1);
        TMain.screenPosition = new Vector2(400, 700);
        TMain.GameViewMatrix = new Terraria.Graphics.SpriteViewMatrix(null);
        PlayerInput.Initialize();
        TMain.GameViewMatrix.Zoom = new Vector2(2);
        PlayerInput.CacheZoomableValues();
        var config = new MobileJoystickConfig { EnableMobileControls = true, UseMobileInventory = true, EnableTouchInput = true, EnableMouseFallback = false, ControlScale = 1.8f, JoystickDeadzone = .25f };
        Set(typeof(MobileJoystickConfig), null, "Instance", config);
        var inventorySystem = new MobileInventorySystem();
        using var session = (MobileControlsSession)MobileControlsSession.Initialize();
        var instances = (Dictionary<Type, MobileSystem>)typeof(MobileControlsSession).GetField("instances", All).GetValue(session);
        instances.Add(typeof(MobileInventorySystem), inventorySystem);
        instances.Add(typeof(MobileMenuSystem), new MobileMenuSystem());
        Check("Aim uses inverse game zoom", () =>
        {
            Set(Input, null, "hasTouchAimPosition", true); Set(Input, null, "touchAimPosition", new Vector2(1000, 500));
            Call(typeof(MobileJoystickPlayer), null, "ApplyTouchAim");
            var expected = new Vector2(640, 360) + (new Vector2(1000, 500) - new Vector2(640, 360)) / 2;
            Equal(TMain.mouseX == (int)expected.X && TMain.mouseY == (int)expected.Y, $"expected {expected}, got {TMain.mouseX},{TMain.mouseY}");
        });
        Check("Jump button re-arms after stick jump", () =>
        {
            TMain.LocalPlayer.releaseJump = false;
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "JoystickVector", new Vector2(0, -1));
            foreach (string name in new[] { "CurrentActions", "PressedActions" }) ((HashSet<MobileControlAction>)Input.GetField(name, All).GetValue(null)).Add(MobileControlAction.Jump);

            MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
            Equal(TMain.LocalPlayer.releaseJump, "independent jump press stayed latched behind stick jump");
        });
        Check("Autopause drains existing attack before freezing inventory", () =>
        {
            TMain.gameMenu = false; TMain.playerInventory = true; TMain.autoPause = true;
            TMain.LocalPlayer.itemAnimation = 15; TMain.LocalPlayer.itemTime = 10;
            var inventory = inventorySystem;
            On_Main.orig_CanPauseGame orig = () => true;
            const string variable = "TML_MOBILE_CONTROL_ART";
            string previous = Environment.GetEnvironmentVariable(variable);
            var art = Directory.CreateTempSubdirectory("touch-fixture-");
            try
            {
                Environment.SetEnvironmentVariable(variable, art.FullName);
                bool pause = (bool)Call(typeof(MobileInventorySystem), inventory, "CanPauseInventoryUse", orig);
                Equal(!pause, "attack animation would freeze while IgnoreMouseInterface blocks the entire inventory");
                Environment.SetEnvironmentVariable(variable, null);
                Equal((bool)Call(typeof(MobileInventorySystem), inventory, "CanPauseInventoryUse", orig),
                    "vanilla inventory did not retain its native autopause behavior");
            }
            finally
            {
                Environment.SetEnvironmentVariable(variable, previous);
                art.Delete();
            }
        });
        Check("Releasing the aim stick clears its stale ring and drag origin", () =>
        {
            TMain.playerInventory = false;
            Set(Input, null, "hasTouchAimPosition", true); Set(Input, null, "touchAimPosition", new Vector2(900, 450));
            Set(Input, null, "previousAimOrigin", new Vector2(640, 360));
            Call(Input, null, "UpdateFingerAssignments");
            Equal(!(bool)Input.GetProperty("HasTouchAimPosition", All).GetValue(null), "released ring stayed at its old target");
            Call(Input, null, "InitializeTouchAim", new Vector2(1000, 600));
            Vector2 actual = (Vector2)Input.GetProperty("TouchAimPosition", All).GetValue(null);
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction");
            Vector2 center = (Vector2)Call(world, null, "ToScreen", TMain.LocalPlayer.MountedCenter);
            Equal(Vector2.Distance(actual, center) < .01f, "next drag did not return to the player");
        });
        Check("Aim initialization projects player through camera zoom", () =>
        {
            Set(Input, null, "hasTouchAimPosition", false);
            Call(Input, null, "InitializeTouchAim", new Vector2(1000, 600));
            Vector2 actual = (Vector2)Input.GetProperty("TouchAimPosition", All).GetValue(null);
            Vector2 center = new(640, 360);
            Vector2 expected = center + (TMain.LocalPlayer.MountedCenter - TMain.screenPosition - center) * 2;
            Equal(Vector2.Distance(actual, expected) < .01f, $"expected {expected}, got {actual}");
        });
        Check("Negative SDL IDs are stable positive UI contacts", () =>
        {
            var touchType = Product.GetType("MobileJoystick.MobileTouchInput");
            TouchCollection first = (TouchCollection)Call(touchType, null, "NormalizeContacts", new TouchCollection(new[] { new TouchLocation(-1610612736, TouchLocationState.Pressed, new Vector2(120, 130)) }));
            TouchCollection moved = (TouchCollection)Call(touchType, null, "NormalizeContacts", new TouchCollection(new[] { new TouchLocation(-1610612736, TouchLocationState.Moved, new Vector2(130, 140)) }));
            Equal(first[0].Id >= 0 && first[0].Id == moved[0].Id, "signed native ID was not safely mapped");
        });
        Check("Guide Help and Craft stay separate native actions", () =>
        {
            var type = Product.GetType("MobileJoystick.MobileNpcDialogSystem"); var dialog = Activator.CreateInstance(type);
            Set(type, dialog, "drawingNative", true);
            foreach (int action in new[] { 1, 2, 0, 3 })
            {
                Set(type, dialog, "pendingAction", action);
                Call(type, dialog, "NativeButtons", null, 255, Color.White, 2, "Help", "Crafting");
                Equal(TMain.npcChatFocus2 == (action == 1) && TMain.npcChatFocus3 == (action == 2), "wrong native button dispatched");
                Equal(TMain.npcChatFocus1 == (action == 0) && TMain.npcChatFocus4 == (action == 3), "wrong close/happiness action");
            }
            Equal((string)type.GetField("primaryText", All).GetValue(dialog) == "Help" && (string)type.GetField("secondaryText", All).GetValue(dialog) == "Crafting", "native button labels lost");
        });
        Check("Zoom controls forward to native zoom beyond 200 percent", () =>
        {
            var actions = (HashSet<MobileControlAction>)Input.GetField("CurrentActions", All).GetValue(null); actions.Clear(); actions.Add(MobileControlAction.ZoomIn);
            TMain.GameZoomTarget = 3;
            Call(Input, null, "UpdateHeldZoom");
            Equal(PlayerInput.Triggers.Current.ViewZoomIn && TMain.GameZoomTarget == 3, "zoom was locally clamped before BetterZoom could handle it");
        });
        Check("Only aim suppresses launcher mouse attack", () =>
        {
            TMain.playerInventory = false; TMain.LocalPlayer.SetTalkNPC(-1); TMain.LocalPlayer.itemAnimation = 0; TMain.LocalPlayer.itemTime = 0;
            ((HashSet<MobileControlAction>)Input.GetField("CurrentActions", All).GetValue(null)).Clear();
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "HasAnyControlTouch", true); Set(Input, null, "AttackHeld", true); SetAimAndUse(false);
            TMain.LocalPlayer.controlUseItem = true;
            MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
            Equal(!TMain.LocalPlayer.controlUseItem, "only-aim still attacks through synthetic mouse");
            SetAimAndUse(true); MobileJoystickPlayer.SetControls(TMain.LocalPlayer); Equal(TMain.LocalPlayer.controlUseItem, "aim-and-use did not attack");
        });
        Check("Smart block aim beyond reach still finds the forward surface", () =>
        {
            TMain.maxTilesX = TMain.maxTilesY = 200;
            TMain.tile = (Tilemap)Activator.CreateInstance(typeof(Tilemap), All, null, new object[] { (ushort)200, (ushort)200 }, null);
            for (int i = 1; i < TMain.player.Length; i++) TMain.player[i] ??= new Player();
            for (int i = 0; i < TMain.npc.Length; i++) TMain.npc[i] ??= new NPC();
            TMain.LocalPlayer.position = new Vector2(1600, 1560); TMain.LocalPlayer.width = 20; TMain.LocalPlayer.height = 42;
            TMain.screenPosition = TMain.LocalPlayer.Center - new Vector2(640, 360); TMain.GameViewMatrix.Zoom = Vector2.One;
            PlayerInput.SetZoom_Unscaled(); PlayerInput.CacheZoomableValues();
            TMain.tileSolid[Terraria.ID.TileID.Stone] = true;
            for (int x = 90; x <= 110; x++) { var tile = TMain.tile[x, 103]; tile.HasTile = true; tile.TileType = Terraria.ID.TileID.Stone; }
            TMain.LocalPlayer.inventory[0] = new Item { type = Terraria.ID.ItemID.StoneBlock, createTile = Terraria.ID.TileID.Stone, stack = 999 };
            TMain.LocalPlayer.selectedItem = 0; Set(typeof(Player), TMain.LocalPlayer, "talkNPC", -1);
            TMain.playerInventory = false; TMain.mapFullscreen = false;
            TMain.LocalPlayer.selectedItem = 0; Player.SmartCursorSettings.SmartBlocksEnabled = true;
            TMain.SmartCursorWanted_Mouse = true; Set(Input, null, "SmartCursorEnabled", true);
            Set(Input, null, "previousAimOrigin", null); Set(Input, null, "hasTouchAimPosition", true);
            Set(Input, null, "touchAimPosition", new Vector2(1080, 410));
            Call(typeof(MobileJoystickPlayer), null, "ApplyTouchAim");
            Player.tileTargetX = (int)TMain.MouseWorld.X / 16; Player.tileTargetY = (int)TMain.MouseWorld.Y / 16;
            Terraria.GameContent.SmartCursorHelper.SmartCursorLookup(TMain.LocalPlayer);
            Equal(TMain.SmartCursorShowing && TMain.SmartCursorX > 100, "forward construction target vanished when aim moved beyond reach");
        });
        Check("Aim ring stays continuous while native smart targets change tiles", () =>
        {
            Set(Input, null, "SmartCursorEnabled", true); Set(Input, null, "hasTouchAimPosition", true);
            Set(Input, null, "previousAimOrigin", null); Set(Input, null, "touchAimPosition", new Vector2(850.25f, 400.75f));
            TMain.SmartCursorShowing = true; TMain.SmartCursorX = 102; TMain.SmartCursorY = 102;
            Vector2 first = (Vector2)Input.GetProperty("TouchCrosshairPosition", All).GetValue(null);
            TMain.SmartCursorX = 103;
            Vector2 second = (Vector2)Input.GetProperty("TouchCrosshairPosition", All).GetValue(null);
            Equal(first == new Vector2(850.25f, 400.75f) && second == first, "ring snapped to a smart tile instead of following finger motion");
            TMain.SmartCursorShowing = false;
        });
        Check("Precise mode and weapons preserve unrestricted aim", () =>
        {
            Vector2 raw = new(1080, 410); Set(Input, null, "SmartCursorEnabled", false);
            Equal((Vector2)Call(typeof(MobileJoystickPlayer), null, "ProjectSmartBuildingAim", raw) == raw, "precision mode clamps aim");
            Set(Input, null, "SmartCursorEnabled", true); TMain.LocalPlayer.inventory[0] = new Item();
            Equal((Vector2)Call(typeof(MobileJoystickPlayer), null, "ProjectSmartBuildingAim", raw) == raw, "weapon aim clamps to build reach");
        });
        Check("World projection round-trips at low/high zoom and reverse gravity", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction"); Vector2 target = new(1650, 1610);
            foreach (float zoom in new[] { .3f, 1, 2, 5 }) foreach (float gravity in new[] { 1f, -1f })
                {
                    TMain.GameViewMatrix.Zoom = new Vector2(zoom); TMain.LocalPlayer.gravDir = gravity;
                    Vector2 screen = (Vector2)Call(world, null, "ToScreen", target);
                    Vector2 actual = (Vector2)Call(world, null, "ToWorld", screen);
                    Equal(Vector2.Distance(target, actual) < .01f, $"projection drift at {zoom}x gravity {gravity}");
                }
            TMain.LocalPlayer.gravDir = 1; TMain.GameViewMatrix.Zoom = Vector2.One;
        });
        Check("Holding attack while opening inventory cannot start another attack", () =>
        {
            TMain.playerInventory = true; TMain.autoPause = true; TMain.LocalPlayer.SetTalkNPC(-1);
            TMain.LocalPlayer.controlUseItem = true; TMain.LocalPlayer.itemAnimation = 5;
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "HasAnyControlTouch", true); Set(Input, null, "AttackHeld", true); SetAimAndUse(true);
            ((HashSet<MobileControlAction>)Input.GetField("CurrentActions", All).GetValue(null)).Clear();
            MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
            Equal(!TMain.LocalPlayer.controlUseItem, "held attack restarted while inventory opens");
            TMain.LocalPlayer.itemAnimation = TMain.LocalPlayer.itemTime = 0;
            var inventory = inventorySystem;
            Equal((bool)Call(typeof(MobileInventorySystem), inventory, "CanPauseInventoryUse", (On_Main.orig_CanPauseGame)(() => true)), "autopause did not resume after attack ended");
            TMain.playerInventory = false;
        });
        Check("Title settings keep quick tap edges until drawing", () =>
        {
            var touchType = Product.GetType("MobileJoystick.MobileTouchInput");
            var title = Product.GetType("MobileJoystick.MobileTitleSettingsSystem");
            TouchCollection sample = default; TMain.hasFocus = true;
            Microsoft.Xna.Framework.Input.Touch.TouchPanel.DisplayWidth = 1280; Microsoft.Xna.Framework.Input.Touch.TouchPanel.DisplayHeight = 720;
            using var hook = new Hook(touchType.GetMethod("GetState", All), (Func<TouchCollection>)(() => sample));
            sample = new TouchCollection(new[] { new TouchLocation(7, TouchLocationState.Pressed, new Vector2(200, 250)) });
            Call(title, null, "ReadPointer");
            sample = new TouchCollection(new[] { new TouchLocation(7, TouchLocationState.Released, new Vector2(200, 250)) });
            Call(title, null, "ReadPointer");
            Call(title, null, "ReadPointer");
            Equal((bool)title.GetField("pressed", All).GetValue(null) && (bool)title.GetField("released", All).GetValue(null), "a catch-up update erased the quick tap");
        });
        Check("Magnifier includes placement, walls and tools but excludes weapons", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction");
            foreach (Item item in new[] { new Item { type = 1, stack = 1, createTile = 1 }, new Item { type = 2, stack = 1, createWall = 1 }, new Item { type = 3, stack = 1, pick = 50 }, new Item { type = 4, stack = 1, axe = 10 }, new Item { type = 5, stack = 1, hammer = 10 } })
                Equal((bool)Call(world, null, "IsPrecisionItem", item), "building/tool item cannot open magnifier");
            Equal(!(bool)Call(world, null, "IsPrecisionItem", new Item { type = 6, stack = 1, damage = 10 }), "weapon unexpectedly opens magnifier");
        });
        Check("Magnifier waits for hold and stays inside every screen edge", () =>
        {
            var lens = Product.GetType("MobileJoystick.MobilePrecisionMagnifier");
            Equal(!(bool)Call(lens, null, "IsLongPress", 1d, 1.1d) && (bool)Call(lens, null, "IsLongPress", 1d, 1.4d), "long press timing wrong");
            foreach (var size in new[] { new Point(1280, 720), new Point(2400, 1080), new Point(800, 600) })
                foreach (var point in new[] { Vector2.Zero, new Vector2(size.X - 1, 0), new Vector2(0, size.Y - 1), new Vector2(size.X - 1, size.Y - 1), size.ToVector2() / 2 })
                {
                    var bounds = (Rectangle)Call(lens, null, "LensBounds", point, size.X, size.Y);
                    var sample = (Rectangle)Call(lens, null, "SampleBounds", point, size.X, size.Y, bounds.Width);
                    Equal(new Rectangle(0, 0, size.X, size.Y).Contains(bounds) && new Rectangle(0, 0, size.X, size.Y).Contains(sample), "magnifier or sampled region leaves screen");
                }
        });
        Check("Direct placement follows the screen finger alongside movement", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction"); Call(world, null, "Reset");
            for (int i = 0; i < TMain.projectile.Length; i++) TMain.projectile[i] ??= new Projectile();
            var contactType = Product.GetType("MobileJoystick.MobileTouchContact");
            var contacts = (System.Collections.IList)Input.GetField("Contacts", All).GetValue(null); contacts.Clear();
            TMain.LocalPlayer.inventory[0] = new Item { type = Terraria.ID.ItemID.StoneBlock, createTile = Terraria.ID.TileID.Stone, stack = 999 };
            TMain.LocalPlayer.lastMouseInterface = false; TMain.blockMouse = false; TMain.mapStyle = 0;
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "HasAnyControlTouch", true);
            Set(Input, null, "Layout", Call(Input, null, "CreateLayout", config));
            Vector2 point = new(700, 300);
            contacts.Add(Activator.CreateInstance(contactType, All, null, new object[] { 42, point, TouchLocationState.Pressed }, null));
            Call(world, null, "UpdateInput");
            Equal((bool)world.GetProperty("PrecisionHeld", All).GetValue(null), "empty-cell building finger not captured");
            TMain.mouseX = 0; TMain.mouseY = 0; Call(world, null, "SetControls", TMain.LocalPlayer);
            Equal(TMain.mouseX == 700 && TMain.mouseY == 300 && TMain.LocalPlayer.controlUseItem && !TMain.SmartCursorWanted_Mouse, "movement finger overrode direct placement");
            Equal((Vector2)Input.GetProperty("TouchCrosshairPosition", All).GetValue(null) == point, "direct touch still shows the old joystick ring");
            point = new(720, 305); contacts.Clear(); contacts.Add(Activator.CreateInstance(contactType, All, null, new object[] { 42, point, TouchLocationState.Moved }, null));
            Call(world, null, "UpdateInput"); Equal((Vector2)world.GetProperty("PrecisionPosition", All).GetValue(null) == point, "long press target does not follow drag");
            contacts.Clear(); Call(world, null, "UpdateInput"); Equal(!(bool)world.GetProperty("PrecisionHeld", All).GetValue(null), "magnifier stayed latched after release");
        });
        Check("Magnifier marker follows smart/precise mode for tools and blocks", () =>
        {
            var lens = Product.GetType("MobileJoystick.MobilePrecisionMagnifier");
            foreach (var item in new[] { new Item { type = 1, stack = 1, pick = 50 }, new Item { type = 2, stack = 1, createTile = 1 }, new Item { type = 3, stack = 1, createWall = 1 } })
            {
                Equal(!(bool)Call(lens, null, "UsesPrecisionGrid", item, true), "smart mode should show the ring");
                Equal((bool)Call(lens, null, "UsesPrecisionGrid", item, false), "precise mode should show the cross and grid");
            }
            Equal(!(bool)Call(lens, null, "UsesPrecisionGrid", new Item { type = 4, stack = 1, damage = 10 }, false), "weapon unexpectedly uses a building grid");
        });
        Check("Dragging the aim stick keeps native hold input active for ranged mods", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction"); Call(world, null, "Reset");
            var contacts = (System.Collections.IList)Input.GetField("Contacts", All).GetValue(null); contacts.Clear();
            var actions = (HashSet<MobileControlAction>)Input.GetField("CurrentActions", All).GetValue(null); actions.Clear();
            var pressed = (HashSet<MobileControlAction>)Input.GetField("PressedActions", All).GetValue(null); pressed.Clear();
            TMain.playerInventory = TMain.mapFullscreen = TMain.ingameOptionsWindow = TMain.inFancyUI = false;
            TMain.LocalPlayer.SetTalkNPC(-1); TMain.mouseItem = new Item(); TMain.gameMenu = false;
            TMain.LocalPlayer.inventory[0] = new Item { type = 1, stack = 1, channel = true, shoot = 1 };
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "HasAnyControlTouch", true); Set(Input, null, "AttackHeld", true); Set(Input, null, "AttackJustPressed", true); SetAimAndUse(true);
            TMain.mouseLeft = false; PlayerInput.Triggers.Current.MouseLeft = false;
            Call(Input, null, "ApplyGameplayTriggers");
            Equal(PlayerInput.Triggers.Current.MouseLeft && PlayerInput.Triggers.JustPressed.MouseLeft, "ranged mod sees no initial hold");
            Equal(!TMain.mouseLeft, "gameplay trigger leaked into UI mouse clicks");
            Set(Input, null, "AttackJustPressed", false);

            for (int frame = 0; frame < 90; frame++)
            {
                PlayerInput.Triggers.Current.MouseLeft = false; PlayerInput.Triggers.JustPressed.MouseLeft = false;
                Set(Input, null, "hasTouchAimPosition", true); Set(Input, null, "previousAimOrigin", null);
                Set(Input, null, "touchAimPosition", new Vector2(800 + frame, 300 + frame * .5f));
                Call(Input, null, "ApplyGameplayTriggers"); MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
                Equal(PlayerInput.Triggers.Current.MouseLeft && TMain.LocalPlayer.controlUseItem, $"hold lost while dragging frame {frame}");
                Equal(!PlayerInput.Triggers.JustPressed.MouseLeft, "drag repeatedly re-pressed attack");
                Equal(TMain.mouseX == 800 + frame && TMain.mouseY == (int)(300 + frame * .5f), "ranged aim stopped following the drag");
            }
            Set(Input, null, "AttackHeld", false); PlayerInput.Triggers.Current.MouseLeft = false;
            Call(Input, null, "ApplyGameplayTriggers");
            Equal(!PlayerInput.Triggers.Current.MouseLeft && PlayerInput.Triggers.JustReleased.MouseLeft, "release did not stop held weapon");
        });
        Check("Native ranged hold respects aim-only, UI and explicit Use", () =>
        {
            var actions = (HashSet<MobileControlAction>)Input.GetField("CurrentActions", All).GetValue(null); actions.Clear();
            Set(Input, null, "AttackHeld", true); SetAimAndUse(false);
            PlayerInput.Triggers.Current.MouseLeft = false; Call(Input, null, "ApplyGameplayTriggers");
            Equal(!PlayerInput.Triggers.Current.MouseLeft, "aim-only fires native ranged mods");
            actions.Add(MobileControlAction.UseItem); Call(Input, null, "ApplyGameplayTriggers");
            Equal(PlayerInput.Triggers.Current.MouseLeft, "separate Use button does not hold native input");
            foreach (string mode in new[] { "inventory", "map", "options", "fancy", "npc" })
            {
                TMain.playerInventory = mode == "inventory"; TMain.mapFullscreen = mode == "map"; TMain.ingameOptionsWindow = mode == "options"; TMain.inFancyUI = mode == "fancy";
                Set(typeof(Player), TMain.LocalPlayer, "talkNPC", mode == "npc" ? 0 : -1); PlayerInput.Triggers.Current.MouseLeft = false;
                Call(Input, null, "ApplyGameplayTriggers"); Equal(!PlayerInput.Triggers.Current.MouseLeft, "native attack continued in " + mode);
            }
            TMain.playerInventory = TMain.mapFullscreen = TMain.ingameOptionsWindow = TMain.inFancyUI = false; TMain.LocalPlayer.SetTalkNPC(-1); actions.Clear();
        });
        Check("Real pressed/moved/released samples keep ranged fire through a long drag", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction"); Call(world, null, "Reset");
            TMain.dedServ = false; TMain.hasFocus = true; TMain.gameMenu = false;
            TMain.playerInventory = TMain.mapFullscreen = TMain.ingameOptionsWindow = TMain.inFancyUI = false;
            TMain.LocalPlayer.SetTalkNPC(-1); TMain.LocalPlayer.dead = false; TMain.LocalPlayer.ghost = false;
            TMain.LocalPlayer.inventory[0] = new Item { type = 1, stack = 1, shoot = 1, channel = true };
            Call(Input, null, "Reset");
            var layout = Call(Input, null, "CreateLayout", config);
            var center = (Vector2)layout.GetType().GetProperty("AttackCenter").GetValue(layout);
            TouchCollection sample = default;
            var touchType = Product.GetType("MobileJoystick.MobileTouchInput");
            using var hook = new Hook(touchType.GetMethod("GetState", All), (Func<TouchCollection>)(() => sample));

            for (int frame = 0; frame < 120; frame++)
            {
                sample = new TouchCollection(new[] { new TouchLocation(77, frame == 0 ? TouchLocationState.Pressed : TouchLocationState.Moved, center + new Vector2(frame * .65f, -frame * .3f)) });
                TMain.mouseLeft = false; PlayerInput.Triggers.Current.MouseLeft = false; PlayerInput.Triggers.JustPressed.MouseLeft = false;
                TMain.LocalPlayer.controlUseItem = false;
                Call(Input, null, "Update"); Call(world, null, "UpdateInput"); Call(Input, null, "ApplyGameplayTriggers"); MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
                Equal((bool)Input.GetProperty("AttackHeld", All).GetValue(null) && PlayerInput.Triggers.Current.MouseLeft && TMain.LocalPlayer.controlUseItem, $"real drag lost fire at frame {frame}");
            }
            sample = new TouchCollection(new[] { new TouchLocation(77, TouchLocationState.Released, center + new Vector2(78, -36)) });
            PlayerInput.Triggers.Current.MouseLeft = false; TMain.LocalPlayer.controlUseItem = false;
            Call(Input, null, "Update"); Call(world, null, "UpdateInput"); Call(Input, null, "ApplyGameplayTriggers"); MobileJoystickPlayer.SetControls(TMain.LocalPlayer);
            Equal(!(bool)Input.GetProperty("AttackHeld", All).GetValue(null) && !PlayerInput.Triggers.Current.MouseLeft && !TMain.LocalPlayer.controlUseItem, "actual release leaves ranged fire stuck");
            TMain.dedServ = true;
        });
        Check("Simultaneous move and aim retain contact identity after SDL compaction", () =>
        {
            var world = Product.GetType("MobileJoystick.MobileWorldInteraction"); Call(world, null, "Reset");
            TMain.dedServ = false; TMain.hasFocus = true; TMain.gameMenu = false;
            TMain.playerInventory = TMain.mapFullscreen = TMain.ingameOptionsWindow = TMain.inFancyUI = false;
            TMain.LocalPlayer.SetTalkNPC(-1); TMain.LocalPlayer.dead = false; TMain.LocalPlayer.ghost = false;
            Call(Input, null, "Reset");
            var layout = Call(Input, null, "CreateLayout", config);
            Vector2 move = (Vector2)layout.GetType().GetProperty("JoystickCenter").GetValue(layout);
            Vector2 aim = (Vector2)layout.GetType().GetProperty("AttackCenter").GetValue(layout);
            var touchType = Product.GetType("MobileJoystick.MobileTouchInput");
            TouchCollection sample = new(new[] { new TouchLocation(10, TouchLocationState.Pressed, move), new TouchLocation(20, TouchLocationState.Pressed, aim) });
            using var hook = new Hook(touchType.GetMethod("GetState", All), (Func<TouchCollection>)(() => sample));
            Call(Input, null, "Update");
            sample = new(new[] { new TouchLocation(10, TouchLocationState.Moved, move + new Vector2(50, 0)), new TouchLocation(20, TouchLocationState.Moved, aim + new Vector2(20, -10)) });
            Call(Input, null, "Update");
            Equal(((Vector2)Input.GetProperty("JoystickVector", All).GetValue(null)).X > 0 && (bool)Input.GetProperty("AttackHeld", All).GetValue(null), "movement and attack did not coexist");
            sample = new(new[] { new TouchLocation(20, TouchLocationState.Moved, aim + new Vector2(30, -10)), new TouchLocation(10, TouchLocationState.Released, move) });
            Call(Input, null, "Update");
            Equal((Vector2)Input.GetProperty("JoystickVector", All).GetValue(null) == Vector2.Zero && (bool)Input.GetProperty("AttackHeld", All).GetValue(null), "releasing movement stole the compacted aim contact");
            sample = new(new[] { new TouchLocation(20, TouchLocationState.Released, aim) }); Call(Input, null, "Update");
            Equal(!(bool)Input.GetProperty("AttackHeld", All).GetValue(null), "releasing final contact left attack held");
            TMain.dedServ = true;
        });
        if (Environment.GetEnvironmentVariable("MJ_INNOVAULT_DLL") is string innoPath) Check("Installed InnoVault PressKey reads a sustained native attack", () =>
        {
            var inno = Assembly.LoadFrom(Path.GetFullPath(innoPath));
            var press = inno.GetType("InnoVault.VaultUtils").GetMethod("PressKey");
            Set(Input, null, "EnabledThisFrame", true); Set(Input, null, "AttackHeld", true); SetAimAndUse(true);
            Call(Input, null, "ApplyGameplayTriggers");
            Equal((bool)press.Invoke(null, new object[] { TMain.LocalPlayer, true, true }), "actual InnoVault rejected mobile hold");
            Set(Input, null, "AttackHeld", false); PlayerInput.Triggers.Current.MouseLeft = false; Call(Input, null, "ApplyGameplayTriggers");
            Equal(!(bool)press.Invoke(null, new object[] { TMain.LocalPlayer, true, true }), "actual InnoVault did not release");
        });
        Console.WriteLine($"{failures} failures"); Environment.ExitCode = failures == 0 ? 0 : 1;
    }
}
