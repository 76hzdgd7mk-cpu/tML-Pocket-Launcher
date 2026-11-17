using System.Reflection;
using System.Runtime.CompilerServices;
using MobileLauncher.Bootstrap.Compatibility;
using Xunit;

namespace MobileLauncher.Bootstrap.Tests;

public sealed class RuntimeMethodHookTests
{
    [Fact]
    public void ChangedArgumentsReachOriginalDelegateAndDisposeRestoresTarget()
    {
        var target = typeof(Targets).GetMethod(nameof(Targets.Add))!;
        Assert.Equal(5, Targets.Add(2, 3));
        using (new RuntimeMethodHook(target, (values, next) =>
        {
            values[0] = 10;
            return (int)next()! * 2;
        }))
        {
            Assert.Equal(26, Targets.Add(2, 3));
        }
        Assert.Equal(5, Targets.Add(2, 3));
    }

    [Fact]
    public void InstanceReceiverAndVoidOriginalArePassedThrough()
    {
        var target = new Targets();
        using (new RuntimeMethodHook(typeof(Targets).GetMethod(nameof(Targets.Store))!, (values, next) =>
        {
            Assert.Same(target, values[0]);
            values[1] = 42;
            return next();
        }))
        {
            target.Store(1);
            Assert.Equal(42, target.Value);
        }
        target.Store(7);
        Assert.Equal(7, target.Value);
    }

    [Fact]
    public void OriginalFailureIsUnwrappedAndNotReturnedAsReflectionException()
    {
        using var hook = new RuntimeMethodHook(typeof(Targets).GetMethod(nameof(Targets.Fail))!, (_, next) => next());
        var error = Assert.Throws<InvalidOperationException>(Targets.Fail);
        Assert.Equal("target failure", error.Message);
    }

    [Fact]
    public void InterceptorCanReplaceResultWithoutCallingOriginal()
    {
        using var hook = new RuntimeMethodHook(typeof(Targets).GetMethod(nameof(Targets.Identity))!, (_, _) => "replacement");
        Assert.Equal("replacement", Targets.Identity("original"));
    }

    [Fact]
    public void RefSignaturesAreRejectedBeforeInstallingHooks()
    {
        Assert.Throws<NotSupportedException>(() => new RuntimeMethodHook(
            typeof(Targets).GetMethod(nameof(Targets.ByRef))!, (_, _) => null));
    }

    [Fact]
    public void WorkshopStyleOutParametersCanBeReplacedWithoutCallingDesktopCode()
    {
        using (new RuntimeMethodHook(typeof(Targets).GetMethod(nameof(Targets.CheckWorkshop))!, (values, _) =>
        {
            Assert.Equal(new object?[] { null, null, null }, values);
            values[0] = null;
            values[1] = string.Empty;
            values[2] = string.Empty;
            return string.Empty;
        }))
        {
            Assert.Equal(string.Empty, Targets.CheckWorkshop(out var resolve, out var accept, out var cancel));
            Assert.Null(resolve);
            Assert.Equal(string.Empty, accept);
            Assert.Equal(string.Empty, cancel);
        }
        Assert.Equal("desktop", Targets.CheckWorkshop(out var original, out _, out _));
        Assert.NotNull(original);
    }

    [Fact]
    public void OriginalOutValuesReachInterceptorAndCaller()
    {
        var target = new Targets();
        using var hook = new RuntimeMethodHook(typeof(Targets).GetMethod(nameof(Targets.Measure))!, (values, next) =>
        {
            Assert.Same(target, values[0]);
            Assert.Equal(0, values[2]);
            values[1] = "abcd";
            var result = next();
            Assert.Equal(4, values[2]);
            values[2] = 8;
            return result;
        });
        Assert.True(target.Measure("a", out var count));
        Assert.Equal(8, count);
    }

    public sealed class Targets
    {
        public int Value { get; private set; }
        [MethodImpl(MethodImplOptions.NoInlining)] public static int Add(int left, int right) => left + right;
        [MethodImpl(MethodImplOptions.NoInlining)] public static string Identity(string value) => value;
        [MethodImpl(MethodImplOptions.NoInlining)] public void Store(int value) => Value = value;
        [MethodImpl(MethodImplOptions.NoInlining)] public static void Fail() => throw new InvalidOperationException("target failure");
        public static void ByRef(ref int value) => value++;
        [MethodImpl(MethodImplOptions.NoInlining)]
        public static string CheckWorkshop(out Action resolve, out string accept, out string cancel)
        {
            resolve = () => { };
            accept = "accept";
            cancel = "cancel";
            return "desktop";
        }
        [MethodImpl(MethodImplOptions.NoInlining)]
        public bool Measure(string text, out int count)
        {
            count = text.Length;
            return true;
        }
    }
}
