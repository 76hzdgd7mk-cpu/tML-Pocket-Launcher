using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using log4net;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using MonoMod.RuntimeDetour;
using Terraria;
using Terraria.ModLoader;
using Terraria.UI;

namespace MobileJoystick;

public abstract class MobileSystem
{
    public virtual void Load() { }
    public virtual void Unload() { }
    public virtual void PostSetupContent() { }
    public virtual void PostAddRecipes() { }
    public virtual void OnWorldUnload() { }
    public virtual void PostUpdateInput() { }
    public virtual void ModifyInterfaceLayers(List<GameInterfaceLayer> layers) { }
    public virtual void ModifyScreenPosition() { }
}

public sealed class MobileControlsSession : IDisposable
{
    private delegate void LoadContent(CancellationToken cancellation);
    private delegate void LoadHook(LoadContent next, CancellationToken cancellation);
    private delegate bool UnloadMods();
    private delegate bool UnloadHook(UnloadMods next);
    private delegate bool DrawNpc(NPC npc, SpriteBatch batch, Vector2 screenPosition, Color color);
    private delegate bool DrawNpcHook(DrawNpc next, NPC npc, SpriteBatch batch, Vector2 screenPosition, Color color);
    private static MobileControlsSession current;
    private readonly Dictionary<Type, MobileSystem> instances = new();
    private readonly List<MobileSystem> loaded = new();
    private readonly List<IDisposable> hooks = new();
    private volatile bool ready;
    internal static readonly ILog Logger = LogManager.GetLogger("MobileControls");

    internal static T Get<T>() where T : MobileSystem => (T)current.instances[typeof(T)];

    public static IDisposable Initialize()
    {
        var session = new MobileControlsSession();
        try
        {
            current = session;
            session.Install();
            Console.WriteLine("[MobileControls] Embedded patch hooks installed.");
            return session;
        }
        catch
        {
            session.Dispose();
            throw;
        }
    }

    private void Install()
    {
        Hook(typeof(ModContent), "Load", (LoadHook)AfterLoad, typeof(CancellationToken));
        Hook(typeof(ModLoader), "Unload", (UnloadHook)BeforeUnload);
        Hook(typeof(SystemLoader), "PostUpdateInput", (Action<Action>)PostInput);
        Hook(typeof(SystemLoader), "ModifyInterfaceLayers",
            (Action<Action<List<GameInterfaceLayer>>, List<GameInterfaceLayer>>)ModifyLayers, typeof(List<GameInterfaceLayer>));
        Hook(typeof(SystemLoader), "ModifyScreenPosition", (Action<Action>)(next => After(next, system => system.ModifyScreenPosition())));
        Hook(typeof(SystemLoader), "OnWorldUnload", (Action<Action>)(next => After(next, system => system.OnWorldUnload())));
        Hook(typeof(PlayerLoader), "SetControls", (Action<Action<Player>, Player>)SetControls, typeof(Player));
        Hook(typeof(NPCLoader), "PreDraw", (DrawNpcHook)PreDraw, typeof(NPC), typeof(SpriteBatch), typeof(Vector2), typeof(Color));
    }

    private void Hook(Type owner, string name, Delegate handler, params Type[] parameters)
    {
        var method = owner.GetMethod(name, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, null, parameters, null)
            ?? throw new MissingMethodException(owner.FullName, name);
        hooks.Add(new Hook(method, handler));
    }

    private void AfterLoad(LoadContent next, CancellationToken cancellation)
    {
        Console.WriteLine("[MobileControls] Waiting for tModLoader content loading.");
        next(cancellation);
        if (Main.dedServ || cancellation.IsCancellationRequested) return;
        Console.WriteLine("[MobileControls] Initializing embedded systems on the game thread.");
        OnGameThread(() =>
        {
            try
            {
                MobileJoystickConfig.Load();
                var types = typeof(MobileSystem).Assembly.GetTypes().Where(type => !type.IsAbstract && type.IsSubclassOf(typeof(MobileSystem)))
                    .OrderBy(type => type == typeof(MobileJoystickSystem) ? 0 : type == typeof(MobileMenuSystem) ? 2 : 1)
                    .ThenBy(type => type.Name, StringComparer.Ordinal);
                foreach (var type in types)
                    instances.Add(type, (MobileSystem)Activator.CreateInstance(type, nonPublic: true));
                foreach (var system in instances.Values)
                {
                    loaded.Add(system);
                    Logger.Debug($"Loading {system.GetType().Name}");
                    system.Load();
                }
                foreach (var system in loaded) system.PostSetupContent();
                foreach (var system in loaded) system.PostAddRecipes();
                ready = true;
                Console.WriteLine($"[MobileControls] Embedded patch active ({loaded.Count} systems).");
            }
            catch (Exception error)
            {
                Logger.Error("Mobile controls initialization failed", error);
                Release();
                throw;
            }
        });
    }

    private bool BeforeUnload(UnloadMods next)
    {
        Stop();
        bool result = next();
        Logger.Debug($"tModLoader content unload returned {result}");
        return result;
    }

    private void PostInput(Action next) => After(next, system => system.PostUpdateInput());

    private void ModifyLayers(Action<List<GameInterfaceLayer>> next, List<GameInterfaceLayer> layers)
    {
        next(layers);
        if (ready)
            foreach (var system in loaded) system.ModifyInterfaceLayers(layers);
    }

    private void After(Action next, Action<MobileSystem> run)
    {
        next();
        if (ready)
            foreach (var system in loaded) run(system);
    }

    private void SetControls(Action<Player> next, Player player)
    {
        next(player);
        if (ready) MobileJoystickPlayer.SetControls(player);
    }

    private bool PreDraw(DrawNpc next, NPC npc, SpriteBatch batch, Vector2 screenPosition, Color color) =>
        next(npc, batch, screenPosition, color) && (!ready || MobileInteractionHighlight.PreDraw(npc, batch, screenPosition, color));

    private static void OnGameThread(Action action)
    {
        if (Program.IsMainThread) action();
        else
        {
            var result = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            Main.QueueMainThreadAction(() =>
            {
                try { action(); result.SetResult(); }
                catch (Exception error) { result.SetException(error); }
            });
            result.Task.GetAwaiter().GetResult();
        }
    }

    private void Release()
    {
        for (int index = loaded.Count - 1; index >= 0; index--)
        {
            try { loaded[index].Unload(); }
            catch (Exception error) { Logger.Warn($"Could not unload {loaded[index].GetType().Name}", error); }
        }
        loaded.Clear();
        instances.Clear();
        ExternalUiLayoutRegistry.Clear();
        MobileInteractionHighlight.Clear();
    }

    private void Stop()
    {
        ready = false;
        if (loaded.Count > 0) OnGameThread(Release);
    }

    public void Dispose()
    {
        Stop();
        for (int index = hooks.Count - 1; index >= 0; index--) hooks[index].Dispose();
        hooks.Clear();
        current = null;
    }
}
