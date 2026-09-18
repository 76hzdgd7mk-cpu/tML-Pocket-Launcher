using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;

namespace FnaSample;

internal static class Program
{
    private static void Main(string[] args)
    {
        using var game = new SampleGame();
        game.Run();
    }
}

internal sealed class SampleGame : Game
{
    private readonly GraphicsDeviceManager graphics;
    private SpriteBatch? spriteBatch;
    private Texture2D? pixel;
    private float position;
    private int direction = 1;

    public SampleGame()
    {
        graphics = new GraphicsDeviceManager(this)
        {
            PreferredBackBufferWidth = 1280,
            PreferredBackBufferHeight = 720,
            SynchronizeWithVerticalRetrace = true
        };
        Window.Title = "FNA Android CoreCLR Sample";
        IsMouseVisible = true;
    }

    protected override void Initialize()
    {
        position = graphics.PreferredBackBufferWidth / 2f;
        base.Initialize();
    }

    protected override void LoadContent()
    {
        spriteBatch = new SpriteBatch(GraphicsDevice);
        pixel = new Texture2D(GraphicsDevice, 1, 1);
        pixel.SetData(new[] { Color.White });
    }

    protected override void Update(GameTime gameTime)
    {
        var keyboard = Keyboard.GetState();
        if (keyboard.IsKeyDown(Keys.Escape) || keyboard.IsKeyDown(Keys.Back))
        {
            Exit();
        }

        var delta = (float)gameTime.ElapsedGameTime.TotalSeconds;
        position += direction * delta * 240f;
        if (position < 80f)
        {
            position = 80f;
            direction = 1;
        }
        else if (position > graphics.PreferredBackBufferWidth - 80f)
        {
            position = graphics.PreferredBackBufferWidth - 80f;
            direction = -1;
        }

        base.Update(gameTime);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(new Color(18, 24, 30));
        if (spriteBatch is null || pixel is null)
        {
            base.Draw(gameTime);
            return;
        }

        spriteBatch.Begin();
        var rectangle = new Rectangle((int)position - 64, 300, 128, 128);
        spriteBatch.Draw(pixel, rectangle, new Color(64, 210, 190));
        spriteBatch.End();
        base.Draw(gameTime);
    }
}
