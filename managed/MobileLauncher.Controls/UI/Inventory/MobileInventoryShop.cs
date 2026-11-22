using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.GameContent;
using Terraria.GameContent.UI;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.UI;

namespace MobileJoystick;

public partial class MobileInventorySystem
{
	private int selectedShopSlot = -1, selectedShopNpc = -1;
	private Item[] selectedShopStock;

	private void SelectShopItem(Item[] stock, int index, Rectangle bounds)
	{
		selectedShopStock = stock; selectedShopNpc = Main.LocalPlayer.talkNPC;
		selectedShopSlot = index;
		if (!stock[index].IsAir) OpenItemDetails(new InventoryGestureSlot(stock, ItemSlot.Context.ShopItem, index, bounds, false));
		else CloseRecipeDetails();
	}

	private void DrawShop()
	{
		if (Main.npcShop <= 0 || Main.npcShop >= Main.instance.shop.Length || Main.instance.shop[Main.npcShop] is not Chest shop) return;
		if (!ReferenceEquals(selectedShopStock, shop.item) || selectedShopNpc != Main.LocalPlayer.talkNPC) selectedShopSlot = -1;
		for (int i = 0; i < Math.Min(40, shop.item.Length); i++) {
			Rectangle r = layout.ShopSlot(i);
			DrawPhoneSlot(shop.item[i], ItemSlot.Context.ShopItem, i, r);
			if (!used && pointerPressed && Hover(r)) { SelectShopItem(shop.item, i, r); used = true; }
		}
		if (selectedShopSlot >= 0 && !shop.item[selectedShopSlot].IsAir) {
			Rectangle selected = layout.ShopSlot(selectedShopSlot);
			InventorySurface(selected, "ToolOutline", Color.YellowGreen);
			if (itemDetailsSource is { Context: ItemSlot.Context.ShopItem }) recipeDetailsExpires = InventoryUiTick + 300;
		}
		NPC npc = Main.npc[Main.LocalPlayer.talkNPC];
		Rectangle close = layout.RightTabDefault(0);
		InventoryButtonSurface(close, "SlotShop", Color.White);
		MobileInteractionArtwork.DrawNpc(Main.spriteBatch, npc, close.Center.ToVector2(), close.Width * .8f, Color.White);
		Tooltip(close, T("CloseShop"));
		if (Click(close)) { Main.LocalPlayer.SetTalkNPC(-1); Main.SetNPCShopIndex(0); selectedShopSlot = -1; CloseRecipeDetails(); Recipe.FindRecipes(); return; }
		Rectangle buy = layout.ShopBuy;
		bool available = selectedShopSlot >= 0 && !shop.item[selectedShopSlot].IsAir;
		InventoryButtonSurface(buy, "SlotShop", available ? Color.White : Color.White * .4f, available);
		if (available) MobileJoystickSystem.DrawItemIcon(Main.spriteBatch, shop.item[selectedShopSlot], buy.Center.ToVector2() - new Vector2(0, 8 * layout.Scale), buy.Width * .65f, Color.White);
		Text(T("Buy"), new Rectangle(buy.X, buy.Bottom - (int)(22 * layout.Scale), buy.Width, (int)(22 * layout.Scale)), .8f);
		if (available && Click(buy)) { BuyShopItem(selectedShopSlot); Recipe.FindRecipes(); }
		double price = Main.LocalPlayer.currentShoppingSettings.PriceAdjustment;
		Text(T("Price") + $" {price:P0}", layout.Right(300, 260, 150, 32), .75f);
	}

	private void DrawShopSellAction()
	{
		Rectangle bounds = layout.ShopSell;
		bool available = selectedSlot >= 0 && selectedSlot < 50 && !Main.LocalPlayer.inventory[selectedSlot].IsAir;
		Item item = available ? Main.LocalPlayer.inventory[selectedSlot] : null;
		bool enabled = available && !item.favorited && (item.type < ItemID.CopperCoin || item.type > ItemID.PlatinumCoin);
		InventoryButtonSurface(bounds, "SlotShop", enabled ? Color.White : Color.White * .4f, enabled);
		if (available) MobileJoystickSystem.DrawItemIcon(Main.spriteBatch, item, bounds.Center.ToVector2() - new Vector2(0, 8 * layout.Scale), bounds.Width * .65f, Color.White);
		Text(T("Sell"), new Rectangle(bounds.X, bounds.Bottom - (int)(22 * layout.Scale), bounds.Width, (int)(22 * layout.Scale)), .8f);
		if (enabled && Click(bounds)) {
			int amount = splitSource.HasValue && splitSource.Value.Index == selectedSlot ? splitAmount : 0;
			SellInventoryItem(new InventoryGestureSlot(Main.LocalPlayer.inventory, ItemSlot.Context.InventoryItem, selectedSlot, layout.Inventory(selectedSlot), false), amount);
		}
	}

	private void BuyShopItem(int index)
	{
		if (!MobileShop || Main.npcShop >= Main.instance.shop.Length) return;
		int cooldown = Main.stackSplit, acceleration = Main.superFastStack;
		bool intoInventory = Main.mouseItem.IsAir;
		try {
			// Confirmation is one purchase, even if autopause froze native repeat state.
			Main.stackSplit = Main.superFastStack = 0;
			NativeTouchClick(() => ItemSlot.Handle(Main.instance.shop[Main.npcShop].item, ItemSlot.Context.ShopItem, index));
			if (intoInventory && !Main.mouseItem.IsAir)
				Main.mouseItem = Main.LocalPlayer.GetItem(Main.myPlayer, Main.mouseItem, GetItemSettings.InventoryUIToInventorySettingsShowAsNew);
		}
		finally { Main.stackSplit = cooldown; Main.superFastStack = acceleration; }
	}

	private void SellInventoryItem(InventoryGestureSlot source, int amount = 0)
	{
		if (!MobileShop || source.Locked || !ReferenceEquals(source.Items, Main.LocalPlayer.inventory)
			|| source.Index >= 58 || source.Item.IsAir || source.Item.favorited
			|| source.Item.type >= ItemID.CopperCoin && source.Item.type <= ItemID.PlatinumCoin) return;
		if (amount > 0 && amount < source.Item.stack) {
			Item[] part = { ItemLoader.TransferWithLimit(source.Item, amount) };
			try { ItemSlot.SellOrTrash(part, source.Context, 0); }
			finally { if (!part[0].IsAir) ItemLoader.StackItems(source.Item, part[0], out _); }
		}
		else ItemSlot.SellOrTrash(source.Items, source.Context, source.Index);
		splitSource = null;
		CloseRecipeDetails();
	}

	// Add prices before ModifyTooltips so currency and mod tooltip hooks still apply.
	private void AppendShopPrice(Item item, ref int count, string[] text, string[] names)
	{
		if (!MobileShop || item.value < 0 || item.type >= ItemID.CopperCoin && item.type <= ItemID.PlatinumCoin) return;
		bool buying = itemDetailsSource is { Context: ItemSlot.Context.ShopItem };
		Main.LocalPlayer.GetItemExpectedPrice(item, out long selling, out long purchase);
		long price = buying ? purchase : Math.Max(1, selling / 5) * item.stack;
		if (!buying && selling > 0) price += (purchase - Math.Max(1, selling / 5)) * Math.Min(Main.shopSellbackHelper.GetAmount(item), item.stack);
		if (item.shopSpecialCurrency != -1) {
			int first = count;
			CustomCurrencyManager.GetPriceText(item.shopSpecialCurrency, text, ref count, buying ? purchase : selling);
			for (int i = first; i < count; i++) names[i] = "SpecialPrice";
			return;
		}
		var coins = new List<string>();
		long remaining = price;
		long[] units = { 1000000, 10000, 100, 1 };
		for (int i = 0; i < units.Length; i++) { long value = remaining / units[i]; remaining %= units[i]; if (value > 0) coins.Add(value + " " + Lang.inter[15 + i].Value); }
		names[count] = "Price";
		text[count++] = (buying ? Lang.tip[50].Value : Lang.tip[49].Value) + " " + (selling <= 0 && !buying ? T("NoValue") : coins.Count == 0 ? T("Free") : string.Join(" ", coins));
	}
}
