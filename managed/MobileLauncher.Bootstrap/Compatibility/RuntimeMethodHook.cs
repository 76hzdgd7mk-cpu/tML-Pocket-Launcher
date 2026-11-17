using System.Linq.Expressions;
using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.ExceptionServices;
using MonoMod.RuntimeDetour;

namespace MobileLauncher.Bootstrap.Compatibility;

/// <summary>Adapts reflection-only patches to the exact signature of an imported assembly.</summary>
public sealed class RuntimeMethodHook : IDisposable
{
    private readonly Hook _hook;

    public RuntimeMethodHook(MethodInfo target, Func<object?[], Func<object?>, object?> intercept)
    {
        if (target.ContainsGenericParameters || target.ReturnType.IsByRef ||
            target.GetParameters().Any(parameter => parameter.ParameterType.IsByRef && (!parameter.IsOut || parameter.IsIn)))
        {
            throw new NotSupportedException($"Unsupported runtime patch signature: {target}");
        }

        var parameterTypes = target.GetParameters().Select(parameter => parameter.ParameterType).ToList();
        if (!target.IsStatic)
        {
            parameterTypes.Insert(0, target.DeclaringType!);
        }

        var originalType = Expression.GetDelegateType(parameterTypes.Append(target.ReturnType).ToArray());
        Func<Delegate, object?[], object?> dispatch = (next, values) => intercept(values, () =>
        {
            try { return next.DynamicInvoke(values); }
            catch (TargetInvocationException exception) when (exception.InnerException is not null)
            {
                ExceptionDispatchInfo.Capture(exception.InnerException).Throw();
                throw;
            }
        });
        // Expression.Compile produces a static method bound to an internal Closure.
        // MonoMod rejects that closed static delegate. Emit a genuine static adapter
        // and store the interception delegate in its collectible generated type.
        var adapter = AssemblyBuilder.DefineDynamicAssembly(
            new AssemblyName($"MobileLauncher.Hook.{Guid.NewGuid():N}"), AssemblyBuilderAccess.RunAndCollect)
            .DefineDynamicModule("Hooks").DefineType("Adapter", TypeAttributes.Public | TypeAttributes.Abstract | TypeAttributes.Sealed);
        var dispatchType = typeof(Func<Delegate, object?[], object?>);
        var dispatchField = adapter.DefineField("Dispatch", dispatchType, FieldAttributes.Public | FieldAttributes.Static);
        var method = adapter.DefineMethod("Invoke", MethodAttributes.Public | MethodAttributes.Static,
            target.ReturnType, new[] { originalType }.Concat(parameterTypes).ToArray());
        var il = method.GetILGenerator();
        var values = il.DeclareLocal(typeof(object[]));
        il.Emit(OpCodes.Ldsfld, dispatchField);
        il.Emit(OpCodes.Ldarg_0);
        il.Emit(OpCodes.Ldc_I4, parameterTypes.Count);
        il.Emit(OpCodes.Newarr, typeof(object));
        il.Emit(OpCodes.Dup);
        il.Emit(OpCodes.Stloc, values);
        for (var index = 0; index < parameterTypes.Count; index++)
        {
            il.Emit(OpCodes.Dup);
            il.Emit(OpCodes.Ldc_I4, index);
            var type = parameterTypes[index];
            if (type.IsByRef)
            {
                // Out arguments have no input value. Never read their caller storage;
                // supply default(T) to the interceptor and copy its final value back.
                type = type.GetElementType()!;
                if (type.IsValueType)
                {
                    var empty = il.DeclareLocal(type);
                    il.Emit(OpCodes.Ldloca, empty);
                    il.Emit(OpCodes.Initobj, type);
                    il.Emit(OpCodes.Ldloc, empty);
                }
                else
                {
                    il.Emit(OpCodes.Ldnull);
                }
            }
            else
            {
                il.Emit(OpCodes.Ldarg, index + 1);
            }
            if (type.IsValueType)
            {
                il.Emit(OpCodes.Box, type);
            }

            il.Emit(OpCodes.Stelem_Ref);
        }
        il.Emit(OpCodes.Callvirt, dispatchType.GetMethod("Invoke")!);
        for (var index = 0; index < parameterTypes.Count; index++)
        {
            if (!parameterTypes[index].IsByRef) continue;
            var type = parameterTypes[index].GetElementType()!;
            il.Emit(OpCodes.Ldarg, index + 1);
            il.Emit(OpCodes.Ldloc, values);
            il.Emit(OpCodes.Ldc_I4, index);
            il.Emit(OpCodes.Ldelem_Ref);
            il.Emit(OpCodes.Unbox_Any, type);
            il.Emit(OpCodes.Stobj, type);
        }
        if (target.ReturnType == typeof(void))
        {
            il.Emit(OpCodes.Pop);
        }
        else
        {
            il.Emit(OpCodes.Unbox_Any, target.ReturnType);
        }

        il.Emit(OpCodes.Ret);
        var adapterType = adapter.CreateType()!;
        adapterType.GetField("Dispatch")!.SetValue(null, dispatch);
        var hookType = Expression.GetDelegateType(new[] { originalType }.Concat(parameterTypes).Append(target.ReturnType).ToArray());
        var hookDelegate = adapterType.GetMethod("Invoke")!.CreateDelegate(hookType);
        _hook = new Hook(target, hookDelegate);
    }

    public void Dispose() => _hook.Dispose();
}
