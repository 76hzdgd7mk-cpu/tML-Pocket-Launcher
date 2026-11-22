using System;
using Newtonsoft.Json.Linq;
using Terraria.Localization;

namespace MobileJoystick;

internal static class MobileControlsText
{
    private static readonly Lazy<JObject> English = new(() => Load("en-US"));
    private static readonly Lazy<JObject> Chinese = new(() => Load("zh-Hans"));

    private static JObject Load(string culture) => JObject.Parse(Hjson.HjsonValue.Parse(
        UiTextureAssets.ReadText($"Localization/{culture}_Mods.MobileJoystick.hjson")).ToString()).Value<JObject>("UI");

    internal static string Get(string key, params object[] arguments)
    {
        string value = (Language.ActiveCulture.Name == "zh-Hans" ? Chinese.Value.Value<string>(key) : null)
            ?? English.Value.Value<string>(key) ?? key;
        return arguments.Length == 0 ? value : string.Format(value, arguments);
    }
}
