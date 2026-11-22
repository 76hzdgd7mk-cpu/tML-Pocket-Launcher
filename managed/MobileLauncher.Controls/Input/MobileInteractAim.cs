using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input.Touch;
using Terraria;

namespace MobileJoystick;

internal static partial class MobileJoystickInput
{
    private static int interactFingerId = int.MinValue, interactContactThisFrame = int.MinValue;
    private static MobileControlButton interactButton;
    private static Vector2 interactStart;
    private static Vector2? interactTapTarget;
    private static bool interactHasAim;
    internal static Vector2 InteractKnobOffset { get; private set; }
    internal static MobileControlButton InteractButton => interactButton;
    internal static bool InteractHeld => interactFingerId != int.MinValue;
    private static bool IsInteractContact(int id) => id == interactFingerId || id == interactContactThisFrame;

    private static void ResetInteractAim()
    {
        interactFingerId = interactContactThisFrame = int.MinValue;
        interactHasAim = false;
        interactTapTarget = null;
        InteractKnobOffset = Vector2.Zero;
    }

    private static void UpdateInteractAim()
    {
        interactContactThisFrame = int.MinValue;
        InteractKnobOffset = Vector2.Zero;
        if (InteractHeld) {
            bool found = false;
            foreach (MobileTouchContact contact in Contacts) {
                if (contact.Id != interactFingerId) continue;
                found = true;
                interactContactThisFrame = contact.Id;
                if (contact.IsReleased || !IsButtonAvailable(interactButton) || !Main.mouseItem.IsAir) {
                    interactFingerId = int.MinValue;
                    interactHasAim = false;
                    interactTapTarget = null;
                    break;
                }
                Vector2 delta = contact.Position - interactStart;
                if (interactTapTarget.HasValue && delta.LengthSquared() <= 16f) break;
                interactTapTarget = null;
                InteractKnobOffset = delta / System.Math.Max(1f, interactButton.Radius);
                if (InteractKnobOffset.LengthSquared() > 1) InteractKnobOffset = Vector2.Normalize(InteractKnobOffset);
                break;
            }
            if (!found) ResetInteractAim();
        }
        if (!InteractHeld && interactContactThisFrame == int.MinValue) {
            foreach (MobileTouchContact contact in Contacts) {
                if (contact.State != TouchLocationState.Pressed || IsGrappleContact(contact.Id) || IsRadialContact(contact.Id)
                    || contact.Id == joystickFingerId || contact.Id == attackFingerId
                    || MobileInventorySystem.BlocksControl(contact.Position) || MobileInventorySystem.OwnsContact(contact.Id)) continue;
                foreach (MobileControlButton button in Layout.Buttons) {
                    if (button.Action != MobileControlAction.Interact || !IsButtonAvailable(button)
                        || !button.Contains(contact.Position) || !CanActivateCustomButton(button, contact)) continue;
                    interactFingerId = interactContactThisFrame = contact.Id;
                    interactButton = button;
                    interactStart = contact.Position;
                    interactTapTarget = hasTouchAimPosition ? MobileWorldInteraction.ToWorld(BaseTouchAimPosition)
                        : MobileInteractionTarget.NativeTapTarget();
                    interactHasAim = true;
                    break;
                }
                if (InteractHeld) break;
            }
        }
        if (InteractHeld) CurrentActions.Add(MobileControlAction.Interact);
        if (interactContactThisFrame != int.MinValue) HasAnyControlTouch = true;
    }

    private static Vector2 InteractAimPosition => interactTapTarget is Vector2 target
        ? MobileWorldInteraction.ToScreen(target)
        : MobileWorldInteraction.ToScreen(Main.LocalPlayer.MountedCenter) + InteractKnobOffset * CharacterAimRadius;

    internal static float CharacterAimRadius => 80f * MobileJoystickLayout.GetControlScale(
        MobileJoystickConfig.Instance, Terraria.GameInput.PlayerInput.RealScreenWidth, Terraria.GameInput.PlayerInput.RealScreenHeight);
}
