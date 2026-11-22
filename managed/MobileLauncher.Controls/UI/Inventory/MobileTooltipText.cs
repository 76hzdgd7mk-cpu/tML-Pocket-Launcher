using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace MobileJoystick;

// Wrap at Unicode text elements so Chinese text needs no spaces. Terraria color
// and item tags remain valid on both sides of a line break.
internal static class MobileTooltipText
{
	internal static string Wrap(string text, float width, Func<string, float> measure)
	{
		if (string.IsNullOrEmpty(text)) return text ?? "";
		var result = new StringBuilder();
		float x = 0;
		foreach (string token in Tokens(text)) {
			if (token == "\r") continue;
			if (token == "\n") { result.Append('\n'); x = 0; continue; }
			float size = measure(token);
			if (x > 0 && x + size > Math.Max(1, width)) { result.Append('\n'); x = 0; }
			result.Append(token);
			x += size;
		}
		return result.ToString();
	}

	private static IEnumerable<string> Tokens(string text)
	{
		for (int i = 0; i < text.Length;) {
			if (text[i] == '[' && text.IndexOf(']', i) is int end && end > i) {
				string tag = text[i..(end + 1)];
				int colon = tag.IndexOf(':');
				if (tag.StartsWith("[c/", StringComparison.OrdinalIgnoreCase) && colon > 3) {
					foreach (string element in Tokens(tag[(colon + 1)..^1]))
						yield return element is "\r" or "\n" ? element : tag[..(colon + 1)] + element + "]";
				}
				else yield return tag;
				i = end + 1;
				continue;
			}
			string next = StringInfo.GetNextTextElement(text, i);
			yield return next;
			i += next.Length;
		}
	}
}
